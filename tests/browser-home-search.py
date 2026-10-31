"""HOME-TOUCH-001 regression for the two English home routes only.

python3 tests/browser-home-search.py http://127.0.0.1:8791
Optional: HOME_SEARCH_OUTPUT=/absolute/evidence/path
Requires Playwright and Chromium. Screenshots/results are not source assets.
"""
import json
import os
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip('/')
out = Path(os.environ.get('HOME_SEARCH_OUTPUT', '/tmp/afterhours-home-search'))
out.mkdir(parents=True, exist_ok=True)
records = []

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    for route in ('/', '/index.html'):
        for width, height in ((320, 900), (375, 844), (390, 844), (768, 1000), (1440, 1000)):
            page = browser.new_page(
                viewport={'width': width, 'height': height},
                device_scale_factor=2, is_mobile=width < 701,
                has_touch=width < 701, reduced_motion='reduce')
            errors, bad = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('response', lambda response: bad.append([response.status, response.url])
                    if response.status >= 400 and response.url.startswith(base)
                    and 'favicon' not in response.url else None)
            response = page.goto(base + route, wait_until='networkidle')
            assert response.status == 200
            page.evaluate('document.fonts.ready')
            search = page.get_by_role('button', name='Search articles', exact=True)
            target = search.bounding_box()
            assert target['width'] >= 44 and target['height'] >= 44, (route, width, target)
            layout = page.locator('header').evaluate('''header => {
                const items = [...header.querySelectorAll('.brand, nav > a, .header-actions > *')]
                    .map(el => ({name: el.id || el.getAttribute('aria-label') || el.textContent.trim(),
                        rect: el.getBoundingClientRect()}))
                    .filter(item => item.rect.width > 0 && item.rect.height > 0);
                const overlaps = [];
                for (let i = 0; i < items.length; i++) {
                    for (let j = i + 1; j < items.length; j++) {
                        const a = items[i].rect, b = items[j].rect;
                        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > .5 &&
                            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > .5) {
                            overlaps.push([items[i].name, items[j].name]);
                        }
                    }
                }
                return {overflow: document.documentElement.scrollWidth > innerWidth,
                    outside: items.filter(item => item.rect.left < 0 || item.rect.right > innerWidth)
                        .map(item => item.name), overlaps};
            }''')
            assert not layout['overflow'] and not layout['outside'] and not layout['overlaps'], (route, width, layout)
            assert search.get_attribute('aria-haspopup') == 'dialog'
            assert search.get_attribute('aria-controls') == 'search-dialog'
            if route == '/' and width in (320, 375, 1440):
                page.screenshot(path=str(out / f'home-{width}.png'))
            # Exercise the expanded corner, not only the original glyph's center.
            if width < 701:
                search.tap(position={'x': 2, 'y': 2})
            else:
                search.click(position={'x': 2, 'y': 2})
            dialog = page.locator('#search-dialog')
            dialog.wait_for(state='visible')
            assert dialog.get_attribute('aria-labelledby') == 'search-title'
            assert dialog.get_attribute('aria-describedby') == 'search-description'
            assert ' '.join(page.locator('#search-title').inner_text().split()) == 'Follow your curiosity.'
            input_field = page.get_by_role('combobox', name='Search stories in English', exact=True)
            assert input_field.evaluate('(el) => document.activeElement === el')
            if route == '/' and width in (375, 1440):
                page.screenshot(path=str(out / f'home-search-dialog-{width}.png'))
            input_field.press('Escape')
            dialog.wait_for(state='hidden')
            assert search.evaluate('(el) => document.activeElement === el')
            search.press('Enter')
            dialog.wait_for(state='visible')
            assert input_field.evaluate('(el) => document.activeElement === el')
            input_field.press('Escape')
            dialog.wait_for(state='hidden')
            assert search.evaluate('(el) => document.activeElement === el')
            assert not errors and not bad, {'route': route, 'width': width, 'errors': errors, 'bad': bad}
            records.append({'route': route, 'width': width,
                            'search_target': {'width': target['width'], 'height': target['height']},
                            'layout': layout, 'corner_tap': True, 'keyboard_open': True,
                            'dialog_name_preserved': True, 'input_focus': True,
                            'escape_returns_focus': True, 'page_errors': errors, 'failed_local_requests': bad})
            print(f'{route} at {width}px: target {target["width"]}x{target["height"]}; fit, dialog and focus passed', flush=True)
            page.close()
    browser.close()

(out / 'results.json').write_text(json.dumps(records, indent=2) + '\n')
print(f'HOME-TOUCH-001: all {len(records)} route/viewport checks passed; evidence: {out}', flush=True)
