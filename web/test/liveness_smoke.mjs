// RUNBOOK-03 §A — pure liveness math (Tasks 1, 2, 5).
//
// liveness.js has no /lib/ specifiers and no DOM, so it imports directly.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const L = await import(pathToFileURL(path.join(here, '..', 'lib', 'liveness.js')).href);

test('healthFromFailures rolls per-slice failures into a global state', () => {
  assert.equal(L.healthFromFailures(new Map([['cockpit', 0]])), 'ok');
  assert.equal(L.healthFromFailures(new Map([['cockpit', 1]])), 'reconnecting');
  assert.equal(L.healthFromFailures(new Map([['cockpit', 3]])), 'offline');
  assert.equal(L.healthFromFailures(new Map([['a', 0], ['b', 5]])), 'offline'); // worst wins
  assert.equal(L.healthFromFailures(new Map()), 'ok');                          // no slices → ok
});

test('agoLabel renders relative freshness', () => {
  const now = 1_000_000;
  assert.equal(L.agoLabel(0, now), 'never');
  assert.equal(L.agoLabel(now - 500, now), 'just now');
  assert.equal(L.agoLabel(now - 6000, now), '6s ago');
  assert.equal(L.agoLabel(now - 120000, now), '2m ago');
  assert.equal(L.agoLabel(now - 7200000, now), '2h ago');
});

test('isStale fires after STALE_INTERVALS cadences', () => {
  const now = 1_000_000;
  assert.equal(L.isStale(now - 5000, 4000, now), false);   // < 3·4s
  assert.equal(L.isStale(now - 13000, 4000, now), true);   // > 12s
  assert.equal(L.isStale(0, 4000, now), false);            // no fetchedAt → not stale
  assert.equal(L.isStale(now - 99999, 0, now), false);     // no interval → not stale
});

test('nextBackoff doubles to a cap (4s→8s→16s→16s)', () => {
  assert.equal(L.nextBackoff(4000, 0, 16000), 4000);
  assert.equal(L.nextBackoff(4000, 1, 16000), 8000);
  assert.equal(L.nextBackoff(4000, 2, 16000), 16000);
  assert.equal(L.nextBackoff(4000, 3, 16000), 16000); // capped
});

test('healthLabel copy is honest', () => {
  assert.equal(L.healthLabel('ok'), 'Connected');
  assert.equal(L.healthLabel('reconnecting'), 'Reconnecting…');
  assert.equal(L.healthLabel('offline'), 'Offline');
});
