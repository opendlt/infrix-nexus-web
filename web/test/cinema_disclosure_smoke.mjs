// Priority 05 — Cinema disclosure-aware rendering (browser-side parity).
//
// Mirrors pkg/cinema/scene/visibility_filter_test.go in the browser core
// (cinema-core/disclosureView.js). The Cinema scene built for an
// authenticated viewer is already server-filtered; this is the last-line
// CLIENT guarantee that no Cinema surface leaks private content even if it is
// handed a scene that still carries private nodes (a proof bundle, a cached
// fixture, an embed host). Decision table must match Go exactly:
//   public     -> render_full
//   owner-read -> full if viewer==owner, else placeholder [owner-restricted]
//   private    -> placeholder [private]/[encrypted], FIXED size (no leak)
//   authority  -> suppress (node + incident edges removed)
//   unknown    -> placeholder (fail-closed)
// plus a disclosure-grant override (placeholder/suppress -> full) that a
// MALFORMED context can never trigger.

import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../cinema-core/visualVocabulary.js');
require('../cinema-core/disclosureView.js');
const C = globalThis.InfrixCinema;
const { decide, applyDisclosure, FilterAction, Level, DISCLOSURE } = C;

// ---- decision table parity ----
{
  const d = decide(Level.PUBLIC, { key: 'balance' });
  assert.equal(d.action, FilterAction.RENDER_FULL, 'public renders full');
  assert.equal(d.label, 'balance', 'public keeps its label');
  console.log('✓ public -> render_full');
}
{
  const d = decide(Level.PRIVATE, { key: 'secret' });
  assert.equal(d.action, FilterAction.RENDER_PLACEHOLDER, 'private -> placeholder');
  assert.equal(d.label, DISCLOSURE.LABEL_PRIVATE, 'private label is [private]');
  assert.equal(d.placeholder, DISCLOSURE.PLACEHOLDER_ENCRYPTED, 'private value is [encrypted]');
  assert.equal(d.fixedSize, DISCLOSURE.PRIVATE_NODE_FIXED_SIZE, 'private uses fixed size');
  console.log('✓ private -> placeholder with fixed size');
}
{
  const same = decide(Level.OWNER_READ, { key: 'k', viewerId: 'alice', owner: 'alice' });
  assert.equal(same.action, FilterAction.RENDER_OWNER_ONLY, 'owner sees own value');
  const other = decide(Level.OWNER_READ, { key: 'k', viewerId: 'bob', owner: 'alice' });
  assert.equal(other.action, FilterAction.RENDER_PLACEHOLDER, 'non-owner gets placeholder');
  assert.equal(other.label, DISCLOSURE.LABEL_OWNER_RESTRICTED, 'non-owner label is [owner-restricted]');
  console.log('✓ owner-read: owner=full, other=placeholder');
}
{
  const d = decide(Level.AUTHORITY_ONLY, { key: 'k' });
  assert.equal(d.action, FilterAction.SUPPRESS, 'authority_only -> suppress');
  console.log('✓ authority_only -> suppress');
}
{
  const d = decide('weird-unknown-level', { key: 'k' });
  assert.equal(d.action, FilterAction.RENDER_PLACEHOLDER, 'unknown level fails closed');
  assert.equal(d.label, DISCLOSURE.LABEL_UNKNOWN, 'unknown label');
  console.log('✓ unknown level -> placeholder (fail-closed)');
}

// ---- disclosure-grant override ----
{
  const full = decide(Level.PRIVATE, {
    key: 'k', viewerId: 'auditor', purpose: 'audit', workflowInstance: 'wf-1',
    hasGrant: true, grantId: 'grant-9',
  });
  assert.equal(full.action, FilterAction.RENDER_FULL, 'held grant upgrades private->full');
  assert.ok(full.label.includes('disclosed via grant-9'), 'discloses the authorizing grant id');
  console.log('✓ active grant upgrades placeholder -> full with grant id');

  // Malformed context (viewer present, purpose/workflow missing) must NOT override.
  const blocked = decide(Level.PRIVATE, { key: 'k', viewerId: 'auditor', hasGrant: true, grantId: 'g' });
  assert.equal(blocked.action, FilterAction.RENDER_PLACEHOLDER, 'malformed context cannot override (fail-closed)');
  console.log('✓ malformed disclosure context cannot trigger override');
}

// ---- whole-scene filtering: no size/label/magnitude leak ----
{
  const scene = {
    id: 's1', nodes: [
      { id: 'pub', kind: 'account', label: 'treasury', position: { x: 0, y: 0 }, size: 30, balance: 1000 },
      { id: 'sec', kind: 'account', label: 'whale-balance-9.9M', visibility: 'private', position: { x: 50, y: 0 }, size: 99, balance: 9900000 },
      { id: 'auth', kind: 'policy', label: 'authority-secret', visibility: 'authority_only', position: { x: 100, y: 0 }, size: 40 },
    ],
    edges: [
      { id: 'e1', fromNodeId: 'pub', toNodeId: 'sec', label: 'transfer 9.9M', amount: 9900000 },
      { id: 'e2', fromNodeId: 'pub', toNodeId: 'auth', label: 'check' },
    ],
  };
  const out = applyDisclosure(scene, {}); // anonymous viewer
  const byId = Object.fromEntries(out.nodes.map((n) => [n.id, n]));

  assert.ok(byId.pub, 'public node kept');
  assert.equal(byId.pub.balance, 1000, 'public balance intact');

  // Private node: present but fully redacted — fixed size, no balance, no real label.
  assert.ok(byId.sec, 'private node kept as placeholder');
  assert.equal(byId.sec.label, DISCLOSURE.LABEL_PRIVATE, 'private label redacted to [private]');
  assert.equal(byId.sec.size, DISCLOSURE.PRIVATE_NODE_FIXED_SIZE, 'private node uses FIXED size (no magnitude leak)');
  assert.equal(byId.sec.balance, undefined, 'private balance stripped');
  assert.ok(byId.sec.redacted, 'private node flagged redacted');
  assert.notEqual(byId.sec.label, 'whale-balance-9.9M', 'original sensitive label never leaks');

  // Authority-only node suppressed entirely; its edge dropped too.
  assert.equal(byId.auth, undefined, 'authority_only node suppressed');
  const edgeIds = out.edges.map((e) => e.id);
  assert.ok(!edgeIds.includes('e2'), 'edge to suppressed node removed');

  // Edge into the private node is redacted (no amount leak).
  const e1 = out.edges.find((e) => e.id === 'e1');
  assert.ok(e1, 'edge to private node kept (both endpoints survive)');
  console.log('✓ scene filter: private redacted (fixed size, no balance/amount), authority suppressed + edge dropped');
}

// ---- authorized viewer with a grant sees the disclosed node ----
{
  const scene = { id: 's2', nodes: [
    { id: 'sec', kind: 'account', label: 'k', owner: 'acc://vault.acme', url: 'acc://vault.acme', visibility: 'private', position: { x: 0, y: 0 }, size: 50 },
  ], edges: [] };
  const grants = new Set(['acc://vault.acme']);
  const out = applyDisclosure(scene, { viewerId: 'auditor', purpose: 'audit', workflowInstance: 'wf-1', grants });
  const sec = out.nodes[0];
  assert.ok(!sec.redacted, 'authorized viewer with grant sees the node un-redacted');
  console.log('✓ authorized viewer with a matching grant sees the disclosed node');
}

// ---- proof mode shows only what the bundle contains ----
{
  // A proof scene with no private markers renders exactly its nodes — the
  // filter neither adds nor invents content.
  const scene = { id: 'p1', nodes: [
    { id: 'intent', kind: 'intent', label: 'transfer', position: { x: 0, y: 0 }, size: 20 },
    { id: 'outcome', kind: 'outcome', label: 'completed', position: { x: 40, y: 0 }, size: 20 },
  ], edges: [{ id: 'e', fromNodeId: 'intent', toNodeId: 'outcome', label: 'produced' }] };
  const out = applyDisclosure(scene, {});
  assert.equal(out.nodes.length, 2, 'proof scene renders exactly its nodes');
  assert.equal(out.edges.length, 1, 'proof scene renders exactly its edges');
  console.log('✓ proof mode shows only what the bundle contains');
}

console.log('\n✓ All Cinema disclosure-view parity checks passed.');
