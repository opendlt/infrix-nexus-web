// Nexus — #/launch Public Launch Page (plan-12 step 1).
//
// The first screen is the hero path: a prompt box, three example prompts, the
// "Build verifiable app" primary action, a live proof-receipt preview, and a
// Cinema replay preview — no internal jargon. Below the fold: verify without
// trusting the node, why Accumulate L0 matters, a comparison to a conventional
// smart-contract flow, the developer + agent one-liners, the wallet/provider
// status, the Kermit-vs-mainnet claim boundary, and the explicit "what we do not
// claim" panel. All copy is the Go-generated, claim-linted content.

import { elt, setAttrs } from '/lib/uxDom.js';
import { copyCommand } from '/lib/copyCommand.js';
import {
  loadLaunch, isLive, hero, sections, claimBoundary, boundaries, receiptPreview, receiptIsHonest,
} from '/marketing/lib/launch.js';

function sourceBanner() {
  const wrap = elt('section', 'launch-banner');
  setAttrs(wrap, { role: 'note' });
  wrap.appendChild(elt('strong', 'launch-banner-tag', 'Describe it. Prove it. Share it.'));
  wrap.appendChild(elt('span', 'launch-banner-text',
    ' — Infrix turns a plain-language prompt into a governed workflow, a real proof anyone can verify, and a shippable SDK + widget. Assurance always comes from the verifier; the node is never trusted.'));
  const src = elt('p', 'launch-source');
  setAttrs(src, { 'data-live': String(isLive()) });
  src.textContent = isLive() ? 'Live launch context connected.' : 'Showing the public launch content.';
  wrap.appendChild(src);
  return wrap;
}

function heroPanel() {
  const h = hero();
  const panel = elt('section', 'launch-hero');
  setAttrs(panel, { 'aria-label': 'Build a verifiable app' });

  panel.appendChild(setAttrs(elt('h2', 'launch-headline', h.headline || ''), { id: 'launch-headline' }));
  panel.appendChild(elt('p', 'launch-subhead', h.subhead || ''));

  // Prompt box.
  const field = elt('div', 'launch-prompt-field');
  const label = elt('label', 'launch-prompt-label', 'Describe your verifiable app');
  setAttrs(label, { for: 'launch-prompt' });
  const input = elt('textarea', 'launch-prompt-input');
  setAttrs(input, { id: 'launch-prompt', rows: '2', placeholder: h.promptPlaceholder || 'Describe the verifiable app you want…' });
  field.appendChild(label);
  field.appendChild(input);
  panel.appendChild(field);

  // Example prompts as clickable chips.
  const examples = elt('div', 'launch-examples');
  setAttrs(examples, { role: 'group', 'aria-label': 'Example prompts' });
  const action = h.primaryAction || {};
  const cmdHolder = elt('div', 'launch-primary');

  const rebuildCommand = () => {
    cmdHolder.replaceChildren();
    const prompt = (input.value || '').trim();
    const cmd = prompt
      ? `infrix new verifiable-app my-app "${prompt.replace(/"/g, "'")}"`
      : (action.command || '');
    const head = elt('div', 'launch-primary-head');
    head.appendChild(elt('strong', 'launch-primary-label', action.label || 'Build verifiable app'));
    head.appendChild(elt('span', 'launch-primary-why', action.why || ''));
    cmdHolder.appendChild(head);
    cmdHolder.appendChild(copyCommand(cmd, 'the build command'));
  };

  for (const ex of h.examplePrompts || []) {
    const chip = elt('button', 'launch-example-chip', ex);
    setAttrs(chip, { type: 'button' });
    chip.addEventListener('click', () => { input.value = ex; rebuildCommand(); input.focus(); });
    examples.appendChild(chip);
  }
  input.addEventListener('input', rebuildCommand);
  panel.appendChild(examples);
  rebuildCommand();
  panel.appendChild(cmdHolder);

  // Previews row.
  const previews = elt('div', 'launch-previews');
  previews.appendChild(receiptPreviewCard());
  previews.appendChild(cinemaPreviewCard(h.cinemaPreview || {}));
  panel.appendChild(previews);

  return panel;
}

function receiptPreviewCard() {
  const card = elt('div', 'launch-preview launch-receipt-preview');
  setAttrs(card, { 'aria-label': 'Proof receipt preview' });
  card.appendChild(elt('h3', 'launch-preview-title', 'Live proof receipt'));
  const r = receiptPreview();
  if (!r) {
    card.appendChild(elt('p', 'launch-preview-empty', 'Run an app to produce a proof receipt.'));
    return card;
  }
  const lbl = elt('p', 'launch-receipt-label');
  setAttrs(lbl, { 'data-verified': String(!!r.verified), 'data-l0': String(!!r.l0Verified) });
  lbl.textContent = r.assuranceLabel || '';
  card.appendChild(lbl);

  const badges = elt('ul', 'launch-badges');
  const add = (text, ok) => {
    const li = elt('li', 'launch-badge');
    setAttrs(li, { 'data-ok': String(ok) });
    li.textContent = text;
    badges.appendChild(li);
  };
  add(r.assuranceLevel || '', !!r.verified);
  add(r.verified ? 'verified' : 'not verified', !!r.verified);
  add(r.l0Verified ? 'L0 confirmed' : 'L0 not checked (local)', !!r.l0Verified);
  add('node never trusted', r.nodeTrusted === false);
  card.appendChild(badges);

  const link = elt('a', 'launch-preview-link', 'Open the full proof receipt →');
  setAttrs(link, { href: '#/receipt' });
  card.appendChild(link);
  return card;
}

function cinemaPreviewCard(c) {
  const card = elt('div', 'launch-preview launch-cinema-preview');
  setAttrs(card, { 'aria-label': 'Cinema replay preview' });
  card.appendChild(elt('h3', 'launch-preview-title', c.title || 'Replay the run'));
  const ol = elt('ol', 'launch-cinema-frames');
  for (const f of c.frames || []) ol.appendChild(elt('li', 'launch-cinema-frame', f));
  card.appendChild(ol);
  if (c.note) card.appendChild(elt('p', 'launch-cinema-note', c.note));
  return card;
}

function sectionsGrid() {
  const grid = elt('div', 'launch-sections');
  for (const s of sections()) {
    const sec = elt('section', 'launch-section');
    setAttrs(sec, { 'aria-label': s.title, 'data-section': s.id });
    sec.appendChild(elt('h3', 'launch-section-title', s.title));
    sec.appendChild(elt('p', 'launch-section-body', s.body));
    if ((s.points || []).length) {
      const ul = elt('ul', 'launch-section-points');
      for (const p of s.points) ul.appendChild(elt('li', null, p));
      sec.appendChild(ul);
    }
    if (s.command) sec.appendChild(copyCommand(s.command, 'the ' + s.title + ' command'));
    grid.appendChild(sec);
  }
  return grid;
}

function claimBoundaryPanel() {
  const cb = claimBoundary();
  const panel = elt('section', 'launch-claim-boundary');
  setAttrs(panel, { 'aria-label': 'Claim boundary: Kermit vs mainnet' });
  panel.appendChild(elt('h3', 'launch-section-title', 'What is proven on Kermit vs mainnet'));
  const grid = elt('div', 'launch-boundary-grid');
  const kermit = elt('div', 'launch-boundary-cell');
  kermit.appendChild(elt('strong', 'launch-boundary-key', 'Kermit'));
  kermit.appendChild(elt('p', null, cb.kermit || ''));
  const mainnet = elt('div', 'launch-boundary-cell');
  mainnet.appendChild(elt('strong', 'launch-boundary-key', 'Mainnet'));
  mainnet.appendChild(elt('p', null, cb.mainnet || ''));
  grid.appendChild(kermit);
  grid.appendChild(mainnet);
  panel.appendChild(grid);
  return panel;
}

function boundariesPanel() {
  const panel = elt('section', 'launch-noclaims');
  setAttrs(panel, { 'aria-label': 'What we do not claim' });
  panel.appendChild(elt('h3', 'launch-section-title', 'What we do not claim'));
  panel.appendChild(elt('p', 'launch-noclaims-intro',
    'Trust comes from being explicit about the edges. Here is what Infrix deliberately does not claim — and the honest statement that replaces each one.'));
  const ul = elt('ul', 'launch-noclaims-list');
  for (const b of boundaries()) {
    const li = elt('li', 'launch-noclaim');
    setAttrs(li, { 'data-boundary': b.id });
    li.appendChild(elt('strong', 'launch-noclaim-title', b.title));
    li.appendChild(elt('p', 'launch-noclaim-honest', b.honest));
    li.appendChild(elt('p', 'launch-noclaim-why', b.why));
    ul.appendChild(li);
  }
  panel.appendChild(ul);
  const link = elt('a', 'launch-trust-link', 'See the full trust center →');
  setAttrs(link, { href: '#/trust-center' });
  panel.appendChild(link);
  return panel;
}

function populate(body) {
  body.appendChild(sourceBanner());
  body.appendChild(heroPanel());
  if (!receiptIsHonest()) {
    const warn = elt('div', 'launch-error');
    setAttrs(warn, { role: 'alert' });
    warn.textContent = 'The proof receipt preview did not pass the honesty rails and was withheld.';
    body.appendChild(warn);
  }
  body.appendChild(sectionsGrid());
  body.appendChild(claimBoundaryPanel());
  body.appendChild(boundariesPanel());
}

export const launchView = {
  async mount(root) {
    root.replaceChildren();
    const shell = elt('div', 'workspace launch-view');
    const header = elt('header', 'workspace-header');
    header.appendChild(setAttrs(elt('h1', 'workspace-title', 'Infrix'), { id: 'launch-title' }));
    header.appendChild(elt('p', 'workspace-subtitle',
      'Describe an app. Get a proof anyone can check — without trusting our node.'));
    shell.appendChild(header);
    const body = elt('div', 'launch-body');
    body.appendChild(elt('p', 'launch-loading', 'Loading…'));
    shell.appendChild(body);
    root.appendChild(shell);

    try {
      await loadLaunch();
      body.replaceChildren();
      populate(body);
    } catch (err) {
      body.replaceChildren();
      const msg = elt('div', 'launch-error');
      msg.setAttribute('role', 'alert');
      msg.appendChild(elt('strong', null, 'Could not load the launch page.'));
      msg.appendChild(elt('p', null, String((err && err.message) || err)));
      body.appendChild(msg);
    }
  },
};
