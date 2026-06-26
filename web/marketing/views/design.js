// Nexus — #/design component gallery (nextux-03).
//
// A testable showcase of the Progressive Disclosure design system: every
// assurance badge in every state, proof receipt cards, error resolution cards,
// trust boundary maps, glossary popovers, technical-detail disclosures, a
// persona switcher, and a next-action bar. It loads the SAME Go-generated
// fixture every surface uses, so the gallery proves the shipped vocabulary.

import { elt, setAttrs } from '/lib/uxDom.js';
import { loadUxFixture, allBadges, errorCards, glossary, personaProfile } from '/lib/uxLabels.js';
import { buildAssuranceBadge, buildAssuranceBadgeRow } from '/components/AssuranceBadge.js';
import { buildProofReceiptCard } from '/components/ProofReceiptCard.js';
import { buildErrorResolutionCard } from '/components/ErrorResolutionCard.js';
import { buildTrustBoundaryMap } from '/components/TrustBoundaryMap.js';
import { buildGlossaryTerm } from '/components/GlossaryPopover.js';
import { buildTechnicalDetails } from '/components/TechnicalDetails.js';
import { buildPersonaSwitcher } from '/components/PersonaSwitcher.js';
import { buildNextActionBar } from '/components/NextActionBar.js';

// Representative assurance states the gallery showcases ("every state").
const STATES = {
  liveL0: {
    label: 'Live L0 (strongest)',
    state: { verified: true, cryptographicallyVerified: true, l0Verified: true, replayVerified: true, nodeTrusted: false, witnessQuorumMet: true, distinctOperatorsMet: true, network: 'kermit', proofLevel: 'L4', governanceLevel: 'G2' },
  },
  offline: {
    label: 'Offline (caps at L3)',
    state: { verified: true, cryptographicallyVerified: true, l0Verified: false, nodeTrusted: false, proofLevel: 'L3' },
  },
  attested: {
    label: 'Operator-attested only',
    state: { operatorAttested: true, nodeTrusted: true },
  },
  failed: {
    label: 'Failed verification',
    state: { verified: false, nodeTrusted: true },
  },
};

function section(title, intro) {
  const sec = elt('section', 'ux-gallery-section');
  sec.appendChild(elt('h2', 'ux-gallery-section-title', title));
  if (intro) sec.appendChild(elt('p', 'ux-gallery-section-intro', intro));
  return sec;
}

function populate(root, persona) {
  const gallery = elt('div', 'ux-design-gallery');
  setAttrs(gallery, { 'data-persona': persona });

  // --- Persona switcher (presentation only) ---
  const personaSec = section('Persona', 'Changes wording, glossary density, and next actions — never verification.');
  let nextBar;
  const switcher = buildPersonaSwitcher({
    active: persona,
    onChange: (p) => {
      gallery.setAttribute('data-persona', p);
      const fresh = buildNextActionBar(p);
      nextBar.replaceWith(fresh);
      nextBar = fresh;
    },
  });
  personaSec.appendChild(switcher);
  gallery.appendChild(personaSec);

  // --- Assurance badges, every state ---
  const badgeSec = section('Assurance badges', 'Each badge appears only when the state allows it. A failed or operator-attested state never shows a green verification badge.');
  for (const key of Object.keys(STATES)) {
    const block = elt('div', 'ux-gallery-state-block');
    block.appendChild(elt('h3', 'ux-gallery-state-title', STATES[key].label));
    block.appendChild(buildAssuranceBadgeRow(STATES[key].state, { showPlain: true }));
    badgeSec.appendChild(block);
  }
  // Also each badge individually, in an allowing state, so all icons/roles show.
  const allBlock = elt('div', 'ux-gallery-state-block');
  allBlock.appendChild(elt('h3', 'ux-gallery-state-title', 'Every badge'));
  const allRow = elt('div', 'ux-badge-row');
  setAttrs(allRow, { role: 'list', 'aria-label': 'All badges' });
  for (const b of allBadges()) {
    const item = buildAssuranceBadge(b, { showPlain: false });
    item.setAttribute('role', 'listitem');
    allRow.appendChild(item);
  }
  allBlock.appendChild(allRow);
  badgeSec.appendChild(allBlock);
  gallery.appendChild(badgeSec);

  // --- Proof receipt cards ---
  const receiptSec = section('Proof receipts', 'The canonical receipt: outcome, honest badges, trust answer, raw artifacts behind a disclosure.');
  receiptSec.appendChild(buildProofReceiptCard({
    status: 'verified', summary: 'Proof verified without trusting this node.',
    state: STATES.liveL0.state, trust: 'No one — anyone can re-run the maths.',
    artifacts: [{ label: 'proof', value: 'L4/G2' }, { label: 'anchor tx', value: 'kermit-tx-abc123' }, { label: 'receipt hash', value: 'sha256:deadbeef' }],
  }, { showPlain: true }));
  receiptSec.appendChild(buildProofReceiptCard({
    status: 'partial', summary: 'Verified offline; live L0 not confirmed.',
    state: STATES.offline.state, trust: 'No one — checked offline.',
    warnings: ['The L0 anchor was not confirmed here (caps at L3).'],
    artifacts: [{ label: 'proof', value: 'L3/G1' }],
  }, { showPlain: true }));
  receiptSec.appendChild(buildProofReceiptCard({
    status: 'failed', summary: 'Verification did not pass.',
    state: STATES.failed.state, trust: 'No one — the proof itself failed.',
    warnings: ['A cryptographic binding did not verify.'],
  }, { showPlain: true }));
  gallery.appendChild(receiptSec);

  // --- Trust boundary maps ---
  const trustSec = section('Trust boundary', 'What did Infrix prove, what did L0 prove, what was merely attested, what you signed, and what remains unverified.');
  trustSec.appendChild(buildTrustBoundaryMap(STATES.liveL0.state, { userSigned: true, signer: 'MetaMask' }));
  trustSec.appendChild(buildTrustBoundaryMap(STATES.offline.state, {}));
  gallery.appendChild(trustSec);

  // --- Error resolution cards ---
  const errorSec = section('Error resolution', 'Plain meaning, impact on assurance, fixes, retry guidance, docs — technical detail collapsed.');
  const showCodes = ['L0_ANCHOR_UNAVAILABLE', 'PROOF_LEVEL_OVERCLAIMED', 'L0_FINALITY_TIMEOUT'];
  const cards = errorCards();
  for (const code of showCodes) {
    const c = cards.find((x) => x.code === code);
    if (c) errorSec.appendChild(buildErrorResolutionCard(c));
  }
  gallery.appendChild(errorSec);

  // --- Glossary popovers ---
  const glossSec = section('Glossary', 'Jargon leads with plain wording; the full definition is one click or keyboard-focus away.');
  const glossLine = elt('p', 'ux-gallery-gloss-line');
  glossLine.appendChild(document.createTextNode('A proof can be confirmed against '));
  glossLine.appendChild(buildGlossaryTerm('Accumulate L0'));
  glossLine.appendChild(document.createTextNode(', summarized in a '));
  glossLine.appendChild(buildGlossaryTerm('proof receipt'));
  glossLine.appendChild(document.createTextNode(', and re-run from a '));
  glossLine.appendChild(buildGlossaryTerm('replay capsule'));
  glossLine.appendChild(document.createTextNode('.'));
  glossSec.appendChild(glossLine);
  // A compact list of every term too.
  const glossList = elt('ul', 'ux-gallery-gloss-list');
  for (const t of glossary()) {
    const li = elt('li', 'ux-gallery-gloss-item');
    li.appendChild(buildGlossaryTerm(t.term, { lead: t.term }));
    glossList.appendChild(li);
  }
  glossSec.appendChild(glossList);
  gallery.appendChild(glossSec);

  // --- Technical details standalone ---
  const techSec = section('Technical detail (Layer 3)', 'Expert detail lives behind a keyboard-focusable disclosure, collapsed by default.');
  techSec.appendChild(buildTechnicalDetails([
    { label: 'proof level', value: 'L4/G2' },
    { label: 'kermit tx', value: 'acc://...@anchor' },
    { label: 'canonical object', value: 'intent:golden-escrow-001' },
    { label: 'registry key', value: 'object/intent/...' },
  ], { summary: 'Show technical detail' }));
  gallery.appendChild(techSec);

  // --- Next action bar (persona-driven) ---
  const nextSec = section('Next actions', 'What can I do next — ordered for the active persona.');
  nextBar = buildNextActionBar(persona);
  nextSec.appendChild(nextBar);
  gallery.appendChild(nextSec);

  root.appendChild(gallery);
}

export const designView = {
  async mount(root) {
    root.replaceChildren();
    // .workspace wrapper + immediate non-empty content so route-render does not
    // wait on an empty frame while the fixture loads.
    const shell = elt('div', 'workspace ux-design-workspace');
    const header = elt('header', 'workspace-header');
    header.appendChild(setAttrs(elt('h1', 'workspace-title', 'Design system'), { id: 'ux-design-title' }));
    header.appendChild(elt('p', 'workspace-subtitle', 'The one product language Infrix speaks everywhere — outcomes first, technical detail on request.'));
    shell.appendChild(header);
    const body = elt('div', 'ux-design-body');
    body.appendChild(elt('p', 'ux-design-loading', 'Loading the design-system registry…'));
    shell.appendChild(body);
    root.appendChild(shell);

    try {
      await loadUxFixture();
      const persona = (personaProfile('builder') || { persona: 'builder' }).persona;
      body.replaceChildren();
      populate(body, persona);
    } catch (err) {
      body.replaceChildren();
      const msg = elt('div', 'ux-design-error');
      msg.setAttribute('role', 'alert');
      msg.appendChild(elt('strong', null, 'Could not load the design-system registry.'));
      msg.appendChild(elt('p', null, String((err && err.message) || err)));
      body.appendChild(msg);
    }
  },
};
