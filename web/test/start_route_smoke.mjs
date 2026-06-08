// adoption-02 + adoption-04 — Nexus guided start page smoke tests (no browser).
//
// Verifies that:
//   1. The start view mounts and renders exactly five guided task cards.
//   2. Each card has a Start link into a #/guided/<task> flow.
//   3. The start page shows plain language — no raw internal "spine" vocab.
//   4. app.js registers the `start` AND `guided` routes; index.html links to
//      #/start and ships the Guided|Expert mode toggle.

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

const { startView } = await import('../views/start.js');

const root = new FakeNode('div');
startView.mount(root);

const cards = root.collect('start-card');
if (cards.length === 5) ok('renders exactly five guided task cards');
else fail('five cards', `got ${cards.length}`);

const starts = root.collect('start-card-start');
const flows = new Set(starts.map((s) => s.href));
const expected = new Set(['#/guided/escrow', '#/guided/verify', '#/guided/inspect', '#/guided/readiness', '#/guided/metamask']);
let allGuided = starts.length === 5 && starts.every((s) => s.href && s.href.startsWith('#/guided/'));
if (allGuided) ok('every card has a Start link into a #/guided/ flow');
else fail('guided start links', `got ${[...flows].join(', ')}`);

let flowsMatch = expected.size === flows.size && [...expected].every((f) => flows.has(f));
if (flowsMatch) ok('cards open the five intended guided flows');
else fail('intended flows', `got ${[...flows].join(', ')}`);

const ids = cards.map((c) => c.dataset.flow).filter(Boolean);
if (new Set(ids).size === 5) ok('each card carries a distinct task id');
else fail('task ids', `got ${ids.join(', ')}`);

// Each card has a "learn what this proves" link.
const learns = root.collect('start-card-learn');
if (learns.length === 5) ok('each card has a "learn what this proves" link');
else fail('learn links', `got ${learns.length}`);

const text = root.allText().toLowerCase();
const forbidden = ['objectregistry', 'canonical spine', 'evidence emission', 'subsystem', 'taxonomy'];
const leaked = forbidden.filter((w) => text.includes(w));
if (leaked.length === 0) ok('start page shows no raw internal vocabulary');
else fail('plain language', `leaked: ${leaked.join(', ')}`);

if (text.includes('what do you want to do')) ok('asks "what do you want to do?"');
else fail('routing question', 'missing the prompt');

const appJs = readFileSync(join(webRoot, 'app.js'), 'utf8');
if (/\bstart:\s*startView\b/.test(appJs) && /\bguided:\s*guidedView\b/.test(appJs)) {
  ok('app.js registers the start and guided routes');
} else {
  fail('route registration', 'app.js does not wire start + guided');
}

const indexHtml = readFileSync(join(webRoot, 'index.html'), 'utf8');
if (indexHtml.includes('href="#/start"')) ok('index.html links to #/start');
else fail('header link', 'index.html has no #/start link');
if (indexHtml.includes('headerModeToggle') && indexHtml.includes('data-mode="guided"') && indexHtml.includes('data-mode="expert"')) {
  ok('index.html ships the Guided | Expert toggle');
} else {
  fail('mode toggle', 'index.html missing the guided/expert toggle');
}

if (failed > 0) {
  console.log(`\nstart_route_smoke: ${failed} failure(s)`);
  process.exit(1);
}
console.log('\nstart_route_smoke: all checks passed');
