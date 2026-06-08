// Nexus browser-verifier tamper matrix (Priority 03).
//
// Every tamper MUST make the browser verifier fail closed at the expected
// check. Covers wrong version, integrity (export hash), plan hash, outcome
// digest, inclusion proof, the stale-vs-recomputed policy-decision pair,
// anchor proof / tx hash, plugin version identity, malformed bundle data, and
// an unreferenced trust-snapshot entry. Run with: node --test ...

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadVerifier, loadFixture } from './_verifier_harness.mjs';

const clone = (o) => JSON.parse(JSON.stringify(o));

/** Mirror of portableVerifier.computeExportHash (incl. v4 replayCapsule). */
function bundleVal(bd) {
  if (bd === null || bd === undefined) return null;
  if (typeof bd === 'string') {
    try {
      return JSON.parse(bd);
    } catch {
      return bd;
    }
  }
  return bd;
}
async function rehash(p, canonicalJSON, coerce32) {
  const intermediate = {
    version: p.version,
    bundleData: bundleVal(p.bundleData),
    planHash: Array.from(coerce32(p.planHash)),
    outcomeDigest: Array.from(coerce32(p.outcomeDigest)),
    trustSnapshot: p.trustSnapshot || null,
    inclusionProofs: p.inclusionProofs || null,
    anchorProof: p.anchorProof || null,
    anchorTxHash: p.anchorTxHash || '',
    anchorBlockHeight: Number(p.anchorBlockHeight || 0),
    pluginVersions: p.pluginVersions || null,
    policyDecisionDigest: Array.from(coerce32(p.policyDecisionDigest)),
    replayCapsule: bundleVal(p.replayCapsule),
  };
  const utf8 = new TextEncoder().encode(canonicalJSON(intermediate));
  const buf = await crypto.subtle.digest('SHA-256', utf8);
  p.exportHash = Array.from(new Uint8Array(buf));
}

test('tamper matrix: every mutation fails the browser verifier at the expected check', async () => {
  const { pkg: original } = loadFixture();
  const v = await loadVerifier();
  try {
    const rh = (p) => rehash(p, v.canonicalJSON, v.coerce32);

    const tampers = [
      { name: 'wrong version', expect: 'version', apply: (p) => { p.version = '2'; } },
      { name: 'flipped exportHash byte', expect: 'export_hash', apply: (p) => { p.exportHash[0] = (p.exportHash[0] + 1) & 0xff; } },
      { name: 'changed planHash (rehashed)', expect: 'plan_hash', apply: async (p) => { p.planHash[0] = (p.planHash[0] + 1) & 0xff; await rh(p); } },
      { name: 'changed outcomeDigest (rehashed)', expect: 'outcome_digest', apply: async (p) => { p.outcomeDigest[0] = (p.outcomeDigest[0] + 1) & 0xff; await rh(p); } },
      {
        name: 'changed inclusion-proof sibling (rehashed)',
        expect: 'inclusion_proof',
        apply: async (p) => {
          const pr = p.inclusionProofs?.[0]?.proof?.[0];
          assert.ok(pr, 'fixture must have an inclusion proof sibling to tamper');
          pr[0] = (pr[0] + 1) & 0xff;
          await rh(p);
        },
      },
      {
        name: 'policy decision changed, STALE export hash',
        expect: 'export_hash',
        apply: (p) => { p.bundleData.policyDecisions[0].decision = 'deny'; /* no rehash */ },
      },
      {
        name: 'policy decision changed, RECOMPUTED export hash',
        expect: 'policy_decision_digest',
        apply: async (p) => { p.bundleData.policyDecisions[0].decision = 'deny'; await rh(p); },
      },
      { name: 'missing anchor proof (anchored bundle)', expect: 'anchor_proof', apply: async (p) => { p.anchorProof = null; await rh(p); } },
      { name: 'wrong anchor tx hash', expect: 'anchor_proof', apply: async (p) => { p.anchorTxHash = 'attacker-tx-hash'; await rh(p); } },
      { name: 'blanked plugin implementationHash', expect: 'plugin_versions', apply: async (p) => { p.pluginVersions[0].implementationHash = ''; await rh(p); } },
      { name: 'malformed bundle data', expect: 'bundle_data', apply: async (p) => { p.bundleData = '{ not valid json'; await rh(p); } },
      {
        name: 'trust-snapshot entry not in trust assumptions',
        expect: 'trust_snapshot',
        apply: async (p) => { (p.trustSnapshot ||= []).push({ profileId: 'fabricated-profile', status: 'active', blockHeight: 999 }); await rh(p); },
      },
    ];

    for (const t of tampers) {
      const p = clone(original);
      await t.apply(p);
      const result = await v.verifyPortablePackage(p);
      assert.equal(result.passed, false, `tamper "${t.name}" must be rejected (verifier wrongly passed)`);
      const failed = result.checks.find((c) => !c.passed);
      assert.ok(failed, `tamper "${t.name}" produced no failed check`);
      assert.ok(
        failed.name.startsWith(t.expect),
        `tamper "${t.name}" failed at "${failed.name}", expected "${t.expect}"`,
      );
    }
  } finally {
    v.cleanup();
  }
});

test('positive control: the untampered fixture still passes', async () => {
  const { pkg } = loadFixture();
  const v = await loadVerifier();
  try {
    const result = await v.verifyPortablePackage(pkg);
    assert.equal(result.passed, true, 'baseline fixture must pass (else the tamper matrix is meaningless)');
  } finally {
    v.cleanup();
  }
});
