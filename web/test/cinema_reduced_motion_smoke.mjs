// RUNBOOK-06 Task 4 (WCAG 2.3.3) — the renderer's entry animation (scale-up +
// fade-in), pulse, and quarantine shake must all be frozen under prefers-
// reduced-motion. This boots the renderer with matchMedia reporting `reduce`
// and asserts a reduced-motion scene needs no continuous animation and that the
// flag flips live when the media query changes.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const cinemaRoot = path.resolve(here, '..', 'cinema-core');

// matchMedia that starts as reduce:true and lets the test flip it.
let mqlHandler = null;
let mqlMatches = true;
globalThis.window = globalThis.window || {};
globalThis.window.devicePixelRatio = 1;
globalThis.window.location = { search: '' };
globalThis.window.addEventListener = () => {};
globalThis.window.removeEventListener = () => {};
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {}, documentElement: {} };
globalThis.matchMedia = () => ({
  get matches() { return mqlMatches; },
  addEventListener(_t, fn) { mqlHandler = fn; },
  removeEventListener() { mqlHandler = null; },
  addListener(fn) { mqlHandler = fn; },
  removeListener() { mqlHandler = null; },
});
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
if (typeof globalThis.performance === 'undefined') globalThis.performance = { now: () => 0 };

function fakeCtx() {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, p) {
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => grad;
      if (p in t) return t[p];
      return () => {};
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

test('prefers-reduced-motion is read at construction', () => {
  const r = new CinemaRenderer(fakeCanvas(800, 600));
  assert.equal(r._reducedMotion, true, 'constructor seeds the flag from matchMedia');
  r.destroy();
});

test('a would-animate scene needs no continuous animation under reduced motion', () => {
  const r = new CinemaRenderer(fakeCanvas(800, 600));
  // A quarantined node would shake (continuous) when motion is allowed.
  r.setSceneGraph({ nodes: [{ id: 'q', position: { x: 0, y: 0 }, quarantined: true }], edges: [] });
  assert.equal(r.needsContinuousAnimation(), false, 'reduced motion → static frame');
  r.destroy();
});

test('rendering a fresh (just-entered) scene does not throw and stays static', () => {
  const r = new CinemaRenderer(fakeCanvas(800, 600));
  // Entry times default to now; with motion this would be mid scale-up. The
  // entryScale gate must snap to 1 so there is nothing to keep animating.
  r.setSceneGraph({ nodes: [{ id: 'a', position: { x: 0, y: 0 }, shape: 'circle' }], edges: [] });
  assert.doesNotThrow(() => r.render());
  assert.equal(r.needsContinuousAnimation(), false, 'entry animation is gated, so no continuous frames');
  r.destroy();
});

test('the flag flips live when the media query changes', () => {
  const r = new CinemaRenderer(fakeCanvas(800, 600));
  assert.equal(r._reducedMotion, true);
  mqlMatches = false;
  assert.equal(typeof mqlHandler, 'function', 'renderer registered a change listener');
  mqlHandler({ matches: false });
  assert.equal(r._reducedMotion, false, 'clearing reduce re-enables motion without a remount');
  r.destroy();
});
