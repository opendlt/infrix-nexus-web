// Nexus — TrustBoundaryMap (nextux-03).
//
// One reusable component that answers, in plain language: what did Infrix
// prove, what did Accumulate L0 prove, what did the operator merely attest,
// what did the user sign, and what remains unverified. It is derived from the
// honest assurance state so it can never claim a boundary the state does not
// support — it is used on proof receipts, the release-evidence verifier, Nexus
// readiness, the Cinema replay summary, MetaMask acceptance, and the playground.

import { elt, setAttrs } from '/lib/uxDom.js';

/**
 * buildTrustBoundaryMap renders the trust boundary for a state + context.
 * @param {object} state an AssuranceState
 * @param {{userSigned?:boolean, signer?:string, unverified?:string[]}} ctx
 */
export function buildTrustBoundaryMap(state, ctx = {}) {
  const s = state || {};
  const map = elt('div', 'ux-trust-map');
  setAttrs(map, { role: 'group', 'aria-label': 'Trust boundary' });
  map.appendChild(elt('div', 'ux-trust-map-title', 'Who proved what'));

  const rows = [
    {
      who: 'Infrix proved',
      what: s.cryptographicallyVerified
        ? 'Every step is cryptographically bound — the maths checks out.'
        : 'The cryptographic bindings did not verify.',
      state: s.cryptographicallyVerified ? 'yes' : 'no',
    },
    {
      who: 'Accumulate L0 proved',
      what: s.l0Verified
        ? 'The anchor is confirmed on the base chain — durable and neutral.'
        : 'No live L0 confirmation — this is not claimed (caps below L4).',
      state: s.l0Verified ? 'yes' : 'pending',
    },
    {
      who: 'Operator attested',
      what: s.operatorAttested
        ? 'An operator vouches for part of this — their word, not a proof.'
        : 'Nothing rests on an operator’s word here.',
      state: s.operatorAttested ? 'attested' : 'none',
    },
    {
      who: 'You signed',
      what: ctx.userSigned
        ? 'You authorized this with your own key' + (ctx.signer ? ' (' + ctx.signer + ').' : '.')
        : 'No user signature was required for this view.',
      state: ctx.userSigned ? 'yes' : 'none',
    },
  ];

  const unverified = Array.isArray(ctx.unverified) ? ctx.unverified.slice() : [];
  if (!s.replayVerified) unverified.push('Deterministic replay was not run.');
  if (!s.witnessQuorumMet) unverified.push('No independent witness quorum.');
  rows.push({
    who: 'Remains unverified',
    what: unverified.length ? unverified.join(' ') : 'Nothing material is left unverified.',
    state: unverified.length ? 'open' : 'none',
  });

  // RUNBOOK-05 Task 7 — staged "proof builds up" reveal (Infrix → L0 → operator →
  // you → remaining). Tag each row with a reveal class + stagger index; the DOM
  // and the rows' truth content are UNCHANGED — only the entrance is sequenced.
  const dl = elt('dl', 'ux-trust-map-rows ux-trust-reveal');
  rows.forEach((r, i) => {
    const dt = elt('dt', 'ux-trust-who ux-trust-row', r.who);
    setAttrs(dt, { 'data-state': r.state, style: `--reveal-i:${i}` });
    const dd = elt('dd', 'ux-trust-what ux-trust-row', r.what);
    setAttrs(dd, { style: `--reveal-i:${i}` });
    dl.appendChild(dt);
    dl.appendChild(dd);
  });
  map.appendChild(dl);
  return map;
}

export function mountTrustBoundaryMap(container, state, ctx = {}) {
  const el = buildTrustBoundaryMap(state, ctx);
  if (container) container.replaceChildren(el);
  // RUNBOOK-05 Task 7 — JS half of the reduced-motion gate (CSS can't see the
  // user setting at mount time without FOUC). Reduced-motion → render visible
  // immediately (no stagger); otherwise trigger the staggered keyframes.
  const reduce = (typeof matchMedia !== 'undefined') && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dl = el.querySelector ? el.querySelector('.ux-trust-reveal') : null;
  if (dl) {
    if (reduce) dl.classList.add('play', 'no-anim');
    else if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => dl.classList.add('play'));
    else dl.classList.add('play');
  }
  return el;
}
