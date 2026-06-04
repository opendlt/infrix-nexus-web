// Nexus — Outcomes view (list + detail).
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 2-E: outcome record with
// finality state machine (Provisional → LocallyFinal → L0AnchoredFinal),
// per-step results with FailureClass + trust snapshot, gas drift,
// approval evidence, and anchor binding cross-link.

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

export const outcomesView = {
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
  h.textContent = 'Outcomes';
  head.appendChild(h);
  const sub = document.createElement('p');
  sub.className = 'spine-section-sub';
  sub.textContent = 'Outcome records compare the planned execution to the actual run. Each row is one finalised plan.';
  head.appendChild(sub);
  rootEl.appendChild(head);

  const wrap = document.createElement('div');
  wrap.className = 'spine-table-wrap';
  wrap.appendChild(loadingNode('Loading outcomes…'));
  rootEl.appendChild(wrap);

  let resp;
  try {
    resp = await rpcWithDisclosure('explorer.outcomeList', { limit: 100 });
  } catch (err) {
    wrap.replaceChildren(errorNode(err));
    return;
  }
  const items = (resp && Array.isArray(resp.items)) ? resp.items : [];
  if (items.length === 0) {
    wrap.replaceChildren(emptyState('No outcome records yet. Outcomes appear here as soon as a plan completes.'));
    return;
  }

  const table = document.createElement('table');
  table.className = 'spine-table outcomes-table';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const c of ['ID', 'Plan ID', 'Intent ID', 'Status', 'Finality', 'Gas used / planned', 'Created']) {
    const th = document.createElement('th');
    th.textContent = c;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const o of items) tbody.appendChild(buildOutcomeRow(o));
  table.appendChild(tbody);
  wrap.replaceChildren(table);

  const meta = document.createElement('div');
  meta.className = 'spine-table-meta';
  meta.textContent = `${items.length} outcome${items.length === 1 ? '' : 's'} shown`;
  rootEl.appendChild(meta);
}

function buildOutcomeRow(o) {
  const tr = document.createElement('tr');
  tr.className = 'outcome-row';
  tr.addEventListener('click', () => {
    window.location.hash = '#/outcomes/' + encodeURIComponent(o.id || o.ID);
  });
  const idCell = document.createElement('td');
  idCell.className = 'mono';
  idCell.textContent = shortHash(o.id || o.ID, 14, 6);
  idCell.title = o.id || o.ID;
  tr.appendChild(idCell);

  const planCell = document.createElement('td');
  planCell.className = 'mono';
  const planID = readField(o, 'PlanID') || o.createdByPlanID || o.CreatedByPlanID;
  planCell.textContent = shortHash(planID, 14, 6);
  planCell.title = planID || '';
  tr.appendChild(planCell);

  const intentCell = document.createElement('td');
  intentCell.className = 'mono';
  const intentID = readField(o, 'InstanceID') || o.createdByIntentID || o.CreatedByIntentID;
  intentCell.textContent = shortHash(intentID, 14, 6);
  intentCell.title = intentID || '';
  tr.appendChild(intentCell);

  const statusCell = document.createElement('td');
  const status = readField(o, 'OverallStatus') || 'unknown';
  statusCell.appendChild(statusPill(status, status === 'completed' ? 'ok' : status === 'failed' ? 'alert' : 'warn'));
  tr.appendChild(statusCell);

  const finCell = document.createElement('td');
  const fin = readField(o, 'Finality') || '';
  finCell.appendChild(statusPill(fin || 'provisional', finalityKind(fin)));
  tr.appendChild(finCell);

  const gasCell = document.createElement('td');
  const used = readField(o, 'TotalGasUsed') || 0;
  const planned = readField(o, 'TotalGasPlanned') || 0;
  gasCell.textContent = `${used} / ${planned}`;
  tr.appendChild(gasCell);

  const createdCell = document.createElement('td');
  createdCell.textContent = formatTime(o.created || o.Created);
  tr.appendChild(createdCell);

  return tr;
}

function finalityKind(s) {
  switch (String(s)) {
    case 'L0AnchoredFinal':
    case 'l0_anchored_final':
      return 'ok';
    case 'LocallyFinal':
    case 'locally_final':
      return 'info';
    case 'failed':
    case 'Failed':
      return 'alert';
    default:
      return 'warn';
  }
}

// -----------------------------------------------------------------
// Detail
// -----------------------------------------------------------------
async function renderDetail(outcomeId) {
  rootEl.replaceChildren();

  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const back = document.createElement('a');
  back.className = 'spine-back';
  back.href = '#/outcomes';
  back.textContent = '← All outcomes';
  head.appendChild(back);
  const h = document.createElement('h2');
  h.className = 'mono';
  h.textContent = outcomeId;
  head.appendChild(h);
  rootEl.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  rootEl.appendChild(grid);

  let outcome;
  try {
    outcome = await rpcWithDisclosure('explorer.outcomeGet', { id: outcomeId });
  } catch (err) {
    grid.appendChild(errorNode(err));
    return;
  }
  if (!outcome) {
    grid.appendChild(errorNode(new Error('outcome not found')));
    return;
  }

  const planID = readField(outcome, 'PlanID') || outcome.createdByPlanID || outcome.CreatedByPlanID;
  const intentID = readField(outcome, 'InstanceID') || outcome.createdByIntentID || outcome.CreatedByIntentID;
  const status = readField(outcome, 'OverallStatus');
  const finality = readField(outcome, 'Finality');
  const used = readField(outcome, 'TotalGasUsed') || 0;
  const planned = readField(outcome, 'TotalGasPlanned') || 0;
  const drift = readField(outcome, 'GasDrift');
  const stepCount = readField(outcome, 'StepOutcomes');

  // Header
  const headerBody = document.createElement('div');
  headerBody.appendChild(kvRow('Status', statusPill(status || 'unknown', status === 'completed' ? 'ok' : status === 'failed' ? 'alert' : 'warn')));
  headerBody.appendChild(kvRow('Finality', statusPill(finality || 'provisional', finalityKind(finality))));
  if (planID) headerBody.appendChild(kvRow('Plan ID', shortHashLink(planID, 'plans')));
  if (intentID) headerBody.appendChild(kvRow('Intent ID', shortHashLink(intentID, 'intents')));
  headerBody.appendChild(kvRow('Gas used', used));
  headerBody.appendChild(kvRow('Gas planned', planned));
  if (drift !== undefined && drift !== null) headerBody.appendChild(kvRow('Gas drift', formatPercent(drift)));
  headerBody.appendChild(kvRow('Created at', formatTime(outcome.created || outcome.Created)));
  headerBody.appendChild(kvRow('Updated at', formatTime(outcome.updated || outcome.Updated)));
  grid.appendChild(card('Outcome envelope', headerBody));

  // Finality state machine visual
  const finalityBody = renderFinalityFlow(finality);
  grid.appendChild(card('Finality state machine', finalityBody));

  // Step summary (count + bar)
  const stepBody = document.createElement('div');
  if (stepCount !== undefined) {
    stepBody.appendChild(kvRow('Step outcomes recorded', stepCount));
  }
  stepBody.appendChild(document.createTextNode(
    'Per-step parameters, FailureClass, and trust snapshots live on the underlying step records (TypePlanStep) and the EvidenceBundle Chain.'
  ));
  grid.appendChild(card('Step outcomes', stepBody));

  // Cross-links
  const linksBody = document.createElement('div');
  linksBody.className = 'action-row';
  if (intentID) linksBody.appendChild(deeplinkButton('View intent', 'intents', intentID));
  if (planID) linksBody.appendChild(deeplinkButton('View plan', 'plans', planID));
  if (intentID) linksBody.appendChild(deeplinkButton('View evidence', 'evidence', '_byIntent', intentID));
  grid.appendChild(card('Cross-links', linksBody));

  // Raw
  const rawBody = document.createElement('details');
  rawBody.className = 'raw-details';
  const summary = document.createElement('summary');
  summary.textContent = 'Raw managed object';
  rawBody.appendChild(summary);
  rawBody.appendChild(jsonBlock(outcome));
  grid.appendChild(card('Inspect', rawBody));
}

function renderFinalityFlow(currentState) {
  const wrap = document.createElement('div');
  wrap.className = 'finality-flow';
  const states = [
    { label: 'Provisional', key: 'Provisional' },
    { label: 'Locally final', key: 'LocallyFinal' },
    { label: 'L0 anchored', key: 'L0AnchoredFinal' },
  ];
  let reachedIdx = states.findIndex((s) => s.key === currentState || s.key.toLowerCase() === String(currentState).toLowerCase());
  if (reachedIdx === -1 && currentState) {
    // Fall back to "currentState IS the label string"
    reachedIdx = states.findIndex((s) => s.label.toLowerCase() === String(currentState).toLowerCase());
  }
  states.forEach((s, idx) => {
    const stage = document.createElement('div');
    stage.className = 'finality-stage';
    if (idx <= reachedIdx) stage.classList.add('reached');
    if (idx === reachedIdx) stage.classList.add('current');
    stage.textContent = s.label;
    wrap.appendChild(stage);
    if (idx < states.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'finality-arrow';
      arrow.textContent = '→';
      wrap.appendChild(arrow);
    }
  });
  return wrap;
}

function shortHashLink(value, route) {
  const a = document.createElement('a');
  a.className = 'mono spine-link';
  a.href = `#/${route}/${encodeURIComponent(value)}`;
  a.textContent = shortHash(value, 14, 6);
  a.title = value;
  return a;
}

function formatPercent(d) {
  if (typeof d !== 'number') return String(d);
  const sign = d > 0 ? '+' : '';
  return `${sign}${(d * 100).toFixed(2)}%`;
}
