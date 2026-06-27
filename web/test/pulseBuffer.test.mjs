// RUNBOOK-07 SP7 — ring buffer (pure).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(here, '_resolve_lib.mjs')).href);

const { pushSample, series, size, resetBuffer, CAP } = await import('/lib/pulseBuffer.js');

const slice = (drift, t) => ({
  status: 'visible',
  data: { trust: { driftingProfiles: drift }, workflow: { outcomeCaptureFailures: 0, compensationStageFailures: 0 }, plugin: { totalAdmitted: 0 }, anchor: { backlog: 0 } },
});

test('non-visible slices are ignored', () => {
  resetBuffer();
  assert.equal(pushSample(null), null);
  assert.equal(pushSample({ status: 'loading' }), null);
  assert.equal(size(), 0);
});

test('the buffer is FIFO-capped at CAP', () => {
  resetBuffer();
  for (let i = 0; i < CAP + 10; i++) pushSample(slice(i), i);
  assert.equal(size(), CAP, 'never exceeds CAP');
  const s = series('driftingProfiles');
  // First 10 samples evicted → oldest retained value is index 10.
  assert.equal(s[0].v, 10);
  assert.equal(s[s.length - 1].v, CAP + 9);
});

test('series returns ordered {t,v} pairs for the chosen key', () => {
  resetBuffer();
  pushSample(slice(1), 100);
  pushSample(slice(3), 200);
  assert.deepEqual(series('driftingProfiles'), [{ t: 100, v: 1 }, { t: 200, v: 3 }]);
});

test('pushSample maps every trended field from the slice', () => {
  resetBuffer();
  const s = pushSample({ status: 'visible', data: {
    trust: { driftingProfiles: 2 }, workflow: { outcomeCaptureFailures: 5, compensationStageFailures: 1 },
    plugin: { totalAdmitted: 9 }, anchor: { pending: 4 },
  } }, 1);
  assert.equal(s.driftingProfiles, 2);
  assert.equal(s.outcomeFail, 5);
  assert.equal(s.compFail, 1);
  assert.equal(s.admitted, 9);
  assert.equal(s.backlog, 4, 'falls back to anchor.pending when backlog absent');
});
