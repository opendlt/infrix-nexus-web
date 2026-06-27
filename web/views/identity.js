// Nexus — #/identity Wallet & Identity Control Center (nextux-08).
//
// One honest screen for who you are, what you can sign, what authority you hold,
// and what a signature will do: a wallet card, the Accumulate identity card, the
// signature queue (each request EXPLAINED in plain language in the browser),
// agent sessions, permissions, signing history, and a safety center. The browser
// never holds a private key and never shows "connected" without backing.

import { elt, setAttrs } from '/lib/uxDom.js';
import {
  loadIdentity, wallet, accumulate, sessions, permissions, signatureQueue,
  history, warnings, isConnected, connectionLabel, explainSignature,
} from '/lib/identity.js';

function walletCard() {
  const w = wallet();
  const connected = isConnected(w);
  const card = elt('section', 'identity-wallet-card');
  setAttrs(card, { 'data-connected': String(connected), 'aria-label': 'Wallet' });
  card.appendChild(elt('h3', 'identity-subtitle', 'Wallet'));
  const status = elt('p', 'identity-wallet-status');
  setAttrs(status, { 'data-connected': String(connected) });
  status.textContent = connectionLabel(w);
  card.appendChild(status);
  if (connected) {
    const dl = elt('dl', 'identity-grid');
    const row = (k, v) => { dl.appendChild(elt('dt', null, k)); dl.appendChild(elt('dd', 'mono', String(v))); };
    row('Provider', w.provider || 'metamask');
    row('Public key', w.publicKeyRecovered ? 'recovered' : 'not recovered');
    card.appendChild(dl);
  } else {
    card.appendChild(elt('p', 'identity-hint', 'Connect a wallet to bind your authority. The browser never shows connected without a signed proof.'));
  }
  return card;
}

function accumulateCard() {
  const a = accumulate();
  const card = elt('section', 'identity-accumulate-card');
  setAttrs(card, { 'aria-label': 'Accumulate identity' });
  card.appendChild(elt('h3', 'identity-subtitle', 'Accumulate identity'));
  if (!a) {
    card.appendChild(elt('p', 'identity-hint', 'No mapped Accumulate identity yet.'));
    return card;
  }
  card.appendChild(elt('p', 'identity-accumulate-line', 'You are ' + a.adi));
  const dl = elt('dl', 'identity-grid');
  const row = (k, v) => { dl.appendChild(elt('dt', null, k)); dl.appendChild(elt('dd', 'mono', String(v))); };
  row('Key page', a.keyPage);
  row('L0 verified', !!a.l0Verified);
  card.appendChild(dl);
  if (a.detail) card.appendChild(elt('p', 'identity-hint', a.detail));
  return card;
}

function explanationBlock(req) {
  const ex = explainSignature(req);
  const block = elt('div', 'identity-sig-explanation');
  if (ex.error) {
    setAttrs(block, { 'data-explainable': 'false', role: 'alert' });
    block.appendChild(elt('p', 'identity-sig-error', 'Cannot explain this request: ' + ex.error + ' — it will not be presented for signing.'));
    return block;
  }
  setAttrs(block, { 'data-explainable': 'true' });
  block.appendChild(elt('p', 'identity-sig-headline', 'This signature can: ' + ex.action + ' on ' + ex.network));
  const dl = elt('dl', 'identity-grid');
  const row = (k, v) => { dl.appendChild(elt('dt', null, k)); dl.appendChild(elt('dd', null, String(v))); };
  row('Identity touched', ex.identityTouched);
  row('Required key page', ex.requiredKeyPage);
  row('Moves funds/credits', ex.fundsOrCreditsMove);
  row('Discloses data', ex.dataDisclosed);
  row('Agent initiated', ex.agentInitiated);
  row('Expected proof', ex.expectedProof);
  row('Irreversible', ex.irreversibleEffects.join('; '));
  block.appendChild(dl);
  for (const w of ex.warnings) {
    const wn = elt('p', 'identity-warning');
    setAttrs(wn, { role: 'status' });
    wn.textContent = '! ' + w;
    block.appendChild(wn);
  }
  return block;
}

function signatureQueuePanel() {
  const q = signatureQueue();
  const panel = elt('section', 'identity-signature-queue');
  setAttrs(panel, { 'aria-label': 'Signature queue' });
  panel.appendChild(elt('h3', 'identity-subtitle', 'Pending signatures (' + q.length + ')'));
  if (!q.length) {
    panel.appendChild(elt('p', 'identity-hint', 'No pending signature requests.'));
    return panel;
  }
  for (const req of q) {
    const item = elt('article', 'identity-sig-request');
    item.appendChild(elt('p', 'identity-sig-title', req.action || req.goalType));
    item.appendChild(explanationBlock(req));
    // RUNBOOK-04 Task 7 — point the demo at the live surface instead of
    // dead-ending: route to the real Approve dossier (or the approvals lane).
    const link = elt('a', 'identity-sig-link');
    link.href = req.planId ? '#/approve/' + encodeURIComponent(req.planId) : '#/inbox/approvals';
    link.textContent = 'Review on the live Approve screen →';
    item.appendChild(link);
    panel.appendChild(item);
  }
  return panel;
}

function sessionsPanel() {
  const list = sessions();
  const panel = elt('section', 'identity-sessions');
  setAttrs(panel, { 'aria-label': 'Agent sessions' });
  panel.appendChild(elt('h3', 'identity-subtitle', 'Agent sessions (' + list.length + ')'));
  if (!list.length) {
    panel.appendChild(elt('p', 'identity-hint', 'No active agent sessions.'));
    return panel;
  }
  for (const s of list) {
    const row = elt('article', 'identity-session');
    setAttrs(row, { 'data-id': s.id, 'data-signing': String(!!s.allowSigning), 'data-network': s.network });
    row.appendChild(elt('span', 'identity-session-id mono', s.id));
    row.appendChild(elt('span', 'identity-session-plain', 'This agent may run ' +
      ((s.allowedActions && s.allowedActions.length) ? s.allowedActions.join(', ') : 'every action') +
      ' on ' + s.network + (s.allowSigning ? ' and may sign' : '')));
    if (s.allowSigning) row.appendChild(elt('span', 'identity-session-flag', 'signing'));
    if (String(s.network).toLowerCase() === 'mainnet') row.appendChild(elt('span', 'identity-session-flag identity-flag-danger', 'mainnet'));
    panel.appendChild(row);
  }
  return panel;
}

function permissionsPanel() {
  const list = permissions();
  const panel = elt('section', 'identity-permissions');
  setAttrs(panel, { 'aria-label': 'Permissions' });
  panel.appendChild(elt('h3', 'identity-subtitle', 'Permissions (' + list.length + ')'));
  if (!list.length) {
    panel.appendChild(elt('p', 'identity-hint', 'No granted capabilities.'));
    return panel;
  }
  const ul = elt('ul', 'identity-perm-list');
  for (const p of list) {
    const li = elt('li', 'identity-perm');
    setAttrs(li, { 'data-kind': p.kind });
    li.textContent = p.plain;
    ul.appendChild(li);
  }
  panel.appendChild(ul);
  return panel;
}

function historyPanel() {
  const list = history();
  const panel = elt('section', 'identity-history');
  setAttrs(panel, { 'aria-label': 'Signing history' });
  panel.appendChild(elt('h3', 'identity-subtitle', 'Signing history (' + list.length + ')'));
  if (!list.length) {
    panel.appendChild(elt('p', 'identity-hint', 'No signed intents yet.'));
    return panel;
  }
  const ul = elt('ul', 'identity-history-list');
  for (const h of list) {
    const li = elt('li', 'identity-history-item');
    li.textContent = h.action + ' on ' + h.network + ' — ' + h.signedAt;
    ul.appendChild(li);
  }
  panel.appendChild(ul);
  return panel;
}

function safetyCenter() {
  const list = warnings();
  const panel = elt('section', 'identity-safety-center');
  setAttrs(panel, { 'aria-label': 'Safety center', role: 'region' });
  panel.appendChild(elt('h3', 'identity-subtitle', 'Safety center'));
  if (!list.length) {
    panel.appendChild(elt('p', 'identity-safe', '✔ No safety warnings.'));
    return panel;
  }
  const ul = elt('ul', 'identity-warning-list');
  for (const w of list) {
    const li = elt('li', 'identity-warning');
    li.textContent = w;
    ul.appendChild(li);
  }
  panel.appendChild(ul);
  return panel;
}

function populate(body) {
  const grid = elt('div', 'identity-grid-layout');
  grid.appendChild(walletCard());
  grid.appendChild(accumulateCard());
  body.appendChild(grid);
  body.appendChild(signatureQueuePanel());
  body.appendChild(sessionsPanel());
  body.appendChild(permissionsPanel());
  body.appendChild(historyPanel());
  body.appendChild(safetyCenter());
}

export const identityView = {
  async mount(root) {
    root.replaceChildren();
    const shell = elt('div', 'workspace identity-view');
    const header = elt('header', 'workspace-header');
    header.appendChild(setAttrs(elt('h1', 'workspace-title', 'Identity'), { id: 'identity-title' }));
    header.appendChild(elt('p', 'workspace-subtitle',
      'Who you are, what you can sign, what authority you hold, and what a signature will do — in one honest place. No private keys, ever.'));
    // RUNBOOK-04 Task 7 — this page reads a SAMPLE identity to demonstrate the
    // signature explainer; it controls nothing. Say so plainly and point at the
    // live signing surface (the explainSignature engine itself now also runs on
    // the live Approve screen — Task 2).
    header.appendChild(setAttrs(
      elt('p', 'identity-preview-banner',
        'Preview — this screen reads a sample identity to demonstrate the signature explainer. Live signing happens on the Approve screen.'),
      { role: 'note' }));
    shell.appendChild(header);
    const body = elt('div', 'identity-body');
    body.appendChild(elt('p', 'identity-loading', 'Loading your identity…'));
    shell.appendChild(body);
    root.appendChild(shell);

    try {
      await loadIdentity();
      body.replaceChildren();
      populate(body);
    } catch (err) {
      body.replaceChildren();
      const msg = elt('div', 'identity-error');
      msg.setAttribute('role', 'alert');
      msg.appendChild(elt('strong', null, 'Could not load the identity center.'));
      msg.appendChild(elt('p', null, String((err && err.message) || err)));
      body.appendChild(msg);
    }
  },
};
