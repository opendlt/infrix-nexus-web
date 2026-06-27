// RUNBOOK-07 SP5 — reverse authority index (pure).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(here, '_resolve_lib.mjs')).href);

const { buildAuthorityIndex, queryWhoCanTouch, normalize, rankByRisk } = await import('/lib/authorityIndex.js');

const X = 'acc://vault.acme';
function atlasFixture() {
  return {
    capabilities: [
      { id: 'cap1', object: X, capability: 'transfer', grantee: 'acc://alice', expiryState: 'active' },
      { id: 'cap2', object: X, capability: 'audit', grantee: 'acc://bob', expiresAtBlock: 5, currentBlock: 50 }, // expired
    ],
    policies: [
      { id: 'pol1', targetId: X, policyType: 'deny_transfer', state: 'active' },
    ],
    roles: [
      { id: 'role1', scopeTarget: X, role: 'approver', holders: [{ id: 'acc://carol' }] },
    ],
    actors: [{ id: 'acc://alice' }, { id: 'acc://bob' }, { id: 'acc://carol' }],
  };
}

test('queryWhoCanTouch returns every capability/policy/role pointing at the target', () => {
  const idx = buildAuthorityIndex(atlasFixture());
  const { rows, empty } = queryWhoCanTouch(idx, X);
  assert.equal(empty, false);
  const kinds = rows.map((r) => r.kind);
  assert.ok(kinds.includes('capability'));
  assert.ok(kinds.includes('policy'));
  assert.ok(kinds.includes('role'));
  // 2 caps + 1 policy + 1 role + resolved actors (alice grantee, carol holder).
  assert.ok(rows.length >= 4);
});

test('rows are risk-ranked: deny-policy first, expired capability last', () => {
  const idx = buildAuthorityIndex(atlasFixture());
  const { rows } = queryWhoCanTouch(idx, X);
  assert.equal(rows[0].kind, 'policy', 'a deny policy ranks highest');
  const expiredCap = rows.find((r) => r.id === 'cap2');
  const activeCap = rows.find((r) => r.id === 'cap1');
  assert.ok(activeCap.riskScore > expiredCap.riskScore, 'active capability outranks the expired one');
});

test('a target with no authority paths returns empty (not an error)', () => {
  const idx = buildAuthorityIndex(atlasFixture());
  const { rows, empty } = queryWhoCanTouch(idx, 'acc://nothing.here');
  assert.equal(empty, true);
  assert.deepEqual(rows, []);
});

test('a target reachable only via policy.affected is still found', () => {
  const idx = buildAuthorityIndex({
    policies: [{ id: 'polA', targetId: 'acc://main', policyType: 'gate', state: 'active', affected: [{ id: 'acc://side' }] }],
  });
  const { rows } = queryWhoCanTouch(idx, 'acc://side');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'polA');
  assert.equal(rows[0].why, 'policy affects this target');
});

test('a redacted authority entry is surfaced as hidden, never dropped', () => {
  const idx = buildAuthorityIndex({
    capabilities: [{ id: 'capH', object: X, capability: 'secret', grantee: 'acc://ghost', status: 'hidden' }],
  });
  const { rows } = queryWhoCanTouch(idx, X);
  assert.equal(rows.length >= 1, true);
  assert.equal(rows.find((r) => r.id === 'capH').hidden, true);
});

test('normalize canonicalizes target ids (trailing slash + case)', () => {
  assert.equal(normalize('ACC://Vault.ACME/'), 'acc://vault.acme');
});
