// RUNBOOK-07 SP1/SP2 — explicit-`at` snapshot helpers.
// Shims window+fetch so the real rpc.js runs under node, then asserts rpcAt
// sends the EXPLICIT `at` (bypassing the global cursor) and normalizeIntentRecord
// folds raw RPC responses into the diffable shape.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(here, '_resolve_lib.mjs')).href);

// Capture every fetch body so we can inspect the params rpc sent.
const sent = [];
globalThis.window = globalThis.window || {};
globalThis.window.location = { origin: 'http://localhost', href: 'http://localhost/' };
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  sent.push(body);
  return { ok: true, json: async () => ({ jsonrpc: '2.0', id: body.id, result: { ok: true } }) };
};

const { rpcAt, normalizeIntentRecord } = await import('/lib/timeSnapshot.js');

test('rpcAt sends an explicit at coordinate', async () => {
  sent.length = 0;
  await rpcAt('explorer.planGet', { id: 'p1' }, { block: 5 });
  const last = sent[sent.length - 1];
  assert.equal(last.method, 'explorer.planGet');
  assert.deepEqual(last.params.at, { block: 5 }, 'explicit at:{block:5} is on the wire');
  assert.equal(last.params.id, 'p1');
  assert.ok(last.params.actor, 'disclosure context is merged in');
});

test('rpcAt with no atCoord omits at entirely (live read shape)', async () => {
  sent.length = 0;
  await rpcAt('explorer.recentIntents', { limit: 10 });
  const last = sent[sent.length - 1];
  assert.equal('at' in last.params, false, 'no at field when atCoord is null');
});

test('rpcAt bypasses any global cursor (it never calls withAt)', async () => {
  // Even if a global cursor were set to block 9, rpcAt must send block 5 because
  // it talks to raw rpc, not rpcWithDisclosure/withAt.
  const { setAt } = await import('/lib/timeContext.js');
  globalThis.window.history = { replaceState() {}, state: null };
  setAt({ block: 9 });
  sent.length = 0;
  await rpcAt('explorer.planGet', { id: 'p2' }, { block: 5 });
  assert.deepEqual(sent[sent.length - 1].params.at, { block: 5 }, 'explicit at wins over the global cursor');
  setAt(null);
});

test('normalizeIntentRecord folds raw responses into the diffable shape', () => {
  const rec = normalizeIntentRecord({
    id: 'i1',
    row: { state: 'running', stage: 'approval', planId: 'p1' },
    plan: { id: 'p1', planHash: '0xhash' },
    approvals: { required: 2, signed: 1, remaining: 1, invalidated: 0 },
    outcome: { id: 'o1', overallStatus: 'failed' },
    anchor: { recordId: 'r1', status: 'anchored', txHash: '0xtx', blockHeight: 7 },
    policies: [{ allowed: false, policyId: 'pol1', reason: 'denied by rule X', trustProfileId: 'tp1' }],
  });
  assert.equal(rec.id, 'i1');
  assert.equal(rec.stage, 'approval');
  assert.equal(rec.planHash, '0xhash');
  assert.equal(rec.approvals.required, 2);
  assert.equal(rec.outcome.overallStatus, 'failed');
  assert.equal(rec.anchor.status, 'anchored');
  assert.equal(rec.policyDecision.allowed, false, 'a denial flips allowed to false');
  assert.equal(rec.policyDecision.denials[0].trustProfileId, 'tp1');
});

test('normalizeIntentRecord treats a clean trace as allowed and missing artifacts as null', () => {
  const rec = normalizeIntentRecord({
    id: 'i2', row: { state: 'running', stage: 'plan' },
    plan: null, approvals: null, outcome: null, anchor: null,
    policies: [{ allowed: true }],
  });
  assert.equal(rec.policyDecision.allowed, true);
  assert.equal(rec.outcome, null);
  assert.equal(rec.anchor, null);
  assert.deepEqual(rec.approvals, { required: 0, signed: 0, remaining: 0, invalidated: 0 });
});
