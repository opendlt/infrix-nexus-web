// Nexus — guided-mode assurance wording (adoption-04).
//
// One place that turns a portable-verifier result into PLAIN, HONEST
// language. The cap is non-negotiable: a proof is only described as L4 when
// the L0 anchor was INDEPENDENTLY CONFIRMED. Offline verification — every
// cryptographic binding checked, but the anchor not fetched from Accumulate
// L0 — caps at L3 and says so. Guided copy never claims L4 without L0.

// Canonical plain-language lines reused across guided flows.
export const PLAIN = Object.freeze({
  noNodeTrust: 'Verified without trusting this node',
  l0NotChecked: 'L0 not checked in offline mode',
  structurallyValidNotL4: 'This proof is structurally valid but not L4',
});

function findCheck(result, names) {
  if (!result || !Array.isArray(result.checks)) return null;
  for (const c of result.checks) {
    const n = String(c && c.name ? c.name : '').toLowerCase();
    if (names.some((x) => n === x || n.includes(x))) return c;
  }
  return null;
}

/** l0Confirmed reports whether an L0-anchor check is present AND passed. */
export function l0Confirmed(result) {
  const c = findCheck(result, ['l0_anchor', 'l0anchor', 'l0']);
  return !!(c && c.passed === true);
}

/**
 * assuranceSummary maps a verifier result to a plain-language verdict.
 * @returns {{level:string, headline:string, detail:string, l4:boolean,
 *            nodeTrust:string, l0:string, replay:string, witness:string}}
 */
export function assuranceSummary(result) {
  const replayCheck = findCheck(result, ['replay']);
  const witnessCheck = findCheck(result, ['witness']);
  const replay = replayCheck
    ? (replayCheck.passed ? 'Deterministic replay reproduced the outcome' : 'Replay attempted but did not reproduce')
    : 'Replay not included in this proof';
  const witness = witnessCheck
    ? (witnessCheck.passed ? 'Independent witness attested' : 'Witness present but not valid')
    : 'No independent witnesses in this proof';

  if (!result || result.passed !== true) {
    return {
      level: 'invalid',
      headline: 'Not verified',
      detail: 'One or more cryptographic checks failed — do not trust this proof.',
      l4: false,
      nodeTrust: PLAIN.noNodeTrust,
      l0: l0Confirmed(result) ? 'L0 anchor confirmed' : PLAIN.l0NotChecked,
      replay,
      witness,
    };
  }

  if (l0Confirmed(result)) {
    return {
      level: 'L4',
      headline: 'Verified to L0 (L4)',
      detail: 'Every binding checks out and the anchor is confirmed on Accumulate L0 — ' + PLAIN.noNodeTrust + '.',
      l4: true,
      nodeTrust: PLAIN.noNodeTrust,
      l0: 'L0 anchor confirmed',
      replay,
      witness,
    };
  }

  // Offline: bindings verified, anchor NOT confirmed against L0 → cap at L3.
  return {
    level: 'L3',
    headline: 'Structurally valid (L3)',
    detail: PLAIN.structurallyValidNotL4 + ' — ' + PLAIN.l0NotChecked + '. ' + PLAIN.noNodeTrust + '.',
    l4: false,
    nodeTrust: PLAIN.noNodeTrust,
    l0: PLAIN.l0NotChecked,
    replay,
    witness,
  };
}
