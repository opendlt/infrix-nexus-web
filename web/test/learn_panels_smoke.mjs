// adoption-11 — Nexus learn-as-you-go panels + learning-ladder view (no browser).
//
// Verifies the learn panels render every ladder concept, link to docs/learn,
// are dismissible with remembered state, that the #/learn view mounts the full
// ladder, and that the proof-receipt component now explains its trust badges.

import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');

// --- FakeDom (shared shape with the other Nexus smokes) ---
class FakeNode {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this._className = '';
    this.textContent = '';
    this.classList = { add: (c) => { if (!this._className.split(/\s+/).includes(c)) this._className = (this._className + ' ' + c).trim(); } };
  }
  get className() { return this._className; }
  set className(v) { this._className = v || ''; }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren(...k) { this.children = k.slice(); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  addEventListener(type, fn) { (this._ev ||= {})[type] = fn; }
  click() { if (this._ev && this._ev.click) this._ev.click(); }
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
globalThis.document = { createElement: (t) => new FakeNode(t) };

// Copy a module tree, rewriting absolute /lib and /views imports to relative.
function copyTree(entryRel) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-smoke-'));
  const seen = new Set();
  const re = /from\s+'(\/(?:lib|views|components)\/[^']+)'/g;
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

const lp = await import(pathToFileURL(copyTree('lib/learnPanels.js')).href);

{
  lp.resetDismissed();
  // Every ladder concept is present and references a docs/learn page.
  for (const key of lp.LADDER) {
    const c = lp.CONCEPTS[key];
    assert.ok(c && c.plain && c.term, `concept ${key} has term + plain text`);
    assert.match(c.doc, /^docs\/learn\/.+\.md$/, `concept ${key} links to docs/learn`);
  }
  console.log('✓ every ladder concept has plain text + a docs/learn link');
}

{
  lp.resetDismissed();
  const host = new FakeNode('div');
  const panel = lp.mountLearnPanel(host, 'proof', { open: true });
  assert.ok(panel, 'panel mounts when not dismissed');
  assert.equal(panel.tagName, 'DETAILS');
  assert.equal(panel.dataset.concept, 'proof');
  assert.match(panel.allText(), /What is this\? — Proof/);
  assert.ok(panel.collect('learn-panel-link').length === 1, 'has a docs link');
  // The "Read more" link must resolve to REAL content (an absolute URL), never a
  // dead SPA-relative path that silently reloads the shell (DX P3-4).
  const docLink = panel.collect('learn-panel-link')[0];
  assert.match(docLink.attributes.href, /^https:\/\/.+\/docs\/learn\/.+\.md$/,
    'docs link is an absolute, resolvable URL');
  assert.equal(docLink.attributes.target, '_blank', 'docs link opens in a new tab');
  console.log('✓ a learn panel renders as a collapsible with a resolvable docs link');
}

{
  lp.resetDismissed();
  const host = new FakeNode('div');
  const panel = lp.mountLearnPanel(host, 'anchor', { open: true });
  const dismiss = panel.collect('learn-panel-dismiss')[0];
  assert.ok(dismiss, 'has a dismiss control');
  dismiss.click();
  assert.equal(panel.dataset.dismissed, 'yes', 'dismiss marks the panel');
  assert.equal(lp.isDismissed('anchor'), true, 'dismissed state is remembered');
  // A subsequent mount is suppressed (no nag) unless forced.
  const host2 = new FakeNode('div');
  assert.equal(lp.mountLearnPanel(host2, 'anchor'), null, 'dismissed panel does not re-mount');
  assert.ok(lp.mountLearnPanel(host2, 'anchor', { force: true }), 'force re-shows it');
  lp.resetDismissed();
  console.log('✓ panels are dismissible and remembered');
}

// The #/learn view mounts the full ladder.
{
  lp.resetDismissed();
  const view = await import(pathToFileURL(copyTree('views/learn.js')).href);
  const root = new FakeNode('div');
  view.learnView.mount(root);
  const panels = root.collect('learn-panel');
  assert.equal(panels.length, lp.LADDER.length, 'the learn view mounts every ladder rung');
  assert.ok(root.collect('learn-view-cta-link').length === 1, 'has a run-the-demo CTA');
  console.log('✓ #/learn mounts the full ladder');
}

// The proof-receipt component explains its trust badges (adoption-11).
{
  const comp = await import(pathToFileURL(copyTree('components/proofReceiptView.js')).href);
  const receipt = {
    version: '1',
    subject: { type: 'evidence', id: 'bundle-x' },
    status: 'verified',
    summary: 'Verified without trusting the Infrix node.',
    assurance: { proofLevel: 'L3', governanceLevel: 'G2', label: 'L3/G2', nodeTrusted: false, l0Verified: false, replayVerified: true, witnessQuorumVerified: false },
    artifacts: {}, verification: {}, warnings: [],
  };
  const host = new FakeNode('div');
  comp.mountProofReceipt(host, receipt);
  const badges = host.collect('proof-receipt-badge');
  assert.ok(badges.length >= 4, 'badges render');
  const explained = badges.filter((b) => b.attributes.title && b.attributes.title.length > 0);
  assert.equal(explained.length, badges.length, 'every badge has a plain-language title');
  const assuranceEl = host.collect('proof-receipt-assurance')[0];
  assert.ok(assuranceEl.attributes.title && /L3/.test(assuranceEl.attributes.title), 'assurance label is explained');
  console.log('✓ proof-receipt badges + assurance are hover-explained');
}

console.log('\n✓ All learn-panel checks passed.');
