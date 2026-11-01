import json
import re
import shutil
import threading
import unittest
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sync_playwright = None

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
CHROMIUM = shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')


@unittest.skipUnless(sync_playwright and CHROMIUM, 'Playwright and Chromium are needed for these optional browser acceptance tests')
class TechnicalFixesBrowserTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        class QuietHandler(SimpleHTTPRequestHandler):
            def log_message(self, *_args):
                pass

        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), lambda *args: QuietHandler(*args, directory=str(SITE)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True, executable_path=CHROMIUM, args=['--no-sandbox', '--disable-dev-shm-usage'])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def make_page(self, width=1280, height=900):
        context = self.browser.new_context(viewport={'width': width, 'height': height}, accept_downloads=True)
        return context, context.new_page()

    def assert_page_fits(self, page, width, route):
        sizes = page.evaluate('({viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth})')
        self.assertLessEqual(sizes['document'], width, f'{route} document overflowed at {width}px: {sizes}')
        self.assertLessEqual(sizes['body'], width, f'{route} body overflowed at {width}px: {sizes}')

    def test_four_mobile_file_workspaces_fit_at_320_and_375_with_long_names_and_keyboard_focus(self):
        pages = [
            ('csv-cleaner', 'csv018-file'),
            ('csv-to-json', 'csv019-file'),
            ('archive-creator', 'zip020-files'),
            ('batch-file-renamer', 'rename021-files'),
        ]
        long_name = 'very-long-file-name-' * 6 + '.csv'
        file_payload = {'name': long_name, 'mimeType': 'text/csv', 'buffer': b'Name,Value\nA,1\n'}
        for width in (320, 375):
            context, page = self.make_page(width, 900)
            try:
                for slug, file_id in pages:
                    route = f'/tools/{slug}/'
                    page.goto(f'{self.base}{route}', wait_until='networkidle')
                    self.assert_page_fits(page, width, route)
                    file_input = page.locator(f'#{file_id}')
                    self.assertEqual(file_input.count(), 1, f'{route} file input exists')
                    file_input.set_input_files(file_payload)
                    self.assertTrue(file_input.input_value().endswith(long_name), f'{route} accepts a long filename')
                    textarea = page.locator('.tool-form textarea').first
                    if textarea.count():
                        textarea.fill('col_a,col_b\n' + ('long-value-' * 16))
                    for select in page.locator('.tool-form select').all():
                        if select.locator('option').count() > 1:
                            select.select_option(index=1)
                    for button in page.locator('.actions button, .tool-form button').all():
                        if not button.is_visible():
                            continue
                        box = button.bounding_box()
                        self.assertIsNotNone(box, f'{route} action has a visible box')
                        self.assertGreaterEqual(box['x'], 0, f'{route} action starts inside viewport')
                        self.assertLessEqual(box['x'] + box['width'], width + 1, f'{route} action fits viewport')
                    file_input.focus()
                    self.assertTrue(file_input.evaluate('(el) => el.matches(":focus")'), f'{route} file chooser can receive keyboard focus')
                    page.keyboard.press('Tab')
                    focused = page.locator(':focus').bounding_box()
                    self.assertIsNotNone(focused, f'{route} next keyboard target remains visible')
                    self.assertGreaterEqual(focused['x'], 0, f'{route} keyboard target starts inside viewport')
                    self.assertLessEqual(focused['x'] + focused['width'], width + 1, f'{route} keyboard target fits viewport')
                    self.assert_page_fits(page, width, route)
            finally:
                context.close()

    def test_seven_range_controls_have_accessible_names_and_keyboard_updates(self):
        controls = [
            ('pdf-compressor', 'pc-quality', 'pc-qv', 'JPEG quality'),
            ('pdf-watermark', 'wm-opacity', 'wm-ov', 'Opacity'),
            ('image-size-optimizer', 'quality', 'quality-value', 'QUALITY'),
            ('qr-code-generator', 'width', 'width-value', 'PRINT WIDTH'),
            ('image-format-converter', 'quality', 'qv', 'Quality'),
            ('video-to-gif', 'fps', 'fpsout', 'Frame rate'),
            ('password-generator', 'pg-length', 'pg-length-out', 'Length'),
        ]
        context, page = self.make_page(375, 900)
        try:
            for slug, input_id, output_id, accessible_name in controls:
                route = f'/tools/{slug}/'
                page.goto(f'{self.base}{route}', wait_until='networkidle')
                slider = page.get_by_role('slider', name=re.compile(accessible_name, re.I))
                self.assertEqual(slider.count(), 1, f'{route} exposes one named slider matching {accessible_name!r}')
                before_value = slider.input_value()
                output = page.locator(f'#{output_id}')
                before_output = output.inner_text()
                slider.focus()
                page.keyboard.press('ArrowRight')
                self.assertNotEqual(slider.input_value(), before_value, f'{route} slider responds to keyboard input')
                self.assertNotEqual(output.inner_text(), before_output, f'{route} value announcement/display updates with the slider')
                box = slider.bounding_box()
                self.assertGreaterEqual(box['x'], 0)
                self.assertLessEqual(box['x'] + box['width'], 375 + 1)
        finally:
            context.close()

    def test_home_terminal_dialog_has_a_name_on_both_homepage_aliases(self):
        context, page = self.make_page(1280, 900)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            for alias in ('/', '/index.html'):
                page.goto(f'{self.base}{alias}', wait_until='networkidle')
                page.locator('#terminal-open').click()
                dialog = page.get_by_role('dialog', name='You found the back door.')
                self.assertEqual(dialog.count(), 1, f'{alias} terminal dialog has its heading as the accessible name')
                self.assertTrue(dialog.is_visible())
                self.assertEqual(page.locator('#terminal').get_attribute('aria-labelledby'), 'terminal-title')
                self.assertEqual(page.evaluate('document.activeElement.id'), 'command')
                page.keyboard.press('Escape')
                self.assertFalse(page.locator('#terminal').is_visible())
                self.assertEqual(page.evaluate('document.activeElement.id'), 'terminal-open')
        finally:
            context.close()
        self.assertEqual(errors, [], f'Unexpected homepage browser errors: {errors}')

    def test_jsonpath_invalid_input_is_free_then_valid_keyboard_retry_charges_once(self):
        context, page = self.make_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            page.goto(f'{self.base}/tools/jsonpath-query-tester/', wait_until='networkidle')
            self.assertTrue(page.get_by_role('status').is_visible() is False if page.get_by_role('status').count() else True)
            json_input = page.locator('#devtool-json')
            query_input = page.locator('#devtool-query')
            json_input.fill('{')
            query_input.fill('$.users[0].name')
            run = page.get_by_role('button', name='Run locally ↗')
            run.focus()
            page.keyboard.press('Enter')
            status = page.locator('#devtool-status')
            status.wait_for(state='visible')
            self.assertIn('JSON parse error', status.inner_text())
            self.assertIn('error', status.get_attribute('class'))
            self.assertIn('polite', status.get_attribute('aria-live'))
            self.assertIn('10 / 10', page.locator('#credit-pill').inner_text())
            self.assertTrue(page.get_by_role('button', name='Copy result').is_disabled())
            self.assertTrue(page.get_by_role('button', name='Download result').is_disabled())

            json_input.fill('{"users":[{"name":"Ada"}]}')
            run.focus()
            page.keyboard.press('Enter')
            page.locator('[aria-label="Tool result"]').wait_for(state='visible')
            self.assertIn('Ada', page.locator('[aria-label="Tool result"]').inner_text())
            self.assertIn('9 / 10', page.locator('#credit-pill').inner_text())
            self.assertTrue(page.get_by_role('button', name='Copy result').is_enabled())
            self.assertTrue(page.get_by_role('button', name='Download result').is_enabled())
        finally:
            context.close()
        self.assertEqual(errors, [], f'Unexpected JSONPath browser errors: {errors}')

    def test_sports_polling_interval_copy_and_filter_status_announcements_are_truthful_and_deduplicated(self):
        context, page = self.make_page()
        payload = {
            'connected': True,
            'updatedAt': '2026-10-31T12:00:00.000Z',
            'matches': [
                {'id': 'match-live', 'sport': 'football', 'league': 'Test League', 'home': {'name': 'Alpha', 'score': '0'}, 'away': {'name': 'Beta', 'score': '0'}, 'status': 'live'},
                {'id': 'match-upcoming', 'sport': 'cricket', 'league': 'Test League', 'home': {'name': 'Gamma', 'score': '—'}, 'away': {'name': 'Delta', 'score': '—'}, 'status': 'upcoming'},
            ],
        }
        state = {'fail': False}

        def feed(route):
            if state['fail']:
                route.fulfill(status=503, content_type='application/json', body='{}')
            else:
                route.fulfill(status=200, content_type='application/json', body=json.dumps(payload))

        page.route('**/sports-scores/scores.json*', feed)
        page.add_init_script("window.__pollIntervals=[]; const original=window.setInterval.bind(window); window.setInterval=(fn, delay, ...args)=>{window.__pollIntervals.push(Number(delay)); return original(fn, delay, ...args);};")
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            page.goto(f'{self.base}/sports-scores/', wait_until='networkidle')
            page.locator('#feed-state').get_by_text('First-party score feed connected').wait_for()
            self.assertIn('every 60 seconds', page.locator('#feed-polling-copy').inner_text())
            self.assertIn(60000, page.evaluate('window.__pollIntervals'))
            self.assertNotIn(1000, page.evaluate('window.__pollIntervals'))
            self.assertEqual(page.locator('#score-list').get_attribute('aria-live'), 'off')
            self.assertEqual(page.locator('#board-summary').get_attribute('role'), 'status')
            self.assertEqual(page.locator('#board-summary').get_attribute('aria-live'), 'polite')
            self.assertEqual(page.locator('#feed-notice').get_attribute('aria-live'), 'polite')
            self.assertIn('2 fixtures, 1 live', page.locator('#board-summary').inner_text())

            live_filter = page.get_by_role('button', name='Live')
            live_filter.focus()
            page.keyboard.press('Enter')
            self.assertEqual(live_filter.get_attribute('aria-pressed'), 'true')
            self.assertIn('Live filter: 1 fixture, 1 live', page.locator('#board-summary').inner_text())
            self.assertEqual(page.locator('.match-card').count(), 1)

            page.get_by_role('button', name='Results').press('Enter')
            self.assertIn('Results filter: 0 fixtures, 0 live, no matching fixtures', page.locator('#board-summary').inner_text())
            self.assertTrue(page.locator('#score-empty').is_visible())

            page.evaluate("window.__statusMutations=0; const watch=new MutationObserver(()=>window.__statusMutations++); for(const id of ['board-summary','feed-state','feed-updated']) watch.observe(document.getElementById(id), {subtree:true, childList:true, characterData:true}); window.__statusObserver=watch;")
            with page.expect_response(lambda response: 'scores.json' in response.url and response.status == 200):
                page.get_by_role('button', name='Refresh').click()
            page.wait_for_timeout(150)
            self.assertEqual(page.evaluate('window.__statusMutations'), 0, 'unchanged polling does not re-announce identical status text')

            state['fail'] = True
            with page.expect_response(lambda response: 'scores.json' in response.url and response.status == 503):
                page.get_by_role('button', name='Refresh').click()
            page.locator('#feed-state').get_by_text('The same-site score feed is unavailable').wait_for()
            self.assertIn('Feed not connected', page.locator('#board-summary').inner_text())
        finally:
            context.close()
        self.assertEqual(errors, [], f'Unexpected sports browser errors: {errors}')

    def test_generated_tool_copy_failure_is_reported_as_an_error_and_does_not_charge_again(self):
        context, page = self.make_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            page.goto(f'{self.base}/tools/capacity-buffer-planner/', wait_until='networkidle')
            page.locator('#new-tool-run').click()
            page.locator('#new-tool-result').wait_for(state='visible')
            self.assertIn('9 / 10', page.locator('#credit-pill').inner_text())
            page.evaluate('window.AHToolkit.copy = async () => false; true')
            copy = page.locator('#new-tool-copy')
            copy.focus()
            page.keyboard.press('Enter')
            status = page.locator('#new-tool-status')
            self.assertIn('Copy failed; select the result text manually.', status.inner_text())
            self.assertIn('error', status.get_attribute('class'))
            self.assertNotIn('success', status.get_attribute('class'))
            page.evaluate('window.AHToolkit.copy = async () => { throw new Error("clipboard denied"); }; true')
            copy.click()
            self.assertIn('Copy failed; select the result text manually.', status.inner_text())
            self.assertIn('error', status.get_attribute('class'))
            self.assertIn('9 / 10', page.locator('#credit-pill').inner_text())
        finally:
            context.close()
        self.assertEqual(errors, [], f'Unexpected generated-tool browser errors: {errors}')


if __name__ == '__main__':
    unittest.main()
