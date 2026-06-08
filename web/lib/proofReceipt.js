// Nexus — canonical proof receipt logic (adoption-06).
//
// The browser twin of pkg/proofreceipt (and sdk/typescript/src/proofReceipt.ts):
// it turns a verification result into the ONE compact receipt every Infrix
// proof surface emits, and validates it fail-closed. The Nexus prove view and
// the Cinema proof mode both render this receipt via components/proofReceiptView.js
// — one receipt component, two surfaces.
//
// The browser portable verifier (lib/portableVerifier.js) is an OFFLINE
// structural verifier: it never confirms an L0 anchor, so a receipt built from
// it is honest by construction (l0Verified false, capped below L4).

export const RECEIPT_VERSION = '1';

const PROOF_LEVELS = new Set(['L1', 'L2', 'L3', 'L4']);
const isProofLevel = (s) => PROOF_LEVELS.has(String(s || '').trim().toUpperCase());
const isL4 = (s) => String(s || '').trim().toUpperCase() === 'L4';
const hasL4 = (s) => String(s || '').toUpperCase().includes('L4');

function checkPassed(checks, names) {
  for (const c of checks || []) {
    const n = String(c && c.name ? c.name : '').toLowerCase();
    if (names.some((x) => n === x || n.includes(x))) return !!c.passed;
  }
  return false;
}

/**
 * buildReceiptFromVerifier builds a receipt from the offline portable-verifier
 * result ({ passed, checks: [{name, passed, detail?, error?}] }).
 * @param {{passed:boolean, checks:Array}} result
 * @param {object} opts subject/artifacts/verification context
 */
export function buildReceiptFromVerifier(result, opts = {}) {
  result = result || { passed: false, checks: [] };
  const checks = result.checks || [];
  // The offline browser verifier never confirms L0; opts may override when an
  // L0 endpoint confirmed the anchor out of band.
  const l0Verified = opts.l0Verified != null ? !!opts.l0Verified : false;
  const anchored = checkPassed(checks, ['anchor_proof', 'anchor']);
  const proofLevel = opts.proofLevel || (result.passed ? (l0Verified ? 'L4' : 'L3') : 'L0');
  const governanceLevel = opts.governanceLevel || '';
  const label = opts.label || (governanceLevel ? `${proofLevel}/${governanceLevel}` : proofLevel);

  const warnings = [];
  for (const c of checks) {
    if (c && c.passed === false) warnings.push(`check failed: ${c.name}${c.detail || c.error ? ' — ' + (c.detail || c.error) : ''}`);
  }
  if (result.passed && !anchored) warnings.push('the bundle is not anchored — offline structural verification only');

  const subjectType = opts.subjectType || (opts.intentId ? 'intent' : 'evidence');

  return {
    version: RECEIPT_VERSION,
    subject: { type: subjectType, id: opts.subjectId || opts.intentId || opts.evidenceId || '' },
    summary: result.passed ? 'Verified without trusting the Infrix node.' : 'Verification failed.',
    status: result.passed ? 'verified' : 'failed',
    assurance: {
      proofLevel,
      governanceLevel,
      label,
      nodeTrusted: false,
      l0Verified,
      replayVerified: opts.replayVerified != null ? !!opts.replayVerified : false,
      witnessQuorumVerified: opts.witnessQuorumVerified != null ? !!opts.witnessQuorumVerified : false,
    },
    artifacts: {
      intentId: opts.intentId || '',
      planId: opts.planId || '',
      outcomeId: opts.outcomeId || '',
      evidenceId: opts.evidenceId || '',
      anchorTx: opts.anchorTx || '',
    },
    verification: {
      verifiedAt: opts.verifiedAt || '',
      verifier: opts.verifier || 'Nexus offline verifier',
      command: opts.command || '',
      network: opts.network || '',
    },
    warnings,
    detailsRef: opts.detailsRef || '',
  };
}

/** validateReceipt returns the fail-closed violations (empty = valid). */
export function validateReceipt(r) {
  const errs = [];
  if (!r) return ['nil receipt'];
  if (r.version !== RECEIPT_VERSION) errs.push(`unsupported version ${r.version}`);
  if (!['intent', 'evidence', 'release', 'metamask_acceptance'].includes(r.subject && r.subject.type)) {
    errs.push(`invalid subject.type ${r.subject && r.subject.type}`);
  }
  if (!['verified', 'partial', 'failed'].includes(r.status)) errs.push(`invalid status ${r.status}`);
  const a = r.assurance || {};
  if (typeof a.nodeTrusted !== 'boolean') errs.push('assurance.nodeTrusted is required');
  const positive = a.l0Verified || a.replayVerified || a.witnessQuorumVerified || isProofLevel(a.proofLevel);
  if (r.status === 'verified' && !positive) errs.push('status verified but no verification check passed');
  if (isL4(a.proofLevel) && !a.l0Verified) errs.push('proofLevel L4 without l0Verified');
  if (hasL4(a.label) && !a.l0Verified) errs.push('label claims L4 without l0Verified');
  if (a.l0Verified) {
    if (!(r.verification && String(r.verification.network).trim())) errs.push('l0Verified without a verification.network');
    if (!(r.verification && String(r.verification.command).trim())) errs.push('l0Verified without a verification.command');
  }
  if (a.witnessQuorumVerified && !a.l0Verified) errs.push('witnessQuorumVerified without l0Verified');
  const art = r.artifacts || {};
  if (r.subject && r.subject.type === 'intent' && art.intentId && r.subject.id && art.intentId !== r.subject.id) {
    errs.push('subject.id conflicts with artifacts.intentId');
  }
  return errs;
}

/** receiptBadges maps a receipt to the shared UI badge set. */
export function receiptBadges(r) {
  const a = (r && r.assurance) || {};
  const net = r && r.verification && r.verification.network;
  return {
    status: r ? r.status : 'failed',
    assurance: a.label || '(none)',
    badges: [
      { name: 'node trust', text: 'no node trust required', on: !(a.nodeTrusted == null ? true : a.nodeTrusted) },
      { name: 'L0', text: a.l0Verified ? `confirmed${net ? ' on ' + net : ''}` : 'not checked (offline)', on: !!a.l0Verified },
      { name: 'replay', text: a.replayVerified ? 'reproduced' : 'not reproduced', on: !!a.replayVerified },
      { name: 'witness', text: a.witnessQuorumVerified ? 'verified' : 'not required', on: !!a.witnessQuorumVerified },
    ],
  };
}

/** renderReceiptText renders the friendly text form (parity with the CLI). */
export function renderReceiptText(r) {
  const head = r.status === 'verified' ? 'VERIFIED' : r.status === 'partial' ? 'PARTIALLY VERIFIED' : 'NOT VERIFIED';
  const a = r.assurance || {};
  const net = r.verification && r.verification.network;
  const lines = [
    head, '',
    `Assurance: ${a.label || '(none)'}`,
    `Trusts Infrix node: ${a.nodeTrusted ? 'yes' : 'no'}`,
    `L0 anchor: ${a.l0Verified ? `confirmed${net ? ' on ' + net : ''}` : 'not checked (offline)'}`,
    `Replay: ${a.replayVerified ? 'reproduced' : 'not reproduced'}`,
    `Witness quorum: ${a.witnessQuorumVerified ? 'verified' : 'not required'}`,
  ];
  if (r.warnings && r.warnings.length) {
    lines.push('', 'Warnings:');
    for (const w of r.warnings) lines.push(`  - ${w}`);
  }
  return lines.join('\n') + '\n';
}
