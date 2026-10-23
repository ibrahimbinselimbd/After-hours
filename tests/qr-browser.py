#!/usr/bin/env python3
"""Explicit opt-in browser QA for the local QR generator.
Usage: python3 tests/qr-browser.py [BASE_URL] [OUTPUT_DIR]
No network/unittest auto-discovery: run this file directly when the local server is ready.
"""
from __future__ import annotations
import argparse, hashlib, json, re, sys, time, subprocess, xml.etree.ElementTree as ET
from pathlib import Path
from playwright.sync_api import sync_playwright, expect, Page
from PIL import Image
try:
    import cairosvg
except ImportError:
    cairosvg = None

DEFAULT_BASE = "http://127.0.0.1:4208"
TOOL = "/tools/qr-code-generator/"
KEY = "afterhours:daily-credits"

def sha(p: Path): return hashlib.sha256(p.read_bytes()).hexdigest()
def fail(m): raise AssertionError(m)
def text(p, sel): return p.locator(sel).inner_text().strip()
def credits(p): return int(text(p, "#credits"))
def wait_verified(p):
    expect(p.locator("#result-state")).to_have_text("VERIFIED", timeout=10000)
    expect(p.locator("#decode-check")).to_contain_text("PASS")
    expect(p.locator("#match-check")).to_contain_text("EXACT")
def fresh_context(browser, width=1440):
    return browser.new_context(viewport={"width": width, "height": 1000}, accept_downloads=True, reduced_motion="reduce")
def goto(p, base):
    r = p.goto(base + TOOL, wait_until="networkidle")
    assert r and r.status == 200
    assert p.evaluate("document.documentElement.scrollWidth <= innerWidth")
def clear_state(p):
    p.evaluate("k=>localStorage.removeItem(k)", KEY)
def type_payload(p, kind, value):
    p.get_by_role("tab", name=kind, exact=True).click()
    if kind == "URL": p.locator("#url").fill(value)
    elif kind == "TEXT": p.locator("#text").fill(value)
    else:
        ssid, password, security, hidden = value
        p.locator("#ssid").fill(ssid); p.locator("#password").fill(password)
        p.locator("#security").select_option(security)
        p.locator("#hidden").set_checked(hidden)
def generate(p):
    p.locator("#generate").click(); wait_verified(p)
def download(p, selector, out):
    with p.expect_download(timeout=10000) as x: p.locator(selector).click()
    d=x.value; path=out/d.suggested_filename; d.save_as(str(path)); return path
def jsqr_decode(p, png_bytes):
    import base64
    return p.evaluate("""b=>{return new Promise(resolve=>{let i=new Image();i.onload=()=>{let c=document.createElement('canvas');c.width=i.width;c.height=i.height;let x=c.getContext('2d');x.drawImage(i,0,0);let d=x.getImageData(0,0,c.width,c.height);let q=window.jsQR(d.data,d.width,d.height);resolve(q&&q.data)};i.src='data:image/png;base64,'+b})}""", base64.b64encode(png_bytes).decode())

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('base',nargs='?',default=DEFAULT_BASE); ap.add_argument('out',nargs='?',default='/workspace/afterhours-qr-qa/local'); a=ap.parse_args()
    base=a.base.rstrip('/'); out=Path(a.out); out.mkdir(parents=True,exist_ok=True); results=[]
    def check(name, fn):
        try: fn(); results.append({"name":name,"ok":True}); print("PASS",name)
        except Exception as e: results.append({"name":name,"ok":False,"error":str(e)}); print("FAIL",name,e)
    with sync_playwright() as pw:
      browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
      ctx=fresh_context(browser); p=ctx.new_page(); goto(p,base); clear_state(p); p.reload(wait_until='networkidle')
      def basic_url():
        before=credits(p); req=[]
        p.on('request',lambda r:req.append(r.url))
        type_payload(p,'URL','https://example.com/afterhours?x=1'); generate(p)
        assert credits(p)==before-1; assert not req, f"network after entry/generation: {req}"
        canvas=p.locator('#qr-canvas'); assert canvas.is_visible()
        # explicit quiet-zone check plus pixel-level four-module edge margin
        assert 'PASS' in text(p,'#quiet-check') or 'OK' in text(p,'#quiet-check')
        png=download(p,'#download-png',out); assert png.suffix=='.png'
        with Image.open(png) as im: assert im.format=='PNG' and im.width==im.height and im.width>=256
        assert jsqr_decode(p,png.read_bytes())=='https://example.com/afterhours?x=1'
        svg=download(p,'#download-svg',out); s=svg.read_text(); assert '<svg' in s and '<path' in s and 'mm' in s
        total=int(ET.fromstring(s).attrib['viewBox'].split()[-1])
        with Image.open(png).convert('RGB') as im:
          assert im.width%total==0; edge=4*(im.width//total); bg=im.getpixel((0,0))
          for box in [(0,0,im.width,edge),(0,im.height-edge,im.width,im.height),(0,0,edge,im.height),(im.width-edge,0,im.width,im.height)]:
            assert all(v==bg for v in im.crop(box).getdata()), 'Quiet zone was not four clear modules'
        raster=out/'svg-raster.png'
        if cairosvg is not None: cairosvg.svg2png(bytestring=svg.read_bytes(),write_to=str(raster))
        else: subprocess.run(['/usr/bin/python3','-c','import cairosvg,sys; cairosvg.svg2png(url=sys.argv[1],write_to=sys.argv[2])',str(svg),str(raster)],check=True)
        assert jsqr_decode(p,raster.read_bytes())=='https://example.com/afterhours?x=1'
        assert sha(png)==sha(download(p,'#download-png',out))
        assert sha(svg)==sha(download(p,'#download-svg',out))
        assert not req, f"network during downloads: {req}"; assert credits(p)==before-1
      check('URL generation, exact jsQR decode, credits, zero network, PNG/SVG repeat bytes',basic_url)
      def wifi_special():
        type_payload(p,'WI-FI',('Lab;Net,East:5\\"','p;ass,word:9\\"','WPA',True)); before=credits(p); generate(p)
        assert credits(p)==before-1
        # Verify exact escaped payload generated by app, including hidden flag.
        assert p.locator('#payload-preview').inner_text().strip()=='WIFI:T:WPA;S:Lab\\;Net\\,East\\:5\\\\\\";P:p\\;ass\\,word\\:9\\\\\\";H:true;;'
      check('Wi-Fi special punctuation, escaping, hidden WPA exact payload',wifi_special)
      def wifi_variants():
        for sec in ['WEP','nopass']:
          type_payload(p,'WI-FI',('Cafe','password123','WPA',False)); p.locator('#security').select_option(sec); generate(p); assert 'EXACT' in text(p,'#match-check')
      check('Wi-Fi WEP and no-password variants',wifi_variants)
      def unicode_text():
        val='বাংলা QR — café 日本語 🚀\nexact text'; type_payload(p,'TEXT',val); generate(p); assert jsqr_decode(p,p.locator('#qr-canvas').screenshot()).endswith(val)
      check('Unicode text exact jsQR decode',unicode_text)
      def advisories_and_stale():
        type_payload(p,'TEXT','x'*1400)
        p.locator('#ink').evaluate("(e)=>{e.value='#777777';e.dispatchEvent(new Event('input',{bubbles:true}))}")
        p.locator('#paper').evaluate("(e)=>{e.value='#888888';e.dispatchEvent(new Event('input',{bubbles:true}))}")
        p.locator('#width').fill('20'); p.locator('#generate').click(); p.wait_for_timeout(600)
        assert 'LOW' in text(p,'#contrast-check') and 'LOW' in text(p,'#module-check')
        p.get_by_role('tab',name='URL',exact=True).click(); p.locator('#url').fill('https://changed.example'); expect(p.locator('#result-state')).to_have_text('—'); assert p.locator('#download-png').is_disabled()
      check('contrast warning, too-small module warning, stale outputs invalidated',advisories_and_stale)
      def print_noncredit():
        p.locator('#ink').evaluate("(e)=>{e.value='#0b1019';e.dispatchEvent(new Event('input',{bubbles:true}))}"); p.locator('#paper').evaluate("(e)=>{e.value='#f2f4ed';e.dispatchEvent(new Event('input',{bubbles:true}))}"); p.locator('#width').fill('50'); type_payload(p,'URL','https://print.example'); generate(p); before=credits(p); p.locator('#print').click(); assert credits(p)==before
      check('print action is noncredit',print_noncredit)
      def invalid_zero():
        p.get_by_role('tab',name='URL',exact=True).click(); p.locator('#url').fill('not-a-url'); before=credits(p); p.locator('#generate').click(); assert credits(p)==before; assert 'CHECK INPUT' in text(p,'#status-label')
        p.evaluate("k=>localStorage.setItem(k,JSON.stringify({day:new Date().toISOString().slice(0,10),remaining:0}))",KEY); p.reload(wait_until='networkidle'); assert credits(p)==0; p.locator('#url').fill('https://zero.example'); p.locator('#generate').click(); p.wait_for_timeout(300); assert credits(p)==0; assert 'VERIFY FAILED' in text(p,'#status-label')
      check('invalid input no debit and zero-credit block',invalid_zero)
      ctx.close()
      def persistence_reset():
        c=fresh_context(browser); q=c.new_page(); goto(q,base); q.evaluate("k=>localStorage.setItem(k,JSON.stringify({day:new Date().toISOString().slice(0,10),remaining:7}))",KEY); q.reload(wait_until='networkidle'); assert credits(q)==7; q.reload(wait_until='networkidle'); assert credits(q)==7
        q.evaluate("k=>localStorage.setItem(k,JSON.stringify({day:'2000-01-01',remaining:1}))",KEY); q.reload(wait_until='networkidle'); assert credits(q)==10
      check('persisted reload and next-day reset',persistence_reset)
      def storage_fallback():
        c=fresh_context(browser); q=c.new_page(); q.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}})"); goto(q,base); type_payload(q,'URL','https://fallback.example'); q.locator('#generate').click(); wait_verified(q); assert credits(q)==9
      check('storage unavailable fallback remains usable',storage_fallback)
      def responsive():
        for w in [320,390,768,1440]:
          c=fresh_context(browser,w); q=c.new_page(); goto(q,base); assert q.evaluate('document.documentElement.scrollWidth <= innerWidth'),w; c.close()
      check('responsive widths 320/390/768/1440 no horizontal overflow',responsive)
      def hub():
        q=browser.new_page(viewport={'width':1440,'height':900}); r=q.goto(base+'/tools/',wait_until='networkidle'); assert r.status==200; assert q.locator('#category-search').count()==1; q.locator('#category-search').fill('QR'); assert q.locator('[data-category="image-design"]').is_visible(); assert q.locator('[data-category="pdf-documents"]').is_hidden(); q.locator('button').filter(has_text='Image & Design').click(); expect(q.locator('#category-dialog')).to_be_visible(); assert '03 AVAILABLE' in q.locator('.modal-status').inner_text(); assert q.locator('#dialog-tools a[href*=' + repr('qr-code-generator') + ']').count()>=1; q.locator('#dialog-tools a[href*=' + repr('qr-code-generator') + ']').first.click(); assert q.url.endswith(TOOL); q.close()
      check('hub search QR, image-design 03 AVAILABLE, navigation',hub)
      def ecc_colors_print():
        c=fresh_context(browser); q=c.new_page(); goto(q,base)
        for level in ['L','M','Q','H']:
          type_payload(q,'TEXT','AFTERHOURS ECC '+level+' বাংলা'); q.locator('#ecc').select_option(level); generate(q)
        q.locator('#ink').fill('#10203d'); q.locator('#paper').fill('#f8f3e0'); generate(q); before=credits(q)
        q.locator('#width').fill('75'); assert credits(q)==before; assert 'EXACT' in text(q,'#match-check')
        f=download(q,'#download-svg',out); root=ET.fromstring(f.read_text()); assert root.attrib['width']=='75mm' and root.attrib['height']=='75mm'
        assert root.find('{http://www.w3.org/2000/svg}rect').attrib['fill']=='#f8f3e0'
        assert root.find('{http://www.w3.org/2000/svg}path').attrib['fill']=='#10203d'
        q.emulate_media(media='print'); actual=q.locator('#qr-canvas').evaluate('(e)=>e.getBoundingClientRect().width'); assert abs(actual-75*96/25.4)<1
        q.emulate_media(media='screen'); assert credits(q)==before; c.close()
      check('all ECC levels, chosen SVG colors, physical width and print CSS, no extra charge',ecc_colors_print)
      def forced_decode_failure():
        c=fresh_context(browser); q=c.new_page(); goto(q,base); type_payload(q,'URL','https://decode-failure.example'); before=credits(q)
        q.evaluate('window.jsQR=()=>null'); q.locator('#generate').click(); expect(q.locator('#result-state')).to_have_text('FAILED')
        assert credits(q)==before and q.locator('#download-png').is_disabled() and q.locator('#download-svg').is_disabled(); c.close()
      check('failed decode uses no credit and blocks both exports',forced_decode_failure)
      def cross_tab_and_shared_counter():
        c=fresh_context(browser); a=c.new_page(); goto(a,base)
        a.evaluate("k=>localStorage.setItem(k,JSON.stringify({day:new Date().toISOString().slice(0,10),remaining:1}))",KEY)
        a.reload(wait_until='networkidle'); b=c.new_page(); goto(b,base)
        type_payload(a,'URL','https://tab-a.example'); type_payload(b,'URL','https://tab-b.example')
        a.locator('#generate').evaluate('(e)=>e.click()'); b.locator('#generate').evaluate('(e)=>e.click()'); a.wait_for_timeout(1000)
        states=[text(a,'#result-state'),text(b,'#result-state')]; assert states.count('VERIFIED')==1 and states.count('FAILED')==1,states
        assert credits(a)==0 and credits(b)==0
        a.goto(base+'/tools/image-size-optimizer/',wait_until='networkidle'); assert credits(a)==0; c.close()
      check('one remaining credit across two tabs and shared optimizer counter',cross_tab_and_shared_counter)
      browser.close()
    (out/'results.json').write_text(json.dumps(results,indent=2)+'\n')
    failed=[x for x in results if not x['ok']]; print(json.dumps({'passed':len(results)-len(failed),'failed':len(failed),'results':results},indent=2)); return 1 if failed else 0
if __name__=='__main__': raise SystemExit(main())
