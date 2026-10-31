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
            assert status.evaluate('(el) => el.tagName') == 'A'
            assert status.get_attribute('href') == 'https://github.com/ibrahimbinselimbd/After-hours/issues'
            assert 'posts are public' in status.inner_text().lower()
            assert status.locator('a, input, textarea, button').count() == 0
            assert page.locator('a[href^="mailto:"]').count() == 0
            assert page.locator('a[href*="github.com"][href*="issues"]').count() >= 1
        def font_px(selector):
            element = page.locator(selector).first
            assert element.count() > 0, f'missing font-size target: {selector}'
            return float(element.evaluate('(el) => parseFloat(getComputedStyle(el).fontSize)'))
        for route in ['/', '/tools/']:
            go(route)
            if route == '/':
                nav = page.locator('#home-navigation')
                assert nav.locator(':scope > a').count() == 4
                if width <= 700:
                    assert not nav.is_visible(), 'the four homepage links remain intentionally hidden on mobile'
                else:
                    assert nav.is_visible(), 'the homepage links remain available on wider screens'
            journal = page.get_by_role('link', name='The journal', exact=True, include_hidden=True)
            assert journal.get_attribute('href').endswith('/#feed')
            # Desktop nav is deliberately hidden on compact layouts; route stays valid.
            if journal.is_visible():
                journal.click()
                assert page.url == base + '/#feed'
                assert page.locator('#feed').is_visible()
        go('/tools/')
        page.locator('[data-category="developer-utilities"]').click()
        page.locator('#category-dialog').wait_for(state='visible')
        assert int(page.locator('.modal-status').inner_text().split()[0]) == 68
        assert page.locator('#dialog-tools a').count() == 68
        expected_columns = 3 if width > 1000 else 2
        column_count = page.locator('#dialog-tools').evaluate('(el) => getComputedStyle(el).gridTemplateColumns.split(" ").length')
        assert column_count == expected_columns, [width, column_count, expected_columns]
        # Scroll the real popup to exercise lazy images, not a forced-eager test DOM.
        for preview in page.locator('#dialog-tools .tool-preview img').all():
            preview.scroll_into_view_if_needed()
            preview.evaluate('(image) => image.decode()')
        page.locator('#category-dialog').evaluate('(el) => { el.scrollTop = 0; }')
        card_checks = page.locator('#dialog-tools a.featured-tool').evaluate_all('''cards => cards.map(card => {
            const image = card.querySelector('.tool-preview img');
            const descendants = [card, ...card.querySelectorAll('.tool-meta, .tool-meta b, .tool-meta small, .open-label')];
            return {
                src: image?.getAttribute('src') || '',
                width: image?.getAttribute('width'),
                height: image?.getAttribute('height'),
                naturalWidth: image?.naturalWidth || 0,
                clipping: descendants.some(el => el.scrollWidth > el.clientWidth + 1),
            };
        })''')
        assert len(card_checks) == 68
        assert all(check['src'].startswith(base + '/tools/_shared/previews/') and check['src'].endswith('.webp') for check in card_checks), card_checks
        assert all(check['width'] == '640' and check['height'] == '360' and check['naturalWidth'] > 0 for check in card_checks), card_checks
        assert not any(check['clipping'] for check in card_checks), [check for check in card_checks if check['clipping']]
        page.locator('#dialog-tool-search').fill('JSON Formatter')
        assert page.locator('#dialog-tools a:visible').count() == 1
        assert page.locator('#dialog-tools a:visible').get_attribute('href').endswith('/tools/json-formatter/')
        assert page.locator('#category-search-status').inner_text() == '1 matching item'
        page.locator('#dialog-tool-search').fill('')
        assert page.locator('#dialog-tools a:visible').count() == 68
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.locator('#category-dialog').evaluate('(el) => { el.scrollTop = el.scrollHeight; }')
        modal_top = page.locator('#category-dialog').bounding_box()['y']
        title_top = page.locator('#dialog-title').bounding_box()['y']
        close_top = page.locator('.modal-close').bounding_box()['y']
        assert modal_top <= title_top < modal_top + 100, [width, title_top, modal_top]
        assert modal_top <= close_top < modal_top + 100, [width, close_top, modal_top]
        page.locator('.modal-close').click()
        go('/')
        assert page.locator('#feed').count() == 1
        feedback()
        page.locator('a[href*="story="]').first.click()
        page.wait_for_load_state('networkidle')
        assert 'story=' in page.url
        feedback()
        assert page.locator('h1').inner_text().strip()
        go('/tools/background-remover/')
        crumbs = page.locator('a[href*="category=image-design#categories"]')
        assert crumbs.count() == 2
        page.locator('.breadcrumb a[href*="category=image-design#categories"]').click()
        page.locator('#category-dialog').wait_for(state='visible')
        assert 'image' in page.locator('#dialog-title').inner_text().lower()
        assert 'design' in page.locator('#dialog-title').inner_text().lower()
        modal_count, modal_label = page.locator('.modal-status').inner_text().split()
        assert modal_label == 'AVAILABLE'
        assert int(modal_count) == page.locator('#category-dialog a[href*="/tools/"]').count()
        tool_link = page.locator('#category-dialog a[href$="/tools/background-remover/"]')
        assert tool_link.count() == 1
        tool_link.click()
        assert '/tools/background-remover/' in page.url
        page.wait_for_load_state('networkidle')
        # Preserve queue and clear behavior without downloading the inference model.
        assert page.locator('#process-button').is_disabled()
        page.locator('#file-input').set_input_files({'name': 'pixel.png', 'mimeType': 'image/png', 'buffer': base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')})
        page.wait_for_function("document.querySelector('#queue-count').textContent.trim() === '01'")
        assert page.locator('#queue-count').inner_text().strip() == '01'
        assert page.locator('#process-button').is_enabled()
        assert font_px('.tile-buttons button') >= 8
        page.locator('#clear-button').click()
        assert page.locator('#queue-count').inner_text().strip() == '00'
        for key in ['about', 'privacy', 'disclaimer', 'advertising', 'terms', 'cookies', 'editorial', 'contact']:
            go('/info.html?page=' + key)
            assert page.locator('.notice strong').inner_text().lower() == 'draft'
            assert 'not treat it as a final legal or operational policy' in page.locator('.notice').inner_text()
            assert page.locator(f'#page-nav a[aria-current="page"][href="info.html?page={key}"]').count() == 1
            assert page.locator('.link-row a[href$="/#feed"]').count() == 1
            assert page.locator('form, textarea, input:not([type="hidden"])').count() == 0
            feedback()
        assert 'public corrections route' in page.locator('.contact-status').inner_text().lower()
        go('/info.html?page=contact#corrections')
        assert page.locator('#corrections').is_visible()
        assert page.locator('#corrections a[href="https://github.com/ibrahimbinselimbd/After-hours/issues"]').count() == 1
        assert 'does not submit text' in page.locator('#corrections').inner_text()
        if width in [390, 1280]:
            page.screenshot(path=str(out / f'contact-{width}.png'), full_page=True)
        go('/info.html?page=contact#%ZZ')
        go('/info.html?page=unknown')
        assert page.locator('#crumb').inner_text() == 'ABOUT'
        if width == 320:
            for slug in ['animated-gif-optimizer', 'audio-format-converter', 'video-compressor', 'video-to-gif']:
                go(f'/tools/{slug}/')
                assert page.locator('h1').count() == 1, slug
                assert page.locator('h1').inner_text().strip(), slug
            aria_controls = [
                ('/tools/base64-encoder-decoder/', '#mode', 'Base64 operation'),
                ('/tools/file-hash/', '#fh-expected', 'Expected SHA-256 hex (optional)'),
                ('/tools/json-yaml-converter/', '#dir', 'Conversion direction'),
                ('/tools/speech-to-text/', '#st-text', 'Transcribed text output'),
                ('/tools/sql-formatter/', '#case', 'SQL keyword case'),
                ('/tools/sql-formatter/', '#dialect', 'SQL dialect'),
                ('/tools/subtitle-converter/', '#source', 'Subtitle text'),
                ('/tools/url-encoder-decoder-parser/', '#mode', 'URL operation'),
                ('/tools/xml-formatter-validator/', '#mode', 'XML operation'),
            ]
            for route, selector, name in aria_controls:
                go(route)
                assert page.locator(selector).get_attribute('aria-label') == name, [route, selector]
            go('/tools/passport-photo-studio/')
            for control, label in [('zoom', 'Zoom'), ('panx', 'Horizontal position'), ('pany', 'Vertical position')]:
                assert page.locator(f'label[for="{control}"]').inner_text().startswith(label), control
            go('/tools/pdf-to-images/')
            assert page.locator('label.field').filter(has_text='Output format').locator('#pti-format').count() == 1
            assert page.locator('label.field').filter(has_text='Output scale (DPI)').locator('#pti-scale').count() == 1
        if width in [320, 1280]:
            go('/')
            assert font_px('.hero-foot') >= 8
            assert font_px('.vertical-label') >= 8
            assert font_px('.ah-footer__world-help') >= 12
            assert font_px('.ah-footer__links a') >= 14
            assert font_px('.ah-footer__policy-note') >= 12
            go('/tools/')
            assert font_px('.breadcrumb') >= 12
            assert font_px('.hero-desc') >= 14
            assert font_px('.tools-page .category p') >= 14
            assert font_px('.planned') >= 12
            go('/districts/')
            assert font_px('.cat-label small') >= 12
            assert font_px('.cat-plan small') >= 12
            go('/tools/heic-to-jpg/')
            assert font_px('.breadcrumb') >= 12
            assert font_px('.site-footer') >= 12
            assert font_px('.file-card > span') >= 12
            go('/tools/background-remover/')
            assert font_px('.local-pill') >= 12
            go('/tools/json-formatter/')
            assert font_px('.tool-hero p') >= 14
            intro_height = page.locator('.tool-hero').evaluate('(el) => el.getBoundingClientRect().height')
            editor_height = page.locator('#js-input').evaluate('(el) => el.getBoundingClientRect().height')
            assert intro_height <= (300 if width == 320 else 330), [width, intro_height]
            assert editor_height >= (230 if width == 320 else 340), [width, editor_height]
        assert not errors, errors
        assert not bad, bad
        assert not submissions, submissions
        records.append({'width': width, 'journal': 'published/planned hierarchy', 'category_modal': f'{expected_columns}-column grid, search and sticky title passed', 'image_design': 'correct modal', 'feedback': 'public issue tracker; no sensitive form', 'info_pages': '8 visible drafts', 'queue': 'add/clear passed', 'overflow': False, 'errors': errors, 'failed_requests': bad, 'submissions': submissions})
        print(f'{width}px: responsive navigation, category-search and existing regressions passed', flush=True)
        page.close()
    browser.close()
(out / 'results.json').write_text(json.dumps(records, indent=2) + '\n')
print(json.dumps(records, indent=2))
