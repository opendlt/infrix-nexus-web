// RUNBOOK-07 SP2 — temporal diff engine (pure).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(here, '_resolve_lib.mjs')).href);

const { diffSnapshots, describeDelta, deltaSeverity } = await import('/lib/temporalDiff.js');

// Build a board snapshot from a compact intent/trust spec.
function snap(intents, trust = {}) {
  return {
    intents: new Map(Object.entries(intents)),
    trust: new Map(Object.entries(trust)),
    anchorBacklog: 0,
  };
}
const intent = (over = {}) => ({
  state: 'running', stage: 'plan',
  approvals: { required: 1, signed: 0, remaining: 1, invalidated: 0 },
  outcome: null, anchor: null, policyDecision: { allowed: true, denials: [] },
  ...over,
});

test('no change between identical snapshots yields no deltas', () => {
  const a = snap({ i1: intent() });
  const b = snap({ i1: intent() });
  assert.deepEqual(diffSnapshots(a, b), []);
});

test('intent_created fires for a new intent only', () => {
  const a = snap({ i1: intent() });
  const b = snap({ i1: intent(), i2: intent({ stage: 'intent' }) });
  const ds = diffSnapshots(a, b);
  assert.equal(ds.length, 1);
  assert.equal(ds[0].kind, 'intent_created');
  assert.equal(ds[0].id, 'i2');
});

test('intent_advanced + intent_state fire on stage/state change', () => {
  const a = snap({ i1: intent({ stage: 'plan', state: 'running' }) });
  const b = snap({ i1: intent({ stage: 'approval', state: 'awaiting' }) });
  const ds = diffSnapshots(a, b);
  const kinds = ds.map((d) => d.kind);
  assert.ok(kinds.includes('intent_advanced'));
  assert.ok(kinds.includes('intent_state'));
});

test('policy_now_denies fires only on allowed not-false → false, and carries a causal ref', () => {
  const a = snap({ i1: intent({ policyDecision: { allowed: true, denials: [] } }) });
  const b = snap({ i1: intent({ policyDecision: { allowed: false, denials: [{ policyId: 'p1', reason: 'r' }] } }) });
  const ds = diffSnapshots(a, b);
  const d = ds.find((x) => x.kind === 'policy_now_denies');
  assert.ok(d, 'fired');
  assert.equal(d.denials.length, 1);
  assert.ok(d.causal, 'carries the later record as the SP3 causal ref');

  // Already-denying in both → no new delta.
  const c = snap({ i1: intent({ policyDecision: { allowed: false, denials: [] } }) });
  assert.equal(diffSnapshots(c, b).some((x) => x.kind === 'policy_now_denies'), false);
});

test('approvals_invalidated fires when the invalidated count increases', () => {
  const a = snap({ i1: intent({ approvals: { required: 2, signed: 2, remaining: 0, invalidated: 0 } }) });
  const b = snap({ i1: intent({ approvals: { required: 2, signed: 2, remaining: 0, invalidated: 2 } }) });
  const d = diffSnapshots(a, b).find((x) => x.kind === 'approvals_invalidated');
  assert.equal(d.count, 2);
});

test('anchor_finalized fires only on pending → anchored', () => {
  const a = snap({ i1: intent({ anchor: { status: 'pending' } }) });
  const b = snap({ i1: intent({ anchor: { status: 'anchored', txHash: '0xabc', blockHeight: 42, recordId: 'r1' } }) });
  const d = diffSnapshots(a, b).find((x) => x.kind === 'anchor_finalized');
  assert.equal(d.block, 42);
  assert.equal(d.txHash, '0xabc');
  assert.equal(d.ref, '#/anchors/r1');
});

test('trust_degraded + downstream approvals_invalidated both appear and deep-link', () => {
  const a = snap(
    { i1: intent({ approvals: { required: 1, signed: 1, remaining: 0, invalidated: 0 } }) },
    { profA: { state: 'active', version: 1, driftImpactCount: 0 } },
  );
  const b = snap(
    { i1: intent({ approvals: { required: 1, signed: 1, remaining: 0, invalidated: 1 } }) },
    { profA: { state: 'degraded', version: 2, driftImpactCount: 3 } },
  );
  const ds = diffSnapshots(a, b);
  const td = ds.find((x) => x.kind === 'trust_degraded');
  const ai = ds.find((x) => x.kind === 'approvals_invalidated');
  assert.ok(td && ai, 'both deltas present');
  assert.equal(td.ref, '#/govern/trustProfiles/profA');
  assert.equal(td.invalidated, 3);
  assert.equal(ai.ref, '#/spine/i1');
});

test('deltas are stage-ordered (anchor after approval after intent)', () => {
  const a = snap({ i1: intent({ stage: 'plan' }) });
  const b = snap({
    i1: intent({ stage: 'approval', anchor: { status: 'anchored', txHash: 'x', blockHeight: 9 },
      policyDecision: { allowed: false, denials: [] } }),
    i2: intent({ stage: 'intent' }),
  });
  const stages = diffSnapshots(a, b).map((d) => d.stage);
  const idx = (s) => STAGE_ORDER.indexOf(s);
  const STAGE_ORDER = ['intent', 'plan', 'approval', 'execution', 'outcome', 'evidence', 'anchor'];
  for (let i = 1; i < stages.length; i++) assert.ok(idx(stages[i - 1]) <= idx(stages[i]), 'monotonic stage order');
});

test('describeDelta + deltaSeverity produce honest strings/levels', () => {
  assert.match(describeDelta({ kind: 'anchor_finalized', id: 'i1', block: 7 }), /Anchor finalized/);
  assert.equal(deltaSeverity({ kind: 'policy_now_denies' }), 'blocked');
  assert.equal(deltaSeverity({ kind: 'approvals_invalidated' }), 'attention');
});
