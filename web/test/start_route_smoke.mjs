// adoption-02 — Nexus start page smoke tests (no browser, no devnet).
//
// Verifies that:
//   1. The start view mounts and renders exactly four persona cards.
//   2. Each card is a navigable link into a real guided flow (#/...).
//   3. The start page shows plain language — no raw internal "spine"
//      vocabulary leaks onto the newcomer's first screen.
//   4. app.js registers the `start` route and index.html links to it.
//
// Mounted against a tiny DOM polyfill — we exercise structure
// (createElement / appendChild / className / href), not real layout.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');

let failed = 0;
function ok(name) { console.log('  ✓', name); }
function fail(name, msg) { console.log('  ✗', name, '—', msg); failed++; }

// ---- minimal DOM polyfill ----
class FakeNode {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = '';
    this.textContent = '';
    this.href = '';
  }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren() { this.children = []; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  hasClass(name) { return String(this.className).split(/\s+/).includes(name); }
  // depth-first collect of nodes whose class list contains `name`.
  collect(name, out = []) {
    if (this.hasClass(name)) out.push(this);
    for (const c of this.children) if (c.collect) c.collect(name, out);
    return out;
  }
  // depth-first concatenated text content.
  allText() {
    let t = this.textContent || '';
    for (const c of this.children) if (c.allText) t += ' ' + c.allText();
    return t;
  }
}

globalThis.document = { createElement: (tag) => new FakeNode(tag) };

const { startView } = await import('../views/start.js');

// 1 + 2: mount and inspect cards.
const root = new FakeNode('div');
startView.mount(root);

const cards = root.collect('start-card');
if (cards.length === 4) ok('renders exactly four persona cards');
else fail('four cards', `got ${cards.length}`);

const expectedFlows = new Set(['#/spine', '#/operate', '#/prove', '#/compose']);
const seenFlows = new Set();
let allNavigable = true;
for (const c of cards) {
  if (!c.href || !c.href.startsWith('#/')) allNavigable = false;
  seenFlows.add(c.href);
}
if (allNavigable) ok('every card navigates to a #/ guided flow');
else fail('navigable cards', 'a card is missing an #/ href');

let flowsMatch = expectedFlows.size === seenFlows.size;
for (const f of expectedFlows) if (!seenFlows.has(f)) flowsMatch = false;
if (flowsMatch) ok('cards open the four intended guided flows');
else fail('intended flows', `got ${[...seenFlows].join(', ')}`);

// each card has a data-path id (ties to the CLI personas).
const ids = cards.map((c) => c.dataset.path).filter(Boolean);
if (new Set(ids).size === 4) ok('each card carries a distinct persona id');
else fail('persona ids', `got ${ids.join(', ')}`);

// 3: no raw internal vocabulary in visible text.
const text = root.allText().toLowerCase();
const forbidden = ['objectregistry', 'canonical spine', 'evidence emission', 'subsystem', 'taxonomy'];
const leaked = forbidden.filter((w) => text.includes(w));
if (leaked.length === 0) ok('start page shows no raw internal vocabulary');
else fail('plain language', `leaked: ${leaked.join(', ')}`);

// the page must actually ask the routing question.
if (text.includes('what are you trying to do')) ok('asks "what are you trying to do?"');
else fail('routing question', 'missing the prompt');

// 4: app.js + index.html wiring.
const appJs = readFileSync(join(webRoot, 'app.js'), 'utf8');
if (/\bstart:\s*startView\b/.test(appJs) && appJs.includes("from '/views/start.js'")) {
  ok('app.js registers the start route');
} else {
  fail('route registration', 'app.js does not wire start: startView');
}

const indexHtml = readFileSync(join(webRoot, 'index.html'), 'utf8');
if (indexHtml.includes('href="#/start"')) ok('index.html links to #/start');
else fail('header link', 'index.html has no #/start link');

if (failed > 0) {
  console.log(`\nstart_route_smoke: ${failed} failure(s)`);
  process.exit(1);
}
console.log('\nstart_route_smoke: all checks passed');
