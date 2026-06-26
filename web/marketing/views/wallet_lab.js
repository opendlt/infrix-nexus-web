// Nexus — #/wallet-lab Wallet Certification Lab (plan-35 §6).
//
// An operator / product-QA surface (not a consumer wallet): the provider list,
// each provider's certification LEVEL + latest tested version + caveats +
// evidence hash + verify command + prompt-readability score + a stale indicator.
// Rows come from sealed certification bundles only; a pending provider is shown
// honestly with no level and no PASS.

import { elt, setAttrs } from '/lib/uxDom.js';
import { copyCommand } from '/lib/copyCommand.js';
import {
  loadWalletLab, isLive, generatedNote, providers, hasOverclaim,
} from '/marketing/lib/walletLab.js';

function banner() {
  const wrap = elt('section', 'trust-banner');
  setAttrs(wrap, { role: 'note' });
  wrap.appendChild(elt('strong', 'trust-banner-tag', 'Evidence-driven'));
  wrap.appendChild(elt('span', 'trust-banner-text', ' — ' + generatedNote()));
  const src = elt('p', 'trust-source');
  setAttrs(src, { 'data-live': String(isLive()) });
  src.textContent = isLive()
    ? 'Live wallet-lab context.'
    : 'Showing the generated provider matrix (run `infrix wallet matrix generate`).';
  wrap.appendChild(src);
  return wrap;
}

function row(p) {
  const card = elt('div', 'wallet-lab-row');
  setAttrs(card, { 'data-provider': p.provider, 'data-level': p.level, 'data-result': p.result });
  card.appendChild(elt('span', 'wallet-lab-provider', p.provider + ' + ' + p.browser));
  card.appendChild(elt('span', 'wallet-lab-network', p.network));
  card.appendChild(elt('span', 'wallet-lab-level', 'Level ' + p.level));
  card.appendChild(elt('span', 'wallet-lab-result', p.result));
  if (p.stale) {
    const s = elt('span', 'wallet-lab-stale', 'STALE');
    setAttrs(s, { 'data-stale': 'true' });
    card.appendChild(s);
  }
  if (p.evidenceHash) {
    card.appendChild(elt('span', 'wallet-lab-evidence', 'evidence ' + p.evidenceHash.slice(0, 12)));
  }
  if (typeof p.promptScore === 'number') {
    card.appendChild(elt('span', 'wallet-lab-prompt', 'prompt ' + p.promptScore + '/7'));
  }
  for (const c of p.caveats) {
    card.appendChild(elt('p', 'wallet-lab-caveat', '⚠ ' + c));
  }
  if (p.verifyCommand) {
    card.appendChild(copyCommand(p.verifyCommand));
  }
  return card;
}

function populate(body) {
  body.appendChild(banner());
  if (hasOverclaim()) {
    const warn = elt('div', 'trust-error');
    setAttrs(warn, { role: 'alert' });
    warn.appendChild(elt('strong', null, 'Overclaim detected — a row claims L3+ without backing evidence. This must never ship.'));
    body.appendChild(warn);
  }
  const list = elt('div', 'wallet-lab-list');
  const rows = providers();
  if (rows.length === 0) {
    list.appendChild(elt('p', 'wallet-lab-empty', 'No certification bundles yet — every provider is pending.'));
  }
  for (const p of rows) {
    list.appendChild(row(p));
  }
  body.appendChild(list);
}

export const walletLabView = {
  async mount(root) {
    root.replaceChildren();
    const shell = elt('div', 'workspace wallet-lab-view');
    const header = elt('header', 'workspace-header');
    header.appendChild(setAttrs(elt('h1', 'workspace-title', 'Wallet Certification Lab'), { id: 'wallet-lab-title' }));
    header.appendChild(elt('p', 'workspace-subtitle',
      'Provider compatibility is evidence-driven: each row is a real, sealed certification bundle with a derived level — never a prose claim.'));
    shell.appendChild(header);
    const body = elt('div', 'wallet-lab-body');
    body.appendChild(elt('p', 'trust-loading', 'Loading the wallet certification lab…'));
    shell.appendChild(body);
    root.appendChild(shell);

    try {
      await loadWalletLab();
      body.replaceChildren();
      populate(body);
    } catch (err) {
      body.replaceChildren();
      const msg = elt('div', 'trust-error');
      msg.setAttribute('role', 'alert');
      msg.appendChild(elt('strong', null, 'Could not load the wallet certification lab.'));
      msg.appendChild(elt('p', null, String((err && err.message) || err)));
      body.appendChild(msg);
    }
  },
};
