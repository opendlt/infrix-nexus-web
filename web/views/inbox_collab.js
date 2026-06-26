// Nexus — #/proof-inbox Proof Inbox + Collaboration (nextux-07).
//
// A calm review workspace over proof artifacts: a queue (with status lanes), an
// item detail with the independent verification panel, the trust boundary, the
// comments + decision history, and the decision controls. Decisions are verified
// IN THE BROWSER (the canonical body is reconstructed and the Ed25519 signature
// re-checked) — trusting no node. The browser never signs or mutates: approving
// and rejecting flow through the approval-gated CLI / agent action.

import { elt, setAttrs } from '/lib/uxDom.js';
import {
  loadInbox, items, itemById, summarize, statusLane, isVerified,
  verifyItemDecisions, LANES,
} from '/lib/inbox.js';

const LANE_LABEL = Object.fromEntries(LANES.map((l) => [l.id, l.label]));

function verificationBadge(v) {
  const status = (v && v.status) || 'pending';
  const badge = elt('span', 'inbox-verif-badge inbox-verif-' + status);
  setAttrs(badge, { 'data-status': status, 'aria-label': 'Verification: ' + status });
  let text = status;
  if (status === 'verified' && v.proofLevel) text = 'verified ' + v.proofLevel + '/' + v.governanceLevel;
  badge.textContent = text;
  return badge;
}

function queueCard(it, selectedId, onSelect) {
  const lane = statusLane(it);
  const card = elt('button', 'inbox-item-card');
  setAttrs(card, {
    type: 'button',
    'data-id': it.id,
    'data-lane': lane,
    'data-selected': String(it.id === selectedId),
    'aria-label': 'Item: ' + it.title,
  });
  const head = elt('div', 'inbox-item-head');
  head.appendChild(elt('span', 'inbox-item-title', it.title));
  head.appendChild(verificationBadge(it.verification));
  card.appendChild(head);
  card.appendChild(elt('p', 'inbox-item-meta', LANE_LABEL[lane] + ' · from ' + (it.sender || '—')));
  card.appendChild(elt('p', 'inbox-item-kind mono', it.kind));
  card.addEventListener('click', () => onSelect(it.id));
  return card;
}

function verificationPanel(it) {
  const v = it.verification || {};
  const panel = elt('section', 'inbox-verification-panel');
  setAttrs(panel, { 'aria-label': 'Verification panel' });
  panel.appendChild(elt('h3', 'inbox-subtitle', 'Verification'));
  const dl = elt('dl', 'inbox-verif-grid');
  const row = (k, val) => { dl.appendChild(elt('dt', null, k)); dl.appendChild(elt('dd', 'mono', String(val))); };
  row('Status', v.status || 'pending');
  row('Proof / governance', (v.proofLevel || '—') + ' / ' + (v.governanceLevel || '—'));
  row('Verifier', v.verifier || '—');
  row('L0 verified', !!v.l0Verified);
  panel.appendChild(dl);
  if (v.detail) panel.appendChild(elt('p', 'inbox-verif-detail', v.detail));
  return panel;
}

function trustBoundary(it) {
  const v = it.verification || {};
  const box = elt('section', 'inbox-trust-boundary');
  setAttrs(box, { 'aria-label': 'Trust boundary' });
  box.appendChild(elt('h3', 'inbox-subtitle', 'Trust boundary'));
  const trustsNode = !!v.trustsNode;
  const line = elt('p', 'inbox-trust-line');
  setAttrs(line, { 'data-trusts-node': String(trustsNode) });
  line.textContent = trustsNode
    ? 'This verdict trusts the sending node.'
    : 'This verdict trusts NO node — it was re-derived independently from the artifact.';
  box.appendChild(line);
  return box;
}

function commentsPanel(it) {
  const box = elt('section', 'inbox-comments');
  setAttrs(box, { 'aria-label': 'Comments' });
  box.appendChild(elt('h3', 'inbox-subtitle', 'Comments (' + (it.comments || []).length + ')'));
  if (!(it.comments || []).length) {
    box.appendChild(elt('p', 'inbox-empty', 'No comments yet.'));
    return box;
  }
  const ul = elt('ul', 'inbox-comment-list');
  for (const c of it.comments) {
    const li = elt('li', 'inbox-comment');
    li.appendChild(elt('span', 'inbox-comment-author', c.author || '—'));
    li.appendChild(elt('span', 'inbox-comment-body', c.body));
    ul.appendChild(li);
  }
  box.appendChild(ul);
  return box;
}

async function decisionsPanel(it) {
  const box = elt('section', 'inbox-decisions');
  setAttrs(box, { 'aria-label': 'Decisions' });
  box.appendChild(elt('h3', 'inbox-subtitle', 'Decisions (' + (it.decisions || []).length + ')'));
  if (!(it.decisions || []).length) {
    box.appendChild(elt('p', 'inbox-empty', 'No decisions yet.'));
    return box;
  }
  const verdicts = await verifyItemDecisions(it);
  const ul = elt('ul', 'inbox-decision-list');
  for (const v of verdicts) {
    const d = v.decision;
    const li = elt('li', 'inbox-decision');
    setAttrs(li, { 'data-type': d.type });
    li.appendChild(elt('span', 'inbox-decision-type', d.type));
    li.appendChild(elt('span', 'inbox-decision-by', 'by ' + (d.signedBy || '—')));
    const verify = elt('span', 'inbox-decision-verify');
    setAttrs(verify, { 'data-ok': String(v.ok), role: 'status' });
    verify.textContent = v.ok ? '✔ signature + artifact binding verified' : '✘ verification failed';
    li.appendChild(verify);
    ul.appendChild(li);
  }
  box.appendChild(ul);
  return box;
}

function decisionControls(it) {
  const box = elt('section', 'inbox-decision-controls');
  setAttrs(box, { 'aria-label': 'Decision controls' });
  box.appendChild(elt('h3', 'inbox-subtitle', 'Your decision'));
  const verified = isVerified(it);
  const note = elt('p', 'inbox-controls-note');
  note.textContent = verified
    ? 'Approving binds your signature to this exact artifact. Do it in your terminal — the browser never signs.'
    : 'This item is not verified, so it cannot be approved. You can still acknowledge or request changes.';
  box.appendChild(note);
  const actions = elt('div', 'inbox-controls-actions');
  const verbs = [
    { v: 'approve', enabled: verified },
    { v: 'reject', enabled: true },
    { v: 'request-changes', enabled: true },
    { v: 'archive', enabled: true },
  ];
  for (const a of verbs) {
    const btn = elt('button', 'inbox-control-btn inbox-control-' + a.v);
    setAttrs(btn, { type: 'button', 'data-verb': a.v, 'aria-label': a.v + ' (in terminal)' });
    if (!a.enabled) btn.setAttribute('disabled', 'true');
    btn.textContent = a.v;
    actions.appendChild(btn);
  }
  box.appendChild(actions);
  box.appendChild(elt('code', 'inbox-control-cmd', 'infrix inbox approve <item> --signer local-dev'));
  return box;
}

function sharedSummaryPanel(it) {
  const s = summarize(it);
  const box = elt('section', 'inbox-shared-summary');
  setAttrs(box, { 'aria-label': 'Shared summary (redaction-safe)' });
  box.appendChild(elt('h3', 'inbox-subtitle', 'Shared summary (safe to send)'));
  box.appendChild(elt('p', 'inbox-summary-note',
    'This is the only shape that crosses a trust boundary. It carries no comment bodies, decision reasons, or artifact bytes.'));
  const pre = elt('pre', 'inbox-summary-json mono');
  pre.textContent = JSON.stringify(s, null, 2);
  box.appendChild(pre);
  return box;
}

async function renderDetail(detailEl, it) {
  detailEl.replaceChildren();
  if (!it) {
    detailEl.appendChild(elt('p', 'inbox-empty', 'Select an item to review it.'));
    return;
  }
  const head = elt('header', 'inbox-detail-head');
  head.appendChild(elt('h2', 'inbox-detail-title', it.title));
  head.appendChild(elt('p', 'inbox-detail-meta mono', it.artifactHash));
  if (it.askedToApprove) head.appendChild(elt('p', 'inbox-detail-ask', 'Asked to approve: ' + it.askedToApprove));
  detailEl.appendChild(head);
  detailEl.appendChild(verificationPanel(it));
  detailEl.appendChild(trustBoundary(it));
  detailEl.appendChild(await decisionsPanel(it));
  detailEl.appendChild(commentsPanel(it));
  detailEl.appendChild(decisionControls(it));
  detailEl.appendChild(sharedSummaryPanel(it));
}

function populate(body) {
  const all = items();
  let selectedId = all.length ? all[0].id : null;

  const layout = elt('div', 'inbox-collab-layout');
  const queue = elt('aside', 'inbox-queue');
  setAttrs(queue, { 'aria-label': 'Proof inbox queue' });
  const detail = elt('div', 'inbox-detail');
  setAttrs(detail, { 'aria-label': 'Item detail', tabindex: '0', role: 'region' });

  const select = (id) => {
    selectedId = id;
    for (const c of queue.querySelectorAll('.inbox-item-card')) {
      c.setAttribute('data-selected', String(c.dataset.id === id));
    }
    renderDetail(detail, itemById(id));
  };

  // Lane filter.
  const filter = elt('div', 'inbox-lane-filter');
  setAttrs(filter, { role: 'group', 'aria-label': 'Filter by lane' });
  const lanesPresent = new Set(all.map(statusLane));
  const allBtn = elt('button', 'inbox-lane-btn inbox-lane-active');
  setAttrs(allBtn, { type: 'button', 'data-lane': 'all' });
  allBtn.textContent = 'All (' + all.length + ')';
  filter.appendChild(allBtn);
  for (const l of LANES) {
    if (!lanesPresent.has(l.id)) continue;
    const b = elt('button', 'inbox-lane-btn');
    setAttrs(b, { type: 'button', 'data-lane': l.id });
    b.textContent = l.label;
    filter.appendChild(b);
  }

  const list = elt('div', 'inbox-queue-list');
  const renderQueue = (lane) => {
    list.replaceChildren();
    for (const it of all) {
      if (lane !== 'all' && statusLane(it) !== lane) continue;
      list.appendChild(queueCard(it, selectedId, select));
    }
  };
  filter.addEventListener('click', (e) => {
    const btn = e.target.closest('.inbox-lane-btn');
    if (!btn) return;
    for (const b of filter.querySelectorAll('.inbox-lane-btn')) b.classList.remove('inbox-lane-active');
    btn.classList.add('inbox-lane-active');
    renderQueue(btn.dataset.lane);
  });

  queue.appendChild(elt('h2', 'inbox-subtitle', 'Queue'));
  queue.appendChild(filter);
  queue.appendChild(list);
  renderQueue('all');

  layout.appendChild(queue);
  layout.appendChild(detail);
  body.appendChild(layout);

  renderDetail(detail, itemById(selectedId));
}

// Render the proof-review queue (queue + detail) into a host element. Shared by
// the standalone view below and the Inbox "proofs" lane (RUNBOOK-01 IA
// consolidation), so there is exactly one proof-review implementation. The
// host is fully owned: its children are replaced.
export async function renderProofQueue(host) {
  host.replaceChildren();
  host.appendChild(elt('p', 'inbox-loading', 'Loading the proof inbox…'));
  try {
    await loadInbox();
    host.replaceChildren();
    populate(host);
  } catch (err) {
    host.replaceChildren();
    const msg = elt('div', 'inbox-error');
    msg.setAttribute('role', 'alert');
    msg.appendChild(elt('strong', null, 'Could not load the proof inbox.'));
    msg.appendChild(elt('p', null, String((err && err.message) || err)));
    host.appendChild(msg);
  }
}

// Standalone proof-inbox view. Retained for compatibility and direct embedding;
// the canonical entry point is now the Inbox "proofs" lane, and the #/proof-inbox
// route redirects there (web/app.js). Both render through renderProofQueue().
export const proofInboxView = {
  async mount(root) {
    root.replaceChildren();
    const shell = elt('div', 'workspace inbox-collab-view');
    const header = elt('header', 'workspace-header');
    header.appendChild(setAttrs(elt('h1', 'workspace-title', 'Proof Inbox'), { id: 'proof-inbox-title' }));
    header.appendChild(elt('p', 'workspace-subtitle',
      'Review proof like an inbox: status, verifier verdict, trust boundary, comments, and decisions — every approval bound to the exact artifact, trusting no node.'));
    shell.appendChild(header);
    const body = elt('div', 'inbox-collab-body');
    shell.appendChild(body);
    root.appendChild(shell);
    await renderProofQueue(body);
  },
};
