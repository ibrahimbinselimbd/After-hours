"""Responsive browser checks for the English homepage day/night switch.

Run: python3 tests/browser-home-theme-toggle.py http://127.0.0.1:8795/After-hours/
"""
import sys
from playwright.sync_api import sync_playwright

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8795/'
VIEWPORTS = [(390, 844), (768, 1024), (1440, 900)]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width, height in VIEWPORTS:
        context = browser.new_context(viewport={'width': width, 'height': height}, color_scheme='light', device_scale_factor=1)
        page = context.new_page()
        page.goto(BASE_URL, wait_until='load')
        toggle = page.get_by_role('button', name='Day and night mode')
        toggle.wait_for(state='visible')
        assert page.locator('html').get_attribute('data-theme') == 'night', f'{width}px: default must stay night even with a light OS preference'
        assert toggle.get_attribute('aria-pressed') == 'false'
        assert toggle.get_attribute('title') == 'Switch to day mode'
        rect = toggle.bounding_box()
        assert rect is not None and rect['x'] >= 0 and rect['x'] + rect['width'] <= width, f'{width}px: toggle must fit the viewport'
        assert abs((rect['y'] + rect['height'] / 2) - height * .52) < 2, f'{width}px: toggle must stay at the marked viewport position'
        assert page.locator('#theme-toggle').evaluate('(el) => getComputedStyle(el).position') == 'fixed'

        icon_night = toggle.inner_html()
        page.evaluate("window.scrollTo({top: document.documentElement.scrollHeight, behavior: 'instant'})")
        page.wait_for_timeout(250)
        scrolled = toggle.bounding_box()
        assert scrolled is not None and abs(scrolled['y'] - rect['y']) < 1, f'{width}px: toggle moved while scrolling'

        toggle.click()
        assert page.locator('html').get_attribute('data-theme') == 'day'
        assert toggle.get_attribute('aria-pressed') == 'true'
        assert toggle.get_attribute('title') == 'Switch to night mode'
        assert toggle.inner_html() != icon_night
        assert page.locator('meta[name="theme-color"]').get_attribute('content') == '#f1f4ed'
        assert page.locator('html').evaluate('(el) => getComputedStyle(el).colorScheme') == 'light'
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), f'{width}px: day mode widened the page'
        page.reload(wait_until='load')
        toggle = page.get_by_role('button', name='Day and night mode')
        assert page.locator('html').get_attribute('data-theme') == 'day', f'{width}px: preference did not persist'
        assert toggle.get_attribute('aria-pressed') == 'true'
        toggle.click()
        assert page.locator('html').get_attribute('data-theme') == 'night'
        assert toggle.get_attribute('aria-pressed') == 'false'
        assert page.locator('meta[name="theme-color"]').get_attribute('content') == '#080a16'
        print(f'{width}x{height}: default night, day/night switching, persistence, fixed scroll position and viewport fit passed', flush=True)
        context.close()
    browser.close()
