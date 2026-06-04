// Nexus — Intents view (list + UNIFIED SPINE DETAIL).
//
// The canonical spine is interconnected. Viewing a single intent
// surfaces the entire flow that ran for it: plan, approvals,
// per-step execution traces with the plugins that fired and the
// trust profiles that were evaluated, the outcome record with
// finality state, the evidence bundle with an inline 8-check
// verifier, the L0 anchor with an inline browser-side verifier,
// every policy decision recorded for the intent, and the plugin
// versions that committed evidence. Everything sits in one
// scrollable view with section anchors so an auditor can jump to
// any layer of the spine without leaving the page.
//
// The per-artifact tabs (Plans / Approvals / Outcomes / Evidence /
// Anchors / Policies / Plugins / Trust) remain as registry-style
// browsers for cross-intent queries ("show me every pending
// approval"), but the canonical "you are here" view is this one.

import {
  rpcWithDisclosure,
  shortHash,
  formatTime,
  renderStageDots,
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

export const intentsView = {
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
  if (currentSubpath.length === 0) renderList();
  else renderUnifiedDetail(currentSubpath[0]);
}

// =================================================================
// LIST
// =================================================================
async function renderList() {
  rootEl.replaceChildren();
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const h = document.createElement('h2');
  h.textContent = 'Intents';
  head.appendChild(h);
  const sub = document.createElement('p');
  sub.className = 'spine-section-sub';
  sub.textContent = 'The canonical entry point — every state-changing operation enters the spine here. Click a row to see the entire spine flow for that intent: plan, approvals, executions, outcome, evidence, anchor, policies, plugins, and trust profiles — all on one page.';
  head.appendChild(sub);
  rootEl.appendChild(head);

  rootEl.appendChild(renderFilterBar(() => renderList()));

  const tableWrap = document.createElement('div');
  tableWrap.className = 'spine-table-wrap';
  tableWrap.appendChild(loadingNode('Loading intents…'));
  rootEl.appendChild(tableWrap);

  let resp;
  try { resp = await rpcWithDisclosure('explorer.recentIntents', { limit: 100 }); }
  catch (err) { tableWrap.replaceChildren(errorNode(err)); return; }
  let intents = resp && Array.isArray(resp.intents) ? resp.intents : [];
  intents = applyFilters(intents);

  if (intents.length === 0) {
    tableWrap.replaceChildren(emptyState('No intents recorded yet. Submit one via `infrix intent submit` or the v4 REST surface.'));
    return;
  }

  const table = document.createElement('table');
  table.className = 'spine-table intents-table';
  table.appendChild(buildHeader(['ID', 'Goal type', 'Actor', 'Created', 'Stages', 'State']));
  const tbody = document.createElement('tbody');
  for (const intent of intents) tbody.appendChild(buildListRow(intent));
  table.appendChild(tbody);
  tableWrap.replaceChildren(table);

  const meta = document.createElement('div');
  meta.className = 'spine-table-meta';
  meta.textContent = `${intents.length} intent${intents.length === 1 ? '' : 's'} shown`;
  rootEl.appendChild(meta);
}

const filterState = { goalType: '', actor: '', state: '', anchored: '' };

function renderFilterBar(onChange) {
  const bar = document.createElement('div');
  bar.className = 'spine-filter-bar';
  bar.appendChild(textFilter('Goal type', filterState.goalType, (v) => { filterState.goalType = v; onChange(); }));
  bar.appendChild(textFilter('Actor', filterState.actor, (v) => { filterState.actor = v; onChange(); }));
  bar.appendChild(selectFilter('State', filterState.state, [
    { value: '', label: 'all' }, { value: 'pending', label: 'pending' },
    { value: 'resolved', label: 'resolved' }, { value: 'completed', label: 'completed' },
    { value: 'failed', label: 'failed' },
  ], (v) => { filterState.state = v; onChange(); }));
  bar.appendChild(selectFilter('Anchored?', filterState.anchored, [
    { value: '', label: 'either' }, { value: 'yes', label: 'anchored' }, { value: 'no', label: 'not anchored' },
  ], (v) => { filterState.anchored = v; onChange(); }));
  return bar;
}

function applyFilters(intents) {
  return intents.filter((i) => {
    if (filterState.goalType && !((i.goalType || '').toLowerCase().includes(filterState.goalType.toLowerCase()))) return false;
    if (filterState.actor && !((i.actor || '').toLowerCase().includes(filterState.actor.toLowerCase()))) return false;
    if (filterState.state && (i.state || '') !== filterState.state) return false;
    if (filterState.anchored === 'yes' && !i.anchorRecordId) return false;
    if (filterState.anchored === 'no' && i.anchorRecordId) return false;
    return true;
  });
}

function buildHeader(columns) {
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const c of columns) {
    const th = document.createElement('th');
    th.textContent = c;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  return thead;
}

function buildListRow(intent) {
  const tr = document.createElement('tr');
  tr.className = 'intent-row';
  tr.addEventListener('click', () => { window.location.hash = '#/intents/' + encodeURIComponent(intent.id || ''); });

  const idCell = document.createElement('td');
  const idChip = document.createElement('span');
  idChip.className = 'mono';
  idChip.textContent = shortHash(intent.id, 12, 6);
  idChip.title = intent.id;
  idCell.appendChild(idChip);
  tr.appendChild(idCell);

  const goalCell = document.createElement('td');
  goalCell.textContent = intent.goalType || '—';
  tr.appendChild(goalCell);

  const actorCell = document.createElement('td');
  actorCell.className = 'mono';
  actorCell.textContent = intent.actor || '—';
  actorCell.title = intent.actor || '';
  tr.appendChild(actorCell);

  const createdCell = document.createElement('td');
  createdCell.textContent = formatTime(intent.created);
  tr.appendChild(createdCell);

  const stagesCell = document.createElement('td');
  stagesCell.appendChild(renderStageDots(intent.stages));
  tr.appendChild(stagesCell);

  const stateCell = document.createElement('td');
  stateCell.appendChild(statusPill(intent.state || 'pending', stateClass(intent)));
  tr.appendChild(stateCell);

  return tr;
}

function stateClass(intent) {
  const s = (intent.state || '').toLowerCase();
  if (s === 'failed') return 'alert';
  if (s === 'completed' || intent.anchorRecordId) return 'ok';
  if (s === 'resolved') return 'info';
  return 'warn';
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
function selectFilter(label, value, options, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'spine-filter';
  const span = document.createElement('span');
  span.textContent = label;
  wrap.appendChild(span);
  const sel = document.createElement('select');
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === value) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  wrap.appendChild(sel);
  return wrap;
}

// =================================================================
// UNIFIED SPINE DETAIL
//
// Sections, in canonical spine order:
//   §1 Intent envelope + 7-stage progress
//   §2 Plan (hash, drift threshold, ghost evidence, steps)
//   §3 Approvals (signers, simulation binding, plan-hash match)
//   §4 Execution (per-step results with plugins + trust)
//   §5 Outcome (finality state, drift analysis)
//   §6 Evidence (chain links + inline 8-check verifier + portable export)
//   §7 Anchor (L0 binding + inline browser-side verifier)
//   §8 Policy decisions (every policy that fired, from the bundle)
//   §9 Plugins fired (PluginVersions from the bundle)
//   §10 Trust profiles (TrustAssumptions from the bundle)
// =================================================================
async function renderUnifiedDetail(intentId) {
  rootEl.replaceChildren();

  // Section navigator
  const nav = document.createElement('nav');
  nav.className = 'spine-section-nav';
  const navItems = [
    { id: 'intent',     label: '1. Intent' },
    { id: 'plan',       label: '2. Plan' },
    { id: 'approvals',  label: '3. Approvals' },
    { id: 'execution',  label: '4. Execution' },
    { id: 'outcome',    label: '5. Outcome' },
    { id: 'evidence',   label: '6. Evidence' },
    { id: 'anchor',     label: '7. Anchor' },
    { id: 'policies',   label: 'Policies' },
    { id: 'plugins',    label: 'Plugins' },
    { id: 'trust',      label: 'Trust' },
  ];
  const back = document.createElement('a');
  back.className = 'spine-back';
  back.href = '#/intents';
  back.textContent = '← All intents';
  nav.appendChild(back);
  for (const n of navItems) {
    const a = document.createElement('a');
    a.className = 'spine-section-jump';
    a.href = '#sec-' + n.id;
    a.textContent = n.label;
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      const target = document.getElementById('sec-' + n.id);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    nav.appendChild(a);
  }
  rootEl.appendChild(nav);

  // Header band
  const head = document.createElement('div');
  head.className = 'spine-detail-head';
  const idEl = document.createElement('h1');
  idEl.className = 'mono spine-detail-id';
  idEl.textContent = intentId;
  head.appendChild(idEl);
  const stateEl = document.createElement('div');
  stateEl.id = 'spine-detail-state';
  head.appendChild(stateEl);
  const stagesEl = document.createElement('div');
  stagesEl.id = 'spine-detail-stages';
  stagesEl.className = 'spine-detail-stages';
  head.appendChild(stagesEl);
  rootEl.appendChild(head);

  // Sections (containers; populated below)
  const main = document.createElement('div');
  main.className = 'spine-sections';
  for (const n of navItems) {
    const sec = document.createElement('section');
    sec.id = 'sec-' + n.id;
    sec.className = 'spine-section';
    sec.dataset.section = n.id;
    const h = document.createElement('h2');
    h.textContent = n.label;
    sec.appendChild(h);
    const body = document.createElement('div');
    body.className = 'spine-section-body';
    body.id = 'sec-body-' + n.id;
    body.appendChild(loadingNode('Loading…'));
    sec.appendChild(body);
    main.appendChild(sec);
  }
  rootEl.appendChild(main);

  // Parallel fetch every layer of the spine for this intent.
  const [intentObj, recentResp] = await Promise.all([
    rpcWithDisclosure('intent.get', { id: intentId }).catch((e) => ({ error: e })),
    rpcWithDisclosure('explorer.recentIntents', { limit: 200 }).catch(() => null),
  ]);
  const spineRow = recentResp && Array.isArray(recentResp.intents)
    ? recentResp.intents.find((r) => r.id === intentId)
    : null;

  if (intentObj && intentObj.error) {
    rootEl.appendChild(errorNode(intentObj.error));
    return;
  }
  if (!intentObj) {
    rootEl.appendChild(errorNode(new Error('intent not found')));
    return;
  }

  // Header — finality state + 7-stage progress
  if (spineRow && spineRow.stages) {
    const dots = renderStageDots(spineRow.stages);
    dots.classList.add('spine-stage-large');
    stagesEl.appendChild(dots);
    const finalityLabel = stageBlurb(spineRow.stages);
    const lbl = document.createElement('div');
    lbl.className = 'spine-stage-label';
    lbl.textContent = finalityLabel;
    stagesEl.appendChild(lbl);
  }
  stateEl.appendChild(statusPill(intentObj.state || intentObj.State || '—', stateClass(spineRow || {})));

  // Now resolve every downstream record in parallel.
  const planID = (spineRow && spineRow.planId) || ('plan-' + intentId);
  const evidenceID = spineRow && spineRow.evidenceId;
  const anchorID = spineRow && spineRow.anchorRecordId;

  const [planObj, approvalsResp, outcomeObj, evidenceObj, anchorObj, policiesResp, anchorChainResp] = await Promise.all([
    rpcWithDisclosure('explorer.planGet', { id: planID }).catch(() => null),
    rpcWithDisclosure('explorer.approvalByPlan', { planId: planID }).catch(() => null),
    spineRow && spineRow.outcomeId
      ? rpcWithDisclosure('explorer.outcomeGet', { id: spineRow.outcomeId }).catch(() => null)
      : Promise.resolve(null),
    evidenceID
      ? rpcWithDisclosure('evidence.get', { id: evidenceID }).catch(() => null)
      : Promise.resolve(null),
    anchorID
      ? rpcWithDisclosure('explorer.anchorGet', { id: anchorID }).catch(() => null)
      : Promise.resolve(null),
    rpcWithDisclosure('explorer.policyDecisionTrace', { intentId: intentId }).catch(() => null),
    anchorID
      ? rpcWithDisclosure('explorer.anchorChain', { startId: anchorID, maxDepth: 50 }).catch(() => null)
      : Promise.resolve(null),
  ]);

  // Render each section.
  renderIntentSection(byId('sec-body-intent'), intentObj, spineRow);
  renderPlanSection(byId('sec-body-plan'), planObj, planID);
  renderApprovalsSection(byId('sec-body-approvals'), approvalsResp, evidenceObj);
  renderExecutionSection(byId('sec-body-execution'), evidenceObj, planObj);
  renderOutcomeSection(byId('sec-body-outcome'), outcomeObj, anchorID);
  renderEvidenceSection(byId('sec-body-evidence'), evidenceObj, evidenceID);
  renderAnchorSection(byId('sec-body-anchor'), anchorObj, anchorChainResp);
  renderPoliciesSection(byId('sec-body-policies'), policiesResp);
  renderPluginsSection(byId('sec-body-plugins'), evidenceObj);
  renderTrustSection(byId('sec-body-trust'), evidenceObj);
}

const byId = (id) => document.getElementById(id);

function stageBlurb(stages) {
  if (!Array.isArray(stages)) return '';
  const reached = stages.filter((s) => s.completed).length;
  return `${reached} / ${stages.length} stages complete`;
}

// -----------------------------------------------------------------
// §1 INTENT ENVELOPE
// -----------------------------------------------------------------
function renderIntentSection(body, obj, spineRow) {
  body.replaceChildren();
  const grid = document.createElement('div');
  grid.className = 'detail-grid';

  const meta = document.createElement('div');
  meta.appendChild(kvRow('Goal type', readField(obj, 'goalType') || readField(obj, 'GoalType')));
  meta.appendChild(kvRow('Actor', readField(obj, 'userAddress') || readField(obj, 'UserAddress') || (spineRow && spineRow.actor)));
  meta.appendChild(kvRow('Submitted at', formatTime(obj.created || obj.Created)));
  meta.appendChild(kvRow('Last updated', formatTime(obj.updated || obj.Updated)));
  meta.appendChild(kvRow('State', statusPill(obj.state || obj.State || '—', stateClass(spineRow || {}))));
  if (spineRow && spineRow.evidenceLevel) meta.appendChild(kvRow('Evidence level', spineRow.evidenceLevel));
  grid.appendChild(card('Envelope', meta));

  const goal = extractGoal(obj);
  if (goal) grid.appendChild(card('Goal payload', jsonBlock(goal)));

  body.appendChild(grid);
}

function extractGoal(obj) {
  const fields = (obj && (obj.fields || obj.Fields)) || {};
  const goalType = fields.GoalType || fields.goalType;
  const customParams = fields.CustomParams || fields.customParams || fields.Goal || fields.goal;
  if (!goalType && !customParams) return null;
  return { goalType: goalType || '', customParams: customParams || {} };
}

// -----------------------------------------------------------------
// §2 PLAN
// -----------------------------------------------------------------
function renderPlanSection(body, plan, planID) {
  body.replaceChildren();
  if (!plan) {
    body.appendChild(emptyState(`No plan record found for ${planID}.`));
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'detail-grid';

  const meta = document.createElement('div');
  meta.appendChild(kvRow('Plan ID', plan.id || plan.ID));
  meta.appendChild(kvRow('Plan hash', hashChip(readField(plan, 'PlanHash'), { head: 12, tail: 8 })));
  meta.appendChild(kvRow('Workflow def', readField(plan, 'WorkflowDefID') || '—'));
  meta.appendChild(kvRow('Step count', readField(plan, 'StepCount')));
  meta.appendChild(kvRow('Total gas estimate', readField(plan, 'TotalGasEstimate')));
  meta.appendChild(kvRow('Required approvals', readField(plan, 'ApprovalCount')));
  meta.appendChild(kvRow('Created at', formatTime(plan.created || plan.Created)));
  meta.appendChild(kvRow('State', statusPill(plan.state || plan.State || '—', 'info')));
  grid.appendChild(card('Plan envelope', meta));

  // Plan-hash binding context — auditors care that this hash is what
  // the approval committed to, so we surface that explicitly.
  const binding = document.createElement('div');
  binding.appendChild(document.createTextNode(
    'Approvals on this plan committed to this exact hash. Any drift in ghost evidence or rule pack between approval and execution invalidates the binding (P1-005 cross-binding).'
  ));
  grid.appendChild(card('Plan-hash commitment', binding));

  body.appendChild(grid);
}

// -----------------------------------------------------------------
// §3 APPROVALS
// -----------------------------------------------------------------
function renderApprovalsSection(body, resp, evidenceObj) {
  body.replaceChildren();
  const approvals = (resp && Array.isArray(resp.approvals)) ? resp.approvals : [];

  // Pull approval evidence from the bundle as a parallel source.
  const bundleApprovals = (() => {
    if (!evidenceObj) return [];
    const f = evidenceObj.fields || evidenceObj.Fields || {};
    let data = f.ApprovalEvidence || f.approvalEvidence;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) { data = []; }
    }
    return Array.isArray(data) ? data : [];
  })();

  if (approvals.length === 0 && bundleApprovals.length === 0) {
    body.appendChild(emptyState('No approvals required for this plan (waived under the dev-test policy, or this is an admin-bootstrap goal).'));
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'detail-grid';

  if (approvals.length > 0) {
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
      const role = readField(a, 'Role');
      if (role) {
        const r = document.createElement('span');
        r.textContent = `role=${role}`;
        row.appendChild(r);
      }
      list.appendChild(row);
    }
    grid.appendChild(card(`Approval envelopes (${approvals.length})`, list));
  }

  if (bundleApprovals.length > 0) {
    const ev = document.createElement('div');
    const list = document.createElement('div');
    list.className = 'approval-mini-list';
    for (const a of bundleApprovals) {
      const row = document.createElement('div');
      row.className = 'approval-mini-row';
      const id = document.createElement('span');
      id.className = 'mono';
      id.textContent = a.identity || a.Identity || '—';
      row.appendChild(id);
      const role = a.role || a.Role || '—';
      const r = document.createElement('span');
      r.textContent = `role=${role}`;
      row.appendChild(r);
      const ph = a.planHash || a.PlanHash;
      if (ph) row.appendChild(hashChip(ph, { head: 10, tail: 6 }));
      const ts = a.signedAt || a.SignedAt;
      if (ts) {
        const t = document.createElement('span');
        t.className = 'history-ts mono';
        t.textContent = formatTime(ts);
        row.appendChild(t);
      }
      list.appendChild(row);
    }
    ev.appendChild(list);
    grid.appendChild(card(`Approval evidence on bundle (${bundleApprovals.length})`, ev));
  }

  body.appendChild(grid);
}

// -----------------------------------------------------------------
// §4 EXECUTION (per-step traces)
// -----------------------------------------------------------------
function renderExecutionSection(body, evidenceObj, plan) {
  body.replaceChildren();
  if (!evidenceObj) {
    body.appendChild(emptyState('No execution traces available — evidence bundle not yet captured.'));
    return;
  }
  const f = evidenceObj.fields || evidenceObj.Fields || {};
  let steps = f.StepOutcomes || f.stepOutcomes;
  if (typeof steps === 'string') {
    try { steps = JSON.parse(steps); } catch (e) { steps = []; }
  }
  if (!Array.isArray(steps) || steps.length === 0) {
    body.appendChild(emptyState('No per-step traces in the bundle (Light evidence level skips them).'));
    return;
  }

  const table = document.createElement('table');
  table.className = 'spine-table';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const c of ['Step', 'Status', 'Gas planned', 'Gas actual', 'Drift', 'Ghost match', 'Output hash']) {
    const th = document.createElement('th');
    th.textContent = c;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const s of steps) {
    const r = document.createElement('tr');
    const stage = document.createElement('td');
    stage.className = 'mono';
    stage.textContent = s.stageId || s.StageID || '—';
    r.appendChild(stage);
    const stCell = document.createElement('td');
    const stat = s.status || s.Status || '—';
    stCell.appendChild(statusPill(stat, stat === 'completed' || stat === 'success' ? 'ok' : (stat === 'failed' ? 'alert' : 'warn')));
    r.appendChild(stCell);
    r.appendChild(td(s.plannedGas || s.PlannedGas));
    r.appendChild(td(s.actualGas || s.ActualGas));
    r.appendChild(td(formatPercent(s.gasDrift || s.GasDrift)));
    r.appendChild(td(s.ghostStatusMatch || s.GhostStatusMatch ? '✓ matched' : '—'));
    const oh = document.createElement('td');
    const ohash = s.outputHash || s.OutputHash;
    if (ohash) oh.appendChild(hashChip(ohash, { head: 10, tail: 6 }));
    else oh.textContent = '—';
    r.appendChild(oh);
    tbody.appendChild(r);
  }
  table.appendChild(tbody);
  body.appendChild(table);

  // Errors callout (any step with a non-empty Error)
  const errors = steps.filter((s) => (s.error || s.Error || '').length > 0);
  if (errors.length > 0) {
    const errBlock = document.createElement('div');
    errBlock.style.marginTop = '12px';
    for (const e of errors) {
      const row = document.createElement('div');
      row.className = 'spine-error';
      row.textContent = `${e.stageId || e.StageID}: ${e.error || e.Error}`;
      errBlock.appendChild(row);
    }
    body.appendChild(errBlock);
  }
}

// -----------------------------------------------------------------
// §5 OUTCOME
// -----------------------------------------------------------------
function renderOutcomeSection(body, outcome, anchorID) {
  body.replaceChildren();
  if (!outcome) {
    body.appendChild(emptyState('No outcome record persisted for this intent yet.'));
    return;
  }
  const f = outcome.fields || outcome.Fields || {};
  const grid = document.createElement('div');
  grid.className = 'detail-grid';

  const meta = document.createElement('div');
  meta.appendChild(kvRow('Outcome ID', outcome.id || outcome.ID));
  meta.appendChild(kvRow('Overall status', readField(outcome, 'OverallStatus')));
  meta.appendChild(kvRow('Finality', statusPill(readField(outcome, 'Finality') || 'provisional', finalityKind(readField(outcome, 'Finality')))));
  meta.appendChild(kvRow('Gas used', readField(outcome, 'TotalGasUsed')));
  meta.appendChild(kvRow('Gas planned', readField(outcome, 'TotalGasPlanned')));
  meta.appendChild(kvRow('Gas drift', formatPercent(readField(outcome, 'GasDrift'))));
  if (anchorID) meta.appendChild(kvRow('Anchor record', shortHashLink(anchorID, 'anchors')));
  grid.appendChild(card('Outcome envelope', meta));

  const fin = document.createElement('div');
  fin.appendChild(renderFinalityFlow(readField(outcome, 'Finality')));
  grid.appendChild(card('Finality state machine', fin));

  body.appendChild(grid);
}

// -----------------------------------------------------------------
// §6 EVIDENCE — with INLINE 8-CHECK VERIFIER + portable export
// -----------------------------------------------------------------
function renderEvidenceSection(body, evidenceObj, evidenceID) {
  body.replaceChildren();
  if (!evidenceObj) {
    body.appendChild(emptyState('Evidence bundle not yet captured.'));
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'detail-grid';

  const f = evidenceObj.fields || evidenceObj.Fields || {};
  const meta = document.createElement('div');
  meta.appendChild(kvRow('Bundle ID', evidenceObj.id || evidenceObj.ID));
  meta.appendChild(kvRow('Level', statusPill(readField(evidenceObj, 'Level') || 'standard', 'info')));
  meta.appendChild(kvRow('Anchor status', statusPill(readField(evidenceObj, 'Anchor') || 'pending', readField(evidenceObj, 'Anchor') === 'anchored' || readField(evidenceObj, 'Anchor') === 'verified' ? 'ok' : 'warn')));
  meta.appendChild(kvRow('Bundle hash', hashChip(readField(evidenceObj, 'BundleHash'), { head: 12, tail: 8 })));
  meta.appendChild(kvRow('Sealed block', readField(evidenceObj, 'SealedBlockHeight')));
  if (readField(evidenceObj, 'AnchorTxHash')) meta.appendChild(kvRow('L0 tx hash', hashChip(readField(evidenceObj, 'AnchorTxHash'), { head: 12, tail: 8 })));
  if (readField(evidenceObj, 'AnchorBlock')) meta.appendChild(kvRow('L0 block', readField(evidenceObj, 'AnchorBlock')));
  grid.appendChild(card('Evidence bundle', meta));

  // Inline 8-check verifier
  const verifyCard = document.createElement('div');
  const verifyBtn = document.createElement('button');
  verifyBtn.type = 'button';
  verifyBtn.className = 'verify-btn';
  verifyBtn.textContent = 'Run 8-check verification';
  const verifyOut = document.createElement('div');
  verifyOut.className = 'verify-output';
  verifyBtn.addEventListener('click', async () => {
    verifyBtn.disabled = true;
    verifyOut.replaceChildren(loadingNode('Running 8-check verifier…'));
    try {
      const result = await rpcWithDisclosure('evidence.verify', { id: evidenceID });
      verifyOut.replaceChildren(renderVerificationResult(result));
    } catch (err) {
      verifyOut.replaceChildren(errorNode(err));
    } finally {
      verifyBtn.disabled = false;
    }
  });
  verifyCard.appendChild(verifyBtn);
  verifyCard.appendChild(verifyOut);
  grid.appendChild(card('Inline verification', verifyCard));

  // Portable package export
  const exportCard = document.createElement('div');
  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'verify-btn';
  exportBtn.textContent = 'Export portable package (JSON)';
  const exportOut = document.createElement('div');
  exportOut.className = 'verify-output';
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    exportOut.replaceChildren(loadingNode('Building portable package…'));
    try {
      const pkg = await rpcWithDisclosure('explorer.evidenceExportPortable', { id: evidenceID });
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portable-${evidenceID}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      const ok = document.createElement('div');
      ok.className = 'verify-summary verify-pass';
      ok.textContent = `✓ Portable package downloaded. Use #/verify to validate offline.`;
      exportOut.replaceChildren(ok);
    } catch (err) {
      exportOut.replaceChildren(errorNode(err));
    } finally {
      exportBtn.disabled = false;
    }
  });
  exportCard.appendChild(exportBtn);
  exportCard.appendChild(exportOut);
  grid.appendChild(card('Portable export', exportCard));

  body.appendChild(grid);
}

function renderVerificationResult(result) {
  const wrap = document.createElement('div');
  const summary = document.createElement('div');
  summary.className = `verify-summary verify-${result.verified ? 'pass' : 'fail'}`;
  const passed = (result.checks || []).filter((c) => c.passed).length;
  const total = (result.checks || []).length;
  summary.textContent = `${result.verified ? '✓ All passed' : '✗ Failed'} — ${passed}/${total}${result.summary ? ' — ' + result.summary : ''}`;
  wrap.appendChild(summary);
  const list = document.createElement('ul');
  list.className = 'verify-checks';
  for (const c of (result.checks || [])) {
    const li = document.createElement('li');
    li.className = `verify-check verify-${c.passed ? 'pass' : 'fail'}`;
    const m = document.createElement('span');
    m.className = 'verify-mark';
    m.textContent = c.passed ? '✓' : '✗';
    li.appendChild(m);
    const n = document.createElement('span');
    n.className = 'verify-name';
    n.textContent = c.name;
    li.appendChild(n);
    if (c.detail) {
      const d = document.createElement('span');
      d.className = 'verify-detail';
      d.textContent = c.detail;
      li.appendChild(d);
    }
    if (c.error) {
      const e = document.createElement('span');
      e.className = 'verify-error';
      e.textContent = c.error;
      li.appendChild(e);
    }
    list.appendChild(li);
  }
  wrap.appendChild(list);
  return wrap;
}

// -----------------------------------------------------------------
// §7 ANCHOR — with anchor chain + inline L0 verifier
// -----------------------------------------------------------------
function renderAnchorSection(body, anchorObj, chainResp) {
  body.replaceChildren();
  if (!anchorObj) {
    body.appendChild(emptyState('No anchor record for this intent yet (anchor produced once evidence is finalised + L0 confirmation arrives).'));
    return;
  }
  const f = anchorObj.fields || anchorObj.Fields || {};
  const grid = document.createElement('div');
  grid.className = 'detail-grid';

  const meta = document.createElement('div');
  meta.appendChild(kvRow('Anchor ID', anchorObj.id || anchorObj.ID));
  meta.appendChild(kvRow('Artifact type', f.artifactType || f.ArtifactType));
  meta.appendChild(kvRow('Artifact hash', hashChip(f.artifactHash || f.ArtifactHash, { head: 12, tail: 8 })));
  meta.appendChild(kvRow('Anchor class', f.anchorType || f.AnchorType));
  meta.appendChild(kvRow('Anchor purpose', f.anchorPurpose || f.AnchorPurpose));
  meta.appendChild(kvRow('Status', statusPill(f.status || anchorObj.state || 'pending', (f.status === 'confirmed' || f.status === 'verified') ? 'ok' : 'warn')));
  if (f.l0TxHash) meta.appendChild(kvRow('L0 tx hash', hashChip(f.l0TxHash, { head: 12, tail: 8 })));
  if (f.l0BlockHeight !== undefined) meta.appendChild(kvRow('L0 block', f.l0BlockHeight));
  if (f.l0DataAccount) meta.appendChild(kvRow('L0 data account', f.l0DataAccount));
  grid.appendChild(card('L0 binding', meta));

  // Anchor chain (last ~10)
  const chain = chainResp && Array.isArray(chainResp.chain) ? chainResp.chain : [];
  if (chain.length > 0) {
    const cb = document.createElement('div');
    const ol = document.createElement('ol');
    ol.className = 'anchor-chain-list';
    for (const link of chain.slice(0, 10)) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.className = 'mono spine-link';
      a.href = '#/anchors/' + encodeURIComponent(link.id);
      a.textContent = shortHash(link.id, 14, 6);
      li.appendChild(a);
      const at = document.createElement('span');
      at.className = 'chain-at';
      at.textContent = ` ${link.artifactType || '?'} · block ${link.l0BlockHeight !== undefined ? link.l0BlockHeight : '?'}`;
      li.appendChild(at);
      ol.appendChild(li);
    }
    cb.appendChild(ol);
    const note = document.createElement('div');
    note.className = 'chain-note';
    note.textContent = `${chain.length} link${chain.length === 1 ? '' : 's'} (newest → oldest)`;
    cb.appendChild(note);
    grid.appendChild(card('Anchor chain', cb));
  }

  // Quick L0 verify shortcut
  const lcard = document.createElement('div');
  lcard.appendChild(document.createTextNode(
    'Open the operator-trust-free L0 cross-checker to validate this anchor against the live Accumulate ledger entirely in your browser.'
  ));
  lcard.appendChild(document.createElement('br'));
  lcard.appendChild(deeplinkButton('Open L0 verifier', 'verify', '_l0'));
  grid.appendChild(card('Verify against Accumulate L0', lcard));

  body.appendChild(grid);
}

// -----------------------------------------------------------------
// §8 POLICY DECISIONS — every policy that fired during this intent
// -----------------------------------------------------------------
function renderPoliciesSection(body, resp) {
  body.replaceChildren();
  const decisions = (resp && Array.isArray(resp.decisions)) ? resp.decisions : [];
  if (decisions.length === 0) {
    body.appendChild(emptyState('No policy decisions recorded on the bundle for this intent.'));
    return;
  }
  const table = document.createElement('table');
  table.className = 'spine-table';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const c of ['When', 'Type', 'Scope', 'Decision', 'Rule', 'Audit']) {
    const th = document.createElement('th');
    th.textContent = c;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const d of decisions) {
    const r = document.createElement('tr');
    r.appendChild(td(formatTime(d.timestamp)));
    r.appendChild(tdMono(d.policyType));
    r.appendChild(tdMono(d.scopeKey));
    const ds = document.createElement('td');
    ds.appendChild(statusPill(d.decision, d.decision === 'allow' ? 'ok' : 'alert'));
    r.appendChild(ds);
    r.appendChild(tdMono(d.ruleId || '—'));
    r.appendChild(td(d.auditMsg || ''));
    tbody.appendChild(r);
  }
  table.appendChild(tbody);
  body.appendChild(table);
}

// -----------------------------------------------------------------
// §9 PLUGINS FIRED — PluginVersions from the bundle
// -----------------------------------------------------------------
function renderPluginsSection(body, evidenceObj) {
  body.replaceChildren();
  if (!evidenceObj) {
    body.appendChild(emptyState('No plugin attribution available — evidence bundle not yet captured.'));
    return;
  }
  const f = evidenceObj.fields || evidenceObj.Fields || {};
  let plugins = f.PluginVersions || f.pluginVersions;
  if (typeof plugins === 'string') {
    try { plugins = JSON.parse(plugins); } catch (e) { plugins = []; }
  }
  if (!Array.isArray(plugins) || plugins.length === 0) {
    body.appendChild(emptyState('No plugin versions recorded on the bundle.'));
    return;
  }
  const table = document.createElement('table');
  table.className = 'spine-table';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const c of ['Plugin ID', 'Version', 'Implementation hash']) {
    const th = document.createElement('th');
    th.textContent = c;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const p of plugins) {
    const r = document.createElement('tr');
    r.style.cursor = 'pointer';
    const pid = p.pluginId || p.PluginID;
    r.addEventListener('click', () => {
      window.location.hash = '#/plugins/' + encodeURIComponent(pid);
    });
    r.appendChild(tdMono(pid));
    r.appendChild(td(p.version || p.Version || '—'));
    const ihCell = document.createElement('td');
    const ih = p.implementationHash || p.ImplementationHash;
    if (ih) ihCell.appendChild(hashChip(ih, { head: 12, tail: 8 }));
    else ihCell.textContent = '—';
    r.appendChild(ihCell);
    tbody.appendChild(r);
  }
  table.appendChild(tbody);
  body.appendChild(table);
}

// -----------------------------------------------------------------
// §10 TRUST PROFILES — TrustAssumptions from the bundle
// -----------------------------------------------------------------
function renderTrustSection(body, evidenceObj) {
  body.replaceChildren();
  if (!evidenceObj) {
    body.appendChild(emptyState('No trust attribution available — evidence bundle not yet captured.'));
    return;
  }
  const f = evidenceObj.fields || evidenceObj.Fields || {};
  let trust = f.TrustAssumptions || f.trustAssumptions;
  if (typeof trust === 'string') {
    try { trust = JSON.parse(trust); } catch (e) { trust = []; }
  }
  if (!Array.isArray(trust) || trust.length === 0) {
    body.appendChild(emptyState('No trust profiles recorded on the bundle.'));
    return;
  }
  const table = document.createElement('table');
  table.className = 'spine-table';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const c of ['Profile ID', 'Evaluation', 'Detail']) {
    const th = document.createElement('th');
    th.textContent = c;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const t of trust) {
    const r = document.createElement('tr');
    r.style.cursor = 'pointer';
    const pid = t.profileId || t.ProfileID;
    r.addEventListener('click', () => {
      window.location.hash = '#/trust/' + encodeURIComponent(pid);
    });
    r.appendChild(tdMono(pid));
    const ev = t.evaluation || t.Evaluation || '—';
    const evCell = document.createElement('td');
    evCell.appendChild(statusPill(ev, ev === 'passed' ? 'ok' : 'warn'));
    r.appendChild(evCell);
    r.appendChild(td(t.detail || t.Detail || ''));
    tbody.appendChild(r);
  }
  table.appendChild(tbody);
  body.appendChild(table);
}

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------
function td(text) {
  const t = document.createElement('td');
  t.textContent = (text === undefined || text === null) ? '—' : String(text);
  return t;
}
function tdMono(text) {
  const t = td(text);
  t.classList.add('mono');
  return t;
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
  if (typeof d !== 'number') return d ? String(d) : '—';
  const sign = d > 0 ? '+' : '';
  return `${sign}${(d * 100).toFixed(2)}%`;
}
function finalityKind(s) {
  switch (String(s)) {
    case 'L0AnchoredFinal': case 'l0_anchored_final': return 'ok';
    case 'LocallyFinal': case 'locally_final': return 'info';
    case 'failed': case 'Failed': return 'alert';
    default: return 'warn';
  }
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
