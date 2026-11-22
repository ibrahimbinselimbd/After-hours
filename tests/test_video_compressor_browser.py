import re
import os
import shutil
import tempfile
import threading
import unittest
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sync_playwright = None

ROOT = Path(__file__).resolve().parents[1]
SITE = Path(os.environ.get('VIDEO_COMPRESSOR_SITE_ROOT', ROOT / 'site')).resolve()
BASE_PATH = os.environ.get('VIDEO_COMPRESSOR_BASE_PATH', '').rstrip('/')
FIXTURE = Path(__file__).resolve().parent / 'fixtures' / 'video-compressor-sample.webm'
CHROMIUM = shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')


@unittest.skipUnless(sync_playwright and CHROMIUM, 'Playwright and Chromium are needed for this optional browser regression test')
class VideoCompressorBrowserRegressionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        class QuietHandler(SimpleHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def translate_path(self, path):
                path = urlsplit(path).path
                if BASE_PATH and (path == BASE_PATH or path.startswith(BASE_PATH + '/')):
                    path = path[len(BASE_PATH):] or '/'
                return super().translate_path(path)

        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), lambda *args: QuietHandler(*args, directory=str(SITE)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.origin = f'http://127.0.0.1:{cls.server.server_port}'
        cls.base = cls.origin + BASE_PATH + '/tools/video-compressor/'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def test_local_webm_compression_cleans_up_without_reference_error(self):
        page_errors = []
        external_requests = []
        self.assertTrue(FIXTURE.is_file(), 'The small synthetic VP8 WebM fixture must be present')
        sample = FIXTURE.read_bytes()
        self.assertTrue(sample.startswith(bytes.fromhex('1A45DFA3')))
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True, executable_path=CHROMIUM, args=['--no-sandbox', '--disable-dev-shm-usage'])
            context = browser.new_context(accept_downloads=True, viewport={'width': 390, 'height': 844})

            def guard(route):
                parsed = urlsplit(route.request.url)
                if parsed.scheme in ('http', 'https') and parsed.netloc != urlsplit(self.origin).netloc:
                    external_requests.append(route.request.url)
                    route.abort()
                else:
                    route.continue_()

            context.route('**/*', guard)
            page = context.new_page()
            page.on('pageerror', lambda error: page_errors.append(str(error)))
            response = page.goto(self.base, wait_until='domcontentloaded')
            self.assertEqual(response.status, 200)
            self.assertIn('Selected output:', page.locator('#codec').inner_text())
            page.locator('#file').set_input_files({
                'name': 'qa-compressor-source.webm',
                'mimeType': 'video/webm',
                'buffer': sample,
            })
            for _ in range(60):
                meta = page.locator('#meta').inner_text()
                if re.search(r'\d+\.\d+ s', meta):
                    break
                page.wait_for_timeout(100)
            self.assertRegex(page.locator('#meta').inner_text(), r'160 × 120 · 1\.2 s')

            with page.expect_download(timeout=15000) as pending:
                page.locator('#run').click()
            download = pending.value
            self.assertEqual(download.suggested_filename, 'afterhours-compressed.webm')
            with tempfile.TemporaryDirectory() as directory:
                output = Path(directory) / download.suggested_filename
                download.save_as(str(output))
                self.assertGreater(output.stat().st_size, 100)
                self.assertTrue(output.read_bytes().startswith(bytes.fromhex('1A45DFA3')), 'Output should be a WebM/EBML file')

            self.assertIn('Transcode finished and verified', page.locator('#status').inner_text())
            self.assertIn('9 / 10', page.locator('#credit-pill').inner_text())
            page.wait_for_timeout(100)
            self.assertEqual(page_errors, [])
            self.assertEqual(external_requests, [])
            context.close()
            browser.close()
