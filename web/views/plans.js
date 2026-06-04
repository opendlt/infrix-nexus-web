// Nexus — Plans view (list + detail).
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 2-C: the canonical execution
// plan, hash-bound to its compiling intent. Each detail screen surfaces:
//   - Plan hash (clickable for copy + cross-link from approval)
//   - Drift threshold + total gas estimate
//   - Required approvals (with deeplink to ApprovalDetail)
//   - Step list with typed parameters + per-step trust profile
//   - Ghost evidence hash with "compare against actual outcome" pivot
//
// List filters by goal type + plan-hash search. The byHash search
// hits explorer.planByHash so an auditor can paste a hash from an
// approval envelope and land on the matching plan.

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

export const plansView = {
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
    renderList();
  } else {
    renderDetail(currentSubpath[0]);
  }
}

// -----------------------------------------------------------------
// List
// -----------------------------------------------------------------
async function renderList() {
  rootEl.replaceChildren();
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const h = document.createElement('h2');
  h.textContent = 'Plans';
  head.appendChild(h);
  const sub = document.createElement('p');
  sub.className = 'spine-section-sub';
  sub.textContent = 'Compiled execution plans with plan-hash binding, drift thresholds, and declared approvals. Each plan corresponds to one intent.';
  head.appendChild(sub);
  rootEl.appendChild(head);

  const filterBar = renderFilterBar(() => renderList());
  rootEl.appendChild(filterBar);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'spine-table-wrap';
  tableWrap.appendChild(loadingNode('Loading plans…'));
  rootEl.appendChild(tableWrap);

  let resp;
  try {
    resp = await rpcWithDisclosure('explorer.planList', { limit: 100 });
  } catch (err) {
    tableWrap.replaceChildren(errorNode(err));
    return;
  }
  let plans = resp && Array.isArray(resp.items) ? resp.items : [];
  plans = applyFilters(plans);

  if (plans.length === 0) {
    tableWrap.replaceChildren(emptyState('No plans found. Plans appear here as soon as an intent is resolved.'));
    return;
  }

  const table = document.createElement('table');
  table.className = 'spine-table plans-table';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const c of ['Plan ID', 'Plan hash', 'Intent', 'Steps', 'Approvals', 'Total gas', 'Created']) {
    const th = document.createElement('th');
    th.textContent = c;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const plan of plans) {
    tbody.appendChild(buildRow(plan));
  }
  table.appendChild(tbody);
  tableWrap.replaceChildren(table);

  const meta = document.createElement('div');
  meta.className = 'spine-table-meta';
  meta.textContent = `${plans.length} plan${plans.length === 1 ? '' : 's'} shown`;
  rootEl.appendChild(meta);
}

const filterState = {
  workflowDef: '',
  hashSearch: '',
};

function renderFilterBar(onChange) {
  const bar = document.createElement('div');
  bar.className = 'spine-filter-bar';

  const wf = textFilter('Workflow def', filterState.workflowDef, (v) => {
    filterState.workflowDef = v;
    onChange();
  });
  bar.appendChild(wf);

  const hashWrap = document.createElement('label');
  hashWrap.className = 'spine-filter';
  const hashLbl = document.createElement('span');
  hashLbl.textContent = 'Find by hash';
  hashWrap.appendChild(hashLbl);
  const hashIn = document.createElement('input');
  hashIn.type = 'text';
  hashIn.placeholder = '0x… (32-byte hex)';
  hashIn.value = filterState.hashSearch;
  hashIn.addEventListener('change', async () => {
    const h = hashIn.value.trim();
    if (!h) return;
    try {
      const obj = await rpcWithDisclosure('explorer.planByHash', { hash: h });
      if (obj && (obj.id || obj.ID)) {
        window.location.hash = '#/plans/' + encodeURIComponent(obj.id || obj.ID);
      }
    } catch (err) {
      hashIn.classList.add('not-found');
      hashIn.title = (err && err.message) || 'no plan found';
      setTimeout(() => hashIn.classList.remove('not-found'), 2000);
    }
  });
  hashWrap.appendChild(hashIn);
  bar.appendChild(hashWrap);

  return bar;
}

function applyFilters(plans) {
  return plans.filter((p) => {
    if (filterState.workflowDef) {
      const wf = readField(p, 'WorkflowDefID') || '';
      if (!wf.toLowerCase().includes(filterState.workflowDef.toLowerCase())) return false;
    }
    return true;
  });
}

function buildRow(plan) {
  const tr = document.createElement('tr');
  tr.className = 'plan-row';
  tr.addEventListener('click', () => {
    window.location.hash = '#/plans/' + encodeURIComponent(plan.id || plan.ID);
  });

  const idCell = document.createElement('td');
  idCell.className = 'mono';
  idCell.textContent = shortHash(plan.id || plan.ID, 14, 6);
  idCell.title = plan.id || plan.ID;
  tr.appendChild(idCell);

  const hashCell = document.createElement('td');
  hashCell.appendChild(hashChip(readField(plan, 'PlanHash')));
  tr.appendChild(hashCell);

  const intentCell = document.createElement('td');
  intentCell.className = 'mono';
  const intentID = readField(plan, 'InstanceID') || plan.createdByIntentID || plan.CreatedByIntentID || '—';
  intentCell.textContent = shortHash(intentID, 14, 6);
  intentCell.title = intentID;
  tr.appendChild(intentCell);

  const stepCell = document.createElement('td');
  stepCell.textContent = String(readField(plan, 'StepCount') || 0);
  tr.appendChild(stepCell);

  const apCell = document.createElement('td');
  apCell.textContent = String(readField(plan, 'ApprovalCount') || 0);
  tr.appendChild(apCell);

  const gasCell = document.createElement('td');
  gasCell.textContent = String(readField(plan, 'TotalGasEstimate') || 0);
  tr.appendChild(gasCell);

  const createdCell = document.createElement('td');
  createdCell.textContent = formatTime(plan.created || plan.Created);
  tr.appendChild(createdCell);

  return tr;
}

function textFilter(label, value, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'spine-filter';
  const span = document.createElement('span');
  span.textContent = label;
  wrap.appendChild(span);
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value || '';
  input.addEventListener('input', () => onChange(input.value));
  wrap.appendChild(input);
  return wrap;
}

// -----------------------------------------------------------------
// Detail
// -----------------------------------------------------------------
async function renderDetail(planId) {
  rootEl.replaceChildren();

  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const back = document.createElement('a');
  back.className = 'spine-back';
  back.href = '#/plans';
  back.textContent = '← All plans';
  head.appendChild(back);
  const h = document.createElement('h2');
  h.className = 'mono';
  h.textContent = planId;
  head.appendChild(h);
  rootEl.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  rootEl.appendChild(grid);

  const [planObj, approvalsResp] = await Promise.all([
    rpcWithDisclosure('explorer.planGet', { id: planId }).catch((e) => ({ error: e })),
    rpcWithDisclosure('explorer.approvalByPlan', { planId }).catch(() => null),
  ]);

  if (planObj && planObj.error) {
    grid.appendChild(errorNode(planObj.error));
    return;
  }
  if (!planObj) {
    grid.appendChild(errorNode(new Error('plan not found')));
    return;
  }

  const intentID = readField(planObj, 'InstanceID') || planObj.createdByIntentID || planObj.CreatedByIntentID;

  // Header card
  const headerBody = document.createElement('div');
  headerBody.appendChild(kvRow('Plan hash', hashChip(readField(planObj, 'PlanHash'), { head: 12, tail: 8 })));
  headerBody.appendChild(kvRow('Intent ID', shortHashClickable(intentID, 'intents')));
  headerBody.appendChild(kvRow('Workflow def', readField(planObj, 'WorkflowDefID') || '—'));
  headerBody.appendChild(kvRow('Step count', readField(planObj, 'StepCount')));
  headerBody.appendChild(kvRow('Total gas estimate', readField(planObj, 'TotalGasEstimate')));
  headerBody.appendChild(kvRow('Approval count', readField(planObj, 'ApprovalCount')));
  headerBody.appendChild(kvRow('Created at', formatTime(planObj.created || planObj.Created)));
  headerBody.appendChild(kvRow('State', statusPill(planObj.state || planObj.State || 'generated', 'info')));
  grid.appendChild(card('Plan envelope', headerBody));

  // Approvals attached to this plan
  const apBody = document.createElement('div');
  const approvals = (approvalsResp && Array.isArray(approvalsResp.approvals)) ? approvalsResp.approvals : [];
  if (approvals.length === 0) {
    apBody.appendChild(emptyState('No approvals recorded for this plan.'));
  } else {
    const list = document.createElement('div');
    list.className = 'approval-mini-list';
    for (const a of approvals) {
      const row = document.createElement('div');
      row.className = 'approval-mini-row';
      const idChip = document.createElement('span');
      idChip.className = 'mono';
      idChip.textContent = shortHash(a.id || a.ID, 16, 6);
      idChip.title = a.id || a.ID;
      row.appendChild(idChip);
      const state = readField(a, 'state') || readField(a, 'State') || a.state || a.State || 'pending';
      row.appendChild(statusPill(state, state === 'granted' ? 'ok' : 'warn'));
      row.appendChild(deeplinkButton('Open', 'approvals', a.id || a.ID));
      list.appendChild(row);
    }
    apBody.appendChild(list);
  }
  grid.appendChild(card(`Approvals (${approvals.length})`, apBody));

  // Cross-links
  const linksBody = document.createElement('div');
  linksBody.className = 'action-row';
  if (intentID) linksBody.appendChild(deeplinkButton('View intent', 'intents', intentID));
  // Outcomes are keyed off plan; we rely on the explorer.outcomeList /
  // outcomeGet pair driven by the explicit detail screen.
  linksBody.appendChild(deeplinkButton('Browse outcomes', 'outcomes'));
  grid.appendChild(card('Cross-links', linksBody));

  // Raw
  const rawBody = document.createElement('details');
  rawBody.className = 'raw-details';
  const summary = document.createElement('summary');
  summary.textContent = 'Raw managed object';
  rawBody.appendChild(summary);
  rawBody.appendChild(jsonBlock(planObj));
  grid.appendChild(card('Inspect', rawBody));
}

function shortHashClickable(value, route) {
  if (!value) {
    const span = document.createElement('span');
    span.className = 'kv-value empty';
    span.textContent = '—';
    return span;
  }
  const wrap = document.createElement('span');
  const a = document.createElement('a');
  a.className = 'mono spine-link';
  a.href = `#/${route}/${encodeURIComponent(value)}`;
  a.textContent = shortHash(value, 14, 6);
  a.title = value;
  wrap.appendChild(a);
  return wrap;
}
