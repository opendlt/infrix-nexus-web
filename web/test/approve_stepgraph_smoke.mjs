// RUNBOOK-04 Task 2 — the approval dossier must show the signer at least what the
// author saw (step graph + ghost predictions) and a real role/key picker, not a
// silent remaining[0] auto-pick.
//
// Loads the REAL approvalDossier + dossier renderers via the /lib resolve hook,
// under a minimal DOM shim (innerHTML is a no-op; only the createElement-built
// structure is asserted).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(here, '_resolve_lib.mjs')).href);

// --- window shim (timeContext reads it at import) ---
globalThis.window = { location: { href: 'http://localhost/#/approve/p1' }, history: { replaceState() {} }, addEventListener() {} };
globalThis.URL = URL;

// --- minimal DOM shim ---
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
    this.children = []; this._cls = ''; this.dataset = {}; this.style = {};
    this.textContent = ''; this.attributes = {}; this.listeners = {};
    this.disabled = false; this.open = false; this.htmlFor = ''; this.title = ''; this.type = ''; this.value = ''; this.id = '';
    this.classList = new ClassList(this);
  }
  get className() { return this._cls; } set className(v) { this._cls = v || ''; }
  set innerHTML(_v) { /* header markup is not parsed; structure is built via createElement */ }
  get innerHTML() { return ''; }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren(...k) { this.children = k.slice(); }
  insertBefore(n) { this.children.unshift(n); return n; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  _hasClass(c) { return String(this._cls).split(/\s+/).includes(c); }
  _walk(pred, out) { for (const c of this.children) { if (c instanceof FakeNode) { if (pred(c)) out.push(c); c._walk(pred, out); } } return out; }
  querySelectorAll(sel) {
    if (sel.startsWith('.')) return this._walk((n) => n._hasClass(sel.slice(1)), []);
    return this._walk((n) => n.tagName === sel.toUpperCase(), []);
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
globalThis.document = {
  createElement: (t) => new FakeNode(t),
  createTextNode: (t) => { const n = new FakeNode('#text'); n.textContent = String(t); return n; },
  querySelector: () => null,
};

const dossierMod = await import('/lib/dossier.js');
const { renderApprovalDossier } = await import('/lib/approvalDossier.js');

const graph = {
  nodes: [
    { id: 'n1', name: 'Transfer', type: 'workflow_action', spineStage: 'execution', gasEstimate: 10 },
    { id: 'n2', name: 'Verify', type: 'proof_verify', spineStage: 'evidence', gasEstimate: 5 },
    { id: 'n3', name: 'Anchor', type: 'anchor', spineStage: 'anchor', gasEstimate: 1 },
  ],
  edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }],
};
const ghost = {
  overallConfidence: 0.91, freshnessStatus: 'fresh',
  steps: [
    { stageId: 's1', gasPredicted: 10, statusPredicted: 'ok', stateRootAfter: 'root1', readSetSize: 1, writeSetSize: 2 },
    { stageId: 's2', gasPredicted: 5, statusPredicted: 'ok', stateRootAfter: 'root2', readSetSize: 0, writeSetSize: 1 },
  ],
};

test('renderStepGraph renders one card per node', () => {
  const el = dossierMod.renderStepGraph(graph);
  assert.equal(el.querySelectorAll('.dossier-step-card').length, 3);
});

test('renderGhostPredictions renders one row per predicted step', () => {
  const el = dossierMod.renderGhostPredictions(ghost);
  const rows = el.querySelectorAll('tr'); // tbody rows (thead is innerHTML, not parsed)
  assert.equal(rows.length, ghost.steps.length);
});

test('the approval dossier renders the step graph + ghost predictions when present', () => {
  const dossier = {
    plan: { stepCount: 3 }, planHash: 'ph', intentId: 'i1',
    remaining: [{ stageId: 'st1', role: 'treasurer', need: 1, have: 0, shortBy: 1 }],
    requiredRoles: ['treasurer'], invalidators: [], risk: [], signed: [], threshold: 1, summary: [],
    stepGraph: graph, ghostEvidence: ghost,
  };
  const root = renderApprovalDossier(dossier, {});
  assert.equal(root.querySelectorAll('.dossier-step-card').length, 3, 'step cards present');
  assert.ok(root.querySelectorAll('.dossier-ghost-predictions').length >= 1, 'ghost predictions present');
});

test('the role picker surfaces every remaining slot (not just remaining[0])', () => {
  const dossier = {
    plan: { stepCount: 1 }, planHash: 'ph', intentId: 'i1',
    remaining: [
      { stageId: 'st1', role: 'treasurer', need: 1, have: 0, shortBy: 1 },
      { stageId: 'st2', role: 'auditor', need: 1, have: 0, shortBy: 1 },
    ],
    requiredRoles: ['treasurer', 'auditor'], invalidators: [], risk: [], signed: [], threshold: 2, summary: [],
  };
  const root = renderApprovalDossier(dossier, {});
  const selects = root.querySelectorAll('select');
  assert.equal(selects.length, 1, 'a role picker is rendered when >1 remaining slot');
  assert.equal(selects[0].querySelectorAll('option').length, 2, 'one option per remaining slot');
});

test('"Sign" is relabelled to the honest "Record approval"', () => {
  const dossier = {
    plan: { stepCount: 1 }, planHash: 'ph', intentId: 'i1',
    remaining: [{ stageId: 'st1', role: 'treasurer' }], requiredRoles: ['treasurer'],
    invalidators: [], risk: [], signed: [], threshold: 1, summary: [],
  };
  const root = renderApprovalDossier(dossier, {});
  const signBtn = root.querySelectorAll('.approval-sign-btn')[0];
  assert.ok(signBtn, 'sign button exists');
  assert.equal(signBtn.textContent, 'Record approval');
});
