# Day-mode contrast and responsive regression

`day-contrast-regression.cjs` checks the built GitHub Pages output on ten representative routes: Home, Article, Districts (including its no-results state), Info, Tools Hub, Passport Photo Studio, Sports, Background Remover, QR Generator, and Text Detector. Every route is checked in Night and Day at 320, 390, 430, 768, and 1440 CSS pixels.

## Run

Run these commands serially from the repository root:

```sh
node scripts/build-github-pages.mjs
SCREENSHOTS=1 SCREENSHOT_DIR=/path/to/evidence node tests/day-contrast-regression.cjs
npm test
```

The browser test serves the isolated `public/` output at `http://127.0.0.1:4173/After-hours/`. Set `CONTRAST_REPORT` or `SCREENSHOT_DIR` to store the generated report and screenshots elsewhere. Outputs are QA evidence, not pixel goldens.

## What it checks

The test measures visible text and input placeholders against WCAG contrast thresholds of 4.5:1 for normal text and 3:1 for large or bold text. It waits for the shared theme stylesheets and fonts, and for Day/Night color transitions to settle, before measuring. Backgrounds involving imagery, gradients, transparency, or opacity are recorded as indeterminate rather than assigned a guessed ratio; the viewport screenshots make those cases reviewable.

For the Background Remover, each Day viewport explicitly audits every visible text run inside `#process-button`, verifies the button retains both its native disabled state and `disabled` attribute, requires a reliable solid button surface and at least 4.5:1 text contrast, and records its colors, opacity, cursor, and per-run ratios. With `SCREENSHOTS=1`, it saves a scrolled screenshot of that disabled control at all five widths.

Keyboard focus is tested with actual sequential `Tab` navigation, starting from a fresh page; it does not call `element.focus()`. At 320px and 1440px, the audit checks all rendered Tab stops in both themes. Day focus indicators must be visible and measurable rings must meet a 3:1 contrast floor. Day focus rings use no color/offset transition so they are legible immediately. Night focus traversal is also recorded.

Disabled-control usability is reported separately from WCAG text contrast: visible disabled controls are checked for opacity-based washout and CSS filters, with an opacity floor of 0.9 and no filter required. The test also verifies Night as the default, theme toggling/restoration, route responses, page titles, and horizontal overflow.
