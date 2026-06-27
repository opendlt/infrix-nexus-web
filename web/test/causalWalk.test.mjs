// RUNBOOK-07 SP3 — causal "why" walk (pure).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(here, '_resolve_lib.mjs')).href);

const { buildCausalChain, pickDenial } = await import('/lib/causalWalk.js');

const failedSnapshot = () => ({
  intent: { id: 'i1' },
  outcome: {
    overallStatus: 'failed',
    failureReason: 'compensation could not complete',
    stepOutcomes: [
      { id: 's1', kind: 'execution', status: 'ok' },
      { id: 's2', kind: 'compensation', status: 'failed', detail: 'rollback rejected' },
    ],
  },
  policies: [
    { allowed: true, policyId: 'p0' },
    { allowed: false, policyId: 'p1', rule: 'role.expired', reason: 'signer role expired', trustProfileId: 'tp1' },
  ],
  anchorChain: { links: [{ blockHeight: 100, txHash: '0xaa', recordId: 'r1' }, { blockHeight: 142, txHash: '0xbb', recordId: 'r2' }] },
});

test('a failed outcome produces the full 5-link chain to a block', () => {
  const chain = buildCausalChain(failedSnapshot());
  assert.ok(chain);
  assert.equal(chain.confidence, 'derived');
  const kinds = chain.links.map((l) => l.kind);
  assert.deepEqual(kinds, ['outcome', 'compensation', 'policy', 'trust', 'block']);
  // Deep-links resolve to the right surfaces.
  assert.equal(chain.links[0].ref, '#/spine/i1');
  assert.equal(chain.links[2].ref, '#/govern/policies/p1');
  assert.equal(chain.links[3].ref, '#/govern/trustProfiles/tp1');
  assert.equal(chain.links[4].block, 142, 'terminal block is the deepest anchor link');
  assert.equal(chain.links[3]._lazy, true, 'trust hop is lazy-loaded on expand');
});

test('a successful or in-flight outcome produces no chain', () => {
  assert.equal(buildCausalChain({ intent: { id: 'i1' }, outcome: { overallStatus: 'completed' } }), null);
  assert.equal(buildCausalChain({ intent: { id: 'i1' }, outcome: { overallStatus: 'running' } }), null);
  assert.equal(buildCausalChain({ intent: { id: 'i1' }, outcome: null }), null);
});

test('Go PascalCase fields are tolerated', () => {
  const chain = buildCausalChain({
    intent: { ID: 'i9' },
    outcome: { OverallStatus: 'failed', StepOutcomes: [{ Kind: 'compensation', Status: 'failed' }] },
    policies: [{ Allowed: false, PolicyID: 'pX', Reason: 'boom' }],
    anchorChain: { Links: [{ BlockHeight: 7, TxHash: '0x07' }] },
  });
  assert.ok(chain);
  assert.equal(chain.links[0].ref, '#/spine/i9');
  assert.equal(chain.links.find((l) => l.kind === 'policy').policyId, 'pX');
  assert.equal(chain.links.find((l) => l.kind === 'block').block, 7);
});

test('a redacted policy hop degrades confidence to partial without fabricating', () => {
  const chain = buildCausalChain({
    intent: { id: 'i2' },
    outcome: { overallStatus: 'failed' },
    policies: { status: 'hidden' },
    anchorChain: { links: [] },
  });
  assert.equal(chain.confidence, 'partial');
  const pol = chain.links.find((l) => l.kind === 'policy');
  assert.equal(pol._hidden, true);
  assert.match(pol.detail, /redacted/);
});

test('pickDenial returns the first denial only', () => {
  const d = pickDenial([{ allowed: true }, { allowed: false, policyId: 'a' }, { allowed: false, policyId: 'b' }]);
  assert.equal(d.policyId, 'a');
  assert.equal(pickDenial([{ allowed: true }]), null);
});
