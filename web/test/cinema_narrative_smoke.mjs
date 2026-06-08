// adoption-05 — Cinema narrative mode (audit story).
//
// Verifies, with no browser and no server, that:
//   - buildNarrative derives the ordered golden-escrow story from a scene.
//   - the anchor event never claims L0 unless an anchor is present (capped).
//   - disclosure redaction never leaks a private label/amount into the text.
//   - the narrative panel renders keyboard-reachable cards.
//   - clicking a card highlights its graph nodes; selecting a graph node
//     highlights its card; advancing the replay head dims future events.

import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../cinema-core/visualVocabulary.js');
require('../cinema-core/narrativeTemplates.js');
require('../cinema-core/narrativePanel.js');
require('../cinema-core/narrativeSync.js');
const C = globalThis.InfrixCinema;

// ---------------------------------------------------------------- build ----
function goldenScene() {
  return {
    id: 'golden-escrow',
    blockHeight: 7,
    nodes: [
      { id: 'intent', kind: 'intent', label: 'open escrow' },
      { id: 'plan', kind: 'plan_timeline', label: 'plan' },
      { id: 'approval', kind: 'approval_gate', label: 'officer approval' },
      { id: 'escrow', kind: 'escrow', label: 'escrow acct' },
      { id: 'outcome', kind: 'outcome', label: 'completed' },
      { id: 'evidence', kind: 'evidence', label: 'evidence bundle' },
      { id: 'anchor', kind: 'anchor', label: 'L0 #7' },
    ],
    edges: [
      { id: 'e1', kind: 'plan_link', fromNodeId: 'intent', toNodeId: 'plan' },
      { id: 'e6', kind: 'evidence_anchor', fromNodeId: 'evidence', toNodeId: 'anchor' },
    ],
  };
}

{
  const events = C.buildNarrative(goldenScene(), { actor: 'Alice', proof: { anchor: { block: 7 }, replay: {} } });
  const stages = events.map((e) => e.stage);
  assert.deepEqual(stages, ['intent', 'policy', 'approval', 'execution', 'outcome', 'evidence', 'anchor'], 'golden-escrow stage order');
  const intent = events[0];
  assert.ok(intent.headline.includes('Alice') && intent.headline.includes('open escrow'), 'intent names actor + label');
  const anchor = events.find((e) => e.stage === 'anchor');
  assert.ok(anchor.headline.includes('Accumulate L0'), 'anchor confirms L0 when anchored');
  assert.equal(anchor.assurance, 'l0', 'anchor assurance is l0 when anchored');
  assert.equal(anchor.blockHeight, 7, 'anchor block is 7');
  console.log('✓ buildNarrative tells the golden-escrow story');
}

// No anchor -> the anchor event must NOT claim L0.
{
  const events = C.buildNarrative(goldenScene(), { actor: 'Alice', proof: { replay: {} } });
  const anchor = events.find((e) => e.stage === 'anchor');
  assert.ok(!anchor.headline.includes('confirmed on Accumulate L0'), 'no L0 claim without an anchor');
  assert.ok(anchor.assurance !== 'l0' && anchor.assurance !== 'witness', 'assurance capped below L0 without an anchor');
  console.log('✓ narrative never claims L0 without an anchor');
}

// Disclosure: a redacted node never leaks its label/amount.
{
  const scene = {
    id: 'p', blockHeight: 5,
    nodes: [
      { id: 'intent', kind: 'intent', label: 'open escrow' },
      { id: 'outcome', kind: 'outcome', label: 'SECRET-PAYEE', redacted: true },
    ],
    edges: [],
  };
  const events = C.buildNarrative(scene, { actor: 'Alice' });
  const out = events.find((e) => e.stage === 'outcome');
  const blob = out.headline + ' ' + out.summary;
  assert.ok(!blob.includes('SECRET-PAYEE'), 'narrative must not leak a redacted label');
  assert.ok(out.redacted, 'outcome event flagged redacted');
  assert.ok(blob.includes('[private]'), 'redacted outcome shows the [private] placeholder');
  console.log('✓ narrative preserves disclosure redaction');
}

// ---------------------------------------------------------------- DOM ----
class FakeClassList {
  constructor(n) { this.n = n; }
  _l() { return String(this.n.className).split(/\s+/).filter(Boolean); }
  add(c) { const l = this._l(); if (!l.includes(c)) l.push(c); this.n.className = l.join(' '); }
  remove(c) { this.n.className = this._l().filter((x) => x !== c).join(' '); }
  toggle(c, on) { if (on === undefined) on = !this.contains(c); on ? this.add(c) : this.remove(c); return on; }
  contains(c) { return this._l().includes(c); }
}
class FakeNode {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = []; this.dataset = {}; this.attributes = {};
    this._className = ''; this.textContent = ''; this.type = ''; this.checked = false;
    this._listeners = {}; this.classList = new FakeClassList(this);
  }
  get className() { return this._className; } set className(v) { this._className = v || ''; }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren(...k) { this.children = k.slice(); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  addEventListener(t, fn) { (this._listeners[t] ||= []).push(fn); }
  fire(t, ev) { for (const fn of (this._listeners[t] || [])) fn(ev || {}); }
  scrollIntoView() {}
  hasClass(name) { return String(this._className).split(/\s+/).includes(name); }
  collect(name, out = []) { if (this.hasClass(name)) out.push(this); for (const c of this.children) if (c.collect) c.collect(name, out); return out; }
}
globalThis.document = { createElement: (t) => new FakeNode(t) };

// Panel renders keyboard-reachable cards.
let focusedNodes = null;
const host = new FakeNode('div');
const panel = new C.NarrativePanel(host, { proof: { anchor: { block: 7 } }, onCardFocus: (ids) => { focusedNodes = ids; } });
panel.setScene(goldenScene(), { proof: { anchor: { block: 7 }, replay: {} } });

const cards = host.collect('cinema-narrative-card');
assert.equal(cards.length, 7, 'panel renders one card per event');
const btns = host.collect('cinema-narrative-card-btn');
assert.ok(btns.every((b) => b.tagName === 'BUTTON'), 'cards are <button> (keyboard reachable)');
console.log('✓ narrative panel renders keyboard-reachable cards');

// Card click -> highlight graph nodes.
const anchorCard = cards.find((c) => c.dataset.stage === 'anchor');
const anchorBtn = anchorCard.collect('cinema-narrative-card-btn')[0];
anchorBtn.fire('click');
assert.ok(Array.isArray(focusedNodes) && focusedNodes.includes('anchor'), 'card click reports its graph nodes');
console.log('✓ card click highlights the related graph nodes');

// setPosition dims future events.
panel.setPosition(2);
const future = cards.filter((c) => c.hasClass('future'));
assert.ok(future.length > 0 && future.every((c) => Number(c.dataset.seq) > 2), 'events after the replay head are dimmed');
const current = cards.filter((c) => c.hasClass('current'));
assert.equal(current.length, 1, 'exactly one current event');
assert.equal(Number(current[0].dataset.seq), 2, 'current event is at the replay head');
console.log('✓ replay head dims future events');

// Graph node selected -> matching card highlights (sync).
const fakeRenderer = {
  sceneGraph: { nodes: [{ id: 'anchor', opacity: 1 }, { id: 'intent', opacity: 1 }] },
  _sel: null,
  on(type, cb) { if (type === 'nodeSelected') this._sel = cb; },
  off() {},
};
const sync = C.createNarrativeSync({ renderer: fakeRenderer, panel });
fakeRenderer._sel({ id: 'anchor' });
assert.ok(host.collect('focused').length >= 1, 'selecting a graph node highlights its card');
// Narrative -> graph highlight dims the others.
sync.highlightNodes(['anchor']);
const anchorNode = fakeRenderer.sceneGraph.nodes.find((n) => n.id === 'anchor');
const intentNode = fakeRenderer.sceneGraph.nodes.find((n) => n.id === 'intent');
assert.equal(anchorNode.opacity, 1, 'highlighted node stays opaque');
assert.ok(intentNode.opacity < 0.5, 'non-highlighted nodes dim');
console.log('✓ graph <-> narrative selection stays in sync');

console.log('\n✓ All Cinema narrative checks passed.');
