import shutil
import struct
import threading
import unittest
import zlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sync_playwright = None

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
CHROMIUM = shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')


def png_chunk(kind, data):
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)


def sample_png(width=360, height=180):
    rows = []
    for y in range(height):
        row = bytearray([0])
        for x in range(width):
            # A pale, flat canvas with a dark line standing in for old screenshot text.
            pixel = (25, 25, 25) if 75 <= y < 96 and 45 <= x < 205 else (238, 238, 238)
            row.extend(pixel)
        rows.append(bytes(row))
    raw = b''.join(rows)
    header = struct.pack('!IIBBBBB', width, height, 8, 2, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', header) + png_chunk(b'IDAT', zlib.compress(raw)) + png_chunk(b'IEND', b'')


@unittest.skipUnless(sync_playwright and CHROMIUM, 'Playwright and Chromium are needed for this optional browser integration test')
class PlannerBrowserIntegrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        class QuietHandler(SimpleHTTPRequestHandler):
            def log_message(self, *_args):
                pass

        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), lambda *args: QuietHandler(*args, directory=str(SITE)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def test_planner_draft_credit_and_screenshot_editor_export(self):
        errors = []
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True, executable_path=CHROMIUM, args=['--no-sandbox', '--disable-dev-shm-usage'])
            context = browser.new_context(accept_downloads=True, viewport={'width': 1280, 'height': 900})
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'{self.base}/tools/cross-platform-game-backlog-session-tracker/', wait_until='networkidle')
            self.assertEqual(page.locator('h1').text_content(), 'Cross-Platform Game Backlog & Session Tracker')
            self.assertTrue(page.locator('#planner-run').is_visible())
            fields = page.evaluate("window.AHPlannerTools.find(x => x.slug === 'cross-platform-game-backlog-session-tracker').fields")
            for field in fields:
                key = field.get('id') or field.get('name')
                control = page.locator(f'[name="{key}"]')
                if not control.count():
                    continue
                field_type = field.get('type')
                value = field.get('default')
                if value is None:
                    if field_type == 'number': value = str(max(int(field.get('min', 1)), 1))
                    elif field_type == 'date': value = '2025-01-15'
                    elif field_type == 'select':
                        options = field.get('options') or []
                        value = options[0].get('value') if options and isinstance(options[0], dict) else (options[0] if options else '')
                    elif field_type == 'checkbox': value = False
                    elif field_type in ('text', 'textarea'): value = 'Example item'
                if field_type == 'checkbox':
                    if value: control.check()
                    else: control.uncheck()
                elif field_type == 'select':
                    if value != '': control.select_option(str(value))
                else:
                    control.fill(str(value if value is not None else ''))
            first_text = page.locator('.planner-fields input[type="text"], .planner-fields textarea').first
            if first_text.count():
                first_text.fill('Local draft test')
                page.reload(wait_until='networkidle')
                self.assertEqual(page.locator('.planner-fields input[type="text"], .planner-fields textarea').first.input_value(), 'Local draft test')
            self.assertIn('10 / 10', page.locator('#credit-pill').inner_text())
            page.locator('#planner-run').click()
            self.assertTrue(page.locator('#planner-result').is_visible())
            self.assertGreater(len(page.locator('#planner-output').inner_text()), 0)
            self.assertIn('9 / 10', page.locator('#credit-pill').inner_text())

            page.goto(f'{self.base}/tools/screenshot-photo-text-editor/', wait_until='networkidle')
            self.assertEqual(page.locator('h1').text_content(), 'Screenshot & Photo Text Editor')
            self.assertEqual(page.evaluate('typeof window.Tesseract'), 'undefined', 'OCR code must remain unloaded until requested')
            source_png = sample_png()
            page.locator('#photo-file').set_input_files({'name': 'local-sample.png', 'mimeType': 'image/png', 'buffer': source_png})
            page.get_by_text('Image opened locally', exact=False).wait_for()
            self.assertTrue(page.locator('#add-text').is_enabled())
            page.locator('#add-text').click()
            text_control = page.locator('#text-lines [data-field="text"]').last
            text_control.fill('Replacement text')
            self.assertIn('Closest width suggestions', page.locator('#text-lines').inner_text())

            def canvas_xy(x, y):
                stage = page.locator('#image-stage')
                stage.scroll_into_view_if_needed()
                box = stage.bounding_box()
                return box['x'] + x * box['width'] / 360, box['y'] + y * box['height'] / 180
            page.locator('#select-repair').click()
            x1, y1 = canvas_xy(35, 65)
            x2, y2 = canvas_xy(215, 105)
            page.mouse.move(x1, y1)
            page.mouse.down()
            page.mouse.move(x2, y2, steps=5)
            page.mouse.up()
            self.assertTrue(page.locator('#choose-sample').is_enabled())
            page.locator('#choose-sample').click()
            sx, sy = canvas_xy(260, 135)
            page.mouse.click(sx, sy)
            page.locator('#start-repair').click()
            bx1, by1 = canvas_xy(60, 85)
            bx2, by2 = canvas_xy(170, 85)
            page.mouse.move(bx1, by1)
            page.mouse.down()
            page.mouse.move(bx2, by2, steps=8)
            page.mouse.up()
            self.assertTrue(page.locator('#undo-repair').is_enabled())
            self.assertIn('9 / 10', page.locator('#credit-pill').inner_text(), 'manual editing alone does not spend a credit')
            page.locator('#download-name').fill('local-edited-image.png')
            with page.expect_download() as download_info:
                page.locator('#export-image').click()
            download = download_info.value
            self.assertEqual(download.suggested_filename, 'local-edited-image.png')
            self.assertIn('8 / 10', page.locator('#credit-pill').inner_text())
            self.assertTrue(page.get_by_text('Edited PNG exported locally', exact=False).is_visible())
            self.assertEqual(page.evaluate('typeof window.Tesseract'), 'undefined')
            browser.close()
        self.assertEqual(errors, [], f'Unexpected browser errors: {errors}')


if __name__ == '__main__':
    unittest.main()
