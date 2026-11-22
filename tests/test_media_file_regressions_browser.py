import math
import os
import shutil
import struct
import tempfile
import threading
import unittest
import wave
import zipfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sync_playwright = None

ROOT = Path(__file__).resolve().parents[1]
SITE = Path(os.environ.get('MEDIA_REGRESSION_SITE_ROOT', ROOT / 'site')).resolve()
BASE_PATH = os.environ.get('MEDIA_REGRESSION_BASE_PATH', '').rstrip('/')
CHROMIUM = shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')
PDFJS_MODULE = r"""
export const GlobalWorkerOptions = {};
export function getDocument({data}) {
  if (!data || !data.length) throw new Error('Fixture bytes missing');
  return {promise: Promise.resolve({
    numPages: 2,
    getPage: async pageNumber => ({
      getViewport: ({scale}) => ({width: 80 * scale, height: 60 * scale}),
      render: ({canvasContext, viewport}) => {
        canvasContext.fillStyle = pageNumber === 1 ? '#d42836' : '#187c49';
        canvasContext.fillRect(0, 0, viewport.width, viewport.height);
        return {promise: Promise.resolve()};
      },
    }),
  })};
}
"""


@unittest.skipUnless(sync_playwright and CHROMIUM, 'Playwright and Chromium are needed for these browser regression tests')
class MediaFileBrowserRegressionTest(unittest.TestCase):
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
        cls.external_requests = []
        cls.page_errors = []
        cls.wav_path = Path(tempfile.gettempdir()) / 'cue-qa-two-second-tone.wav'
        with wave.open(str(cls.wav_path), 'wb') as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(48000)
            frames = bytearray()
            for index in range(96000):
                sample = int(9000 * math.sin(2 * math.pi * 440 * index / 48000))
                frames.extend(struct.pack('<h', sample))
            output.writeframes(frames)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)
        try:
            cls.wav_path.unlink()
        except FileNotFoundError:
            pass

    def setUp(self):
        self.external_requests = []
        self.page_errors = []
        self.playwright = sync_playwright().start()
        self.browser = self.playwright.chromium.launch(
            headless=True,
            executable_path=CHROMIUM,
            args=['--no-sandbox', '--disable-dev-shm-usage'],
        )
        self.context = self.browser.new_context(accept_downloads=True, viewport={'width': 390, 'height': 844})

        def guard(route):
            parsed = urlsplit(route.request.url)
            if parsed.scheme in ('http', 'https') and parsed.netloc != urlsplit(self.origin).netloc:
                self.external_requests.append(route.request.url)
                route.abort()
            else:
                route.continue_()

        self.context.route('**/*', guard)
        self.page = self.context.new_page()
        self.page.on('pageerror', lambda error: self.page_errors.append(str(error)))

    def tearDown(self):
        self.context.close()
        self.browser.close()
        self.playwright.stop()

    def visit(self, slug):
        page = self.page.goto(f'{self.origin}{BASE_PATH}/tools/{slug}/', wait_until='domcontentloaded')
        self.assertEqual(page.status, 200)

    def assert_clean_browser(self):
        self.assertEqual(self.page_errors, [])
        self.assertEqual(self.external_requests, [])

    @staticmethod
    def assert_valid_wav(path, expected_duration, tolerance=0.04):
        data = Path(path).read_bytes()
        if len(data) < 44:
            raise AssertionError('WAV output is shorter than its 44-byte header')
        if data[:4] != b'RIFF' or data[8:12] != b'WAVE' or data[36:40] != b'data':
            raise AssertionError('Output does not contain a valid PCM WAV header')
        riff_size = struct.unpack_from('<I', data, 4)[0]
        payload_size = struct.unpack_from('<I', data, 40)[0]
        if riff_size != len(data) - 8 or payload_size != len(data) - 44:
            raise AssertionError('WAV RIFF/data lengths do not match the downloaded bytes')
        with wave.open(str(path), 'rb') as source:
            duration = source.getnframes() / source.getframerate()
            if abs(duration - expected_duration) > tolerance:
                raise AssertionError(f'Expected about {expected_duration}s of audio, got {duration:.3f}s')

    def test_fade_generator_exports_complete_pcm_wav(self):
        self.visit('fade-generator')
        self.page.locator('#f').set_input_files(str(self.wav_path))
        self.page.locator('#i').fill('0.5')
        self.page.locator('#o').fill('0.5')
        with self.page.expect_download(timeout=12000) as pending:
            self.page.locator('#g').click()
        download = pending.value
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / download.suggested_filename
            download.save_as(str(output))
            self.assert_valid_wav(output, 2.0)
        self.assertIn('Faded audio downloaded.', self.page.locator('#s').inner_text())
        self.assert_clean_browser()

    def test_waveform_cutter_decodes_and_exports_selected_pcm_range(self):
        self.visit('waveform-cutter')
        self.page.locator('#f').set_input_files(str(self.wav_path))
        self.page.wait_for_function("() => /seconds ready/.test(document.querySelector('#s')?.textContent || '')", timeout=8000)
        self.page.locator('#a').fill('0.25')
        self.page.locator('#b').fill('1.25')
        with self.page.expect_download(timeout=12000) as pending:
            self.page.locator('#g').click()
        download = pending.value
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / download.suggested_filename
            download.save_as(str(output))
            self.assert_valid_wav(output, 1.0)
        self.assertIn('Cut audio downloaded.', self.page.locator('#s').inner_text())
        self.assert_clean_browser()

    def test_pixel_drawing_board_exports_a_stroke_from_its_transparent_canvas(self):
        self.visit('image-drawing-board')
        canvas = self.page.locator('#canvas')
        bounds = canvas.bounding_box()
        self.page.mouse.move(bounds['x'] + 70, bounds['y'] + 80)
        self.page.mouse.down()
        self.page.mouse.move(bounds['x'] + 260, bounds['y'] + 180, steps=8)
        self.page.mouse.up()
        drawn_pixels = canvas.evaluate("c => {const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let count=0;for(let i=3;i<d.length;i+=4)if(d[i])count++;return count}")
        self.assertGreater(drawn_pixels, 0, 'The synthetic stroke must leave pixels on the canvas')
        with self.page.expect_download(timeout=12000) as pending:
            self.page.locator('#run').click()
        download = pending.value
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / download.suggested_filename
            download.save_as(str(output))
            data = output.read_bytes()
            self.assertTrue(data.startswith(b'\x89PNG\r\n\x1a\n'))
            self.assertEqual(struct.unpack_from('>II', data, 16), (900, 600))
        self.assertIn('Drawing downloaded.', self.page.locator('#status').inner_text())
        self.assert_clean_browser()

    def test_pdf_to_images_renders_selected_pages_into_a_valid_zip(self):
        self.visit('pdf-to-images')

        def mock_pdfjs(route):
            route.fulfill(
                status=200,
                body=PDFJS_MODULE,
                content_type='application/javascript',
                headers={'access-control-allow-origin': '*'},
            )

        self.context.route('**/pdf.min.mjs', mock_pdfjs)
        self.page.locator('#pti-file').set_input_files({
            'name': 'qa-two-page.pdf',
            'mimeType': 'application/pdf',
            'buffer': b'%PDF-1.4\nSynthetic PDF.js mock fixture\n%%EOF',
        })
        self.page.locator('#pti-pages').fill('1-2')
        self.page.locator('#pti-scale').select_option('1')
        with self.page.expect_download(timeout=15000) as pending:
            self.page.locator('#pti-run').click()
        download = pending.value
        self.assertEqual(download.suggested_filename, 'pdf-pages.zip')
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / download.suggested_filename
            download.save_as(str(output))
            with zipfile.ZipFile(output) as archive:
                self.assertEqual(archive.namelist(), ['page-001.png', 'page-002.png'])
                for name in archive.namelist():
                    png = archive.read(name)
                    self.assertTrue(png.startswith(b'\x89PNG\r\n\x1a\n'))
                    self.assertEqual(struct.unpack_from('>II', png, 16), (80, 60))
        self.assertIn('Exported 2 pages successfully.', self.page.locator('#pti-status').inner_text())
        self.assertEqual(self.page_errors, [])
        # The PDF.js module request is fulfilled locally by the test; no outbound request is made.
        self.assertEqual(self.external_requests, [])
