// adoption-06 — Nexus proof receipt logic + component smoke tests (no browser).
//
// Verifies the browser receipt twin of pkg/proofreceipt: it builds an honest
// receipt from the offline verifier result, validates fail-closed, maps badges,
// and the shared component renders a card whose raw hashes live only inside the
// expandable details.

import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');

// ---- logic (pure ESM, no rewrite needed) ----
const lib = await import(pathToFileURL(path.join(webRoot, 'lib', 'proofReceipt.js')).href);

{
  const r = lib.buildReceiptFromVerifier(
    { passed: true, checks: [{ name: 'anchor_proof', passed: true }] },
    { evidenceId: 'ev-1' },
  );
  assert.equal(r.status, 'verified');
  assert.equal(r.assurance.l0Verified, false, 'offline verifier never claims L0');
  assert.equal(r.assurance.nodeTrusted, false);
  assert.deepEqual(lib.validateReceipt(r), [], 'offline receipt validates');
  console.log('✓ builds an honest offline receipt');
}

{
  // Hostile receipt: L4 without L0 must be rejected.
  const r = lib.buildReceiptFromVerifier({ passed: true, checks: [] }, { proofLevel: 'L4', label: 'L4/G2' });
  const errs = lib.validateReceipt(r);
  assert.ok(errs.some((e) => /L4 without l0Verified/.test(e)), errs.join('; '));
  console.log('✓ validator rejects L4 without L0');
}

{
  const r = lib.buildReceiptFromVerifier({ passed: true, checks: [{ name: 'anchor_proof', passed: true }] }, {});
  const b = lib.receiptBadges(r);
  const byName = Object.fromEntries(b.badges.map((x) => [x.name, x]));
  assert.equal(byName['node trust'].on, true, 'no node trust required');
  assert.equal(byName['L0'].on, false, 'offline L0 badge off');
  const text = lib.renderReceiptText(r);
  assert.match(text, /VERIFIED/);
  assert.match(text, /Trusts Infrix node: no/);
  console.log('✓ badge + text mapping are honest');
}

// ---- component (rewrite absolute /lib import for node) ----
function copyTree(entryRel) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-smoke-'));
  const seen = new Set();
  const re = /from\s+'(\/(?:lib|components)\/[^']+)'/g;
  function walk(abs) {
    if (seen.has(abs)) return;
    seen.add(abs);
    let src = fs.readFileSync(abs, 'utf8');
    const deps = [];
    let m;
    while ((m = re.exec(src)) !== null) deps.push(m[1]);
    re.lastIndex = 0;
    src = src.replace(re, (_f, p) => `from './${p.split('/').pop()}'`);
    fs.writeFileSync(path.join(tmp, path.basename(abs)), src);
    for (const d of deps) walk(path.join(webRoot, d.replace(/^\//, '')));
  }
  walk(path.join(webRoot, entryRel));
  return path.join(tmp, path.basename(entryRel));
}

class FakeClassList {
  constructor(n) { this.n = n; }
  _l() { return String(this.n.className).split(/\s+/).filter(Boolean); }
  add(c) { const l = this._l(); if (!l.includes(c)) l.push(c); this.n.className = l.join(' '); }
  remove(c) { this.n.className = this._l().filter((x) => x !== c).join(' '); }
  contains(c) { return this._l().includes(c); }
  toggle(c, on) { if (on === undefined) on = !this.contains(c); on ? this.add(c) : this.remove(c); return on; }
}
class FakeNode {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = []; this.dataset = {}; this.attributes = {};
    this._className = ''; this.textContent = '';
    this.classList = new FakeClassList(this);
  }
  get className() { return this._className; } set className(v) { this._className = v || ''; }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren(...k) { this.children = k.slice(); }
  insertBefore(c) { this.children.unshift(c); return c; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  hasClass(name) { return String(this._className).split(/\s+/).includes(name); }
  collect(name, out = []) { if (this.hasClass(name)) out.push(this); for (const c of this.children) if (c.collect) c.collect(name, out); return out; }
  allText() { let t = this.textContent || ''; for (const c of this.children) if (c.allText) t += ' ' + c.allText(); return t; }
}
globalThis.document = { createElement: (t) => new FakeNode(t) };

const comp = await import(pathToFileURL(copyTree('components/proofReceiptView.js')).href);

{
  const receipt = lib.buildReceiptFromVerifier({ passed: true, checks: [{ name: 'anchor_proof', passed: true }] }, {
    evidenceId: 'ev-1', anchorTx: 'SECRET-ANCHOR-TX',
  });
  const host = new FakeNode('div');
  comp.mountProofReceipt(host, receipt);
  const card = host.collect('proof-receipt')[0];
  assert.ok(card, 'card mounted');
  const status = card.collect('proof-receipt-status')[0];
  assert.match(status.textContent, /VERIFIED/);
  const badges = card.collect('proof-receipt-badge');
  assert.equal(badges.length, 4, 'four trust badges');

  // The raw anchor tx must live ONLY inside the details (not the default card body).
  const details = card.collect('proof-receipt-details')[0];
  assert.ok(details.allText().includes('SECRET-ANCHOR-TX'), 'raw hash present inside details');
  // The default-visible part (everything before details) must not show it.
  const nonDetails = card.children.filter((c) => !c.hasClass('proof-receipt-details'));
  const visibleText = nonDetails.map((c) => c.allText()).join(' ');
  assert.ok(!visibleText.includes('SECRET-ANCHOR-TX'), 'raw hash hidden by default');
  console.log('✓ component renders a card; raw hashes hidden until expanded');
}

console.log('\n✓ All proof-receipt checks passed.');
