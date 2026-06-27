// RUNBOOK-07 SP4 — POLICY_* allow/deny delta classification + submit gating.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(here, '_resolve_lib.mjs')).href);

const { classifyPolicyFlips, policyDeltaGatesSubmit, simulatePolicyDelta } = await import('/lib/whatIfSimulator.js');

test('classifyPolicyFlips detects newly-denied and newly-allowed flips', () => {
  const before = [{ intentId: 'i1', allowed: true }, { intentId: 'i2', allowed: false }, { intentId: 'i3', allowed: true }];
  const after = [{ intentId: 'i1', allowed: false }, { intentId: 'i2', allowed: true }, { intentId: 'i3', allowed: true }];
  const f = classifyPolicyFlips(before, after);
  assert.deepEqual(f.newlyDenied, ['i1']);
  assert.deepEqual(f.newlyAllowed, ['i2']);
  assert.equal(f.netDeny, false, 'one denied vs one allowed → not a net deny');
});

test('a net-new denial gates Submit; no new denials does not', () => {
  assert.equal(policyDeltaGatesSubmit({ newlyDenied: ['i1'], newlyAllowed: [] }), true);
  assert.equal(policyDeltaGatesSubmit({ newlyDenied: [], newlyAllowed: ['i2'] }), false);
});

test('unknown-before intents default to allowed (so a new denial is caught)', () => {
  const f = classifyPolicyFlips([], [{ intentId: 'iNew', allowed: false }]);
  assert.deepEqual(f.newlyDenied, ['iNew']);
});

test('simulatePolicyDelta calls policy.simulate and classifies the result', async () => {
  const calls = [];
  const rpc = async (method, params) => {
    calls.push({ method, params });
    return { decisions: [{ intentId: 'i1', allowed: false }] };
  };
  const { flips } = await simulatePolicyDelta(
    { goalType: 'POLICY_UPDATE', customParams: { rule: 'x' }, currentDecisions: [{ intentId: 'i1', allowed: true }] },
    { rpc },
  );
  assert.equal(calls[0].method, 'policy.simulate');
  assert.deepEqual(flips.newlyDenied, ['i1']);
  assert.equal(policyDeltaGatesSubmit(flips), true);
});

test('Go PascalCase decision fields are tolerated', () => {
  const f = classifyPolicyFlips(
    [{ IntentID: 'i1', Allowed: true }],
    [{ IntentID: 'i1', Allowed: false }],
  );
  assert.deepEqual(f.newlyDenied, ['i1']);
});
