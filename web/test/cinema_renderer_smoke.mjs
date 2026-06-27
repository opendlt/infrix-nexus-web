// RUNBOOK-05 — canvas renderer structural smoke (the renderer had no node test).
// Loads the classic-script CinemaRenderer under a fake canvas/2d-context + window
// shims and asserts the Task 2/4/6/8 invariants that don't need a real browser.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const cinemaRoot = path.resolve(here, '..', 'cinema-core');

// --- shims (must exist before `new CinemaRenderer`) ---
let resizeListeners = 0;
globalThis.window = globalThis.window || {};
globalThis.window.devicePixelRatio = 2;
globalThis.window.location = { search: '' };
globalThis.window.addEventListener = (t) => { if (t === 'resize') resizeListeners++; };
globalThis.window.removeEventListener = (t) => { if (t === 'resize') resizeListeners--; };
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {}, documentElement: {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
globalThis.requestAnimationFrame = () => 1;   // no-op (don't auto-run the loop)
globalThis.cancelAnimationFrame = () => {};
if (typeof globalThis.performance === 'undefined') globalThis.performance = { now: () => 0 };

function fakeCtx() {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, p) {
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => grad;
      if (p in t) return t[p];
      return () => {};            // any 2D method → no-op
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
function fakeCanvas(w, h) {
  return {
    _ctx: null,
    getContext() { return this._ctx || (this._ctx = fakeCtx()); },
    parentElement: { clientWidth: w, clientHeight: h },
    style: {}, width: 0, height: 0,
    addEventListener() {}, removeEventListener() {},
    setPointerCapture() {}, releasePointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0 }; },
  };
}

await import(pathToFileURL(path.join(cinemaRoot, 'visualVocabulary.js')).href);
await import(pathToFileURL(path.join(cinemaRoot, 'renderer.js')).href);
const { CinemaRenderer } = globalThis.InfrixCinema;
const vocab = globalThis.InfrixCinema;

test('Task 2 — backing store is sized by devicePixelRatio', () => {
  const canvas = fakeCanvas(800, 600);
  const r = new CinemaRenderer(canvas);
  assert.equal(canvas.width, 1600, '800 * dpr(2)');
  assert.equal(canvas.height, 1200, '600 * dpr(2)');
  assert.equal(canvas.style.width, '800px', 'CSS box stays logical size');
  assert.equal(canvas.style.height, '600px');
  assert.equal(r.cssWidth, 800);
  r.destroy();
});

test('Task 4 — empty scene idles; destroy removes the resize listener (F10)', () => {
  const before = resizeListeners;
  const r = new CinemaRenderer(fakeCanvas(800, 600));
  assert.equal(resizeListeners, before + 1, 'constructor adds one resize listener');
  assert.equal(typeof r.needsContinuousAnimation, 'function');
  r.setSceneGraph({ nodes: [], edges: [] });
  assert.equal(r.needsContinuousAnimation(), false, 'an empty static scene needs no continuous animation');
  r.destroy();
  assert.equal(resizeListeners, before, 'destroy removes the resize listener (no leak)');
});

test('Task 8 — reduced-motion short-circuits continuous animation', () => {
  const r = new CinemaRenderer(fakeCanvas(800, 600));
  // A scene that WOULD animate (a quarantined node).
  r.setSceneGraph({ nodes: [{ id: 'a', position: { x: 0, y: 0 }, quarantined: true }], edges: [] });
  assert.equal(r.needsContinuousAnimation(), true, 'animates when motion is allowed');
  r._reducedMotion = true;
  assert.equal(r.needsContinuousAnimation(), false, 'reduced-motion → static frame, no continuous animation');
  r.destroy();
});

test('Task 6 — the renderer has a builder for every vocabulary shape and renders them', () => {
  for (const m of ['drawShield', 'drawGate', 'drawDocument', 'drawArrow', 'drawPolygon', 'drawStar', 'drawGauge', 'tracePath']) {
    assert.equal(typeof CinemaRenderer.prototype[m], 'function', `renderer has ${m}`);
  }
  const r = new CinemaRenderer(fakeCanvas(800, 600));
  // Drawing one node of every SHAPES value must not throw (dispatch covers all 12).
  const shapes = Object.values(vocab.SHAPES);
  assert.ok(shapes.length >= 12, 'vocabulary has all 12 shapes');
  const nodes = shapes.map((s, i) => ({ id: 's' + i, position: { x: i * 30, y: 0 }, shape: s, label: s }));
  r.setSceneGraph({ nodes, edges: [] });
  assert.doesNotThrow(() => r.render(), 'render dispatches every shape without throwing');
  r.destroy();
});
