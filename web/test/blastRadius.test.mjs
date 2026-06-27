// RUNBOOK-07 SP4 — blast-radius projection (pure).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(here, '_resolve_lib.mjs')).href);

const { computeBlastRadius, blastHeadline } = await import('/lib/blastRadius.js');

test('degrade_trust is EXACT and reads the server dependentApprovals', () => {
  const node = {
    id: 'tp1',
    dependentApprovals: [
      { planId: 'plan-a', role: 'finance', invalidated: true },
      { planId: 'plan-b', role: 'ops', invalidated: true },
    ],
  };
  const r = computeBlastRadius({}, node, 'degrade_trust');
  assert.equal(r.source, 'server', 'trust degrade is exact (server-provided)');
  assert.equal(r.approvals.length, 2);
  assert.ok(r.highlightIds.has('plan-a') && r.highlightIds.has('plan-b'));
  assert.ok(r.highlightIds.has('tp1'), 'the node itself is highlighted');
  assert.match(blastHeadline(r), /2 pending approvals and 0 in-flight intents/);
});

test('revoke_capability is DERIVED and finds dependent approvals + intents', () => {
  const cap = { id: 'cap1', object: 'acc://vault.acme', grantee: 'acc://alice' };
  const atlas = {
    approvals: [
      { id: 'ap1', planId: 'plan-a', role: 'r1', object: 'acc://vault.acme' },   // matches by object
      { id: 'ap2', planId: 'plan-b', role: 'r2', object: 'acc://other' },        // no match
      { id: 'ap3', planId: 'plan-c', role: 'r3', capabilityId: 'cap1' },         // matches by id
    ],
    actors: [{ id: 'alice', intents: [{ id: 'i1', targetId: 'acc://vault.acme' }, { id: 'i2', targetId: 'acc://x' }] }],
  };
  const r = computeBlastRadius(atlas, cap, 'revoke_capability');
  assert.equal(r.source, 'derived');
  const planIds = r.approvals.map((a) => a.planId).sort();
  assert.deepEqual(planIds, ['plan-a', 'plan-c']);
  assert.equal(r.intents.length, 1);
  assert.equal(r.intents[0].id, 'i1');
  assert.ok(r.highlightIds.has('ap1') && r.highlightIds.has('ap3') && r.highlightIds.has('i1'));
});

test('expire_role is DERIVED and breaks approvals signed under the role', () => {
  const role = { id: 'role1', role: 'approver', holders: [{ id: 'h1' }], policies: [{ targetId: 'acc://t' }] };
  const atlas = {
    approvals: [
      { id: 'ap1', planId: 'plan-a', role: 'approver' },
      { id: 'ap2', planId: 'plan-b', role: 'viewer' },
    ],
  };
  const r = computeBlastRadius(atlas, role, 'expire_role');
  assert.equal(r.source, 'derived');
  assert.equal(r.approvals.length, 1);
  assert.equal(r.approvals[0].planId, 'plan-a');
  assert.ok(r.highlightIds.has('h1') && r.highlightIds.has('acc://t'));
});

test('an empty atlas / unknown mutation yields an empty, safe result', () => {
  const r = computeBlastRadius({}, { id: 'n' }, 'unknown_mutation');
  assert.deepEqual(r.approvals, []);
  assert.deepEqual(r.intents, []);
  assert.ok(r.highlightIds.has('n'));
});
