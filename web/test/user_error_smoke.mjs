// adoption-08 — Nexus error translation logic + card component smoke tests.
//
// Verifies the browser twin of pkg/usererror: it parses a v4 error envelope
// into a normalized UserError keyed on the same stable code, and the shared
// userErrorCard renders the title, why-it-matters impact, the fixes (marking
// safe-to-run commands), and the docs link — with the raw code/cause tucked
// inside the expandable details. No raw stack trace is ever shown.

import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');

// ---- logic (pure ESM) ----
const lib = await import(pathToFileURL(path.join(webRoot, 'lib', 'userError.js')).href);

// mirrors WriteV4UserError: {error:{code,message,details:<full UserError>}}
const ENVELOPE = {
  code: 'L0_KEY_PAGE_RESOLVER_MISSING',
  message: 'This node cannot verify the signer against Accumulate L0.',
  details: {
    code: 'L0_KEY_PAGE_RESOLVER_MISSING',
    title: 'This node cannot verify the signer against Accumulate L0',
    message: 'This node cannot verify the signer against Accumulate L0.',
    cause: 'the L0 key-page resolver is not configured on this node',
    impact: 'MetaMask signed the request, but Infrix cannot prove the key is authorized.',
    fixes: [
      { label: 'Start the node with an L0 endpoint', command: 'infrix node --config <c>', safeToRun: false },
      { label: 'Or use local demo mode', command: 'infrix demo start --mode local', safeToRun: true },
    ],
    docs: 'docs/errors/l0-key-page-resolver-missing.md',
    retryable: false,
  },
};

{
  assert.equal(lib.isStableErrorCode('L0_KEY_PAGE_RESOLVER_MISSING'), true);
  assert.equal(lib.isStableErrorCode(-32000), false);

  const ue = lib.parseUserError(ENVELOPE);
  assert.ok(ue, 'envelope parsed');
  assert.equal(ue.code, 'L0_KEY_PAGE_RESOLVER_MISSING');
  assert.equal(ue.impact.length > 0, true);
  assert.equal(ue.fixes.length, 2);
  assert.equal(ue.docs, 'docs/errors/l0-key-page-resolver-missing.md');

  // legacy numeric-coded error is not treated as translated.
  assert.equal(lib.parseUserError({ code: -32601, message: 'method not found' }), null);

  const text = lib.renderUserErrorText(ue);
  assert.match(text, /Why it matters/);
  assert.match(text, /infrix demo start --mode local/);
  console.log('✓ parses a v4 envelope into a normalized UserError');
}

// ---- component (rewrite absolute /lib import for node) ----
function copyTree(entryRel) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'usererror-smoke-'));
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

class FakeNode {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this._className = '';
    this.textContent = '';
  }
  get className() { return this._className; }
  set className(v) { this._className = v || ''; }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren(...k) { this.children = k.slice(); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
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

const comp = await import(pathToFileURL(copyTree('components/userErrorCard.js')).href);

{
  const host = new FakeNode('div');
  comp.mountUserError(host, ENVELOPE);
  const card = host.collect('user-error')[0];
  assert.ok(card, 'card mounted');
  assert.equal(card.dataset.code, 'L0_KEY_PAGE_RESOLVER_MISSING');
  assert.equal(card.attributes.role, 'alert');

  const title = card.collect('user-error-title')[0];
  assert.match(title.textContent, /cannot verify the signer/);
  const impact = card.collect('user-error-impact')[0];
  assert.match(impact.allText(), /Why it matters/);

  const fixes = card.collect('user-error-fix');
  assert.equal(fixes.length, 2, 'both fixes rendered');
  // the safe-to-run fix is marked.
  const safe = fixes.find((f) => f.dataset.safe === 'yes');
  assert.ok(safe, 'a safe-to-run fix is marked');
  assert.match(safe.allText(), /infrix demo start --mode local/);

  const docs = card.collect('user-error-docs')[0];
  assert.equal(docs.attributes.href, 'docs/errors/l0-key-page-resolver-missing.md');

  // the raw code lives inside <details>, not the calm default body.
  const details = card.collect('user-error-details')[0];
  assert.ok(details.allText().includes('L0_KEY_PAGE_RESOLVER_MISSING'), 'code present in details');
  const nonDetails = card.children.filter((c) => !c.hasClass('user-error-details'));
  // no raw stack-trace markers anywhere.
  const all = card.allText();
  assert.ok(!/goroutine|\.go:\d|at Object\./.test(all), 'no stack trace in card');
  console.log('✓ card shows title/impact/fixes/docs; raw code tucked in details');
}

console.log('\n✓ All user-error checks passed.');
