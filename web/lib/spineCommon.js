// Nexus — shared spine helpers.
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 2: utilities every spine-artifact
// view consumes — the canonical disclosure context, JSON pretty-print,
// the 7-stage progress widget, hash-chip rendering, and the "navigate
// to <artifact> <id>" deep-link helper. Centralising these here keeps
// every detail screen consistent and removes per-view drift.

import { rpc } from '/lib/rpc.js';
import { withAt } from '/lib/timeContext.js';

// THE one canonical spine definition (RUNBOOK-02 Task 1). No other module may
// re-declare the 7 stages — import STAGES / STAGE_KEYS / STAGE_INDEX from here.
// `token` is the bare CSS-variable suffix matching --spine-1 … --spine-7 in
// styles.css; consumers compose `var(--${stage.token})` or use STAGE_INDEX with
// the [data-stage="N"] selectors.
export const STAGES = [
  { key: 'intent',    label: 'Intent',    blurb: 'goal submitted',    token: 'spine-1' },
  { key: 'plan',      label: 'Plan',      blurb: 'compiled + hashed', token: 'spine-2' },
  { key: 'approval',  label: 'Approval',  blurb: 'signers + waivers', token: 'spine-3' },
  { key: 'execution', label: 'Execution', blurb: 'plugins fire',      token: 'spine-4' },
  { key: 'outcome',   label: 'Outcome',   blurb: 'finality bound',    token: 'spine-5' },
  { key: 'evidence',  label: 'Evidence',  blurb: 'hash chain sealed', token: 'spine-6' },
  { key: 'anchor',    label: 'Anchor',    blurb: 'L0 commitment',     token: 'spine-7' },
];

// Derived views — never hand-maintain these.
export const STAGE_KEYS  = STAGES.map((s) => s.key);            // ['intent', … 'anchor']
export const STAGE_ORDER = STAGE_KEYS;                          // back-compat alias (renderStageDots, external importers)
export const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s.key, i + 1])); // intent→1 … anchor→7
export const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]));

// Disclosure context the explorer browses with. Hydrated from
// localStorage so the header's identity switcher can persist a chosen
// acting-ADI + purpose across reloads; defaults to the local devnet
// operator. NOT frozen — setDisclosure() mutates it in place so every
// consumer that spreads { ...DISCLOSURE } at call time picks up the
// switch immediately.
const ACTOR_KEY = 'nexus.actor';
const PURPOSE_KEY = 'nexus.purpose';
function readLS(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; }
}
export const DISCLOSURE = {
  actor: readLS(ACTOR_KEY, 'acc://test.acme'),
  purpose: readLS(PURPOSE_KEY, 'operational'),
  workflowInstance: 'nexus-explorer',
};

/** Switch the acting identity / purpose the explorer reads as. Persists
 * to localStorage and mutates DISCLOSURE in place. Callers typically
 * reload the view afterwards so already-rendered data re-fetches under
 * the new context. */
export function setDisclosure(actor, purpose) {
  if (actor && actor.trim()) {
    DISCLOSURE.actor = actor.trim();
    try { localStorage.setItem(ACTOR_KEY, DISCLOSURE.actor); } catch (_) { /* private mode */ }
  }
  if (purpose && purpose.trim()) {
    DISCLOSURE.purpose = purpose.trim();
    try { localStorage.setItem(PURPOSE_KEY, DISCLOSURE.purpose); } catch (_) { /* private mode */ }
  }
}

/** Issue a JSON-RPC call with the canonical disclosure context + the
 * current time-travel at-coordinate (if any) auto-injected. The at
 * coordinate is sourced from lib/timeContext.js; live reads pass
 * through unchanged. */
export function rpcWithDisclosure(method, params = {}) {
  return rpc(method, withAt({ ...DISCLOSURE, ...params }));
}

/** Truncate a long hash/id for compact rendering, preserving copy-paste-ability. */
export function shortHash(s, head = 6, tail = 4) {
  if (!s) return '';
  s = String(s);
  if (s.length <= head + tail + 2) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

/** Format an ISO timestamp or epoch as a human-readable UTC string. */
export function formatTime(t) {
  if (!t) return '';
  const d = (typeof t === 'string') ? new Date(t) : new Date(t);
  if (isNaN(d.getTime())) return String(t);
  return d.toISOString().replace('T', ' ').replace('Z', ' UTC');
}

/** Render the 7-stage spine progression widget. Each stage is one dot
 * painted in its canonical gradient colour (cool→warm: violet → indigo →
 * cyan → mint → emerald → chartreuse → gold). The Aurora theme uses
 * --spine-N tokens; Daylight/Phosphor override those tokens but keep
 * the same paint-when-done behaviour. */
export function renderStageDots(stages) {
  if (!Array.isArray(stages) || stages.length === 0) {
    stages = STAGE_ORDER.map((s) => ({ stage: s, completed: false }));
  }
  const wrap = document.createElement('span');
  wrap.className = 'stage-track';
  stages.forEach((s, idx) => {
    const dot = document.createElement('span');
    dot.className = 'stage-dot';
    // 1-based stage index drives the gradient colour.
    dot.dataset.stage = String(idx + 1);
    if (s.completed) dot.classList.add('done');
    if (s.failed) dot.classList.add('failed');
    if (s.active) dot.classList.add('active');
    dot.title = `${s.stage}: ${s.completed ? 'done' : (s.failed ? 'failed' : 'pending')}`;
    wrap.appendChild(dot);
  });
  return wrap;
}

/** Build an inline "View <kind>" deep-link button. */
export function deeplinkButton(label, route, ...subpath) {
  const btn = document.createElement('button');
  btn.className = 'deeplink-btn';
  btn.type = 'button';
  btn.textContent = label;
  btn.addEventListener('click', () => {
    const segs = subpath.filter((s) => s !== undefined && s !== null && s !== '').map(String);
    const newHash = '#/' + [route, ...segs].join('/');
    window.location.hash = newHash;
  });
  return btn;
}

/** Build a clickable hash chip with copy-to-clipboard on click. */
export function hashChip(value, options = {}) {
  const span = document.createElement('span');
  span.className = 'hash-chip';
  if (!value) {
    span.textContent = '—';
    span.classList.add('empty');
    return span;
  }
  const text = String(value);
  span.textContent = options.full ? text : shortHash(text, options.head || 8, options.tail || 6);
  span.title = `Click to copy: ${text}`;
  span.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      const orig = span.textContent;
      span.textContent = '✓ copied';
      span.classList.add('copied');
      setTimeout(() => {
        span.textContent = orig;
        span.classList.remove('copied');
      }, 1200);
    } catch (e) {
      // clipboard write may fail in non-secure contexts; ignore.
    }
  });
  return span;
}

/** JSON pretty-print into a <pre> with light syntax classes. */
export function jsonBlock(value) {
  const pre = document.createElement('pre');
  pre.className = 'json-block';
  try {
    pre.textContent = JSON.stringify(value, null, 2);
  } catch (e) {
    pre.textContent = String(value);
  }
  return pre;
}

/** Empty-state placeholder used by every list view. */
export function emptyState(message) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.textContent = message;
  return div;
}

/** Build a labelled key:value row for detail panels. */
export function kvRow(label, valueNode) {
  const row = document.createElement('div');
  row.className = 'kv-row';
  const k = document.createElement('span');
  k.className = 'kv-label';
  k.textContent = label;
  const v = document.createElement('span');
  v.className = 'kv-value';
  if (valueNode instanceof Node) {
    v.appendChild(valueNode);
  } else if (valueNode === undefined || valueNode === null || valueNode === '') {
    v.classList.add('empty');
    v.textContent = '—';
  } else {
    v.textContent = String(valueNode);
  }
  row.appendChild(k);
  row.appendChild(v);
  return row;
}

/** Build a section card (header + body). */
export function card(title, bodyNode) {
  const sec = document.createElement('section');
  sec.className = 'spine-card';
  const h = document.createElement('h3');
  h.className = 'spine-card-title';
  h.textContent = title;
  sec.appendChild(h);
  const body = document.createElement('div');
  body.className = 'spine-card-body';
  if (bodyNode instanceof Node) body.appendChild(bodyNode);
  sec.appendChild(body);
  return sec;
}

/** Helper: render a small status pill. */
export function statusPill(label, kind = 'neutral') {
  const span = document.createElement('span');
  span.className = `status-pill status-${kind}`;
  span.textContent = label;
  return span;
}

/** Read fields from a ManagedObject's `fields` map case-insensitively.
 * The Go side persists camelCase OR PascalCase depending on the
 * subsystem; the JSON wire mirrors whichever shape the Go map uses.
 * Phase 2 view modules don't care — they ask for a logical key
 * and we resolve it from either casing. */
export function readField(obj, key) {
  if (!obj || !obj.fields) return undefined;
  const fields = obj.fields;
  if (Object.prototype.hasOwnProperty.call(fields, key)) return fields[key];
  // Try first-letter swap (PascalCase ↔ camelCase).
  const swap = key.length > 0
    ? (key[0] === key[0].toUpperCase() ? key[0].toLowerCase() : key[0].toUpperCase()) + key.slice(1)
    : key;
  if (Object.prototype.hasOwnProperty.call(fields, swap)) return fields[swap];
  // Case-insensitive scan as last resort.
  const lc = key.toLowerCase();
  for (const k of Object.keys(fields)) {
    if (k.toLowerCase() === lc) return fields[k];
  }
  return undefined;
}

/** Render a loading state. */
export function loadingNode(label = 'Loading…') {
  const d = document.createElement('div');
  d.className = 'spine-loading';
  d.textContent = label;
  return d;
}

/** Render an error state. */
export function errorNode(err) {
  const d = document.createElement('div');
  d.className = 'spine-error';
  d.textContent = err && err.message ? err.message : String(err);
  return d;
}

// Phase 0: re-export the disclosure-aware state nodes so views don't
// need to import lib/states.js separately. Every section in a
// narrative chapter that comes back hidden / notProduced / unavailable
// renders one of these instead of a generic empty state.
export { hiddenNode, notProducedNode, unavailableNode, errorStateNode, renderSliceState } from '/lib/states.js';
