"""Four English link-audit regressions; run with a local or production base URL."""
import base64, json, os, sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip('/')
out = Path(os.environ.get('LINK_AUDIT_OUTPUT', str(Path(tempfile.gettempdir()) / 'afterhours-link-audit')))
out.mkdir(parents=True, exist_ok=True)
records = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    for width in [320, 390, 768, 1280]:
        page = browser.new_page(viewport={'width': width, 'height': 900}, reduced_motion='reduce')
        errors, bad, submissions = [], [], []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('response', lambda r: bad.append([r.status, r.url]) if r.status >= 400 and 'favicon' not in r.url else None)
        page.on('request', lambda r: submissions.append(r.url) if r.method not in ['GET', 'HEAD'] else None)
        def go(route):
            response = page.goto(base + route, wait_until='networkidle')
            if response is not None:
                assert response.status == 200, [route, response.status]
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), [route, width, 'overflow']
        def feedback():
            status = page.locator('.ah-footer__feedback-status')
            assert status.count() == 1
            assert 'Feedback contact coming soon' in status.inner_text()
            assert status.locator('a, input, textarea, button').count() == 0
            assert page.locator('a[href^="mailto:"], a[href*="github.com"][href*="issues"]').count() == 0
        for route in ['/', '/tools/']:
            go(route)
            journal = page.get_by_role('link', name='The journal', exact=True, include_hidden=True)
            assert journal.get_attribute('href') == '/#feed'
            # Desktop nav is deliberately hidden on compact layouts; route stays valid.
            if journal.is_visible():
                journal.click()
                assert page.url == base + '/#feed'
                assert page.locator('#feed').is_visible()
        go('/')
        assert page.locator('#feed').count() == 1
        feedback()
        story = page.locator('a[href*="story="]').first.get_attribute('href')
        go('/' + story.lstrip('/'))
        feedback()
        assert page.locator('h1').inner_text().strip()
        go('/tools/background-remover/')
        crumbs = page.locator('a[href="/tools/?category=image-design#categories"]')
        assert crumbs.count() == 2
        page.locator('.breadcrumb a[href="/tools/?category=image-design#categories"]').click()
        page.locator('#category-dialog').wait_for(state='visible')
        assert 'image' in page.locator('#dialog-title').inner_text().lower()
        assert 'design' in page.locator('#dialog-title').inner_text().lower()
        assert page.locator('.modal-status').inner_text() == '01 AVAILABLE'
        page.get_by_role('link', name='Open Bulk Image Background Remover', exact=True).click()
        assert '/tools/background-remover/' in page.url
        page.wait_for_load_state('networkidle')
        # Preserve queue and clear behavior without downloading the inference model.
        assert page.locator('#process-button').is_disabled()
        page.locator('#file-input').set_input_files({'name': 'pixel.png', 'mimeType': 'image/png', 'buffer': base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')})
        page.wait_for_function("document.querySelector('#queue-count').textContent.trim() === '01'")
        assert page.locator('#queue-count').inner_text().strip() == '01'
        assert page.locator('#process-button').is_enabled()
        page.locator('#clear-button').click()
        assert page.locator('#queue-count').inner_text().strip() == '00'
        for key in ['about', 'privacy', 'disclaimer', 'advertising', 'terms', 'cookies', 'editorial', 'contact']:
            go('/info?page=' + key)
            assert page.locator('.notice strong').inner_text().lower() == 'draft'
            assert 'not treat it as a final legal or operational policy' in page.locator('.notice').inner_text()
            assert page.locator(f'#page-nav a[aria-current="page"][href="info.html?page={key}"]').count() == 1
            assert page.locator('.link-row a[href="/#feed"]').count() == 1
            assert page.locator('form, textarea, input:not([type="hidden"])').count() == 0
            feedback()
        assert 'Feedback contact coming soon' in page.locator('.contact-status').inner_text()
        go('/info?page=contact#corrections')
        assert page.locator('#corrections').is_visible()
        assert 'No text is collected or submitted' in page.locator('#corrections').inner_text()
        if width in [390, 1280]:
            page.screenshot(path=str(out / f'contact-{width}.png'), full_page=True)
        go('/info?page=contact#%ZZ')
        go('/info?page=unknown')
        assert page.locator('#crumb').inner_text() == 'ABOUT'
        assert not errors, errors
        assert not bad, bad
        assert not submissions, submissions
        records.append({'width': width, 'journal': 'feed', 'image_design': 'correct modal', 'feedback': 'no collection; coming soon', 'info_pages': '8 visible drafts', 'queue': 'add/clear passed', 'overflow': False, 'errors': errors, 'failed_requests': bad, 'submissions': submissions})
        print(f'{width}px: all four fixes and queue regression passed', flush=True)
        page.close()
    browser.close()
(out / 'results.json').write_text(json.dumps(records, indent=2) + '\n')
print(json.dumps(records, indent=2))
