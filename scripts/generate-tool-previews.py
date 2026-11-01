"""Generate decorative, real-interface previews for the English category cards.

Optional dev dependencies: pip install playwright Pillow
Run against a local preview only: python3 scripts/generate-tool-previews.py
No controls are submitted, no quota actions run, and external requests are blocked.
"""
import argparse
import asyncio
from io import BytesIO
import json
from pathlib import Path
import subprocess
from urllib.parse import urlparse
from PIL import Image
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'site/tools/_shared/previews'
CATALOG = r"""
const fs=require('node:fs'),vm=require('node:vm');
const box={window:{},document:{querySelector:()=>null,querySelectorAll:()=>[]}};
vm.createContext(box);
for(const file of ['site/tools/_shared/planner-catalog-data.js','site/tools/_shared/new-tools-catalog-data.js','site/tools/catalog.js'])vm.runInContext(fs.readFileSync(file,'utf8'),box);
vm.runInContext('globalThis.tools=categories.flatMap(c=>c.availableTools)',box);
process.stdout.write(JSON.stringify(box.tools));
"""

async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default='http://127.0.0.1:4181')
    parser.add_argument('--workers', type=int, default=6)
    parser.add_argument('--slugs', nargs='*')
    args = parser.parse_args()
    if urlparse(args.base).hostname not in ('127.0.0.1', 'localhost'):
        parser.error('Use the local development server, not the deployed website.')
    tools = json.loads(subprocess.check_output(['node', '-e', CATALOG], cwd=ROOT))
    if args.slugs:
        tools = [t for t in tools if t['href'].strip('/').split('/')[-1] in args.slugs]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    pending = asyncio.Queue()
    for tool in tools:
        pending.put_nowait(tool)
    completed, failures = [], []
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        context = await browser.new_context(viewport={'width': 900, 'height': 900}, reduced_motion='reduce', device_scale_factor=1)
        async def local_only(route):
            if urlparse(route.request.url).hostname in ('127.0.0.1', 'localhost') or route.request.url.startswith(('data:', 'blob:')):
                await route.continue_()
            else:
                await route.abort()
        await context.route('**/*', local_only)
        async def worker():
            page = await context.new_page()
            while not pending.empty():
                tool = pending.get_nowait()
                slug = tool['href'].strip('/').split('/')[-1]
                try:
                    response = await page.goto(args.base.rstrip('/') + tool['href'], wait_until='load', timeout=30000)
                    if not response or response.status != 200:
                        raise RuntimeError(f'HTTP {response.status if response else None}')
                    await page.wait_for_function("!document.querySelector('#tool-shell') || !!document.querySelector('#tool-shell main')", timeout=8000)
                    await page.evaluate('document.fonts.ready')
                    # Capture the real workspace as-is, including pages with strict CSP.
                    # The browser context requests reduced motion; no tool controls run.
                    region = page.locator('.workspace').first
                    if not await region.count():
                        region = page.locator('main').first
                    if not await region.count():
                        region = page.locator('body')
                    raw = await region.screenshot(type='png', animations='disabled', timeout=15000)
                    source = Image.open(BytesIO(raw)).convert('RGB')
                    w, h = source.size
                    target_h = round(w * 9 / 16)
                    if h < target_h:
                        canvas = Image.new('RGB', (w, target_h), (12, 17, 27))
                        canvas.paste(source, (0, 0))
                        source = canvas
                    source = source.crop((0, 0, w, target_h)).resize((640, 360), Image.Resampling.LANCZOS)
                    source.save(OUTPUT / f'{slug}.webp', 'WEBP', quality=78, method=5)
                    completed.append(slug)
                    if len(completed) % 25 == 0 or len(tools) < 25:
                        print(f'{len(completed)}/{len(tools)} previews generated — {slug}', flush=True)
                except Exception as error:
                    failures.append({'slug': slug, 'error': str(error)})
                    print(f'FAILED {slug}: {error}', flush=True)
                finally:
                    pending.task_done()
            await page.close()
        await asyncio.gather(*(worker() for _ in range(min(args.workers, len(tools)))))
        await browser.close()
    print(json.dumps({'generated': len(completed), 'failures': failures}, indent=2), flush=True)
    if failures:
        raise SystemExit(1)

if __name__ == '__main__':
    asyncio.run(main())
