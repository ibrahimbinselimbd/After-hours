"""Optional real-browser smoke test; requires the English app server, Playwright and Chromium."""
import sys,json,os,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
base=sys.argv[1].rstrip('/')
out=Path(os.environ.get('TEXT_DETECTOR_TEST_OUTPUT', str(Path(tempfile.gettempdir())/'afterhours-text-detector-smoke')))
out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    records=[]
    for width in [320,390,768,1280]:
        page=browser.new_page(viewport={'width':width,'height':900},device_scale_factor=1)
        errors=[]; bad=[]; api=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('response',lambda r:bad.append([r.status,r.url]) if r.status>=400 and 'favicon' not in r.url else None)
        page.on('request',lambda r:api.append(r.url) if '/api/' in r.url else None)
        page.goto(base+'/tools/text-detector/',wait_until='networkidle')
        assert page.locator('body').get_attribute('data-analysis-enabled') == 'false'
        assert page.locator('meta[name="robots"]').get_attribute('content') == 'noindex,follow'
        assert page.locator('#service-notice').is_visible()
        assert 'COMING SOON' in page.locator('#service-notice').inner_text()
        assert page.locator('#analyze-button').is_disabled()
        page.get_by_role('button',name='Try sample',exact=True).click()
        assert page.locator('#analyze-button').is_disabled()
        assert int(page.locator('#word-count').inner_text())>=80
        page.locator('[data-mode=prompt]').click()
        page.get_by_role('button',name='Try sample',exact=True).click()
        assert int(page.locator('#word-count').inner_text())>=60
        assert page.locator('#analyze-button').is_disabled()
        assert page.locator('#result-section').is_hidden()
        assert page.locator('#progress-panel').is_hidden()
        page.locator('#text-input').fill('word '*8001)
        assert page.locator('#input-limit-message').is_visible()
        assert page.locator('#analyze-button').is_disabled()
        assert len(api)==0,api
        layout=page.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})')
        assert layout['scroll']<=width,layout
        assert not errors,errors
        assert not bad,bad
        # Category breadcrumb opens the correct district modal directly.
        page.locator('.breadcrumb a[href*="category="]').click()
        page.locator('#category-dialog').wait_for(state='visible')
        assert 'COMING SOON' in page.locator('.modal-status').inner_text()
        disabled_preview = page.locator('#category-dialog .disabled-tool')
        assert disabled_preview.is_visible()
        assert 'COMING SOON · DISABLED' in disabled_preview.inner_text()
        assert disabled_preview.locator('a').count() == 0
        assert page.locator('#category-dialog a[href="/tools/text-detector/"]').count() == 0
        page.locator('#category-dialog .modal-close').click()
        page.locator('[data-category="ai-everyday-utilities"]').click()
        assert page.locator('#category-dialog .disabled-tool').is_visible()
        assert 'COMING SOON · DISABLED' in page.locator('#category-dialog .disabled-tool').inner_text()
        assert page.locator('#category-dialog a[href="/tools/text-detector/"]').count() == 0
        page.locator('#category-dialog .modal-close').click()
        page.get_by_role('link',name='AFTERHOURS home',exact=True).click()
        assert page.url.rstrip('/')==base,page.url
        page.goto(base+'/tools/text-detector/',wait_until='networkidle')
        if width in [390,1280]: page.screenshot(path=str(out/f'{"live" if base.startswith("https") else "local"}-{width}.png'),full_page=True)
        records.append({'width':width,'layout':layout,'api_requests':len(api),'errors':errors,'bad_assets':bad,'navigation':'passed','analysis':'disabled'})
        page.close()
    browser.close()
    print(json.dumps(records,indent=2))
    (out/('live-browser-tests.json' if base.startswith('https') else 'local-browser-tests.json')).write_text(json.dumps(records,indent=2))
