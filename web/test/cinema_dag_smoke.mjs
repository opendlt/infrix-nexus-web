// Cinema-Inbox-Time Effort 1 — DAG renderer + replay smoke tests.
//
// Verifies (no browser, no devnet) that:
//   1. The 7-node chain graph yields N-1 edge paths after mountDagRenderer
//      (proves the layout produces correct edge count).
//   2. rewindGraphToBlock correctly recomputes node statuses + edge states
//      given a known playhead block.
//
// Runs with a minimal jsdom-free DOM polyfill — we don't need real
// layout (mounting Resize/MutationObservers requires them but our
// DOM shim mocks them). The renderer is exercised structurally
// (createElement, appendChild, classList) and the rewind function
// is exercised against pure data.

import { strict as assert } from 'node:assert';

// =====================================================================
// Minimal DOM polyfill — just enough to host the renderer
// =====================================================================
class FakeNode {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.classList = new FakeClassList(this);
    this._listeners = {};
    this.parentNode = null;
    this.textContent = '';
  }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    c.parentNode = null;
    return c;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  querySelector(sel) {
    // Only handles ":scope > svg.dag-edges" and ".execution-step-card[data-step-id='X']".
    if (sel === ':scope > svg.dag-edges') {
      for (const c of this.children) if (c.tagName === 'SVG' && c.classList.contains('dag-edges')) return c;
      return null;
    }
    const stepMatch = sel.match(/^\.execution-step-card\[data-step-id="(.+)"\]$/);
    if (stepMatch) {
      const id = stepMatch[1].replace(/\\/g, '');
      return this._findStep(id);
    }
    if (sel === 'defs.dag-arrow-defs') {
      for (const c of this.children) if (c.tagName === 'DEFS' && c.classList.contains('dag-arrow-defs')) return c;
      return null;
    }
    return null;
  }
  querySelectorAll(sel) {
    if (sel === '.execution-step-card') return this._allSteps();
    return [];
  }
  _findStep(id) {
    if (this.classList.contains('execution-step-card') && this.dataset.stepId === id) return this;
    for (const c of this.children) {
      const r = c._findStep ? c._findStep(id) : null;
      if (r) return r;
    }
    return null;
  }
  _allSteps() {
    const out = [];
    if (this.classList.contains('execution-step-card')) out.push(this);
    for (const c of this.children) if (c._allSteps) out.push(...c._allSteps());
    return out;
  }
  getBoundingClientRect() {
    // Position cards in a horizontal layer: x = index*180, y=0, w=160, h=80.
    if (this.classList.contains('execution-step-card')) {
      const idx = parseInt(this._idx || '0', 10);
      return { left: idx*180, right: idx*180+160, top: 10, bottom: 90, width: 160, height: 80 };
    }
    return { left: 0, right: 1000, top: 0, bottom: 200, width: 1000, height: 200 };
  }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  removeEventListener() {}
}
class FakeClassList {
  constructor(node) { this.node = node; this._set = new Set(); }
  add(...cs) { for (const c of cs) this._set.add(c); this._write(); }
  remove(...cs) { for (const c of cs) this._set.delete(c); this._write(); }
  contains(c) { return this._set.has(c); }
  toggle(c, v) { if (v == null) v = !this._set.has(c); v ? this._set.add(c) : this._set.delete(c); this._write(); }
  _write() { this.node.attributes['class'] = Array.from(this._set).join(' '); }
  *[Symbol.iterator]() { yield* this._set; }
}
const document = {
  createElement: (tag) => new FakeNode(tag),
  createElementNS: (_ns, tag) => new FakeNode(tag),
};
const window = {};
class ResizeObserver { observe() {} disconnect() {} }
class MutationObserver { observe() {} disconnect() {} }
globalThis.document = document;
globalThis.window = window;
globalThis.ResizeObserver = ResizeObserver;
globalThis.MutationObserver = MutationObserver;
globalThis.getComputedStyle = () => ({ position: 'relative' });
globalThis.requestAnimationFrame = (fn) => fn();
globalThis.CSS = { escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '_') };

// Load the modules under test (file: protocol with absolute paths).
const dagModURL = new URL('../lib/dagRenderer.js', import.meta.url);
const tlModURL  = new URL('../lib/timelineScrubber.js', import.meta.url);
const { mountDagRenderer } = await import(dagModURL);
const { rewindGraphToBlock } = await import(tlModURL);

// =====================================================================
// Build a 7-node chain graph: A → B → C → D → E → F → G
// =====================================================================
function buildChainGraph() {
  const ids = ['a','b','c','d','e','f','g'];
  const nodes = ids.map((id, i) => ({
    id, name: id.toUpperCase(), type: 'contract_call',
    spineStage: 'execution',
    gasPlanned: 100,
    dependsOn: i === 0 ? [] : [ids[i-1]],
    status: 'completed',
    startedAtBlock:   i,
    completedAtBlock: i + 1,
  }));
  const edges = [];
  for (let i = 1; i < ids.length; i++) {
    edges.push({ from: ids[i-1], to: ids[i], reason: 'dependency', state: 'unlocked', unlockedAtBlock: i });
  }
  return { nodes, edges, pathToFailure: [] };
}

// =====================================================================
// Test 1: 7-node chain → 6 edges drawn
// =====================================================================
{
  const host = document.createElement('div');
  const graph = buildChainGraph();
  // Add cards with data-step-id and index attribute for layout
  for (let i = 0; i < graph.nodes.length; i++) {
    const card = document.createElement('div');
    card.classList.add('execution-step-card');
    card.dataset.stepId = graph.nodes[i].id;
    card._idx = String(i);
    host.appendChild(card);
  }
  const ctl = mountDagRenderer(host, graph);
  // Force a paint
  ctl.update(graph);
  const svg = host.querySelector(':scope > svg.dag-edges');
  assert.ok(svg, 'SVG overlay was created');
  const pathCount = svg.children.filter((c) => c.tagName === 'PATH').length;
  assert.equal(pathCount, 6, `expected 6 edges in a 7-node chain; got ${pathCount}`);
  console.log('✓ 7-node chain produces 6 SVG paths');
}

// =====================================================================
// Test 2: rewindGraphToBlock reverts node statuses + edge states
// =====================================================================
{
  const g = buildChainGraph();
  // Mark D (index 3) as failed at block 4 (with C/B/A as predecessors)
  g.nodes[3].status = 'failed';
  g.failure = { failedStepId: 'd', failureClass: 'execution_failed' };
  g.pathToFailure = ['a','b','c','d'];

  // Rewind to block 2 — chain has A(end=1), B(end=2), C(start=2,end=3).
  // playheadBlock < end semantics:
  //   A end=1; 2<1 false → terminal (completed)
  //   B end=2; 2<2 false → terminal (completed)
  //   C start=2,end=3; 2<2 false, 2<3 true → running
  //   D start=3; 2<3 true → pending
  const rw2 = rewindGraphToBlock(g, 2);
  assert.equal(rw2.nodes[0].status, 'completed', 'A is done at block 2');
  assert.equal(rw2.nodes[1].status, 'completed', 'B is done at block 2');
  assert.equal(rw2.nodes[2].status, 'running',   'C is running at block 2');
  assert.equal(rw2.nodes[3].status, 'pending',   'D is pending at block 2');
  // Failure overlay should be masked because D's failure hasn't happened yet (D end=4 > playhead 2).
  assert.equal(rw2.failure, null, 'failure masked when failure block not yet reached');
  assert.deepEqual(rw2.pathToFailure, [], 'pathToFailure masked too');
  // Edges: a→b unlocked (block 1 <= 2), b→c unlocked (block 2 <= 2), c→d blocking (block 3 > 2)
  const ab = rw2.edges.find((e) => e.from === 'a' && e.to === 'b');
  const bc = rw2.edges.find((e) => e.from === 'b' && e.to === 'c');
  const cd = rw2.edges.find((e) => e.from === 'c' && e.to === 'd');
  assert.equal(ab.state, 'unlocked', 'a→b unlocked at block 2');
  assert.equal(bc.state, 'unlocked', 'b→c unlocked at block 2');
  assert.equal(cd.state, 'blocking', 'c→d blocking at block 2');
  console.log('✓ rewindGraphToBlock(2) reverts node statuses + edge states + masks future failure');

  // Rewind to block 5 — failure now visible
  const rw5 = rewindGraphToBlock(g, 5);
  assert.equal(rw5.nodes[3].status, 'failed', 'D failed by block 5');
  assert.ok(rw5.failure && rw5.failure.failedStepId === 'd', 'failure overlay restored at block 5');
  assert.deepEqual(rw5.pathToFailure, ['a','b','c','d'], 'pathToFailure restored');
  console.log('✓ rewindGraphToBlock(5) restores failure overlay');
}

console.log('');
console.log('✓ All Cinema E1C4 JS smoke checks passed.');
