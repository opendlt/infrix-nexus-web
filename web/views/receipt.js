// Nexus — #/receipt Shareable Proof Receipt (plan-12 step 2).
//
// The receipt is the shareable artifact — a page better than a block-explorer
// page. In order: a plain-English summary, the assurance level, what was and was
// not verified, the independent verification command, the L0 anchor status, the
// witness status, the Cinema replay, the download bundle, and the embed widget.
// Assurance always comes from the verifier; the node is never trusted, and a
// local receipt never claims L0/L4.

import { elt, setAttrs } from '/lib/uxDom.js';
import { copyCommand } from '/lib/copyCommand.js';
import { loadReceipt, isLive, receipt, receiptIsHonest } from '/lib/receipt.js';

function summaryPanel(r) {
  const panel = elt('section', 'receipt-summary');
  setAttrs(panel, { 'aria-label': 'Summary' });
  panel.appendChild(elt('h2', 'receipt-h2', r.title || 'Proof receipt'));
  panel.appendChild(elt('p', 'receipt-plain', r.plainSummary || ''));

  const lbl = elt('p', 'receipt-assurance-label');
  setAttrs(lbl, { 'data-verified': String(!!r.verified), 'data-l0': String(!!r.l0Verified) });
  lbl.textContent = r.assuranceLabel || '';
  panel.appendChild(lbl);

  const badges = elt('ul', 'receipt-badges');
  const add = (text, ok) => {
    const li = elt('li', 'receipt-badge');
    setAttrs(li, { 'data-ok': String(ok) });
    li.textContent = text;
    badges.appendChild(li);
  };
  add('Assurance ' + (r.assuranceLevel || ''), !!r.verified);
  add(r.verified ? 'verified' : 'not verified', !!r.verified);
  add(r.l0Verified ? 'L0 confirmed' : 'L0 not checked (local)', !!r.l0Verified);
  add('node never trusted', r.nodeTrusted === false);
  panel.appendChild(badges);
  return panel;
}

function verifiedList(title, cls, items, ok) {
  const panel = elt('section', cls);
  setAttrs(panel, { 'aria-label': title });
  panel.appendChild(elt('h3', 'receipt-h3', title));
  const ul = elt('ul', 'receipt-list');
  for (const it of items || []) {
    const li = elt('li', 'receipt-list-item');
    setAttrs(li, { 'data-ok': String(ok) });
    li.textContent = it;
    ul.appendChild(li);
  }
  panel.appendChild(ul);
  return panel;
}

function statusPanel(r) {
  const panel = elt('section', 'receipt-status');
  setAttrs(panel, { 'aria-label': 'Anchor & witness status' });
  panel.appendChild(elt('h3', 'receipt-h3', 'Anchor & witnesses'));
  const dl = elt('dl', 'receipt-status-grid');
  const row = (k, v) => { dl.appendChild(elt('dt', null, k)); dl.appendChild(elt('dd', null, v)); };
  row('L0 anchor', r.l0AnchorStatus || '');
  row('Witnesses', r.witnessStatus || '');
  panel.appendChild(dl);
  return panel;
}

function actionsPanel(r) {
  const panel = elt('section', 'receipt-actions');
  setAttrs(panel, { 'aria-label': 'Verify, replay, download, embed' });

  panel.appendChild(elt('h3', 'receipt-h3', 'Verify it yourself'));
  panel.appendChild(elt('p', 'receipt-action-note',
    'Run this offline. The verifier re-derives the result from the sealed evidence — the Infrix node is never trusted.'));
  if (r.independentCommand) panel.appendChild(copyCommand(r.independentCommand, 'the independent verification command'));

  const grid = elt('div', 'receipt-action-grid');

  const replay = elt('div', 'receipt-action-card');
  replay.appendChild(elt('strong', 'receipt-action-title', 'Cinema replay'));
  replay.appendChild(elt('code', 'mono', r.cinemaReplay || ''));
  replay.appendChild(elt('p', 'receipt-action-sub', 'A non-committing view of the canonical artifacts — the L0-anchored spine is the record.'));
  grid.appendChild(replay);

  const dl = elt('div', 'receipt-action-card');
  dl.appendChild(elt('strong', 'receipt-action-title', 'Download bundle'));
  dl.appendChild(elt('code', 'mono', r.downloadBundle || ''));
  dl.appendChild(elt('p', 'receipt-action-sub', 'A self-contained, offline-verifiable proof bundle.'));
  grid.appendChild(dl);

  panel.appendChild(grid);

  panel.appendChild(elt('h3', 'receipt-h3', 'Embed the verification widget'));
  if (r.embedWidget) panel.appendChild(copyCommand(r.embedWidget, 'the embed widget command'));
  return panel;
}

function populate(body) {
  const r = receipt();
  if (!receiptIsHonest()) {
    const warn = elt('div', 'receipt-error');
    setAttrs(warn, { role: 'alert' });
    warn.textContent = 'This receipt did not pass the honesty rails and was withheld.';
    body.appendChild(warn);
    return;
  }
  const src = elt('p', 'receipt-source');
  setAttrs(src, { 'data-live': String(isLive()) });
  src.textContent = isLive() ? 'Live receipt connected.' : 'Showing an example proof receipt.';
  body.appendChild(src);

  body.appendChild(summaryPanel(r));
  const cols = elt('div', 'receipt-columns');
  cols.appendChild(verifiedList('What was verified', 'receipt-verified', r.whatVerified, true));
  cols.appendChild(verifiedList('What was not verified', 'receipt-notverified', r.whatNotVerified, false));
  body.appendChild(cols);
  body.appendChild(statusPanel(r));
  body.appendChild(actionsPanel(r));
}

export const receiptView = {
  async mount(root) {
    root.replaceChildren();
    const shell = elt('div', 'workspace receipt-view');
    const header = elt('header', 'workspace-header');
    header.appendChild(setAttrs(elt('h1', 'workspace-title', 'Proof Receipt'), { id: 'receipt-title' }));
    header.appendChild(elt('p', 'workspace-subtitle',
      'A shareable proof receipt: what happened, how sure we are, and how to check it yourself.'));
    shell.appendChild(header);
    const body = elt('div', 'receipt-body');
    body.appendChild(elt('p', 'receipt-loading', 'Loading the receipt…'));
    shell.appendChild(body);
    root.appendChild(shell);

    try {
      await loadReceipt();
      body.replaceChildren();
      populate(body);
    } catch (err) {
      body.replaceChildren();
      const msg = elt('div', 'receipt-error');
      msg.setAttribute('role', 'alert');
      msg.appendChild(elt('strong', null, 'Could not load the receipt.'));
      msg.appendChild(elt('p', null, String((err && err.message) || err)));
      body.appendChild(msg);
    }
  },
};
