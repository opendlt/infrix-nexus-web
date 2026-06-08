// adoption-04 — Nexus guided flows smoke tests (no browser, no server).
//
// Mounts each guided flow (#/guided/<task>) against a tiny DOM polyfill and
// asserts the synchronous shell: the right inputs/buttons render, every flow
// ends with an expert-view link, and the MetaMask flow is honest (SDK/API +
// acceptance harness, no unbacked compatibility claim).

import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');

// The view + lib modules use browser-absolute imports (`from '/lib/...'` and
// `from '/views/...'`). Node can't resolve those, so copy the transitive set
// into a temp dir with imports rewritten to relative, then dynamic-import.
function copyModuleTree(entryRel) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-smoke-'));
  const seen = new Set();
  const importRe = /from\s+'(\/(?:lib|views)\/[^']+)'/g;
  function walk(absPath) {
    if (seen.has(absPath)) return;
    seen.add(absPath);
    let src = fs.readFileSync(absPath, 'utf8');
    const deps = [];
    let m;
    while ((m = importRe.exec(src)) !== null) deps.push(m[1]);
    importRe.lastIndex = 0;
    src = src.replace(importRe, (_full, p) => `from './${p.split('/').pop()}'`);
    fs.writeFileSync(path.join(tmp, path.basename(absPath)), src);
    for (const d of deps) walk(path.join(webRoot, d.replace(/^\//, '')));
  }
  walk(path.join(webRoot, entryRel));
  return { entry: path.join(tmp, path.basename(entryRel)), tmp };
}

let failed = 0;
function ok(name) { console.log('  ✓', name); }
function fail(name, msg) { console.log('  ✗', name, '—', msg); failed++; }

// ---- DOM polyfill (richer: events, classList, inputs) ----
class FakeClassList {
  constructor(node) { this.node = node; }
  _list() { return String(this.node.className).split(/\s+/).filter(Boolean); }
  add(c) { const l = this._list(); if (!l.includes(c)) l.push(c); this.node.className = l.join(' '); }
  remove(c) { this.node.className = this._list().filter((x) => x !== c).join(' '); }
  toggle(c, on) { if (on === undefined) on = !this.contains(c); on ? this.add(c) : this.remove(c); return on; }
  contains(c) { return this._list().includes(c); }
}
class FakeNode {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this._className = '';
    this.textContent = '';
    this.href = '';
    this.type = '';
    this.value = '';
    this.placeholder = '';
    this.id = '';
    this.disabled = false;
    this.files = [];
    this._listeners = {};
    this.classList = new FakeClassList(this);
  }
  get className() { return this._className; }
  set className(v) { this._className = v || ''; }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren(...kids) { this.children = kids.slice(); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  hasClass(name) { return String(this._className).split(/\s+/).includes(name); }
  collect(name, out = []) {
    if (this.hasClass(name)) out.push(this);
    for (const c of this.children) if (c.collect) c.collect(name, out);
    return out;
  }
  allText() {
    let t = this.textContent || '';
    for (const c of this.children) if (c.allText) t += ' ' + c.allText();
    return t;
  }
}

globalThis.document = { createElement: (tag) => new FakeNode(tag) };

const { entry } = copyModuleTree('views/guided.js');
const { guidedView } = await import(pathToFileURL(entry).href);

function mountFlow(flow) {
  const root = new FakeNode('div');
  guidedView.mount(root, flow ? [flow] : []);
  return root;
}

// Every flow must end with an expert-view link.
for (const flow of ['escrow', 'verify', 'inspect', 'readiness', 'metamask']) {
  const root = mountFlow(flow);
  const expert = root.collect('guided-expert-link');
  if (expert.length >= 1 && expert.every((a) => a.href && a.href.startsWith('#/'))) {
    ok(`#/guided/${flow} ends with an expert-view link`);
  } else {
    fail(`${flow} expert link`, `found ${expert.length}`);
  }
}

// Escrow: mode chooser + submit + buyer/seller/amount form.
{
  const root = mountFlow('escrow');
  const seg = root.collect('guided-seg-btn');
  const primary = root.collect('guided-primary');
  const inputs = root.collect('guided-input');
  if (seg.length === 2) ok('escrow has a local/kermit mode chooser'); else fail('escrow mode chooser', `${seg.length} buttons`);
  if (primary.length >= 1) ok('escrow has a submit button'); else fail('escrow submit', 'no primary button');
  if (inputs.length >= 3) ok('escrow has buyer/seller/amount fields'); else fail('escrow fields', `${inputs.length} inputs`);
}

// Verify: paste area + sample + verify button.
{
  const root = mountFlow('verify');
  const paste = root.collect('guided-paste');
  const primary = root.collect('guided-primary');
  const secondary = root.collect('guided-secondary');
  if (paste.length === 1) ok('verify has a paste area'); else fail('verify paste', `${paste.length}`);
  if (primary.length >= 1) ok('verify has a Verify button'); else fail('verify button', 'missing');
  if (secondary.some((b) => /sample/i.test(b.textContent))) ok('verify offers the bundled sample'); else fail('verify sample', 'no sample button');
}

// Inspect: intent field + inspect button.
{
  const root = mountFlow('inspect');
  const primary = root.collect('guided-primary');
  const inputs = root.collect('guided-input');
  if (primary.length >= 1 && inputs.length >= 1) ok('inspect has an intent field + button'); else fail('inspect form', 'missing');
}

// Readiness: result container present synchronously.
{
  const root = mountFlow('readiness');
  const result = root.collect('guided-result');
  if (result.length >= 1) ok('readiness renders a result container'); else fail('readiness result', 'missing');
}

// MetaMask honesty: SDK/API + acceptance, no unbacked compatibility claim.
{
  const root = mountFlow('metamask');
  const text = root.allText().toLowerCase();
  const honest = root.collect('guided-honest');
  if (honest.length >= 1 && text.includes('sdk/api') && text.includes('acceptance')) {
    ok('metamask is framed as SDK/API support + acceptance harness');
  } else {
    fail('metamask honesty', 'missing SDK/API + acceptance framing');
  }
  const overclaims = ['works with metamask', 'one-click', 'consumer-grade', 'fully compatible'];
  const leaked = overclaims.filter((w) => text.includes(w));
  if (leaked.length === 0) ok('metamask makes no unbacked compatibility claim'); else fail('metamask overclaim', leaked.join(', '));
}

if (failed > 0) {
  console.log(`\nguided_smoke: ${failed} failure(s)`);
  process.exit(1);
}
console.log('\nguided_smoke: all checks passed');
