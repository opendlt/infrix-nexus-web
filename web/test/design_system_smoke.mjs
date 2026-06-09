// nextux-03 — Progressive Disclosure design system smoke tests (no browser).
//
// Proves the browser twin of pkg/uxcopy: the data-driven assurance gate matches
// the Go gate (no Live L0 without an L0 anchor; no green badge on an
// operator-attested-only or failed state), and every component renders the
// honest, accessible structure the design system requires — from the SAME
// Go-generated fixture every surface consumes.

import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');

// Copy a set of /lib + /components modules (and their transitive deps) into ONE
// temp dir with rewritten absolute imports, so every module — and the test —
// shares a single uxLabels instance (and thus one installed fixture).
function copyTreeMulti(entries) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ux-design-smoke-'));
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
  for (const e of entries) walk(path.join(webRoot, e));
  return tmp;
}

// --- a small DOM stand-in (no browser) ---
class FakeClassList {
  constructor(n) { this.n = n; }
  _l() { return String(this.n.className).split(/\s+/).filter(Boolean); }
  add(c) { const l = this._l(); if (!l.includes(c)) l.push(c); this.n.className = l.join(' '); }
  remove(c) { this.n.className = this._l().filter((x) => x !== c).join(' '); }
  contains(c) { return this._l().includes(c); }
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
  replaceWith() { /* no-op for smoke */ }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  hasAttribute(k) { return k in this.attributes; }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener() { /* listeners not exercised in smoke */ }
  hasClass(name) { return String(this._className).split(/\s+/).includes(name); }
  collect(name, out = []) { if (this.hasClass(name)) out.push(this); for (const c of this.children) if (c.collect) c.collect(name, out); return out; }
  allText() { let t = this.textContent || ''; for (const c of this.children) if (c.allText) t += ' ' + c.allText(); return t; }
}
globalThis.document = { createElement: (t) => new FakeNode(t), createTextNode: (t) => ({ textContent: String(t), allText() { return this.textContent; } }) };

const tmp = copyTreeMulti([
  'components/AssuranceBadge.js',
  'components/ProofReceiptCard.js',
  'components/ErrorResolutionCard.js',
  'components/TrustBoundaryMap.js',
  'components/GlossaryPopover.js',
  'components/TechnicalDetails.js',
  'components/PersonaSwitcher.js',
  'components/NextActionBar.js',
]);
const imp = (b) => import(pathToFileURL(path.join(tmp, b)).href);

const ux = await imp('uxLabels.js');
const AB = await imp('AssuranceBadge.js');
const RC = await imp('ProofReceiptCard.js');
const EC = await imp('ErrorResolutionCard.js');
const TB = await imp('TrustBoundaryMap.js');
const GL = await imp('GlossaryPopover.js');
const TD = await imp('TechnicalDetails.js');
const PS = await imp('PersonaSwitcher.js');
const NA = await imp('NextActionBar.js');

// Install the Go-generated fixture (the same file the web fetches + the SDK ships).
const fixture = JSON.parse(fs.readFileSync(path.join(webRoot, 'testdata', 'uxcopy.fixture.json'), 'utf8'));
ux.setUxFixture(fixture);

// --- the gate matches Go ---
const liveL0 = { verified: true, cryptographicallyVerified: true, l0Verified: true, replayVerified: true, nodeTrusted: false, witnessQuorumMet: true, distinctOperatorsMet: true };
const offline = { verified: true, cryptographicallyVerified: true, l0Verified: false, nodeTrusted: false };
const attested = { operatorAttested: true, nodeTrusted: true };
const failed = { verified: false, nodeTrusted: true };

{
  const ids = ux.badgesFor(liveL0).map((b) => b.id);
  assert.ok(ids.includes('assurance.live_l0'), 'live L0 badge present when l0Verified');
  console.log('✓ Live L0 badge appears with an L0 anchor');
}
{
  const ids = ux.badgesFor(offline).map((b) => b.id);
  assert.ok(!ids.includes('assurance.live_l0'), 'no Live L0 badge offline');
  assert.ok(ids.includes('assurance.offline') && ids.includes('assurance.no_node_trust'), 'offline + no-node-trust present');
  console.log('✓ offline state never claims Live L0');
}
{
  const positives = ux.badgesFor(attested).filter((b) => b.colorRole === 'positive');
  assert.equal(positives.length, 0, 'no green badge for an operator-attested-only state');
  const failPositives = ux.badgesFor(failed).filter((b) => b.colorRole === 'positive');
  assert.equal(failPositives.length, 0, 'no green badge on a failed verification');
  console.log('✓ no positive badge on attested-only / failed states');
}

// --- AssuranceBadge component ---
{
  const badge = ux.badgeById('assurance.live_l0');
  const el = AB.buildAssuranceBadge(badge, { showPlain: true });
  assert.equal(el.getAttribute('data-color-role'), 'positive');
  assert.ok(el.collect('ux-badge-glyph').length === 1, 'has a status glyph (not color-only)');
  assert.ok(el.allText().includes('Live L0 verified'), 'shows the short label');
  assert.ok(el.getAttribute('aria-label'), 'has a screen-reader label');

  const row = AB.buildAssuranceBadgeRow(failed);
  const greens = row.collect('ux-badge').filter((b) => b.getAttribute('data-color-role') === 'positive');
  assert.equal(greens.length, 0, 'failed row has no green badge');
  console.log('✓ AssuranceBadge: glyph + sr-label; failed row has no green badge');
}

// --- ProofReceiptCard: raw artifacts hidden until expanded ---
{
  const card = RC.buildProofReceiptCard({
    status: 'verified', summary: 'Proof verified without trusting this node.',
    state: liveL0, trust: 'No one.',
    artifacts: [{ label: 'receipt hash', value: 'SECRET-RECEIPT-HASH' }],
  }, { showPlain: true });
  assert.equal(card.getAttribute('data-status'), 'verified');
  assert.ok(card.collect('ux-receipt-status')[0].allText().includes('VERIFIED'));
  const tech = card.collect('ux-technical')[0];
  assert.ok(tech && tech.allText().includes('SECRET-RECEIPT-HASH'), 'artifact lives inside technical details');
  const visible = card.children.filter((c) => !c.hasClass('ux-technical')).map((c) => c.allText()).join(' ');
  assert.ok(!visible.includes('SECRET-RECEIPT-HASH'), 'raw artifact hidden by default');
  console.log('✓ ProofReceiptCard: raw artifacts hidden until expanded');
}

// --- ErrorResolutionCard: has a fix + collapsed code ---
{
  const card = EC.buildErrorResolutionCard({ code: 'L0_ANCHOR_UNAVAILABLE' });
  const fixes = card.collect('ux-error-fix');
  assert.ok(fixes.length >= 1, 'error card includes at least one fix');
  const tech = card.collect('ux-technical')[0];
  assert.ok(tech && tech.allText().includes('error_code'), 'stable code in collapsed technical block');
  console.log('✓ ErrorResolutionCard: fix present, code collapsed');
}

// --- TrustBoundaryMap: no raw jargon in default mode ---
{
  const offlineMap = TB.buildTrustBoundaryMap(offline, {});
  const text = offlineMap.allText().toLowerCase();
  for (const jargon of ['canonical spine', 'key page', 'substrate', 'replay capsule']) {
    assert.ok(!text.includes(jargon), `trust map should not surface jargon "${jargon}"`);
  }
  assert.ok(offlineMap.allText().includes('Infrix proved'), 'answers what Infrix proved in plain language');
  // The confirmed-L0 case leads with the plain phrase for L0, not "L0".
  const liveMap = TB.buildTrustBoundaryMap(liveL0, { userSigned: true, signer: 'MetaMask' });
  assert.ok(liveMap.allText().includes('base chain'), 'uses the plain phrase for L0 when confirmed');
  console.log('✓ TrustBoundaryMap: plain language, no jargon');
}

// --- GlossaryPopover: popover hidden by default, term inside ---
{
  const el = GL.buildGlossaryTerm('Accumulate L0');
  const btn = el.collect('ux-glossary-term')[0];
  assert.equal(btn.getAttribute('aria-expanded'), 'false', 'collapsed by default');
  const pop = el.collect('ux-glossary-popover')[0];
  assert.ok(pop.hasAttribute('hidden'), 'popover hidden by default');
  assert.ok(pop.allText().includes('Accumulate L0'), 'canonical term in popover');
  console.log('✓ GlossaryPopover: hidden by default, term in popover');
}

// --- TechnicalDetails: a <details> with fields ---
{
  const el = TD.buildTechnicalDetails([{ label: 'proof', value: 'L4/G2' }], { summary: 'Detail' });
  assert.equal(el.tagName, 'DETAILS');
  assert.ok(!el.hasAttribute('open'), 'collapsed by default');
  assert.ok(el.allText().includes('L4/G2'));
  console.log('✓ TechnicalDetails: collapsible disclosure');
}

// --- PersonaSwitcher: one checked option per persona ---
{
  const el = PS.buildPersonaSwitcher({ active: 'auditor' });
  const opts = el.collect('ux-persona-option');
  assert.equal(opts.length, fixture.personas.length, 'one option per persona');
  const checked = opts.filter((o) => o.getAttribute('aria-checked') === 'true');
  assert.equal(checked.length, 1, 'exactly one option checked');
  assert.equal(checked[0].getAttribute('data-persona'), 'auditor');
  console.log('✓ PersonaSwitcher: one checked option');
}

// --- NextActionBar: persona-ordered, lead action first ---
{
  const el = NA.buildNextActionBar('auditor');
  const actions = el.collect('ux-next-action');
  assert.ok(actions.length > 0, 'auditor has next actions');
  assert.equal(actions[0].getAttribute('data-action'), 'next.copy_verify_command', 'auditor leads with the verifier command');
  console.log('✓ NextActionBar: persona-ordered actions');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n✓ All design-system checks passed.');
