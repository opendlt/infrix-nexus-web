// Nexus — client-side PortableEvidencePackage verifier.
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 5: byte-exact mirror of
// pkg/evidence/portable.go::VerifyPortablePackage. The 10-check
// matrix runs entirely in the browser without any Infrix-server
// roundtrip — the user has stepped outside the operator's trust
// boundary and is verifying directly from the package's
// self-contained witness.
//
// The 10 checks (from VerifyPortablePackage):
//   1.  Version match
//   2.  ExportHash recomputes
//   3.  BundleData parses as a valid EvidenceBundle (we do a
//       structural shape check; full Go struct compatibility is the
//       wire-format guarantee documented in PORTABLE_SPEC.md)
//   4.  PlanHash non-zero AND matches embedded ApprovalEvidence (or
//       falls back to OutcomeDigest for subsystem-attributed bundles)
//   5.  OutcomeDigest non-zero AND matches embedded bundle.OutcomeDigest
//   6.  Every InclusionProof reconstructs to its declared ChainHash
//   7.  Anchored bundle: AnchorProof, AnchorTxHash, AnchorBlockHeight
//       cross-binding to embedded bundle
//   8.  TrustSnapshot entries: BlockHeight non-zero, ProfileID in
//       embedded bundle.TrustAssumptions
//   9.  PolicyDecisionDigest matches recomputed digest of embedded
//       bundle.PolicyDecisions
//   10. PluginVersions: every entry has all three identity fields

import {
  canonicalJSON,
  canonicalJSONSha256,
  bytesEqual,
  bytesToHex,
  coerce32,
  isZero32,
  sha256,
  concatBytes,
} from '/lib/canonicalJson.js';

// Must track pkg/evidence.PortableEvidencePackageVersion. v4 added the
// replayCapsule + witnessReceipts fields (replayCapsule is committed to
// ExportHash; see computeExportHash below).
const PORTABLE_VERSION = '4';

/**
 * Run the 10-check verifier against a parsed PortableEvidencePackage.
 * @param {object} pkg — parsed JSON of a portable-package file
 * @returns {Promise<{passed:boolean, checks:Array<{name:string, passed:boolean, detail?:string, error?:string}>}>}
 */
export async function verifyPortablePackage(pkg) {
  const checks = [];

  // ── 1. Version
  if (!pkg) {
    return { passed: false, checks: [{ name: 'version', passed: false, error: 'package is null' }] };
  }
  if (pkg.version !== PORTABLE_VERSION) {
    checks.push({ name: 'version', passed: false, detail: `got ${pkg.version}, expected ${PORTABLE_VERSION}` });
    return { passed: false, checks };
  }
  checks.push({ name: 'version', passed: true, detail: `v${PORTABLE_VERSION}` });

  // ── 2. ExportHash integrity
  let computedExportHash;
  try {
    computedExportHash = await computeExportHash(pkg);
  } catch (err) {
    checks.push({ name: 'export_hash', passed: false, error: 'failed to recompute: ' + err.message });
    return { passed: false, checks };
  }
  const wantedExportHash = coerce32(pkg.exportHash);
  if (!bytesEqual(computedExportHash, wantedExportHash)) {
    checks.push({
      name: 'export_hash',
      passed: false,
      detail: `recomputed ${bytesToHex(computedExportHash).slice(0, 16)}… ≠ stored ${bytesToHex(wantedExportHash).slice(0, 16)}…`,
    });
    return { passed: false, checks };
  }
  checks.push({ name: 'export_hash', passed: true, detail: bytesToHex(computedExportHash).slice(0, 16) + '…' });

  // ── 3. BundleData parses
  if (!pkg.bundleData) {
    checks.push({ name: 'bundle_data', passed: false, error: 'BundleData is empty' });
    return { passed: false, checks };
  }
  // BundleData is a json.RawMessage — i.e. raw bytes of the
  // canonicalised EvidenceBundle. The portable-package wire form
  // serialises that as a JSON string OR an inline JSON value.
  let embedded;
  try {
    embedded = parseBundleData(pkg.bundleData);
  } catch (err) {
    checks.push({ name: 'bundle_data', passed: false, error: 'BundleData not valid EvidenceBundle JSON: ' + err.message });
    return { passed: false, checks };
  }
  checks.push({ name: 'bundle_data', passed: true, detail: `embedded bundle id=${embedded.id || embedded.ID || '?'}` });

  // ── 4. PlanHash + cross-binding to ApprovalEvidence
  const planHash = coerce32(pkg.planHash);
  if (isZero32(planHash)) {
    checks.push({ name: 'plan_hash', passed: false, error: 'PlanHash is zero' });
    return { passed: false, checks };
  }
  const approvals = embedded.approvalEvidence || embedded.ApprovalEvidence || [];
  const approvalPlanHashes = approvals
    .map((a) => coerce32(a.planHash || a.PlanHash))
    .filter((h) => !isZero32(h));
  if (approvalPlanHashes.length > 0) {
    const matched = approvalPlanHashes.some((h) => bytesEqual(h, planHash));
    if (!matched) {
      checks.push({
        name: 'plan_hash',
        passed: false,
        detail: `package PlanHash ${bytesToHex(planHash).slice(0, 16)}… not in ${approvalPlanHashes.length} approval entr${approvalPlanHashes.length === 1 ? 'y' : 'ies'}`,
      });
      return { passed: false, checks };
    }
    checks.push({ name: 'plan_hash', passed: true, detail: 'matches an ApprovalEvidence.PlanHash' });
  } else {
    // Subsystem-attributed bundles use OutcomeDigest as PlanHash.
    const outcome = coerce32(embedded.outcomeDigest || embedded.OutcomeDigest);
    if (!bytesEqual(outcome, planHash)) {
      checks.push({
        name: 'plan_hash',
        passed: false,
        detail: 'no ApprovalEvidence and PlanHash ≠ embedded OutcomeDigest (subsystem-attributed fallback fails)',
      });
      return { passed: false, checks };
    }
    checks.push({ name: 'plan_hash', passed: true, detail: 'subsystem-attributed: matches OutcomeDigest' });
  }

  // ── 5. OutcomeDigest matches
  const outcomeDigest = coerce32(pkg.outcomeDigest);
  if (isZero32(outcomeDigest)) {
    checks.push({ name: 'outcome_digest', passed: false, error: 'OutcomeDigest is zero' });
    return { passed: false, checks };
  }
  const embeddedOutcome = coerce32(embedded.outcomeDigest || embedded.OutcomeDigest);
  if (!bytesEqual(outcomeDigest, embeddedOutcome)) {
    checks.push({
      name: 'outcome_digest',
      passed: false,
      detail: `package ${bytesToHex(outcomeDigest).slice(0, 16)}… ≠ embedded ${bytesToHex(embeddedOutcome).slice(0, 16)}…`,
    });
    return { passed: false, checks };
  }
  checks.push({ name: 'outcome_digest', passed: true });

  // ── 6. Inclusion proofs
  const proofs = pkg.inclusionProofs || [];
  for (let i = 0; i < proofs.length; i++) {
    try {
      const ok = await verifyMerkleInclusionProof(proofs[i]);
      if (!ok) {
        checks.push({ name: `inclusion_proof[${i}]`, passed: false, detail: 'reconstructed root ≠ ChainHash' });
        return { passed: false, checks };
      }
    } catch (err) {
      checks.push({ name: `inclusion_proof[${i}]`, passed: false, error: err.message });
      return { passed: false, checks };
    }
  }
  if (proofs.length === 0) {
    checks.push({ name: 'inclusion_proofs', passed: true, detail: 'no proofs (skipped)' });
  } else {
    checks.push({ name: 'inclusion_proofs', passed: true, detail: `${proofs.length} proof${proofs.length === 1 ? '' : 's'} reconstruct cleanly` });
  }

  // ── 7. Anchor proof cross-binding when bundle is anchored
  // The canonical EvidenceBundle wire form names these "anchorStatus" /
  // "anchorBlockHeight" (pkg/evidence/bundle.go json tags). Reading the wrong
  // key would silently skip the whole anchor cross-binding — match Go exactly.
  const anchorState = embedded.anchorStatus || embedded.anchor || embedded.Anchor || '';
  const isAnchored = anchorState === 'anchored' || anchorState === 'verified';
  if (isAnchored) {
    if (!pkg.anchorProof) {
      checks.push({ name: 'anchor_proof', passed: false, error: 'anchored bundle missing AnchorProof' });
      return { passed: false, checks };
    }
    const apBundleID = pkg.anchorProof.bundleId || pkg.anchorProof.BundleID;
    const embBundleID = embedded.id || embedded.ID;
    if (apBundleID !== embBundleID) {
      checks.push({
        name: 'anchor_proof',
        passed: false,
        detail: `AnchorProof.BundleID ${apBundleID} ≠ embedded.ID ${embBundleID}`,
      });
      return { passed: false, checks };
    }
    const embTx = embedded.anchorTxHash || embedded.AnchorTxHash || '';
    if (embTx !== '' && pkg.anchorTxHash !== embTx) {
      checks.push({
        name: 'anchor_proof',
        passed: false,
        detail: `AnchorTxHash mismatch: package ${pkg.anchorTxHash} ≠ embedded ${embTx}`,
      });
      return { passed: false, checks };
    }
    const embBlock = embedded.anchorBlockHeight || embedded.anchorBlock || embedded.AnchorBlock || 0;
    if (embBlock !== 0 && Number(pkg.anchorBlockHeight || 0) !== Number(embBlock)) {
      checks.push({
        name: 'anchor_proof',
        passed: false,
        detail: `AnchorBlockHeight mismatch: package ${pkg.anchorBlockHeight} ≠ embedded ${embBlock}`,
      });
      return { passed: false, checks };
    }
    checks.push({ name: 'anchor_proof', passed: true, detail: `tx=${(pkg.anchorTxHash || '').slice(0, 12)}… block=${pkg.anchorBlockHeight}` });
  } else {
    checks.push({ name: 'anchor_proof', passed: true, detail: `bundle not anchored (state=${anchorState || 'unanchored'}); skipped` });
  }

  // ── 8. Trust snapshot
  const embeddedTrust = embedded.trustAssumptions || embedded.TrustAssumptions || [];
  const embeddedProfileSet = new Set(embeddedTrust.map((t) => t.profileId || t.ProfileID).filter(Boolean));
  const snap = pkg.trustSnapshot || [];
  for (let i = 0; i < snap.length; i++) {
    const s = snap[i];
    const bh = Number(s.blockHeight || s.BlockHeight || 0);
    if (bh === 0) {
      checks.push({ name: `trust_snapshot[${i}]`, passed: false, detail: 'zero BlockHeight' });
      return { passed: false, checks };
    }
    const pid = s.profileId || s.ProfileID || '';
    if (embeddedProfileSet.size > 0 && !embeddedProfileSet.has(pid)) {
      checks.push({
        name: `trust_snapshot[${i}]`,
        passed: false,
        detail: `ProfileID ${pid} not in embedded TrustAssumptions`,
      });
      return { passed: false, checks };
    }
  }
  checks.push({ name: 'trust_snapshot', passed: true, detail: `${snap.length} entr${snap.length === 1 ? 'y' : 'ies'}` });

  // ── 9. PolicyDecisionDigest cross-binding.
  // Pass the parsed objects DIRECTLY to the canonical JSON encoder.
  // The Go pipeline does json.Marshal([]DecisionProofRef) →
  // json.Unmarshal-into-any → writeCanonical; the JSON parser on
  // our side already gave us the same map[string]any shape after
  // JSON.parse, so we hand it to the canonical encoder unchanged.
  // Critically: we must NOT synthesize empty optional fields
  // (e.g. `actor` is omitempty in Go) — adding them would produce
  // a different canonical-JSON output than Go and the digest
  // would mismatch.
  const decisions = embedded.policyDecisions || embedded.PolicyDecisions || [];
  const expectedPolicyDigest = decisions.length === 0
    ? new Uint8Array(32)
    : await canonicalJSONSha256(decisions);
  const wantedPolicyDigest = coerce32(pkg.policyDecisionDigest);
  if (!bytesEqual(expectedPolicyDigest, wantedPolicyDigest)) {
    checks.push({
      name: 'policy_decision_digest',
      passed: false,
      detail: `recomputed ${bytesToHex(expectedPolicyDigest).slice(0, 16)}… ≠ stored ${bytesToHex(wantedPolicyDigest).slice(0, 16)}…`,
    });
    return { passed: false, checks };
  }
  checks.push({ name: 'policy_decision_digest', passed: true, detail: `${decisions.length} decision${decisions.length === 1 ? '' : 's'}` });

  // ── 10. PluginVersions
  const pvs = pkg.pluginVersions || [];
  for (let i = 0; i < pvs.length; i++) {
    const pv = pvs[i];
    const pid = pv.pluginId || pv.PluginID || '';
    const ver = pv.version || pv.Version || '';
    const ih = pv.implementationHash || pv.ImplementationHash || '';
    if (!pid || !ver || !ih) {
      checks.push({
        name: `plugin_versions[${i}]`,
        passed: false,
        detail: `partially populated (id=${pid}, version=${ver}, implHash=${ih})`,
      });
      return { passed: false, checks };
    }
  }
  checks.push({ name: 'plugin_versions', passed: true, detail: `${pvs.length} entr${pvs.length === 1 ? 'y' : 'ies'}` });

  return { passed: true, checks };
}

/**
 * Recompute ExportHash. Builds an intermediate map matching
 * pkg/evidence/portable.go::computePortableExportHash and runs the
 * canonical JSON encoder + SHA-256.
 */
async function computeExportHash(pkg) {
  const intermediate = {
    version: pkg.version,
    bundleData: bundleDataAsCanonicalValue(pkg.bundleData),
    planHash: arrayifyHash(pkg.planHash),
    outcomeDigest: arrayifyHash(pkg.outcomeDigest),
    trustSnapshot: pkg.trustSnapshot || null,
    inclusionProofs: pkg.inclusionProofs || null,
    anchorProof: pkg.anchorProof || null,
    anchorTxHash: pkg.anchorTxHash || '',
    anchorBlockHeight: Number(pkg.anchorBlockHeight || 0),
    pluginVersions: pkg.pluginVersions || null,
    policyDecisionDigest: arrayifyHash(pkg.policyDecisionDigest),
    // v4: the replay capsule is committed to ExportHash (Go encodes the raw
    // message, or null when absent). Omitting this key would diverge from
    // pkg/evidence.computePortableExportHash and fail every v4 package.
    replayCapsule: bundleDataAsCanonicalValue(pkg.replayCapsule),
  };
  return canonicalJSONSha256(intermediate);
}

/**
 * BundleData is json.RawMessage on the Go side. When it's already an
 * object/array (because the JSON parser inlined it), the canonical
 * encoder will sort its keys. When it's a string (raw JSON), we have
 * to parse it once so the canonical encoder operates on the same
 * structure Go would. Either way the canonicalised bytes match
 * because Go's pipeline does Marshal → Unmarshal-into-any → sorted
 * canonical write.
 */
function bundleDataAsCanonicalValue(bd) {
  if (bd === null || bd === undefined) return null;
  if (typeof bd === 'string') {
    // RawMessage emitted as a JSON string literal — re-parse the
    // string content to feed the canonical encoder. If the string
    // doesn't parse, fall through and let the encoder treat it as a
    // string scalar.
    try { return JSON.parse(bd); } catch (e) { return bd; }
  }
  return bd;
}

/**
 * Normalise hash fields to the integer-array form the Go side
 * canonicalises. Accepts: Array<number> (JSON-parsed [N]byte), hex
 * string, or base64 string.
 */
function arrayifyHash(v) {
  const b = coerce32(v);
  return Array.from(b);
}

/**
 * Accept either a parsed object (the JSON parser inlined the
 * RawMessage) or a string (raw JSON bytes).
 */
function parseBundleData(bd) {
  if (bd === null || bd === undefined) throw new Error('null bundleData');
  if (typeof bd === 'object') return bd;
  if (typeof bd === 'string') return JSON.parse(bd);
  throw new Error('unexpected bundleData type ' + typeof bd);
}

/** Mirror Go's verifyMerkleInclusionProof. */
async function verifyMerkleInclusionProof(proof) {
  if (!proof) return false;
  let computed = coerce32(proof.link && (proof.link.contentHash || proof.link.ContentHash));
  let idx = Number(proof.linkIndex || proof.LinkIndex || 0);
  const siblings = proof.proof || proof.Proof || [];
  for (const sib of siblings) {
    const sibling = coerce32(sib);
    let concatBuf;
    if (idx % 2 === 0) {
      concatBuf = concatBytes(computed, sibling);
    } else {
      concatBuf = concatBytes(sibling, computed);
    }
    computed = await sha256(concatBuf);
    idx = Math.floor(idx / 2);
  }
  const wanted = coerce32(proof.chainHash || proof.ChainHash);
  return bytesEqual(computed, wanted);
}

