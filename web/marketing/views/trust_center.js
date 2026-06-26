// Nexus — #/trust-center Trust Center (plan-12 step 4 + 5).
//
// The public trust center: the latest release evidence (bound to the current
// commit), the launch-check receipt, the UX matrix transcript, the human + agent
// study, the wallet provider matrix, the security/threat model, the explicit
// "what we do not claim" boundaries, and the mainnet status. Every item is
// reproducible from the repository; the release-evidence section always links to
// the evidence for HEAD.

import { elt, setAttrs } from '/lib/uxDom.js';
import { copyCommand } from '/lib/copyCommand.js';
import {
  loadTrustCenter, isLive, commit, network, generatedNote, sections, boundaries,
  mainnetStatus, linksToCommit,
} from '/marketing/lib/trustCenter.js';

function sourceBanner() {
  const wrap = elt('section', 'trust-banner');
  setAttrs(wrap, { role: 'note' });
  wrap.appendChild(elt('strong', 'trust-banner-tag', 'Reproducible trust'));
  wrap.appendChild(elt('span', 'trust-banner-text', ' — ' + generatedNote()));
  const src = elt('p', 'trust-source');
  setAttrs(src, { 'data-live': String(isLive()) });
  src.textContent = isLive()
    ? ('Live trust center for commit ' + (commit() || '—').slice(0, 12) + '.')
    : 'Showing the trust center (run `infrix trust-center` for your current commit).';
  wrap.appendChild(src);
  return wrap;
}

function metaRow() {
  const row = elt('div', 'trust-meta');
  const c = elt('span', 'trust-meta-commit mono');
  setAttrs(c, { 'data-commit': commit() });
  c.textContent = 'commit ' + (commit() || '—').slice(0, 12);
  row.appendChild(c);
  const n = elt('span', 'trust-meta-network');
  n.textContent = 'network ' + (network() || '—');
  row.appendChild(n);
  const linked = elt('span', 'trust-meta-linked');
  setAttrs(linked, { 'data-links-head': String(linksToCommit()) });
  linked.textContent = linksToCommit() ? 'links to evidence for HEAD' : 'evidence link unavailable';
  row.appendChild(linked);
  return row;
}

function sectionsGrid() {
  const grid = elt('div', 'trust-sections');
  for (const s of sections()) {
    const sec = elt('section', 'trust-section');
    setAttrs(sec, { 'aria-label': s.title, 'data-section': s.id });
    const head = elt('div', 'trust-section-head');
    head.appendChild(elt('h3', 'trust-section-title', s.title));
    const status = elt('span', 'trust-section-status', s.status);
    setAttrs(status, { 'data-status': s.status });
    head.appendChild(status);
    sec.appendChild(head);
    sec.appendChild(elt('p', 'trust-section-detail', s.detail));
    if (s.command) sec.appendChild(copyCommand(s.command, 'the ' + s.title + ' command'));
    if (s.link) {
      const link = elt('p', 'trust-section-link');
      link.appendChild(elt('span', 'trust-section-link-label', 'Reference: '));
      link.appendChild(elt('code', 'mono', s.link));
      sec.appendChild(link);
    }
    grid.appendChild(sec);
  }
  return grid;
}

function boundariesPanel() {
  const panel = elt('section', 'trust-noclaims');
  setAttrs(panel, { 'aria-label': 'What we do not claim' });
  panel.appendChild(elt('h3', 'trust-section-title', 'What we do not claim'));
  const ul = elt('ul', 'trust-noclaims-list');
  for (const b of boundaries()) {
    const li = elt('li', 'trust-noclaim');
    setAttrs(li, { 'data-boundary': b.id });
    li.appendChild(elt('strong', 'trust-noclaim-title', b.title));
    li.appendChild(elt('p', 'trust-noclaim-donot', 'We do not claim: ' + b.weDoNotClaim));
    li.appendChild(elt('p', 'trust-noclaim-honest', b.honest));
    ul.appendChild(li);
  }
  panel.appendChild(ul);
  return panel;
}

function mainnetPanel() {
  const panel = elt('section', 'trust-mainnet');
  setAttrs(panel, { 'aria-label': 'Mainnet status' });
  panel.appendChild(elt('h3', 'trust-section-title', 'Mainnet status'));
  panel.appendChild(elt('p', 'trust-mainnet-text', mainnetStatus()));
  return panel;
}

function populate(body) {
  body.appendChild(sourceBanner());
  body.appendChild(metaRow());
  body.appendChild(sectionsGrid());
  body.appendChild(boundariesPanel());
  body.appendChild(mainnetPanel());
}

export const trustCenterView = {
  async mount(root) {
    root.replaceChildren();
    const shell = elt('div', 'workspace trust-center-view');
    const header = elt('header', 'workspace-header');
    header.appendChild(setAttrs(elt('h1', 'workspace-title', 'Trust Center'), { id: 'trust-center-title' }));
    header.appendChild(elt('p', 'workspace-subtitle',
      'Everything Infrix asks you to trust — and exactly what it does not claim — reproducible from this repository.'));
    shell.appendChild(header);
    const body = elt('div', 'trust-center-body');
    body.appendChild(elt('p', 'trust-loading', 'Loading the trust center…'));
    shell.appendChild(body);
    root.appendChild(shell);

    try {
      await loadTrustCenter();
      body.replaceChildren();
      populate(body);
    } catch (err) {
      body.replaceChildren();
      const msg = elt('div', 'trust-error');
      msg.setAttribute('role', 'alert');
      msg.appendChild(elt('strong', null, 'Could not load the trust center.'));
      msg.appendChild(elt('p', null, String((err && err.message) || err)));
      body.appendChild(msg);
    }
  },
};
