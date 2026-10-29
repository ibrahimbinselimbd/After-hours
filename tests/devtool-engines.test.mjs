import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engineRoot = path.join(repoRoot, 'site/tools/_shared/devtool-engines');
const fixtures = JSON.parse(fs.readFileSync(path.join(repoRoot, 'tests/fixtures/devtool-engine-smoke.json'), 'utf8')).fixtures;

assert.equal(fixtures.length, 50, 'the smoke fixture must cover all 50 researched tools');

for (const fixture of fixtures) {
  test(`${fixture.slug} engine smoke test`, async () => {
    const sourcePath = path.join(engineRoot, `${fixture.slug}.js`);
    assert.ok(fs.existsSync(sourcePath), `${fixture.slug} module must exist`);
    const source = fs.readFileSync(sourcePath, 'utf8');
    assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|\beval\s*\(/, 'engine must stay local and must not evaluate code');

    const window = {AHDevToolEngines: {}, crypto: webcrypto};
    const sandbox = {
      window,
      crypto: webcrypto,
      TextEncoder,
      TextDecoder,
      Uint8Array,
      ArrayBuffer,
      DataView,
      Blob,
      URL,
      atob: globalThis.atob,
      btoa: globalThis.btoa,
      console,
    };
    vm.runInNewContext(source, sandbox, {filename: sourcePath, timeout: 2_000});
    const engine = window.AHDevToolEngines[fixture.slug];
    assert.ok(engine, `${fixture.slug} must register a distinct engine`);
    assert.equal(typeof engine.run, 'function', `${fixture.slug} must expose a runnable operation`);
    assert.ok(Array.isArray(engine.fields) && engine.fields.length >= 1 && engine.fields.length <= 4, `${fixture.slug} must declare 1–4 supported inputs`);
    assert.equal(new Set(engine.fields.map(field => field.id)).size, engine.fields.length, `${fixture.slug} field IDs must be unique`);
    for (const field of engine.fields) assert.ok(['text', 'textarea'].includes(field.type), `${fixture.slug} field ${field.id} must use a supported local text input`);

    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error(`${fixture.slug} smoke run exceeded 5 seconds`)), 5_000));
    const raw = await Promise.race([Promise.resolve().then(() => engine.run(fixture.input)), timeout]);
    const text = typeof raw === 'string' ? raw : raw?.text;
    assert.equal(typeof text, 'string', `${fixture.slug} must return plain text, not HTML`);
    assert.ok(text.trim().length > 0, `${fixture.slug} must return a useful diagnostic or result for its sample`);
    assert.ok(text.length <= 1_000_000, `${fixture.slug} output must remain within the shared runtime display limit`);
  });
}
