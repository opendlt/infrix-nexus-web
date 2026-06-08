// Nexus — proof receipt component (adoption-06).
//
// THE shared receipt card. The Nexus prove view imports it directly; the
// Cinema proof mode dynamic-imports the same file — one component, two
// surfaces, identical trust answer.
//
// Default view: status, assurance, the four trust badges, and a warning count.
// Raw hashes and the full proof material stay hidden inside an expandable
// <details> (accessible, keyboard-reachable). Nothing is shown that the
// receipt does not back.

import { receiptBadges, validateReceipt } from '/lib/proofReceipt.js';

function elt(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = String(text);
  return n;
}

function statusHeadline(status) {
  return status === 'verified' ? 'VERIFIED' : status === 'partial' ? 'PARTIALLY VERIFIED' : 'NOT VERIFIED';
}

// adoption-11 — plain-language explanations for the trust badges and the
// assurance label, surfaced on hover so a receipt teaches the learning-ladder
// terms (L4/G2, replay, witness) in place. Kept inline (no extra import) so the
// shared component stays self-contained for embedders.
const BADGE_HELP = Object.freeze({
  'node trust': 'No node trust required: the proof is verified by maths anyone can re-run, not by trusting the node that produced it.',
  L0: 'L0 (Accumulate): whether the anchor was confirmed against Accumulate L0. Confirmed = durable beyond Infrix and reaches L4; not checked = offline, caps at L3.',
  replay: 'Replay: whether the recorded steps were independently re-run and reproduced the same outcome.',
  witness: 'Witness: whether an independent quorum of operators co-signed this proof (not required for a valid proof).',
});

function explainAssurance(label, a) {
  const level = String(label || '').toUpperCase();
  const proof = a.l0Verified
    ? 'L4 — the anchor is confirmed against Accumulate L0 (durable, neutral).'
    : 'L3 — cryptographically valid offline; the L0 anchor is not confirmed here.';
  const gov = level.includes('G2')
    ? ' G2 — backed by an approval plus a verified condition.'
    : level.includes('G1')
      ? ' G1 — backed by a bound approval.'
      : level.includes('G0')
        ? ' G0 — backed by an allowed policy decision.'
        : '';
  return proof + gov;
}

/**
 * mountProofReceipt builds the receipt card into container and returns the
 * card element. Pass { expanded: true } to open the details by default.
 */
export function mountProofReceipt(container, receipt, opts = {}) {
  const card = buildProofReceiptCard(receipt, opts);
  if (container) {
    container.replaceChildren(card);
  }
  return card;
}

/** buildProofReceiptCard returns the receipt card element (no mounting). */
export function buildProofReceiptCard(receipt, opts = {}) {
  const r = receipt || {};
  const a = r.assurance || {};
  const view = receiptBadges(r);

  const card = elt('div', 'proof-receipt receipt-' + (r.status || 'failed'));
  card.dataset.status = r.status || 'failed';
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', 'Proof receipt: ' + statusHeadline(r.status));

  card.appendChild(elt('div', 'proof-receipt-status', statusHeadline(r.status)));
  if (r.summary) card.appendChild(elt('div', 'proof-receipt-summary', r.summary));
  // adoption-11 — the assurance label is hover/expand-explained so "L4/G2"
  // teaches itself.
  const assuranceEl = elt('div', 'proof-receipt-assurance', view.assurance);
  assuranceEl.setAttribute('title', explainAssurance(view.assurance, r.assurance || {}));
  card.appendChild(assuranceEl);

  const badges = elt('ul', 'proof-receipt-badges');
  for (const b of view.badges) {
    const li = elt('li', 'proof-receipt-badge', b.text);
    li.dataset.badge = b.name;
    li.dataset.on = b.on ? 'on' : 'off';
    // adoption-11 — every badge carries a plain-language explanation on hover.
    if (BADGE_HELP[b.name]) li.setAttribute('title', BADGE_HELP[b.name]);
    badges.appendChild(li);
  }
  card.appendChild(badges);

  if (r.warnings && r.warnings.length) {
    card.appendChild(elt('div', 'proof-receipt-warnings', r.warnings.length + ' warning(s)'));
  }

  // A receipt that does not validate must never look trustworthy.
  const errs = validateReceipt(r);
  if (errs.length) {
    card.classList.add('proof-receipt-invalid');
    card.appendChild(elt('div', 'proof-receipt-invalid-note', 'This receipt does not validate: ' + errs[0]));
  }

  // Expanded details — full hashes + proof material live here only.
  const details = elt('details', 'proof-receipt-details');
  if (opts.expanded) details.setAttribute('open', 'open');
  details.appendChild(elt('summary', null, 'Details'));
  const dl = elt('dl', 'proof-receipt-fields');
  const field = (label, value) => {
    if (!value) return;
    dl.appendChild(elt('dt', null, label));
    dl.appendChild(elt('dd', null, value));
  };
  field('Subject', (r.subject ? r.subject.type + ' ' + r.subject.id : ''));
  field('Proof level', a.proofLevel);
  field('Governance level', a.governanceLevel);
  const art = r.artifacts || {};
  field('Intent', art.intentId);
  field('Plan', art.planId);
  field('Outcome', art.outcomeId);
  field('Evidence', art.evidenceId);
  field('Anchor tx', art.anchorTx);
  const v = r.verification || {};
  field('Verifier', v.verifier);
  field('Command', v.command);
  field('Network', v.network);
  field('Verified at', v.verifiedAt);
  for (const w of (r.warnings || [])) field('Warning', w);
  details.appendChild(dl);

  const pre = elt('pre', 'proof-receipt-json', JSON.stringify(r, null, 2));
  details.appendChild(pre);
  card.appendChild(details);

  return card;
}
