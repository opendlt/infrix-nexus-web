// Nexus — ProofReceiptCard (nextux-03).
//
// The design-system proof receipt: outcome headline, the honest assurance badge
// row (gated by the state), the trust answer, and the raw artifacts behind a
// Layer-3 disclosure. It is the canonical card the prove view and Cinema proof
// mode render, built from the same registry as every other surface.

import { elt, setAttrs } from '/lib/uxDom.js';
import { COLOR_ROLE_VARS } from '/lib/uxLabels.js';
import { buildAssuranceBadgeRow } from '/components/AssuranceBadge.js';
import { buildTechnicalDetails } from '/components/TechnicalDetails.js';

const STATUS_META = {
  verified: { role: 'positive', headline: 'VERIFIED' },
  partial: { role: 'caution', headline: 'PARTIALLY VERIFIED' },
  failed: { role: 'negative', headline: 'NOT VERIFIED' },
};

/**
 * buildProofReceiptCard renders a receipt.
 * @param {object} receipt { status, summary, state (AssuranceState), trust, artifacts:[{label,value}], warnings:[] }
 * @param {{showPlain?:boolean, expanded?:boolean}} opts
 */
export function buildProofReceiptCard(receipt, opts = {}) {
  const r = receipt || {};
  const status = STATUS_META[r.status] ? r.status : 'failed';
  const meta = STATUS_META[status];
  const roleMeta = COLOR_ROLE_VARS[meta.role];

  const card = elt('div', 'ux-receipt-card ux-receipt-' + status);
  setAttrs(card, {
    role: 'group',
    'data-status': status,
    'aria-label': 'Proof receipt: ' + meta.headline,
    style: `--ux-role-fg:${roleMeta.fg};--ux-role-soft:${roleMeta.soft}`,
  });

  const head = elt('div', 'ux-receipt-headline');
  const glyph = elt('span', 'ux-receipt-glyph', roleMeta.glyph);
  setAttrs(glyph, { 'aria-hidden': 'true' });
  head.appendChild(glyph);
  head.appendChild(elt('span', 'ux-receipt-status', meta.headline));
  card.appendChild(head);

  if (r.summary) card.appendChild(elt('p', 'ux-receipt-summary', r.summary));

  // Layer 2 — honest assurance badges.
  card.appendChild(buildAssuranceBadgeRow(r.state || {}, { showPlain: !!opts.showPlain }));

  // Trust answer.
  if (r.trust) {
    const t = elt('div', 'ux-receipt-trust');
    t.appendChild(elt('span', 'ux-receipt-trust-label', 'Trust: '));
    t.appendChild(elt('span', 'ux-receipt-trust-text', r.trust));
    card.appendChild(t);
  }

  // Honest caveats.
  if (r.warnings && r.warnings.length) {
    const ul = elt('ul', 'ux-receipt-warnings');
    setAttrs(ul, { 'aria-label': 'Notes' });
    for (const w of r.warnings) ul.appendChild(elt('li', 'ux-receipt-warning', w));
    card.appendChild(ul);
  }

  // Layer 3 — raw artifacts behind a disclosure (hidden by default).
  if (r.artifacts && r.artifacts.length) {
    card.appendChild(buildTechnicalDetails(r.artifacts, { open: !!opts.expanded, summary: 'Technical detail' }));
  }

  return card;
}

export function mountProofReceiptCard(container, receipt, opts = {}) {
  const el = buildProofReceiptCard(receipt, opts);
  if (container) container.replaceChildren(el);
  return el;
}
