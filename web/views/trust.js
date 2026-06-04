// Nexus — Trust view (registry + per-profile detail + drift history + proof-mismatch alerts).
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 3-I: TrustRegistry browser
// with per-profile drift, proof-mismatch alerts (Gap 11-B), and
// freshness window indicators.
//
// Subpaths:
//   #/trust              — registry + alert lane
//   #/trust/_alerts      — proof-mismatch alerts only
//   #/trust/<profileID>  — single-profile detail with audit trail

import {
  rpcWithDisclosure,
  shortHash,
  formatTime,
  jsonBlock,
  emptyState,
  kvRow,
  card,
  statusPill,
  loadingNode,
  errorNode,
  deeplinkButton,
} from '/lib/spineCommon.js';

let rootEl = null;
let currentSubpath = [];

export const trustView = {
  mount(root, subpath) {
    rootEl = root;
    currentSubpath = Array.isArray(subpath) ? subpath : [];
    render();
  },
  onSubpathChange(subpath) {
    currentSubpath = Array.isArray(subpath) ? subpath : [];
    render();
  },
};

function render() {
  if (!rootEl) return;
  if (currentSubpath.length === 0) {
    renderRegistry();
  } else if (currentSubpath[0] === '_alerts') {
    renderAlerts();
  } else {
    renderDetail(currentSubpath[0]);
  }
}

// -----------------------------------------------------------------
// Registry
// -----------------------------------------------------------------
async function renderRegistry() {
  rootEl.replaceChildren();
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const h = document.createElement('h2');
  h.textContent = 'Trust';
  head.appendChild(h);
  const sub = document.createElement('p');
  sub.className = 'spine-section-sub';
  sub.textContent = 'TrustRegistry browser. Each profile has a state (active / degraded / suspended / revoked), a freshness window, and an audit trail.';
  head.appendChild(sub);
  const actions = document.createElement('div');
  actions.className = 'action-row';
  actions.appendChild(deeplinkButton('Proof-mismatch alerts', 'trust', '_alerts'));
  head.appendChild(actions);
  rootEl.appendChild(head);

  // Two parallel fetches: full list + alerts.
  const [listResp, alertsResp] = await Promise.all([
    rpcWithDisclosure('trust.list', {}).catch((e) => ({ error: e })),
    rpcWithDisclosure('explorer.trustProofMismatchAlerts', {}).catch(() => null),
  ]);

  if (listResp && listResp.error) {
    rootEl.appendChild(errorNode(listResp.error));
    return;
  }

  const items = trustListItems(listResp);
  if (alertsResp && alertsResp.alerts && alertsResp.alerts.length > 0) {
    const banner = document.createElement('div');
    banner.className = 'verify-summary verify-fail';
    banner.textContent = `⚠ ${alertsResp.alerts.length} active proof-mismatch alert${alertsResp.alerts.length === 1 ? '' : 's'}. Click "Proof-mismatch alerts" above to inspect.`;
    rootEl.appendChild(banner);
  }

  if (items.length === 0) {
    rootEl.appendChild(emptyState('No trust profiles registered.'));
    return;
  }

  const table = document.createElement('table');
  table.className = 'spine-table';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const c of ['Profile ID', 'State', 'Proof type', 'Trust assumption', 'Min confirmations', 'Version', 'Updated']) {
    const th = document.createElement('th');
    th.textContent = c;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const p of items) tbody.appendChild(buildRow(p));
  table.appendChild(tbody);
  rootEl.appendChild(table);

  const meta = document.createElement('div');
  meta.className = 'spine-table-meta';
  meta.textContent = `${items.length} profile${items.length === 1 ? '' : 's'}`;
  rootEl.appendChild(meta);
}

function trustListItems(resp) {
  if (!resp) return [];
  if (Array.isArray(resp.items)) return resp.items;
  if (Array.isArray(resp)) return resp;
  return [];
}

function buildRow(profile) {
  const tr = document.createElement('tr');
  const id = readProfileID(profile);
  tr.addEventListener('click', () => {
    if (id) window.location.hash = '#/trust/' + encodeURIComponent(id);
  });

  const idCell = document.createElement('td');
  idCell.className = 'mono';
  idCell.textContent = shortHash(id, 18, 6);
  idCell.title = id;
  tr.appendChild(idCell);

  const state = readField(profile, 'State') || readField(profile, 'state') || 'active';
  const stateCell = document.createElement('td');
  stateCell.appendChild(statusPill(state, stateKind(state)));
  tr.appendChild(stateCell);

  const proofCell = document.createElement('td');
  proofCell.textContent = readField(profile, 'ProofType') || readField(profile, 'proofType') || '—';
  tr.appendChild(proofCell);

  const trustCell = document.createElement('td');
  trustCell.textContent = readField(profile, 'TrustAssumption') || readField(profile, 'trustAssumption') || '—';
  tr.appendChild(trustCell);

  const confCell = document.createElement('td');
  confCell.textContent = readField(profile, 'MinConfirmations') || readField(profile, 'minConfirmations') || 0;
  tr.appendChild(confCell);

  const verCell = document.createElement('td');
  verCell.textContent = readField(profile, 'Version') || profile.version || '0';
  tr.appendChild(verCell);

  const updCell = document.createElement('td');
  updCell.textContent = formatTime(profile.updated || profile.Updated || readField(profile, 'UpdatedAt'));
  tr.appendChild(updCell);

  return tr;
}

function readProfileID(profile) {
  if (!profile) return '';
  if (profile.id) return profile.id;
  if (profile.ID) return profile.ID;
  const fields = profile.fields || {};
  return fields.ProfileID || fields.profileId || '';
}

function readField(obj, key) {
  if (!obj) return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  const fields = obj.fields;
  if (fields && Object.prototype.hasOwnProperty.call(fields, key)) return fields[key];
  return undefined;
}

function stateKind(state) {
  switch (String(state).toLowerCase()) {
    case 'active': return 'ok';
    case 'degraded': return 'warn';
    case 'suspended': return 'alert';
    case 'revoked': return 'alert';
    default: return 'info';
  }
}

// -----------------------------------------------------------------
// Detail
// -----------------------------------------------------------------
async function renderDetail(profileID) {
  rootEl.replaceChildren();
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const back = document.createElement('a');
  back.className = 'spine-back';
  back.href = '#/trust';
  back.textContent = '← All trust profiles';
  head.appendChild(back);
  const h = document.createElement('h2');
  h.className = 'mono';
  h.textContent = profileID;
  head.appendChild(h);
  rootEl.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  rootEl.appendChild(grid);

  const [profile, history] = await Promise.all([
    rpcWithDisclosure('explorer.trustGet', { id: profileID }).catch((e) => ({ error: e })),
    rpcWithDisclosure('trust.history', { id: profileID }).catch(() => null),
  ]);

  if (profile && profile.error) {
    grid.appendChild(errorNode(profile.error));
    return;
  }
  if (!profile) {
    grid.appendChild(errorNode(new Error('trust profile not found')));
    return;
  }

  // Header
  const headerBody = document.createElement('div');
  headerBody.appendChild(kvRow('Profile ID', profile.profileId));
  headerBody.appendChild(kvRow('State', statusPill(profile.state, stateKind(profile.state))));
  headerBody.appendChild(kvRow('Proof type', profile.proofType || '—'));
  headerBody.appendChild(kvRow('Trust assumption', profile.trustAssumption || '—'));
  headerBody.appendChild(kvRow('Finality model', profile.finalityModel || '—'));
  headerBody.appendChild(kvRow('Min confirmations', profile.minConfirmations));
  headerBody.appendChild(kvRow('Freshness window', profile.freshnessWindow || '—'));
  headerBody.appendChild(kvRow('Version', profile.version));
  headerBody.appendChild(kvRow('Created at', formatTime(profile.createdAt)));
  headerBody.appendChild(kvRow('Updated at', formatTime(profile.updatedAt)));
  if (profile.degradedAt) headerBody.appendChild(kvRow('Degraded at', formatTime(profile.degradedAt)));
  if (profile.degradedReason) headerBody.appendChild(kvRow('Degraded reason', statusPill(profile.degradedReason, 'alert')));
  grid.appendChild(card('Trust profile envelope', headerBody));

  // Drift history (= audit trail)
  const histBody = document.createElement('div');
  const events = historyEvents(history);
  if (events.length === 0) {
    histBody.appendChild(emptyState('No history recorded.'));
  } else {
    const list = document.createElement('div');
    list.className = 'history-list';
    for (const e of events) {
      const row = document.createElement('div');
      row.className = 'history-row';
      const ts = document.createElement('span');
      ts.className = 'history-ts mono';
      ts.textContent = formatTime(e.timestamp || e.Timestamp || e.at);
      row.appendChild(ts);
      const tp = document.createElement('span');
      tp.className = 'history-type';
      tp.textContent = e.type || e.Type || e.kind || 'event';
      row.appendChild(tp);
      const det = document.createElement('span');
      det.className = 'history-detail';
      det.textContent = e.detail || e.Detail || e.message || '';
      row.appendChild(det);
      list.appendChild(row);
    }
    histBody.appendChild(list);
  }
  grid.appendChild(card('Drift history (audit trail)', histBody));

  // Raw envelope
  const rawBody = document.createElement('details');
  rawBody.className = 'raw-details';
  const summary = document.createElement('summary');
  summary.textContent = 'Raw profile';
  rawBody.appendChild(summary);
  rawBody.appendChild(jsonBlock(profile));
  grid.appendChild(card('Inspect', rawBody));
}

function historyEvents(resp) {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  if (Array.isArray(resp.events)) return resp.events;
  if (Array.isArray(resp.history)) return resp.history;
  if (Array.isArray(resp.items)) return resp.items;
  return [];
}

// -----------------------------------------------------------------
// Alerts (proof-mismatch)
// -----------------------------------------------------------------
async function renderAlerts() {
  rootEl.replaceChildren();
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const back = document.createElement('a');
  back.className = 'spine-back';
  back.href = '#/trust';
  back.textContent = '← Trust';
  head.appendChild(back);
  const h = document.createElement('h2');
  h.textContent = 'Proof-mismatch alerts';
  head.appendChild(h);
  const sub = document.createElement('p');
  sub.className = 'spine-section-sub';
  sub.textContent = 'Trust profiles transitioned to degraded state by RecordProofMismatch (Gap 11-B). Each alert reflects a real cryptographic verification failure that invalidated the profile.';
  head.appendChild(sub);
  rootEl.appendChild(head);

  const wrap = document.createElement('div');
  wrap.appendChild(loadingNode('Loading alerts…'));
  rootEl.appendChild(wrap);
  let resp;
  try {
    resp = await rpcWithDisclosure('explorer.trustProofMismatchAlerts', {});
  } catch (err) {
    wrap.replaceChildren(errorNode(err));
    return;
  }
  const alerts = (resp && resp.alerts) || [];
  if (alerts.length === 0) {
    wrap.replaceChildren(emptyState('No proof-mismatch alerts. All trust profiles are healthy.'));
    return;
  }
  const table = document.createElement('table');
  table.className = 'spine-table';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const c of ['Profile ID', 'State', 'Reason', 'Degraded at', 'Version']) {
    const th = document.createElement('th');
    th.textContent = c;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const a of alerts) {
    const r = document.createElement('tr');
    r.style.cursor = 'pointer';
    r.addEventListener('click', () => { window.location.hash = '#/trust/' + encodeURIComponent(a.profileId); });
    const id = document.createElement('td');
    id.className = 'mono';
    id.textContent = a.profileId;
    r.appendChild(id);
    const st = document.createElement('td');
    st.appendChild(statusPill(a.state, 'alert'));
    r.appendChild(st);
    const reason = document.createElement('td');
    reason.textContent = a.degradedReason;
    r.appendChild(reason);
    const at = document.createElement('td');
    at.textContent = formatTime(a.degradedAt);
    r.appendChild(at);
    const ver = document.createElement('td');
    ver.textContent = a.version;
    r.appendChild(ver);
    tbody.appendChild(r);
  }
  table.appendChild(tbody);
  wrap.replaceChildren(table);
}
