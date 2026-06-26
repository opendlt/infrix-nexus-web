// Nexus — Inbox view.
//
// Cinema-Inbox-Time Effort 2 Commit 4 — collaborative inbox.
//
// One screen for everything the operator needs to act on:
//   - approvals waiting on me   (governed.approve flow)
//   - intents assigned to me    (handoff accepted)
//   - mentions on me            (@-mentions in notes)
//   - handoffs to me            (pending invitations)
//   - my drafts                 (in-flight intents in Studio)
//   - proofs                    (proof-review queue — RUNBOOK-01 IA: was #/proof-inbox)
//
// Routes:
//   #/inbox          — full inbox, default tab = approvals
//   #/inbox/<tab>    — focus a specific lane (approvals|assigned|mentions|handoffs|drafts|proofs)
//
// Bulk-action toolbar:
//   [✓] approve selected   (opens rationale modal once, applies to all)
//   [✗] reject selected    (rationale modal)
//   [↪] handoff selected   (assignee modal)
//   [☰] mark all read
//
// Keyboard nav (Gmail-style):
//   j / k     — next / prev row
//   x         — toggle selection on focused row
//   s         — star/unstar focused row (local)
//   r         — reply (add a note to focused intent)
//   f         — forward (open handoff modal)
//   Enter     — open focused row in its canonical view
//   a         — approve focused row
//   d         — decline focused row
//   /         — focus the filter input
//
// Polling: re-fetch nexus.inbox every 5s while the tab is visible.
//
// Spec parity: see Cinema-Inbox-Time-plan.md Effort 2 §E2C4.

import {
  rpcWithDisclosure,
  shortHash,
  formatTime,
  loadingNode,
  errorNode,
  emptyState,
} from '/lib/spineCommon.js';
import { onAtChange, isAtLive } from '/lib/timeContext.js';
// RUNBOOK-01 IA consolidation — the proof-review queue is now a lane of this
// one Inbox (it used to be a separate #/proof-inbox surface). One shared
// renderer paints it; #/proof-inbox redirects into #/inbox/proofs.
import { renderProofQueue } from '/views/inbox_collab.js';

let rootEl = null;
let currentTab = 'approvals';
let pollHandle = null;
let lastSnapshot = null;
let atUnsub = null;
const selection = new Set(); // row keys: `${lane}:${id}`
const stars = new Set();
let focusedKey = null;
let filterQuery = '';
// The proofs lane is fixture-backed and self-contained; render it once per tab
// entry so the 5s nexus.inbox poll does not thrash it or drop its selection.
let proofsRendered = false;

const TABS = [
  { key: 'approvals', label: 'Approvals', countField: 'approvalsCount' },
  { key: 'assigned',  label: 'Assigned',  countField: 'assignedCount' },
  { key: 'mentions',  label: 'Mentions',  countField: 'mentionsCount' },
  { key: 'handoffs',  label: 'Handoffs',  countField: 'handoffsCount' },
  { key: 'drafts',    label: 'Drafts',    countField: 'draftsCount' },
  { key: 'proofs',    label: 'Proofs',    countField: 'proofsCount' },
];

export const inboxView = {
  mount(root, subpath) {
    rootEl = root;
    currentTab = (subpath && subpath[0]) || 'approvals';
    render();
    startPolling();
    bindKeys();
    // Cinema-Inbox-Time E3C6 — when the at-cursor moves, the snapshot
    // becomes stale; force an immediate refresh so the inbox reflects
    // the new lens.
    atUnsub = onAtChange(() => refresh().catch(() => {}));
  },
  onSubpathChange(subpath) {
    currentTab = (subpath && subpath[0]) || 'approvals';
    render();
  },
  unmount() {
    stopPolling();
    unbindKeys();
    if (atUnsub) { try { atUnsub(); } catch (_) {} atUnsub = null; }
    rootEl = null;
  },
};

// -----------------------------------------------------------------
// Render
// -----------------------------------------------------------------
function render() {
  if (!rootEl) return;
  proofsRendered = false; // body is rebuilt; allow the proofs lane to mount once
  rootEl.replaceChildren();

  const shell = document.createElement('div');
  shell.className = 'workspace inbox-canvas';
  rootEl.appendChild(shell);

  const head = document.createElement('header');
  head.className = 'workspace-header';
  const title = document.createElement('h2');
  title.className = 'workspace-title';
  title.textContent = 'Inbox';
  head.appendChild(title);
  const sub = document.createElement('p');
  sub.className = 'workspace-subtitle';
  sub.textContent = 'Everything waiting on you — approvals, assigned intents, mentions, handoffs, and your in-flight drafts.';
  head.appendChild(sub);
  shell.appendChild(head);

  // Tab strip
  shell.appendChild(buildTabStrip());

  // Toolbar
  shell.appendChild(buildToolbar());

  // Body
  const body = document.createElement('section');
  body.className = 'inbox-body';
  body.id = 'inboxBody';
  shell.appendChild(body);

  body.appendChild(loadingNode('Loading inbox…'));
  refresh().catch((e) => {
    body.replaceChildren();
    body.appendChild(errorNode(e));
  });
}

function buildTabStrip() {
  const strip = document.createElement('nav');
  strip.className = 'inbox-tabs';
  strip.setAttribute('role', 'tablist');
  for (const t of TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'inbox-tab' + (currentTab === t.key ? ' is-active' : '');
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(currentTab === t.key));
    btn.dataset.tab = t.key;
    btn.textContent = t.label;
    const count = lastSnapshot && lastSnapshot[t.countField];
    if (count !== undefined && count !== null) {
      const badge = document.createElement('span');
      badge.className = 'inbox-tab-badge';
      badge.textContent = String(count);
      btn.appendChild(badge);
    }
    btn.addEventListener('click', () => {
      window.location.hash = '#/inbox/' + t.key;
    });
    strip.appendChild(btn);
  }
  return strip;
}

function buildToolbar() {
  const bar = document.createElement('div');
  bar.className = 'inbox-toolbar';

  const filter = document.createElement('input');
  filter.type = 'search';
  filter.className = 'inbox-filter';
  filter.placeholder = 'Filter (press /)…';
  filter.value = filterQuery;
  filter.addEventListener('input', () => {
    filterQuery = filter.value;
    renderBody();
  });
  bar.appendChild(filter);

  const count = document.createElement('span');
  count.className = 'inbox-selection-count';
  count.id = 'inboxSelectionCount';
  count.textContent = selection.size > 0 ? `${selection.size} selected` : '';
  bar.appendChild(count);

  bar.appendChild(toolbarButton('✓ Approve', 'inbox-btn-approve', onBulkApprove));
  bar.appendChild(toolbarButton('✗ Reject',  'inbox-btn-reject',  onBulkReject));
  bar.appendChild(toolbarButton('↪ Handoff', 'inbox-btn-handoff', onBulkHandoff));
  bar.appendChild(toolbarButton('Refresh',  'inbox-btn-refresh', () => refresh()));

  return bar;
}

function toolbarButton(label, cls, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'inbox-btn ' + cls;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

async function refresh() {
  try {
    const resp = await rpcWithDisclosure('nexus.inbox', { limit: 100 });
    lastSnapshot = resp || {};
    renderBody();
    syncTabBadges();
  } catch (e) {
    const body = document.getElementById('inboxBody');
    if (body) {
      body.replaceChildren();
      body.appendChild(errorNode(e));
    }
  }
}

function syncTabBadges() {
  if (!rootEl) return;
  const buttons = rootEl.querySelectorAll('button.inbox-tab');
  for (const btn of buttons) {
    const t = TABS.find((x) => x.key === btn.dataset.tab);
    if (!t) continue;
    btn.querySelectorAll('.inbox-tab-badge').forEach((b) => b.remove());
    const c = lastSnapshot && lastSnapshot[t.countField];
    if (c !== undefined && c !== null) {
      const badge = document.createElement('span');
      badge.className = 'inbox-tab-badge';
      badge.textContent = String(c);
      btn.appendChild(badge);
    }
  }
}

function renderBody() {
  const body = document.getElementById('inboxBody');
  if (!body) return;
  // Proofs lane — delegate to the shared proof-review queue renderer. It owns
  // its own queue/detail layout and controls, so it is rendered once per tab
  // entry (not on every poll tick) to preserve selection.
  if (currentTab === 'proofs') {
    if (proofsRendered) return;
    proofsRendered = true;
    renderProofQueue(body).catch((e) => { body.replaceChildren(); body.appendChild(errorNode(e)); });
    return;
  }
  proofsRendered = false;
  body.replaceChildren();
  const rows = visibleRows();
  if (rows.length === 0) {
    body.appendChild(emptyState('Nothing here. You are all caught up.'));
    return;
  }
  const list = document.createElement('ul');
  list.className = 'inbox-list';
  list.setAttribute('role', 'listbox');
  list.tabIndex = 0;
  for (const r of rows) {
    list.appendChild(buildRow(r));
  }
  body.appendChild(list);
}

function visibleRows() {
  if (!lastSnapshot) return [];
  let raw = [];
  switch (currentTab) {
    case 'approvals':
      raw = (lastSnapshot.approvalsWaitingOnMe || []).map((r) => ({ lane: 'approvals', ...r }));
      break;
    case 'assigned':
      raw = (lastSnapshot.intentsAssignedToMe || []).map((r) => ({ lane: 'assigned', ...r }));
      break;
    case 'mentions':
      raw = (lastSnapshot.mentionsOnMe || []).map((r) => ({ lane: 'mentions', ...r }));
      break;
    case 'handoffs':
      raw = (lastSnapshot.handoffsToMe || []).map((r) => ({ lane: 'handoffs', ...r }));
      break;
    case 'drafts':
      raw = (lastSnapshot.myDrafts || []).map((r) => ({ lane: 'drafts', ...r }));
      break;
  }
  if (!filterQuery) return raw;
  const q = filterQuery.toLowerCase();
  return raw.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
}

function buildRow(r) {
  const key = rowKey(r);
  const li = document.createElement('li');
  li.className = 'inbox-row';
  li.dataset.key = key;
  if (focusedKey === key) li.classList.add('is-focused');
  if (selection.has(key)) li.classList.add('is-selected');

  // Checkbox
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'inbox-row-check';
  cb.checked = selection.has(key);
  cb.addEventListener('change', () => {
    toggleSelection(key);
    li.classList.toggle('is-selected', selection.has(key));
    updateSelectionCount();
  });
  li.appendChild(cb);

  // Star
  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'inbox-row-star' + (stars.has(key) ? ' is-on' : '');
  star.textContent = stars.has(key) ? '★' : '☆';
  star.addEventListener('click', () => {
    if (stars.has(key)) stars.delete(key);
    else stars.add(key);
    star.textContent = stars.has(key) ? '★' : '☆';
    star.classList.toggle('is-on', stars.has(key));
  });
  li.appendChild(star);

  // Lane chip
  const chip = document.createElement('span');
  chip.className = 'inbox-row-lane lane-' + r.lane;
  chip.textContent = laneLabel(r.lane);
  li.appendChild(chip);

  // Primary
  const primary = document.createElement('div');
  primary.className = 'inbox-row-primary';
  primary.textContent = rowTitle(r);
  li.appendChild(primary);

  // Secondary
  const secondary = document.createElement('div');
  secondary.className = 'inbox-row-secondary';
  secondary.textContent = rowSecondary(r);
  li.appendChild(secondary);

  // Time
  const time = document.createElement('time');
  time.className = 'inbox-row-time';
  time.textContent = formatTime(r.createdAt || r.updatedAt || r.autoSavedAt || '');
  li.appendChild(time);

  li.addEventListener('click', (ev) => {
    if (ev.target === cb || ev.target === star) return;
    focusedKey = key;
    renderBody();
    openRow(r);
  });

  return li;
}

function rowKey(r) {
  return `${r.lane}:${r.id || r.intentId || r.approvalId || r.handoffId || r.draftId}`;
}

function laneLabel(lane) {
  switch (lane) {
    case 'approvals': return 'APPR';
    case 'assigned':  return 'ASGN';
    case 'mentions':  return '@';
    case 'handoffs':  return 'HOFF';
    case 'drafts':    return 'DRFT';
    default:          return lane.toUpperCase();
  }
}

function rowTitle(r) {
  return r.title || r.goalType || r.intentId || r.id || '(untitled)';
}

function rowSecondary(r) {
  const parts = [];
  if (r.intentId) parts.push(shortHash(r.intentId));
  if (r.sender) parts.push('from ' + r.sender);
  if (r.author) parts.push('by ' + r.author);
  if (r.state) parts.push(r.state);
  return parts.join(' · ');
}

function openRow(r) {
  // Route into the canonical canvas for each lane.
  switch (r.lane) {
    case 'approvals':
      window.location.hash = '#/approve/' + encodeURIComponent(r.planId || r.intentId || r.id);
      break;
    case 'assigned':
    case 'mentions':
    case 'handoffs':
      window.location.hash = '#/spine/' + encodeURIComponent(r.intentId || r.id);
      break;
    case 'drafts':
      window.location.hash = '#/compose/' + encodeURIComponent(r.goalType || '') + '/draft/' + encodeURIComponent(r.id);
      break;
  }
}

// -----------------------------------------------------------------
// Selection
// -----------------------------------------------------------------
function toggleSelection(key) {
  if (selection.has(key)) selection.delete(key);
  else selection.add(key);
}

function updateSelectionCount() {
  const el = document.getElementById('inboxSelectionCount');
  if (!el) return;
  el.textContent = selection.size > 0 ? `${selection.size} selected` : '';
}

// -----------------------------------------------------------------
// Bulk actions
// -----------------------------------------------------------------
async function onBulkApprove() {
  if (selection.size === 0) {
    alert('Select at least one row to approve.');
    return;
  }
  const rationale = window.prompt('Rationale for approving (min 10 chars):', '');
  if (rationale === null) return;
  if (rationale.length < 10) {
    alert('Rationale must be at least 10 characters.');
    return;
  }
  const ids = collectSelectedIntentIds();
  const results = await Promise.allSettled(ids.map((intentId) =>
    rpcWithDisclosure('governed.approve', { intentId, rationale })
  ));
  reportBulkOutcome(results, 'approve');
  selection.clear();
  await refresh();
}

async function onBulkReject() {
  if (selection.size === 0) {
    alert('Select at least one row to reject.');
    return;
  }
  const rationale = window.prompt('Rationale for rejecting (min 10 chars):', '');
  if (rationale === null) return;
  if (rationale.length < 10) {
    alert('Rationale must be at least 10 characters.');
    return;
  }
  const ids = collectSelectedIntentIds();
  const results = await Promise.allSettled(ids.map((intentId) =>
    rpcWithDisclosure('governed.reject', { intentId, rationale })
  ));
  reportBulkOutcome(results, 'reject');
  selection.clear();
  await refresh();
}

async function onBulkHandoff() {
  if (selection.size === 0) {
    alert('Select at least one row to hand off.');
    return;
  }
  const assignee = window.prompt('Assignee (acc:// URL):', '');
  if (!assignee) return;
  const note = window.prompt('Note (optional):', '') || '';
  const ids = collectSelectedIntentIds();
  const results = await Promise.allSettled(ids.map((intentId) =>
    rpcWithDisclosure('nexus.handoffCreate', { intentId, assignee, note })
  ));
  reportBulkOutcome(results, 'handoff');
  selection.clear();
  await refresh();
}

function collectSelectedIntentIds() {
  const out = [];
  for (const key of selection) {
    const row = findRowByKey(key);
    if (!row) continue;
    const id = row.intentId || row.id;
    if (id) out.push(id);
  }
  return out;
}

function findRowByKey(key) {
  if (!lastSnapshot) return null;
  const lanes = [
    ['approvals', lastSnapshot.approvalsWaitingOnMe || []],
    ['assigned',  lastSnapshot.intentsAssignedToMe || []],
    ['mentions',  lastSnapshot.mentionsOnMe || []],
    ['handoffs',  lastSnapshot.handoffsToMe || []],
    ['drafts',    lastSnapshot.myDrafts || []],
  ];
  for (const [lane, rows] of lanes) {
    for (const r of rows) {
      const k = `${lane}:${r.id || r.intentId || r.approvalId || r.handoffId || r.draftId}`;
      if (k === key) return { lane, ...r };
    }
  }
  return null;
}

function reportBulkOutcome(results, verb) {
  let ok = 0, fail = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') ok++;
    else fail++;
  }
  if (fail === 0) {
    flashToast(`${ok} ${verb}ed.`);
  } else {
    flashToast(`${ok} ok, ${fail} failed. See console.`);
    for (const r of results) {
      if (r.status === 'rejected') console.error('inbox bulk ' + verb, r.reason);
    }
  }
}

function flashToast(msg) {
  const t = document.createElement('div');
  t.className = 'inbox-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => {
    t.classList.add('is-fading');
    setTimeout(() => t.remove(), 300);
  }, 1800);
}

// -----------------------------------------------------------------
// Polling
// -----------------------------------------------------------------
function startPolling() {
  stopPolling();
  pollHandle = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    // Cinema-Inbox-Time E3C6 — when the at-cursor is anchored to the
    // past, the snapshot is immutable. Skip the poll to save round-
    // trips; the user can pull back to live to resume.
    if (!isAtLive()) return;
    refresh();
  }, 5000);
}

function stopPolling() {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

// -----------------------------------------------------------------
// Keyboard nav
// -----------------------------------------------------------------
function bindKeys() {
  document.addEventListener('keydown', onKey);
}

function unbindKeys() {
  document.removeEventListener('keydown', onKey);
}

function onKey(ev) {
  if (!rootEl || !rootEl.isConnected) return;
  if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA')) {
    if (ev.key === '/' && document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('inbox-filter')) {
      return;
    }
    return;
  }
  const rows = visibleRows();
  if (rows.length === 0) return;
  const idx = Math.max(0, rows.findIndex((r) => rowKey(r) === focusedKey));
  switch (ev.key) {
    case 'j': {
      const next = rows[Math.min(rows.length - 1, idx + 1)];
      focusedKey = rowKey(next);
      renderBody();
      ev.preventDefault();
      break;
    }
    case 'k': {
      const prev = rows[Math.max(0, idx - 1)];
      focusedKey = rowKey(prev);
      renderBody();
      ev.preventDefault();
      break;
    }
    case 'x': {
      toggleSelection(focusedKey);
      renderBody();
      updateSelectionCount();
      ev.preventDefault();
      break;
    }
    case 's': {
      if (stars.has(focusedKey)) stars.delete(focusedKey);
      else stars.add(focusedKey);
      renderBody();
      ev.preventDefault();
      break;
    }
    case 'r': {
      onReply(rows[idx]);
      ev.preventDefault();
      break;
    }
    case 'f': {
      onForward(rows[idx]);
      ev.preventDefault();
      break;
    }
    case 'Enter': {
      openRow(rows[idx]);
      ev.preventDefault();
      break;
    }
    case 'a': {
      if (rows[idx] && rows[idx].lane === 'approvals') {
        selection.clear();
        selection.add(rowKey(rows[idx]));
        onBulkApprove();
      }
      ev.preventDefault();
      break;
    }
    case 'd': {
      if (rows[idx] && rows[idx].lane === 'approvals') {
        selection.clear();
        selection.add(rowKey(rows[idx]));
        onBulkReject();
      }
      ev.preventDefault();
      break;
    }
    case '/': {
      const f = rootEl.querySelector('.inbox-filter');
      if (f) {
        f.focus();
        f.select();
        ev.preventDefault();
      }
      break;
    }
  }
}

async function onReply(row) {
  if (!row) return;
  const body = window.prompt('Add a note (use @acc://… to mention):', '');
  if (!body) return;
  try {
    await rpcWithDisclosure('nexus.noteAdd', {
      intentId: row.intentId || row.id,
      body,
    });
    flashToast('Note added.');
  } catch (e) {
    flashToast('Note failed: ' + (e && e.message ? e.message : e));
  }
}

async function onForward(row) {
  if (!row) return;
  const assignee = window.prompt('Forward to (acc:// URL):', '');
  if (!assignee) return;
  const note = window.prompt('Note (optional):', '') || '';
  try {
    await rpcWithDisclosure('nexus.handoffCreate', {
      intentId: row.intentId || row.id,
      assignee,
      note,
    });
    flashToast('Handoff created.');
    await refresh();
  } catch (e) {
    flashToast('Handoff failed: ' + (e && e.message ? e.message : e));
  }
}
