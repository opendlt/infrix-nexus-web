// RUNBOOK-06 Task 3 — keyboard navigation of the canvas proof graph.
// Loads CinemaRenderer under canvas/window shims, then drives the focus + arrow
// + Enter + Escape handlers and asserts the focus index moves, nodeFocused /
// nodeSelected fire, and Tab is never swallowed (no keyboard trap, WCAG 2.1.2).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const cinemaRoot = path.resolve(here, '..', 'cinema-core');

globalThis.window = globalThis.window || {};
globalThis.window.devicePixelRatio = 1;
globalThis.window.location = { search: '' };
globalThis.window.addEventListener = () => {};
globalThis.window.removeEventListener = () => {};
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {}, documentElement: {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
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

// A canvas shim that records event listeners by type so the test can fire them.
function fakeCanvas(w, h) {
  const listeners = new Map();
  return {
    _ctx: null,
    listeners,
    getContext() { return this._ctx || (this._ctx = fakeCtx()); },
    parentElement: { clientWidth: w, clientHeight: h },
    style: {}, width: 0, height: 0,
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    removeEventListener(type, fn) { const a = listeners.get(type) || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
    setPointerCapture() {}, releasePointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    fire(type, ev) { for (const fn of (listeners.get(type) || [])) fn(ev || {}); },
  };
}

await import(pathToFileURL(path.join(cinemaRoot, 'visualVocabulary.js')).href);
await import(pathToFileURL(path.join(cinemaRoot, 'renderer.js')).href);
const { CinemaRenderer } = globalThis.InfrixCinema;

function key(name) {
  let prevented = false;
  return { key: name, preventDefault() { prevented = true; }, get _prevented() { return prevented; } };
}

function threeNodeScene() {
  return {
    nodes: [
      { id: 'a', position: { x: 0, y: 0 }, label: 'Alpha', kind: 'intent' },
      { id: 'b', position: { x: 50, y: 0 }, label: 'Bravo', kind: 'approval_gate', status: 'completed' },
      { id: 'c', position: { x: 100, y: 0 }, label: 'Charlie', kind: 'evidence' },
    ],
    edges: [{ from: 'a', to: 'b' }],
  };
}

test('focus lands on the first node and exposes an ordered traversal', () => {
  const canvas = fakeCanvas(800, 600);
  const r = new CinemaRenderer(canvas);
  r.setSceneGraph(threeNodeScene());
  assert.equal(r.orderedNodes().length, 3);
  let focused = null;
  r.on('nodeFocused', (n) => { focused = n; });
  canvas.fire('focus');
  assert.equal(r.focusVisible, true);
  assert.equal(r.focusedNodeIndex, 0);
  assert.equal(focused && focused.id, 'a', 'focusing the canvas centers + announces the first node');
  r.destroy();
});

test('arrow keys move focus and wrap; Home/End jump to ends', () => {
  const canvas = fakeCanvas(800, 600);
  const r = new CinemaRenderer(canvas);
  r.setSceneGraph(threeNodeScene());
  const seen = [];
  r.on('nodeFocused', (n) => seen.push(n.id));
  canvas.fire('focus');                       // index 0 (a)
  canvas.fire('keydown', key('ArrowRight'));  // 1 (b)
  assert.equal(r.focusedNodeIndex, 1);
  canvas.fire('keydown', key('ArrowRight'));  // 2 (c)
  canvas.fire('keydown', key('ArrowRight'));  // wraps to 0 (a)
  assert.equal(r.focusedNodeIndex, 0);
  canvas.fire('keydown', key('ArrowLeft'));   // wraps back to 2 (c)
  assert.equal(r.focusedNodeIndex, 2);
  canvas.fire('keydown', key('Home'));
  assert.equal(r.focusedNodeIndex, 0);
  canvas.fire('keydown', key('End'));
  assert.equal(r.focusedNodeIndex, 2);
  assert.deepEqual(seen.slice(0, 4), ['a', 'b', 'c', 'a']);
  r.destroy();
});

test('Enter selects the focused node; Escape clears the selection', () => {
  const canvas = fakeCanvas(800, 600);
  const r = new CinemaRenderer(canvas);
  r.setSceneGraph(threeNodeScene());
  let selected = null;
  r.on('nodeSelected', (n) => { selected = n; });
  canvas.fire('focus');
  canvas.fire('keydown', key('ArrowRight'));   // focus b
  canvas.fire('keydown', key('Enter'));
  assert.equal(selected && selected.id, 'b');
  assert.equal(r.selectedNode, 'b');
  canvas.fire('keydown', key('Escape'));
  assert.equal(r.selectedNode, null, 'Escape clears the selection');
  r.destroy();
});

test('Tab is not intercepted — no keyboard trap (WCAG 2.1.2)', () => {
  const canvas = fakeCanvas(800, 600);
  const r = new CinemaRenderer(canvas);
  r.setSceneGraph(threeNodeScene());
  canvas.fire('focus');
  const tab = key('Tab');
  canvas.fire('keydown', tab);
  assert.equal(tab._prevented, false, 'Tab must bubble so focus can leave the canvas');
  // Escape with nothing selected must also pass through (no preventDefault).
  const esc = key('Escape');
  canvas.fire('keydown', esc);
  assert.equal(esc._prevented, false, 'Escape with no selection is not swallowed');
  r.destroy();
});

test('selectNodeById drives the same selection path the parallel DOM uses', () => {
  const canvas = fakeCanvas(800, 600);
  const r = new CinemaRenderer(canvas);
  r.setSceneGraph(threeNodeScene());
  let selected = null;
  r.on('nodeSelected', (n) => { selected = n; });
  r.selectNodeById('c');
  assert.equal(selected && selected.id, 'c');
  assert.equal(r.focusedNodeIndex, 2, 'keyboard focus follows the programmatic selection');
  r.destroy();
});
