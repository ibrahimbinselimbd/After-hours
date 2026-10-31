"""Visual card regression: local or deployed English hub; no tool actions are run.

python3 tests/browser-category-cards.py https://ibrahimbinselimbd.github.io/After-hours
Optional: CATEGORY_CARD_OUTPUT=/absolute/output/path
Requires Playwright, Chromium, Pillow. Output is evidence, not committed source.
"""
import concurrent.futures
from io import BytesIO
import json
import os
from pathlib import Path
import sys
from urllib.parse import urlparse
from urllib.request import urlopen
from PIL import Image
from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip('/')
out = Path(os.environ.get('CATEGORY_CARD_OUTPUT', '/tmp/afterhours-category-cards'))
out.mkdir(parents=True, exist_ok=True)
records, assets = [], set()
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    for width, height in [(320, 900), (390, 844), (768, 1000), (1440, 1000)]:
        page = browser.new_page(viewport={'width': width, 'height': height}, device_scale_factor=2, reduced_motion='reduce')
        errors, bad, submissions = [], [], []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('response', lambda r: bad.append([r.status, r.url]) if r.status >= 400 and 'favicon' not in r.url else None)
        page.on('request', lambda r: submissions.append(r.url) if r.method not in ('GET', 'HEAD') else None)
        response = page.goto(base + '/tools/', wait_until='networkidle')
        assert response.status == 200
        ids = page.locator('.category[data-category]').evaluate_all('(els) => els.map(el => el.dataset.category)')
        assert len(ids) == 20
        count = 0
        for category in ids:
            page.locator(f'[data-category="{category}"]').click()
            dialog = page.locator('#category-dialog')
            dialog.wait_for(state='visible')
            cards = page.locator('#dialog-tools a.featured-tool')
            total = cards.count()
            assert total > 0
            count += total
            columns = page.locator('#dialog-tools').evaluate('(el) => getComputedStyle(el).gridTemplateColumns.split(" ").length')
            assert columns == (3 if width > 1000 else 2), [width, category, columns]
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert dialog.evaluate('(el) => el.scrollWidth <= el.clientWidth + 1')
            check = cards.evaluate_all('''els => els.map(card => {
                const image = card.querySelector('.tool-preview img');
                const title = card.querySelector('.tool-meta b');
                const footer = card.querySelector('.open-label');
                return {href:card.href, src:image?.src, width:Number(image?.getAttribute('width')), height:Number(image?.getAttribute('height')),
                    title:title?.textContent, clipped:[card,title,footer].some(el=>el.scrollWidth>el.clientWidth+1)};
            })''')
            for card in check:
                slug = urlparse(card['href']).path.strip('/').split('/')[-1]
                assert card['src'] == base + '/tools/_shared/previews/' + slug + '.webp', card
                assert card['width'] == 640 and card['height'] == 360 and card['title'], card
                assert not card['clipped'], [width, category, card]
                assets.add(card['src'])
            first = cards.first.locator('img')
            first.evaluate('(image) => image.decode()')
            assert first.evaluate('(image) => getComputedStyle(image).animationName') == 'none'
            if category == 'data-spreadsheets' and width in (390, 1440):
                # A pointer action removes the automatic focus ring from the evidence image.
                page.locator('#dialog-title').click()
                page.screenshot(path=str(out / f'popup-{width}.png'))
            last = cards.last.locator('img')
            last.scroll_into_view_if_needed()
            last.evaluate('(image) => image.decode()')
            assert last.evaluate('(image) => image.naturalWidth') == 640
            modal_top = dialog.bounding_box()['y']
            assert modal_top <= page.locator('#dialog-title').bounding_box()['y'] < modal_top + 110
            assert modal_top <= page.locator('.modal-close').bounding_box()['y'] < modal_top + 110
            page.locator('.modal-close').click()
        assert count == 500
        assert not errors and not bad and not submissions, {'errors':errors,'bad':bad,'submissions':submissions}
        records.append({'width':width,'height':height,'categories':20,'active_cards':count,'columns':3 if width>1000 else 2,'overflow':False,'reduced_motion':'disabled','errors':errors,'failed_requests':bad})
        print(f'{width}px: all 20 category popups / 500 tool cards passed', flush=True)
        page.close()
    page = browser.new_page(viewport={'width':390,'height':844}, reduced_motion='no-preference')
    page.goto(base + '/tools/?category=data-spreadsheets', wait_until='networkidle')
    page.locator('#dialog-tools .featured-tool.is-in-view').first.wait_for()
    first = page.locator('#dialog-tools .featured-tool').first
    motion = first.evaluate('''el => ({card:getComputedStyle(el).animationName,
        image:getComputedStyle(el.querySelector('img')).animationName,
        sheen:getComputedStyle(el.querySelector('.tool-preview'),'::after').animationName})''')
    assert motion == {'card':'tool-card-enter','image':'tool-preview-drift','sheen':'tool-preview-sheen'}, motion
    page.locator('#dialog-tools .featured-tool').last.scroll_into_view_if_needed()
    page.wait_for_function("!document.querySelector('#dialog-tools .featured-tool').classList.contains('is-in-view')")
    assert first.locator('img').evaluate('(el) => getComputedStyle(el).animationName') == 'none'
    records.append({'motion':'entry, preview drift and sheen active only in view; reduced-motion disables all','computed':motion})
    browser.close()

def verify_asset(url):
    with urlopen(url, timeout=30) as response:
        assert response.status == 200
        data = response.read()
    assert len(data) <= 250 * 1024
    with Image.open(BytesIO(data)) as image:
        image.load()
        assert image.size == (640, 360)
    return len(data)

assert len(assets) == 500
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    sizes = list(pool.map(verify_asset, sorted(assets)))
records.append({'verified_preview_assets':500,'total_bytes':sum(sizes),'largest_bytes':max(sizes)})
(out / 'results.json').write_text(json.dumps(records, indent=2) + '\n')
print(json.dumps(records, indent=2), flush=True)
