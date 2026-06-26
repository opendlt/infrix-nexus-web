// RUNBOOK-03 §B — store behavior under node (Tasks 2 & 4).
//
// Proves the two highest-stakes liveness invariants on the REAL store module:
//   - Task 4 (P3): moving the time cursor re-issues every time-sensitive read
//     (cockpit / recentIntents) AND every open narrative under the new `at`.
//   - Task 2: a transient fetch error keeps last-known-good data (flagged stale)
//     instead of wiping it.
//
// store.js imports by browser-absolute /lib/ specifiers, so a resolve hook maps
// them to files under web/, and window/document/fetch are shimmed (the same
// shape as time_context_smoke.mjs). The store's backoff pollers are torn down at
// the end so the test process exits.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(here, '_resolve_lib.mjs')).href); // install /lib resolver

// --- DOM + fetch shim (must exist before the store's dep graph loads) ---
const calls = []; // every RPC method the store issues, in order
let throwNext = false;
globalThis.window = {
  location: { href: 'http://localhost/#/spine/intent-1', origin: 'http://localhost' },
  history: { state: null, replaceState(state, _t, url) { this.state = state; if (url) this.href = url; } },
  addEventListener() {},
};
globalThis.document = { hidden: false, visibilityState: 'visible', addEventListener() {} };
globalThis.URL = URL;
globalThis.fetch = async (_url, opts) => {
  const body = JSON.parse(opts.body);
  calls.push(body.method);
  if (throwNext) throw new Error('network down');
  const result = body.method === 'explorer.recentIntents'
    ? { intents: [{ id: 'intent-1' }] }
    : body.method === 'nexus.cockpit'
      ? { pendingApprovals: [], riskSignals: [], verificationTasks: [] }
      : body.method === 'intent.get'
        ? { id: 'intent-1' }
        : {}; // every other narrative/pulse RPC: a harmless empty shape
  return { json: async () => ({ result }) };
};

const store = await import('/lib/store.js');
const tc = await import('/lib/timeContext.js');

const unsubs = [];
const settle = () => new Promise((r) => setTimeout(r, 25));

test('moving the time cursor invalidates the time-sensitive slices (Task 4 / P3)', async () => {
  unsubs.push(store.subscribe2('cockpit', () => {}));
  unsubs.push(store.subscribe2('recentIntents', () => {}));
  unsubs.push(store.subscribeNarrative('intent-1', () => {}));
  await settle();          // let the initial fetches land
  calls.length = 0;        // only observe what the cursor move triggers

  tc.setAt({ block: 5 });  // fire onAtChange
  await settle();

  assert.ok(calls.includes('nexus.cockpit'), 'cockpit re-fetched on at-change');
  assert.ok(calls.includes('explorer.recentIntents'), 'recentIntents re-fetched on at-change');
  assert.ok(calls.includes('intent.get'), 'the open narrative re-fetched at the new at-coordinate');
});

test('a transient error keeps last-known-good data (Task 2)', async () => {
  // cockpit has data from the prior test. Force the next fetch to throw.
  throwNext = true;
  await store.refreshSlice('cockpit');
  throwNext = false;

  const slice = store.getSlice('cockpit');
  assert.ok(slice.data, 'data preserved across a transient failure');
  assert.equal(slice.status, 'visible', 'kept slice still renders (status visible)');
  assert.equal(slice.stale, true, 'kept slice flagged stale');

  // …and the global health reflects the failure.
  assert.notEqual(store.getHealth(), 'ok', 'a failed poll moves health off "ok"');
});

test('teardown — stop the backoff pollers so the process exits', () => {
  tc.setAt(null);                 // return to live
  for (const u of unsubs) { try { u(); } catch (_) {} }
});
