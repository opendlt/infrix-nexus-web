// RUNBOOK-02 — spine strip (Cockpit hero) smoke.
//
// The strip had zero importers until RUNBOOK-02 promoted it to the Cockpit
// hero, so nothing exercised it. This no-browser smoke proves:
//   1. Single source — spineCommon.STAGES is the canonical 7-stage definition.
//   2. No drift — timeline/narrative/spineStrip + dossier/evidenceProof/
//      executionGraph import the shared stages and declare no local copy.
//   3. The strip renders 7 cards + 6 connectors in canonical order.
//   4. Stage-click invokes onStageClick(stageKey, stageNum).
//   5. Mode switch: showIntentProgression() enters narrative mode + marks
//      completed cards; showThroughput() leaves it.
//   6. destroy() unsubscribes without throwing.
//
// Real spineStrip.js + spineCommon.js are loaded (so the single-source wiring
// is exercised); the side-effectful leaf deps (rpc/store/bus/timeContext/states)
// are stubbed so the module graph loads without a browser, fetch, or pollers.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const readWeb = (rel) => fs.readFileSync(path.join(webRoot, rel), 'utf8');

// ---- minimal DOM shim -------------------------------------------------------
const byId = new Map();
class ClassList {
  constructor(n) { this.n = n; }
  _l() { return String(this.n._cls).split(/\s+/).filter(Boolean); }
  add(c) { const l = this._l(); if (!l.includes(c)) l.push(c); this.n._cls = l.join(' '); }
  remove(c) { this.n._cls = this._l().filter((x) => x !== c).join(' '); }
  toggle(c, on) { const has = this.contains(c); const want = on === undefined ? !has : !!on; if (want) this.add(c); else this.remove(c); return want; }
  contains(c) { return this._l().includes(c); }
}
class FakeNode {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this._cls = '';
    this._id = '';
    this.dataset = {};
    this.style = {};
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.attrs = {};
    this.listeners = {};
    this.classList = new ClassList(this);
  }
  get className() { return this._cls; }
  set className(v) { this._cls = v || ''; }
  get id() { return this._id; }
  set id(v) { this._id = v; if (v) byId.set(v, this); }
  get offsetWidth() { return 0; }
  set innerHTML(_v) { /* eyebrow uses innerHTML; ignore for structure tests */ }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren(...k) { this.children = k.slice(); }
  remove() { /* detached in real DOM; no-op here */ }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  dispatch(type) { for (const fn of (this.listeners[type] || [])) fn({ type, target: this }); }
  _hasClass(c) { return String(this._cls).split(/\s+/).includes(c); }
  _collect(cls, out) { for (const c of this.children) { if (c._hasClass && c._hasClass(cls)) out.push(c); if (c._collect) c._collect(cls, out); } return out; }
  querySelectorAll(sel) { return this._collect(sel.replace(/^\./, ''), []); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
globalThis.document = {
  createElement: (t) => new FakeNode(t),
  createTextNode: (t) => { const n = new FakeNode('#text'); n.textContent = String(t); return n; },
  getElementById: (id) => byId.get(id) || null,
};

// ---- temp module tree: real strip + commons, stubbed leaves -----------------
function buildTempTree() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spine-strip-smoke-'));
  const write = (name, src) => fs.writeFileSync(path.join(tmp, name), src);
  const rewrite = (src) => src.replace(/from\s+'\/lib\/([^']+)'/g, "from './$1'");
  write('spineStrip.js', rewrite(readWeb('lib/spineStrip.js')));
  write('spineCommon.js', rewrite(readWeb('lib/spineCommon.js')));
  // Stub leaf deps (no fetch / no window / no pollers).
  write('rpc.js', 'export function rpc() { return Promise.resolve({}); }\n');
  write('timeContext.js', 'export function withAt(p) { return p; }\n');
  write('states.js', [
    'export function hiddenNode() { return document.createElement("div"); }',
    'export function notProducedNode() { return document.createElement("div"); }',
    'export function unavailableNode() { return document.createElement("div"); }',
    'export function errorStateNode() { return document.createElement("div"); }',
    'export function renderSliceState() { return document.createElement("div"); }',
  ].join('\n') + '\n');
  write('spineBus.js', 'export function subscribe() { return () => {}; }\n');
  write('store.js', [
    'export function subscribe2() { return () => {}; }',
    'export function refreshSlice() { return Promise.resolve(); }',
  ].join('\n') + '\n');
  return tmp;
}
const tmp = buildTempTree();
const imp = (b) => import(pathToFileURL(path.join(tmp, b)).href);

const common = await imp('spineCommon.js');
const { createSpineStrip } = await imp('spineStrip.js');

// ---- 1. single source -------------------------------------------------------
test('spineCommon.STAGES is the canonical 7-stage definition', () => {
  const { STAGES, STAGE_KEYS, STAGE_INDEX } = common;
  assert.equal(STAGES.length, 7, 'seven stages');
  assert.deepEqual(STAGE_KEYS, ['intent', 'plan', 'approval', 'execution', 'outcome', 'evidence', 'anchor']);
  STAGES.forEach((s, i) => {
    assert.ok(s.key && s.label && s.blurb, `stage ${i} has key/label/blurb`);
    assert.equal(s.token, 'spine-' + (i + 1), `stage ${i} token is spine-${i + 1}`);
    assert.equal(STAGE_INDEX[s.key], i + 1, `STAGE_INDEX[${s.key}] === ${i + 1}`);
  });
});

// ---- 2. no drift (source-level) ---------------------------------------------
test('every spine consumer imports the shared stages — no local copy', () => {
  // The labelled-object literal exists in exactly one file.
  const consumers = ['lib/timeline.js', 'lib/narrative.js', 'lib/spineStrip.js',
    'lib/dossier.js', 'lib/evidenceProof.js', 'lib/executionGraph.js'];
  for (const f of consumers) {
    const src = readWeb(f);
    assert.ok(/STAGE(S|_KEYS|_INDEX)[^=]*from '\/lib\/spineCommon\.js'/.test(src) ||
              /from '\/lib\/spineCommon\.js'[\s\S]*STAGE(S|_KEYS|_INDEX)/.test(src) ||
              /import \{[^}]*STAGE(S|_KEYS|_INDEX)[^}]*\} from '\/lib\/spineCommon\.js'/.test(src),
      `${f} must import STAGES/STAGE_KEYS/STAGE_INDEX from spineCommon`);
    assert.ok(!/\['intent', *'plan', *'approval'/.test(src), `${f} must not declare a local stage-key array`);
    assert.ok(!/key:\s*'intent'[\s\S]{0,120}key:\s*'plan'/.test(src), `${f} must not declare a local stage-object array`);
  }
});

// ---- 3. strip renders 7 cards + 6 connectors --------------------------------
test('createSpineStrip renders 7 cards and 6 connectors in canonical order', () => {
  const strip = createSpineStrip({ onStageClick() {} });
  const api = strip;
  for (const m of ['element', 'showThroughput', 'showIntentProgression', 'setActiveChapter', 'destroy']) {
    assert.equal(typeof (m === 'element' ? api.element : api[m]), m === 'element' ? 'object' : 'function', `api.${m}`);
  }
  const cards = strip.element.querySelectorAll('.strip-card');
  assert.equal(cards.length, 7, 'seven stage cards');
  assert.deepEqual(cards.map((c) => c.dataset.key), common.STAGE_KEYS, 'card order matches STAGE_KEYS');
  assert.deepEqual(cards.map((c) => c.dataset.stage), ['1', '2', '3', '4', '5', '6', '7']);
  assert.equal(strip.element.querySelectorAll('.strip-conn').length, 6, 'six connectors');
  strip.destroy();
});

// ---- 4. stage-click contract ------------------------------------------------
test('clicking a stage card invokes onStageClick(stageKey, stageNum)', () => {
  const calls = [];
  const strip = createSpineStrip({ onStageClick: (k, n) => calls.push([k, n]) });
  const cards = strip.element.querySelectorAll('.strip-card');
  cards[2].dispatch('click'); // approval (index 2 → stage 3)
  assert.deepEqual(calls, [['approval', 3]]);
  strip.destroy();
});

// ---- 5. mode switch ---------------------------------------------------------
test('showIntentProgression enters narrative mode + marks completed; showThroughput leaves it', () => {
  const strip = createSpineStrip({ onStageClick() {} });
  strip.showIntentProgression([
    { stage: 'intent', completed: true },
    { stage: 'plan', completed: true },
    { stage: 'approval', failed: true },
  ]);
  assert.ok(strip.element.classList.contains('strip-narrative-mode'), 'narrative mode on');
  const cards = strip.element.querySelectorAll('.strip-card');
  const plan = cards.find((c) => c.dataset.key === 'plan');
  const appr = cards.find((c) => c.dataset.key === 'approval');
  assert.ok(plan.classList.contains('completed'), 'plan card completed');
  assert.ok(appr.classList.contains('failed'), 'approval card failed');
  strip.showThroughput();
  assert.ok(!strip.element.classList.contains('strip-narrative-mode'), 'narrative mode off');
  strip.destroy();
});

// ---- 6. cleanup -------------------------------------------------------------
test('destroy() runs without throwing', () => {
  const strip = createSpineStrip({ onStageClick() {} });
  assert.doesNotThrow(() => strip.destroy());
});

// ---- 7. cockpit composition (Task 2 + Task 3, source-level) -----------------
test('spine.js mounts the strip as hero and no longer mounts the JSON dock', () => {
  const spine = readWeb('views/spine.js');
  assert.match(spine, /import \{ createSpineStrip \} from '\/lib\/spineStrip\.js'/, 'imports the strip');
  assert.match(spine, /createSpineStrip\(\{/, 'mounts the strip');
  // strip is appended to the canvas BEFORE the flow region (hero position).
  const stripAt = spine.indexOf('canvas.appendChild(strip.element)');
  const flowAt = spine.indexOf("flow.className = 'spine-flow'");
  assert.ok(stripAt > 0 && flowAt > 0 && stripAt < flowAt, 'strip mounts before the flow region');
  // The raw-JSON quick-compose dock is gone from the Cockpit.
  assert.ok(!spine.includes('createQuickComposeDock'), 'no JSON dock on the Cockpit');
});

test('the JSON dock is preserved (exported) for Studio reuse, not deleted', () => {
  const rails = readWeb('lib/cockpitRails.js');
  assert.match(rails, /export function createQuickComposeDock/, 'dock kept exported');
});

// ---- grid hero band ---------------------------------------------------------
test('the cockpit grid reserves a full-width "strip" hero row', () => {
  const css = readWeb('styles.css');
  // grid-template-areas spans the strip across both columns above flow+rail.
  assert.match(css, /grid-template-areas:\s*\n?\s*"strip strip"\s*\n?\s*"flow\s+rail"/,
    'cockpit-canvas grid has a strip row spanning both columns');
  assert.match(css, /\.spine-strip\s*\{\s*grid-area: strip;/, '.spine-strip occupies grid-area strip');
});
