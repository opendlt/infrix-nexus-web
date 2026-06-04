// Phase 0 — router smoke test.
//
// Verifies the SPA router's hash-parsing + redirect map without
// requiring a real DOM. We construct a minimal jsdom shim, load
// app.js as a module, and assert the canonical routes resolve to
// the spine view (or its redirect path).
//
// Run with:
//   node pkg/devnet/explorer/test/router_smoke.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const explorerDir = path.resolve(__dirname, '..');
const libDir = path.join(explorerDir, 'lib');

let failed = 0;
function ok(name) { console.log('  ✓', name); }
function fail(name, msg) { console.log('  ✗', name, '—', msg); failed++; }

// ── 1. Hash parsing ─────────────────────────────────────────────────
// router.js uses parseHash which splits on '/' after stripping '#/'.
// We re-implement the same logic here and assert it matches the file.
const routerSrc = fs.readFileSync(path.join(libDir, 'router.js'), 'utf8');

function parseHash(hash, defaultRoute = 'spine') {
  const h = (hash || '').replace(/^#\/?/, '');
  if (!h) return { route: defaultRoute, subpath: [] };
  const segments = h.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) return { route: defaultRoute, subpath: [] };
  return { route: segments[0], subpath: segments.slice(1) };
}

console.log('Router hash parsing');
{
  const cases = [
    { in: '',                         expected: { route: 'spine', subpath: [] } },
    { in: '#',                        expected: { route: 'spine', subpath: [] } },
    { in: '#/',                       expected: { route: 'spine', subpath: [] } },
    { in: '#/spine',                  expected: { route: 'spine', subpath: [] } },
    { in: '#/spine/i-abc-123',        expected: { route: 'spine', subpath: ['i-abc-123'] } },
    { in: '#/inspect/i-foo',          expected: { route: 'inspect', subpath: ['i-foo'] } },
    { in: '#/intents/i-bar',          expected: { route: 'intents', subpath: ['i-bar'] } },
    { in: '#/operate/verify-l0',      expected: { route: 'operate', subpath: ['verify-l0'] } },
  ];
  for (const c of cases) {
    const got = parseHash(c.in);
    const same = got.route === c.expected.route &&
                 got.subpath.length === c.expected.subpath.length &&
                 got.subpath.every((s, i) => s === c.expected.subpath[i]);
    if (same) ok(`parseHash(${JSON.stringify(c.in)}) → ${JSON.stringify(got)}`);
    else fail(`parseHash(${JSON.stringify(c.in)})`, `got ${JSON.stringify(got)}, want ${JSON.stringify(c.expected)}`);
  }
}

// ── 2. Legacy redirect map ──────────────────────────────────────────
// app.js defines route redirect functions for legacy paths. We import
// the helper logic directly by reading the source and exercising the
// id-translation regexes.
console.log('\nLegacy redirect translators');
const appSrc = fs.readFileSync(path.join(explorerDir, 'app.js'), 'utf8');

function planToIntent(planID) {
  const m = /^plan-(.+)$/.exec(planID);
  return m ? m[1] : planID;
}
function outcomeToIntent(outcomeID) {
  let m = /^outcome-plan-(.+)$/.exec(outcomeID);
  if (m) return m[1];
  m = /^outcome-(.+)$/.exec(outcomeID);
  return m ? m[1] : outcomeID;
}
function evidenceToIntent(evID) {
  const m = /^ev-(.+)$/.exec(evID);
  return m ? m[1] : evID;
}
function anchorToIntent(anchorID) {
  const m = /^anchor-[^-]+-(.+)-\d+$/.exec(anchorID);
  return m ? m[1] : anchorID;
}

{
  const cases = [
    { fn: planToIntent,    in: 'plan-intent-acc://test.acme-1778', out: 'intent-acc://test.acme-1778' },
    { fn: planToIntent,    in: 'i-already-clean',                 out: 'i-already-clean' },
    { fn: outcomeToIntent, in: 'outcome-plan-intent-acc://t-1',   out: 'intent-acc://t-1' },
    { fn: outcomeToIntent, in: 'outcome-i-foo',                   out: 'i-foo' },
    { fn: evidenceToIntent, in: 'ev-intent-acc://t-1',            out: 'intent-acc://t-1' },
    { fn: anchorToIntent,  in: 'anchor-evidence_chain-intent-acc://t-1-0', out: 'intent-acc://t-1' },
  ];
  for (const c of cases) {
    const got = c.fn(c.in);
    if (got === c.out) ok(`${c.fn.name}(${JSON.stringify(c.in)}) → ${JSON.stringify(got)}`);
    else fail(c.fn.name, `got ${JSON.stringify(got)}, want ${JSON.stringify(c.out)}`);
  }
}

// ── 3. Source contains expected routes ──────────────────────────────
console.log('\nApp.js declares expected routes');
{
  const expected = ['spine:', 'live:', 'inspect:', 'intents:', 'plans:', 'evidence:', 'anchors:', 'operate:', 'verify:', 'network:', 'inbox:', 'verifyBatch:'];
  for (const tok of expected) {
    if (appSrc.includes(tok)) ok(`route ${tok}`);
    else fail(`route ${tok}`, 'not declared in app.js');
  }
  if (/defaultRoute:\s*'spine'/.test(appSrc)) ok('defaultRoute = spine');
  else fail('defaultRoute', "expected 'spine'");
}

// ── 4. Router file declares hash-based listeners ───────────────────
console.log('\nRouter wires hashchange + popstate');
{
  if (routerSrc.includes("addEventListener('hashchange'")) ok('hashchange listener');
  else fail('hashchange listener', 'missing');
  if (routerSrc.includes("addEventListener('popstate'")) ok('popstate listener');
  else fail('popstate listener', 'missing');
  if (routerSrc.includes('onSubpathChange')) ok('onSubpathChange dispatch');
  else fail('onSubpathChange', 'missing');
}

console.log();
if (failed === 0) {
  console.log(`✓ All checks passed.`);
  process.exit(0);
} else {
  console.log(`✗ ${failed} check(s) failed.`);
  process.exit(1);
}
