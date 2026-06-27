// RUNBOOK-07 SP7 — trend/σ anomaly detection (pure).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(here, '_resolve_lib.mjs')).href);

const { detectAnomalies } = await import('/lib/trendAlerts.js');

// Build a buffer of {t, <key>} samples spaced 4s apart ending at `now`.
function buf(key, values, now = 1_000_000) {
  const n = values.length;
  return values.map((v, i) => ({ t: now - (n - 1 - i) * 4000, [key]: v }));
}

test('a flat series produces no alerts (sd===0 guard, no false positives)', () => {
  const b = buf('driftingProfiles', [0, 0, 0, 0, 0]);
  assert.deepEqual(detectAnomalies(b, { now: 1_000_000 }), []);
});

test('a ≥3σ spike fires a high alert', () => {
  // 9 flat samples at 1, then a big spike → z well above 3σ.
  const b = buf('driftingProfiles', [1, 1, 1, 1, 1, 1, 1, 1, 1, 40]);
  const alerts = detectAnomalies(b, { now: 1_000_000 });
  const spike = alerts.find((a) => a.level === 'high' && a.key === 'driftingProfiles');
  assert.ok(spike, 'σ spike detected');
  assert.match(spike.text, /σ in 5 min/);
  assert.equal(spike.ref, '#/govern/trustProfiles');
});

test('a 0 → nonzero transition fires a "newly nonzero" medium alert', () => {
  const b = buf('compFail', [0, 0, 0, 2]);
  const alerts = detectAnomalies(b, { now: 1_000_000 });
  const step = alerts.find((a) => a.key === 'compFail' && a.level === 'medium');
  assert.ok(step, 'newly-nonzero step detected');
  assert.match(step.text, /newly nonzero/);
});

test('samples outside the window are excluded', () => {
  const now = 1_000_000;
  // One spike sample 10 minutes ago (outside the 5-min window) → ignored.
  const b = [{ t: now - 10 * 60 * 1000, driftingProfiles: 99 }, { t: now, driftingProfiles: 0 }];
  assert.deepEqual(detectAnomalies(b, { now }), []);
});

test('fewer than 2 in-window samples → no alerts', () => {
  assert.deepEqual(detectAnomalies([{ t: 1_000_000, backlog: 5 }], { now: 1_000_000 }), []);
});
