// Nexus — Approvals view (list + detail).
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 2-D: pending approval queue +
// recent approvals lane + detail screen with plan-hash binding,
// signer key page, role derivation source, and signature
// verification status.
//
// Subpaths:
//   #/approvals                — pending + recent (two lanes)
//   #/approvals/<id>           — single-approval detail
//   #/approvals/_byPlan/<id>   — every approval attached to a plan
//
// Data sources:
//   approval.pending  — pending list (per server)
//   approval.list     — recent / all
//   approval.get      — single-approval read
//   explorer.approvalByPlan — every approval bound to a given plan ID

import {
  rpcWithDisclosure,
  shortHash,
  formatTime,
  hashChip,
  jsonBlock,
  emptyState,
  kvRow,
  card,
  statusPill,
  readField,
  loadingNode,
  errorNode,
  deeplinkButton,
} from '/lib/spineCommon.js';

let rootEl = null;
let currentSubpath = [];

export const approvalsView = {
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
    renderTwoLane();
  } else if (currentSubpath[0] === '_byPlan' && currentSubpath[1]) {
    renderByPlan(currentSubpath[1]);
  } else {
    renderDetail(currentSubpath[0]);
  }
}

// -----------------------------------------------------------------
// Two-lane list (pending + recent)
// -----------------------------------------------------------------
async function renderTwoLane() {
  rootEl.replaceChildren();
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const h = document.createElement('h2');
  h.textContent = 'Approvals';
  head.appendChild(h);
  const sub = document.createElement('p');
  sub.className = 'spine-section-sub';
  sub.textContent = 'Pending approvals (top) and recent (bottom). Click any row for plan-hash binding + signer verification.';
  head.appendChild(sub);
  rootEl.appendChild(head);

  const pendingWrap = document.createElement('div');
  pendingWrap.className = 'approval-lane';
  const pendingHead = document.createElement('h3');
  pendingHead.textContent = 'Pending';
  pendingWrap.appendChild(pendingHead);
  pendingWrap.appendChild(loadingNode('Loading pending…'));
  rootEl.appendChild(pendingWrap);

  const recentWrap = document.createElement('div');
  recentWrap.className = 'approval-lane';
  const recentHead = document.createElement('h3');
  recentHead.textContent = 'Recent';
  recentWrap.appendChild(recentHead);
  recentWrap.appendChild(loadingNode('Loading recent…'));
  rootEl.appendChild(recentWrap);

  const [pendingResp, recentResp] = await Promise.all([
    rpcWithDisclosure('approval.pending', { limit: 50 }).catch((e) => ({ error: e })),
    rpcWithDisclosure('approval.list', { limit: 50 }).catch((e) => ({ error: e })),
  ]);

  // Pending lane
  const pendingChildren = pendingWrap.childNodes;
  while (pendingChildren.length > 1) pendingWrap.removeChild(pendingWrap.lastChild);
  if (pendingResp && pendingResp.error) {
    pendingWrap.appendChild(errorNode(pendingResp.error));
  } else {
    const items = approvalListItems(pendingResp);
    if (items.length === 0) pendingWrap.appendChild(emptyState('No pending approvals.'));
    else pendingWrap.appendChild(buildApprovalTable(items));
  }

  // Recent lane
  const recentChildren = recentWrap.childNodes;
  while (recentChildren.length > 1) recentWrap.removeChild(recentWrap.lastChild);
  if (recentResp && recentResp.error) {
    recentWrap.appendChild(errorNode(recentResp.error));
  } else {
    const items = approvalListItems(recentResp);
    if (items.length === 0) recentWrap.appendChild(emptyState('No approval records yet.'));
    else recentWrap.appendChild(buildApprovalTable(items));
  }
}

function approvalListItems(resp) {
  if (!resp) return [];
  if (Array.isArray(resp.items)) return resp.items;
  if (Array.isArray(resp.approvals)) return resp.approvals;
  if (Array.isArray(resp)) return resp;
  return [];
}

function buildApprovalTable(items) {
  const table = document.createElement('table');
  table.className = 'spine-table approvals-table';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const c of ['ID', 'Plan hash', 'Identity', 'Role', 'State', 'Created']) {
    const th = document.createElement('th');
    th.textContent = c;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const a of items) {
    tbody.appendChild(buildApprovalRow(a));
  }
  table.appendChild(tbody);
  return table;
}

function buildApprovalRow(a) {
  const tr = document.createElement('tr');
  tr.className = 'approval-row';
  tr.addEventListener('click', () => {
    window.location.hash = '#/approvals/' + encodeURIComponent(a.id || a.ID);
  });
  const idCell = document.createElement('td');
  idCell.className = 'mono';
  idCell.textContent = shortHash(a.id || a.ID, 14, 6);
  idCell.title = a.id || a.ID;
  tr.appendChild(idCell);

  const hashCell = document.createElement('td');
  const ph = readField(a, 'PlanHash');
  hashCell.appendChild(hashChip(ph));
  tr.appendChild(hashCell);

  const idtCell = document.createElement('td');
  idtCell.className = 'mono';
  const identity = readField(a, 'Identity') || readField(a, 'identity');
  idtCell.textContent = identity || '—';
  tr.appendChild(idtCell);

  const roleCell = document.createElement('td');
  const role = readField(a, 'Role') || readField(a, 'role');
  roleCell.textContent = role || '—';
  tr.appendChild(roleCell);

  const stateCell = document.createElement('td');
  const state = a.state || a.State || readField(a, 'State') || 'pending';
  stateCell.appendChild(statusPill(state, stateToKind(state)));
  tr.appendChild(stateCell);

  const createdCell = document.createElement('td');
  createdCell.textContent = formatTime(a.created || a.Created);
  tr.appendChild(createdCell);

  return tr;
}

function stateToKind(state) {
  switch (String(state).toLowerCase()) {
    case 'granted':
    case 'quorum_reached':
      return 'ok';
    case 'revoked':
    case 'expired':
      return 'alert';
    case 'pending':
      return 'warn';
    default:
      return 'info';
  }
}

// -----------------------------------------------------------------
// By-plan list
// -----------------------------------------------------------------
async function renderByPlan(planId) {
  rootEl.replaceChildren();

  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const back = document.createElement('a');
  back.className = 'spine-back';
  back.href = '#/approvals';
  back.textContent = '← All approvals';
  head.appendChild(back);
  const h = document.createElement('h2');
  h.textContent = 'Approvals for plan';
  head.appendChild(h);
  const subPlan = document.createElement('p');
  subPlan.className = 'spine-section-sub mono';
  subPlan.textContent = planId;
  head.appendChild(subPlan);
  rootEl.appendChild(head);

  const wrap = document.createElement('div');
  wrap.className = 'spine-table-wrap';
  wrap.appendChild(loadingNode('Loading approvals…'));
  rootEl.appendChild(wrap);

  let resp;
  try {
    resp = await rpcWithDisclosure('explorer.approvalByPlan', { planId });
  } catch (err) {
    wrap.replaceChildren(errorNode(err));
    return;
  }
  const items = (resp && Array.isArray(resp.approvals)) ? resp.approvals : [];
  if (items.length === 0) {
    wrap.replaceChildren(emptyState('No approvals attached to this plan.'));
    return;
  }
  wrap.replaceChildren(buildApprovalTable(items));

  const link = document.createElement('div');
  link.className = 'action-row';
  link.appendChild(deeplinkButton('Open plan', 'plans', planId));
  rootEl.appendChild(link);
}

// -----------------------------------------------------------------
// Detail
// -----------------------------------------------------------------
async function renderDetail(approvalId) {
  rootEl.replaceChildren();

  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const back = document.createElement('a');
  back.className = 'spine-back';
  back.href = '#/approvals';
  back.textContent = '← All approvals';
  head.appendChild(back);
  const h = document.createElement('h2');
  h.className = 'mono';
  h.textContent = approvalId;
  head.appendChild(h);
  rootEl.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  rootEl.appendChild(grid);

  let approval;
  try {
    approval = await rpcWithDisclosure('approval.get', { id: approvalId });
  } catch (err) {
    grid.appendChild(errorNode(err));
    return;
  }
  if (!approval) {
    grid.appendChild(errorNode(new Error('approval not found')));
    return;
  }

  const planID = readField(approval, 'PlanID') || approval.createdByPlanID || approval.CreatedByPlanID;
  const planHash = readField(approval, 'PlanHash');
  const identity = readField(approval, 'Identity');
  const role = readField(approval, 'Role');
  const targetID = readField(approval, 'TargetID') || readField(approval, 'TargetId');
  const sigPubKey = readField(approval, 'SignerPublicKey');
  const sigAlg = readField(approval, 'SignatureAlgorithm');
  const sig = readField(approval, 'Signature');
  const expiresBlock = readField(approval, 'ExpiresAtBlock');
  const validFromBlock = readField(approval, 'ValidFromBlock');
  const simHash = readField(approval, 'SimulationHash');

  // Header card
  const headerBody = document.createElement('div');
  headerBody.appendChild(kvRow('State', statusPill(approval.state || approval.State || 'pending', stateToKind(approval.state || approval.State))));
  if (planID) headerBody.appendChild(kvRow('Plan ID', shortHashLink(planID, 'plans')));
  headerBody.appendChild(kvRow('Plan hash', hashChip(planHash, { head: 12, tail: 8 })));
  if (targetID) headerBody.appendChild(kvRow('Target', targetID));
  headerBody.appendChild(kvRow('Created', formatTime(approval.created || approval.Created)));
  headerBody.appendChild(kvRow('Updated', formatTime(approval.updated || approval.Updated)));
  if (validFromBlock !== undefined) headerBody.appendChild(kvRow('Valid from block', validFromBlock));
  if (expiresBlock !== undefined) headerBody.appendChild(kvRow('Expires at block', expiresBlock));
  grid.appendChild(card('Approval envelope', headerBody));

  // Plan-hash binding check (against the live plan)
  if (planID && planHash) {
    const checkBody = document.createElement('div');
    checkBody.appendChild(loadingNode('Verifying plan-hash binding…'));
    grid.appendChild(card('Plan-hash binding', checkBody));
    rpcWithDisclosure('explorer.planGet', { id: planID })
      .then((planObj) => {
        const livePlanHash = planObj ? readField(planObj, 'PlanHash') : '';
        const matches = livePlanHash && String(livePlanHash).toLowerCase() === String(planHash).toLowerCase();
        checkBody.replaceChildren();
        checkBody.appendChild(kvRow('Live plan hash', hashChip(livePlanHash, { head: 12, tail: 8 })));
        checkBody.appendChild(kvRow('Match?', statusPill(matches ? '✓ matches current plan' : '✗ plan has drifted', matches ? 'ok' : 'alert')));
      })
      .catch((err) => {
        checkBody.replaceChildren();
        checkBody.appendChild(errorNode(err));
      });
  }

  // Signer card
  const signerBody = document.createElement('div');
  if (identity) signerBody.appendChild(kvRow('Identity', identity));
  if (role) signerBody.appendChild(kvRow('Role', role));
  if (sigAlg) signerBody.appendChild(kvRow('Signature algorithm', sigAlg));
  if (sigPubKey) signerBody.appendChild(kvRow('Public key', hashChip(toHexIfBytes(sigPubKey), { head: 14, tail: 8 })));
  if (sig) signerBody.appendChild(kvRow('Signature', hashChip(toHexIfBytes(sig), { head: 14, tail: 8 })));
  grid.appendChild(card('Signer', signerBody));

  // Simulation binding (Spec §11.5)
  if (simHash) {
    const simBody = document.createElement('div');
    simBody.appendChild(kvRow('Simulation hash', hashChip(simHash, { head: 12, tail: 8 })));
    simBody.appendChild(document.createTextNode(
      'The approver committed to this simulation snapshot. If the plan’s ghost evidence changes, the approval is invalidated and the plan must re-acquire approval.'
    ));
    grid.appendChild(card('Simulation binding', simBody));
  }

  // Cross-links
  const linksBody = document.createElement('div');
  linksBody.className = 'action-row';
  if (planID) linksBody.appendChild(deeplinkButton('Open plan', 'plans', planID));
  if (planID) linksBody.appendChild(deeplinkButton('Other approvals on plan', 'approvals', '_byPlan', planID));
  grid.appendChild(card('Cross-links', linksBody));

  // Raw
  const rawBody = document.createElement('details');
  rawBody.className = 'raw-details';
  const summary = document.createElement('summary');
  summary.textContent = 'Raw managed object';
  rawBody.appendChild(summary);
  rawBody.appendChild(jsonBlock(approval));
  grid.appendChild(card('Inspect', rawBody));
}

function shortHashLink(value, route) {
  const a = document.createElement('a');
  a.className = 'mono spine-link';
  a.href = `#/${route}/${encodeURIComponent(value)}`;
  a.textContent = shortHash(value, 14, 6);
  a.title = value;
  return a;
}

// Convert a base64 string (the JSON-encoded form for []byte fields)
// to a hex string for display. If the value is already hex or a
// non-string, return it as-is.
function toHexIfBytes(v) {
  if (typeof v !== 'string') return v;
  // Already hex?
  if (/^[0-9a-fA-F]+$/.test(v) && v.length % 2 === 0) return v;
  try {
    const bin = atob(v);
    let out = '';
    for (let i = 0; i < bin.length; i++) {
      out += bin.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return out;
  } catch (e) {
    return v;
  }
}
