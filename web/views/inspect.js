// Nexus — INSPECT mode.
//
// The cockpit's microscope. One intent fills the canvas. The
// canonical 7-stage pipeline is rendered prominently at top with
// each stage as a clickable tile. Click a tile → that stage's
// full detail fills the focus pane below. Right rail lists every
// "involved entity" — plugin / policy / trust / role / capability —
// that touched this intent. Each row opens a side drawer with the
// entity's full detail, never leaving the intent's flow.

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
import {
  openPluginDrawer,
  openTrustDrawer,
  openPolicyDecisionDrawer,
  openRoleDrawer,
  openCapabilityDrawer,
  closeAllDrawers,
} from '/lib/drawer.js';

const STAGE_DEFS = [
  { key: 'intent',    label: 'Intent',    blurb: 'goal submitted' },
  { key: 'plan',      label: 'Plan',      blurb: 'compiled + hashed' },
  { key: 'approval',  label: 'Approval',  blurb: 'signers + waivers' },
  { key: 'execution', label: 'Execution', blurb: 'plugins fire' },
  { key: 'outcome',   label: 'Outcome',   blurb: 'finality bound' },
  { key: 'evidence',  label: 'Evidence',  blurb: 'hash chain sealed' },
  { key: 'anchor',    label: 'Anchor',    blurb: 'L0 commitment' },
];

let rootEl = null;
let currentSubpath = [];
let activeStageKey = 'intent';
let cache = {};

export const inspectView = {
  mount(root, subpath) {
    rootEl = root;
    currentSubpath = Array.isArray(subpath) ? subpath : [];
    activeStageKey = 'intent';
    cache = {};
    closeAllDrawers();
    render();
  },
  onSubpathChange(subpath) {
    currentSubpath = Array.isArray(subpath) ? subpath : [];
    activeStageKey = 'intent';
    cache = {};
    closeAllDrawers();
    render();
  },
};

function render() {
  if (!rootEl) return;
  if (currentSubpath.length === 0) {
    renderLanding();
    return;
  }
  renderInspect(currentSubpath[0]);
}

// =================================================================
// LANDING (no intent selected)
// =================================================================
async function renderLanding() {
  rootEl.replaceChildren();
  const wrap = document.createElement('div');
  wrap.className = 'inspect-landing';
  const head = document.createElement('div');
  head.className = 'inspect-landing-head';
  const h = document.createElement('h1');
  h.textContent = 'Inspect';
  head.appendChild(h);
  const sub = document.createElement('p');
  sub.textContent = 'Choose an intent to inspect its full spine flow — plan, approvals, executions, outcome, evidence, anchor — together with every plugin, policy, and trust profile that fired during it.';
  head.appendChild(sub);
  wrap.appendChild(head);

  const form = document.createElement('div');
  form.className = 'inspect-landing-form';
  const lbl = document.createElement('label');
  lbl.textContent = 'Paste an intent ID';
  form.appendChild(lbl);
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inspect-landing-input';
  input.placeholder = 'intent-acc://test.acme-1778…';
  input.spellcheck = false;
  input.autocomplete = 'off';
  form.appendChild(input);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'verify-btn';
  btn.textContent = 'Inspect';
  btn.addEventListener('click', () => {
    const v = input.value.trim();
    if (v) window.location.hash = '#/inspect/' + encodeURIComponent(v);
  });
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') btn.click(); });
  form.appendChild(btn);
  wrap.appendChild(form);

  // Recent intents quick-pick
  const recentHead = document.createElement('div');
  recentHead.className = 'inspect-landing-recent-head';
  recentHead.textContent = 'Recent intents';
  wrap.appendChild(recentHead);
  const recentList = document.createElement('div');
  recentList.className = 'inspect-landing-recent';
  recentList.appendChild(loadingNode('Loading recent intents…'));
  wrap.appendChild(recentList);

  rootEl.appendChild(wrap);
  try {
    const r = await rpcWithDisclosure('explorer.recentIntents', { limit: 20 });
    const intents = (r && r.intents) || [];
    recentList.replaceChildren();
    if (intents.length === 0) {
      recentList.appendChild(emptyState('No intents yet — submit one via the CLI to see the spine traverse.'));
      return;
    }
    for (const intent of intents) {
      const row = document.createElement('a');
      row.className = 'inspect-recent-row';
      row.href = '#/inspect/' + encodeURIComponent(intent.id);
      const idEl = document.createElement('span');
      idEl.className = 'mono inspect-recent-id';
      idEl.textContent = shortHash(intent.id, 22, 6);
      row.appendChild(idEl);
      const goal = document.createElement('span');
      goal.className = 'inspect-recent-goal';
      goal.textContent = intent.goalType || '—';
      row.appendChild(goal);
      const dots = renderStageDots(intent.stages);
      row.appendChild(dots);
      const ts = document.createElement('span');
      ts.className = 'inspect-recent-ts';
      ts.textContent = formatTime(intent.created);
      row.appendChild(ts);
      recentList.appendChild(row);
    }
  } catch (err) {
    recentList.replaceChildren(errorNode(err));
  }
}

// =================================================================
// INSPECT (one intent)
// =================================================================
async function renderInspect(intentId) {
  rootEl.replaceChildren();

  // Layout: top breadcrumb, stage tiles, focus pane, right rail
  const layout = document.createElement('div');
  layout.className = 'inspect-layout';
  rootEl.appendChild(layout);

  const main = document.createElement('div');
  main.className = 'inspect-main';
  layout.appendChild(main);

  const rail = document.createElement('aside');
  rail.className = 'inspect-rail';
  rail.id = 'inspect-rail';
  layout.appendChild(rail);

  // Breadcrumb
  const crumb = document.createElement('div');
  crumb.className = 'inspect-crumb';
  const crumbBack = document.createElement('a');
  crumbBack.href = '#/live';
  crumbBack.textContent = '← Live';
  crumbBack.className = 'inspect-crumb-back';
  crumb.appendChild(crumbBack);
  const crumbId = document.createElement('span');
  crumbId.className = 'mono inspect-crumb-id';
  crumbId.textContent = intentId;
  crumb.appendChild(crumbId);
  const crumbState = document.createElement('span');
  crumbState.id = 'inspect-crumb-state';
  crumb.appendChild(crumbState);
  main.appendChild(crumb);

  // Stage tiles
  const stagesWrap = document.createElement('div');
  stagesWrap.className = 'inspect-stages';
  for (let i = 0; i < STAGE_DEFS.length; i++) {
    const def = STAGE_DEFS[i];
    const tile = document.createElement('button');
    tile.className = 'inspect-tile';
    tile.dataset.stage = String(i + 1);
    tile.dataset.key = def.key;
    tile.addEventListener('click', () => {
      activeStageKey = def.key;
      updateActiveTile();
      renderFocus();
    });

    const dot = document.createElement('div');
    dot.className = 'stage-dot';
    dot.dataset.stage = String(i + 1);
    tile.appendChild(dot);

    const num = document.createElement('span');
    num.className = 'inspect-tile-num';
    num.textContent = String(i + 1);
    tile.appendChild(num);

    const name = document.createElement('span');
    name.className = 'inspect-tile-name';
    name.textContent = def.label;
    tile.appendChild(name);

    const status = document.createElement('span');
    status.className = 'inspect-tile-status';
    status.id = `inspect-tile-status-${def.key}`;
    status.textContent = '·';
    tile.appendChild(status);

    stagesWrap.appendChild(tile);
    if (i < STAGE_DEFS.length - 1) {
      const conn = document.createElement('div');
      conn.className = 'inspect-tile-conn';
      conn.id = `inspect-tile-conn-${i}`;
      stagesWrap.appendChild(conn);
    }
  }
  main.appendChild(stagesWrap);

  // Focus pane
  const focus = document.createElement('div');
  focus.className = 'inspect-focus';
  focus.id = 'inspect-focus';
  focus.appendChild(loadingNode('Loading…'));
  main.appendChild(focus);

  // Right rail content (loading)
  rail.appendChild(loadingNode('Loading involved entities…'));

  // Parallel-fetch every layer for this intent.
  const [intentObj, recentResp] = await Promise.all([
    rpcWithDisclosure('intent.get', { id: intentId }).catch((e) => ({ error: e })),
    rpcWithDisclosure('explorer.recentIntents', { limit: 200 }).catch(() => null),
  ]);
  const spineRow = recentResp && Array.isArray(recentResp.intents)
    ? recentResp.intents.find((r) => r.id === intentId) : null;

  if (intentObj && intentObj.error) { focus.replaceChildren(errorNode(intentObj.error)); return; }
  if (!intentObj) { focus.replaceChildren(errorNode(new Error('intent not found'))); return; }

  cache.intent = intentObj;
  cache.spineRow = spineRow;

  // Update tiles + crumb state
  if (spineRow && spineRow.stages) {
    const stages = spineRow.stages;
    stages.forEach((s, i) => {
      const def = STAGE_DEFS[i];
      const tile = main.querySelector(`.inspect-tile[data-key="${def.key}"]`);
      if (!tile) return;
      tile.classList.toggle('done', !!s.completed);
      tile.classList.toggle('failed', !!s.failed);
      const status = tile.querySelector('.inspect-tile-status');
      status.textContent = s.completed ? '✓' : (s.failed ? '✗' : '○');
      const conn = main.querySelector(`#inspect-tile-conn-${i}`);
      if (conn && i < stages.length - 1) {
        conn.classList.toggle('done', !!(s.completed && stages[i + 1].completed));
      }
    });
  }
  crumbState.appendChild(statusPill(intentObj.state || intentObj.State || '—', stateClass(spineRow)));

  // Resolve every layer in parallel and stash into cache.
  const planID = (spineRow && spineRow.planId) || ('plan-' + intentId);
  const evidenceID = spineRow && spineRow.evidenceId;
  const anchorID = spineRow && spineRow.anchorRecordId;

  const [planObj, approvalsResp, outcomeObj, evidenceObj, anchorObj, policiesResp, anchorChainResp] = await Promise.all([
    rpcWithDisclosure('explorer.planGet', { id: planID }).catch(() => null),
    rpcWithDisclosure('explorer.approvalByPlan', { planId: planID }).catch(() => null),
    spineRow && spineRow.outcomeId
      ? rpcWithDisclosure('explorer.outcomeGet', { id: spineRow.outcomeId }).catch(() => null) : Promise.resolve(null),
    evidenceID ? rpcWithDisclosure('evidence.get', { id: evidenceID }).catch(() => null) : Promise.resolve(null),
    anchorID ? rpcWithDisclosure('explorer.anchorGet', { id: anchorID }).catch(() => null) : Promise.resolve(null),
    rpcWithDisclosure('explorer.policyDecisionTrace', { intentId }).catch(() => null),
    anchorID ? rpcWithDisclosure('explorer.anchorChain', { startId: anchorID, maxDepth: 50 }).catch(() => null) : Promise.resolve(null),
  ]);

  cache.plan = planObj;
  cache.approvals = approvalsResp;
  cache.outcome = outcomeObj;
  cache.evidence = evidenceObj;
  cache.anchor = anchorObj;
  cache.policies = policiesResp;
  cache.anchorChain = anchorChainResp;
  cache.evidenceID = evidenceID;

  updateActiveTile();
  renderFocus();
  renderRail(rail);
}

function stateClass(intent) {
  if (!intent) return 'warn';
  const s = (intent.state || '').toLowerCase();
  if (s === 'failed') return 'alert';
  if (s === 'completed' || intent.anchorRecordId) return 'ok';
  if (s === 'resolved') return 'info';
  return 'warn';
}

function updateActiveTile() {
  if (!rootEl) return;
  const tiles = rootEl.querySelectorAll('.inspect-tile');
  tiles.forEach((t) => {
    t.classList.toggle('active', t.dataset.key === activeStageKey);
  });
}

// -----------------------------------------------------------------
// Stage focus pane
// -----------------------------------------------------------------
function renderFocus() {
  const focus = document.getElementById('inspect-focus');
  if (!focus) return;
  focus.replaceChildren();
  switch (activeStageKey) {
    case 'intent':    return focus.appendChild(renderIntentFocus());
    case 'plan':      return focus.appendChild(renderPlanFocus());
    case 'approval':  return focus.appendChild(renderApprovalFocus());
    case 'execution': return focus.appendChild(renderExecutionFocus());
    case 'outcome':   return focus.appendChild(renderOutcomeFocus());
    case 'evidence':  return focus.appendChild(renderEvidenceFocus());
    case 'anchor':    return focus.appendChild(renderAnchorFocus());
  }
}

function renderIntentFocus() {
  const wrap = document.createElement('div');
  const obj = cache.intent;
  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  const meta = document.createElement('div');
  meta.appendChild(kvRow('Goal type', readField(obj, 'goalType') || readField(obj, 'GoalType')));
  meta.appendChild(kvRow('Actor', readField(obj, 'userAddress') || readField(obj, 'UserAddress') || (cache.spineRow && cache.spineRow.actor)));
  meta.appendChild(kvRow('Submitted at', formatTime(obj.created || obj.Created)));
  meta.appendChild(kvRow('Last updated', formatTime(obj.updated || obj.Updated)));
  meta.appendChild(kvRow('State', statusPill(obj.state || obj.State || '—', stateClass(cache.spineRow))));
  if (cache.spineRow && cache.spineRow.evidenceLevel) meta.appendChild(kvRow('Evidence level', cache.spineRow.evidenceLevel));
  grid.appendChild(card('Intent envelope', meta));
  const goal = extractGoal(obj);
  if (goal) grid.appendChild(card('Goal payload', jsonBlock(goal)));
  wrap.appendChild(grid);
  return wrap;
}

function renderPlanFocus() {
  const wrap = document.createElement('div');
  const plan = cache.plan;
  if (!plan) { wrap.appendChild(emptyState('No plan record persisted yet.')); return wrap; }
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
  meta.appendChild(kvRow('State', statusPill(plan.state || 'generated', 'info')));
  grid.appendChild(card('Plan envelope', meta));
  const note = document.createElement('div');
  note.appendChild(document.createTextNode(
    'Approvals on this plan committed to its hash. Drift in ghost evidence or rule pack between approval and execution invalidates the binding (P1-005).'
  ));
  grid.appendChild(card('Plan-hash commitment', note));
  wrap.appendChild(grid);
  return wrap;
}

function renderApprovalFocus() {
  const wrap = document.createElement('div');
  const approvals = (cache.approvals && Array.isArray(cache.approvals.approvals)) ? cache.approvals.approvals : [];
  const bundleApprovals = bundleApprovalEvidence(cache.evidence);
  if (approvals.length === 0 && bundleApprovals.length === 0) {
    wrap.appendChild(emptyState('No approvals required (waived under the dev-test policy or admin-bootstrap goal).'));
    return wrap;
  }
  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  if (approvals.length > 0) {
    const list = document.createElement('div');
    list.className = 'approval-mini-list';
    for (const a of approvals) {
      const row = document.createElement('div');
      row.className = 'approval-mini-row';
      const id = document.createElement('span');
      id.className = 'mono';
      id.textContent = shortHash(a.id || a.ID, 16, 6);
      row.appendChild(id);
      const state = readField(a, 'state') || readField(a, 'State') || a.state || 'pending';
      row.appendChild(statusPill(state, state === 'granted' ? 'ok' : 'warn'));
      list.appendChild(row);
    }
    grid.appendChild(card(`Approval envelopes (${approvals.length})`, list));
  }
  if (bundleApprovals.length > 0) {
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
      r.style.cursor = 'pointer';
      r.style.color = 'var(--accent)';
      r.addEventListener('click', () => openRoleDrawer(role));
      row.appendChild(r);
      const ph = a.planHash || a.PlanHash;
      if (ph) row.appendChild(hashChip(ph, { head: 10, tail: 6 }));
      list.appendChild(row);
    }
    grid.appendChild(card(`Approval evidence on bundle (${bundleApprovals.length})`, list));
  }
  wrap.appendChild(grid);
  return wrap;
}

function renderExecutionFocus() {
  const wrap = document.createElement('div');
  const evidenceObj = cache.evidence;
  if (!evidenceObj) { wrap.appendChild(emptyState('No execution traces — evidence bundle not yet captured.')); return wrap; }
  const f = evidenceObj.fields || evidenceObj.Fields || {};
  let steps = f.StepOutcomes || f.stepOutcomes;
  if (typeof steps === 'string') { try { steps = JSON.parse(steps); } catch (e) { steps = []; } }
  if (!Array.isArray(steps) || steps.length === 0) {
    wrap.appendChild(emptyState('No per-step traces in the bundle.')); return wrap;
  }
  const table = document.createElement('table');
  table.className = 'spine-table';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const c of ['Step', 'Status', 'Gas planned', 'Gas actual', 'Drift', 'Output hash']) {
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
    const oh = document.createElement('td');
    const ohash = s.outputHash || s.OutputHash;
    if (ohash) oh.appendChild(hashChip(ohash, { head: 10, tail: 6 }));
    else oh.textContent = '—';
    r.appendChild(oh);
    tbody.appendChild(r);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  // Errors
  const errors = steps.filter((s) => (s.error || s.Error || '').length > 0);
  if (errors.length > 0) {
    for (const e of errors) {
      const row = document.createElement('div');
      row.className = 'spine-error';
      row.style.marginTop = '8px';
      row.textContent = `${e.stageId || e.StageID}: ${e.error || e.Error}`;
      wrap.appendChild(row);
    }
  }
  return wrap;
}

function renderOutcomeFocus() {
  const wrap = document.createElement('div');
  const outcome = cache.outcome;
  if (!outcome) { wrap.appendChild(emptyState('No outcome record persisted yet.')); return wrap; }
  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  const meta = document.createElement('div');
  meta.appendChild(kvRow('Outcome ID', outcome.id || outcome.ID));
  meta.appendChild(kvRow('Overall status', readField(outcome, 'OverallStatus')));
  meta.appendChild(kvRow('Finality', statusPill(readField(outcome, 'Finality') || 'provisional', finalityKind(readField(outcome, 'Finality')))));
  meta.appendChild(kvRow('Gas used', readField(outcome, 'TotalGasUsed')));
  meta.appendChild(kvRow('Gas planned', readField(outcome, 'TotalGasPlanned')));
  meta.appendChild(kvRow('Gas drift', formatPercent(readField(outcome, 'GasDrift'))));
  grid.appendChild(card('Outcome envelope', meta));
  const fin = document.createElement('div');
  fin.appendChild(renderFinalityFlow(readField(outcome, 'Finality')));
  grid.appendChild(card('Finality state machine', fin));
  wrap.appendChild(grid);
  return wrap;
}

function renderEvidenceFocus() {
  const wrap = document.createElement('div');
  const evidenceObj = cache.evidence;
  if (!evidenceObj) { wrap.appendChild(emptyState('Evidence bundle not yet captured.')); return wrap; }
  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  const meta = document.createElement('div');
  meta.appendChild(kvRow('Bundle ID', evidenceObj.id || evidenceObj.ID));
  meta.appendChild(kvRow('Level', statusPill(readField(evidenceObj, 'Level') || 'standard', 'info')));
  meta.appendChild(kvRow('Anchor status', statusPill(readField(evidenceObj, 'Anchor') || 'pending', readField(evidenceObj, 'Anchor') === 'anchored' ? 'ok' : 'warn')));
  meta.appendChild(kvRow('Bundle hash', hashChip(readField(evidenceObj, 'BundleHash'), { head: 12, tail: 8 })));
  meta.appendChild(kvRow('Sealed block', readField(evidenceObj, 'SealedBlockHeight')));
  grid.appendChild(card('Evidence bundle', meta));
  // 8-check
  const verifyBody = document.createElement('div');
  const vBtn = document.createElement('button');
  vBtn.type = 'button';
  vBtn.className = 'verify-btn';
  vBtn.textContent = 'Run 8-check verification';
  const vOut = document.createElement('div');
  vOut.className = 'verify-output';
  vBtn.addEventListener('click', async () => {
    vBtn.disabled = true;
    vOut.replaceChildren(loadingNode('Verifying…'));
    try {
      const r = await rpcWithDisclosure('evidence.verify', { id: cache.evidenceID });
      vOut.replaceChildren(renderVerificationResult(r));
    } catch (e) { vOut.replaceChildren(errorNode(e)); }
    finally { vBtn.disabled = false; }
  });
  verifyBody.appendChild(vBtn);
  verifyBody.appendChild(vOut);
  grid.appendChild(card('Inline verification', verifyBody));
  // Export
  const expBody = document.createElement('div');
  const eBtn = document.createElement('button');
  eBtn.type = 'button';
  eBtn.className = 'verify-btn';
  eBtn.textContent = 'Export portable package (JSON)';
  const eOut = document.createElement('div');
  eOut.className = 'verify-output';
  eBtn.addEventListener('click', async () => {
    eBtn.disabled = true;
    eOut.replaceChildren(loadingNode('Building…'));
    try {
      const pkg = await rpcWithDisclosure('explorer.evidenceExportPortable', { id: cache.evidenceID });
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `portable-${cache.evidenceID}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      const ok = document.createElement('div');
      ok.className = 'verify-summary verify-pass';
      ok.textContent = `✓ Portable package downloaded. Use Operate → Verify to validate offline.`;
      eOut.replaceChildren(ok);
    } catch (e) { eOut.replaceChildren(errorNode(e)); }
    finally { eBtn.disabled = false; }
  });
  expBody.appendChild(eBtn);
  expBody.appendChild(eOut);
  grid.appendChild(card('Portable export', expBody));
  wrap.appendChild(grid);
  return wrap;
}

function renderAnchorFocus() {
  const wrap = document.createElement('div');
  const anchorObj = cache.anchor;
  if (!anchorObj) { wrap.appendChild(emptyState('No anchor record yet.')); return wrap; }
  const f = anchorObj.fields || anchorObj.Fields || {};
  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  const meta = document.createElement('div');
  meta.appendChild(kvRow('Anchor ID', anchorObj.id || anchorObj.ID));
  meta.appendChild(kvRow('Artifact type', f.artifactType || f.ArtifactType));
  meta.appendChild(kvRow('Artifact hash', hashChip(f.artifactHash || f.ArtifactHash, { head: 12, tail: 8 })));
  meta.appendChild(kvRow('Anchor class', f.anchorType || f.AnchorType));
  meta.appendChild(kvRow('Anchor purpose', f.anchorPurpose || f.AnchorPurpose));
  meta.appendChild(kvRow('Status', statusPill(f.status || anchorObj.state || 'pending', (f.status === 'confirmed') ? 'ok' : 'warn')));
  if (f.l0TxHash) meta.appendChild(kvRow('L0 tx hash', hashChip(f.l0TxHash, { head: 12, tail: 8 })));
  if (f.l0BlockHeight !== undefined) meta.appendChild(kvRow('L0 block', f.l0BlockHeight));
  if (f.l0DataAccount) meta.appendChild(kvRow('L0 data account', f.l0DataAccount));
  grid.appendChild(card('L0 binding', meta));
  // Chain
  const chain = cache.anchorChain && Array.isArray(cache.anchorChain.chain) ? cache.anchorChain.chain : [];
  if (chain.length > 0) {
    const cb = document.createElement('div');
    const ol = document.createElement('ol');
    ol.className = 'anchor-chain-list';
    for (const link of chain.slice(0, 10)) {
      const li = document.createElement('li');
      const id = document.createElement('span');
      id.className = 'mono';
      id.textContent = shortHash(link.id, 14, 6);
      li.appendChild(id);
      const at = document.createElement('span');
      at.className = 'chain-at';
      at.textContent = ` ${link.artifactType || '?'} · block ${link.l0BlockHeight !== undefined ? link.l0BlockHeight : '?'}`;
      li.appendChild(at);
      ol.appendChild(li);
    }
    cb.appendChild(ol);
    grid.appendChild(card('Anchor chain', cb));
  }
  // L0 verify shortcut
  const verifyCard = document.createElement('div');
  verifyCard.appendChild(document.createTextNode(
    'Validate this anchor against the live Accumulate ledger entirely in your browser — no Infrix-server roundtrip.'
  ));
  verifyCard.appendChild(document.createElement('br'));
  verifyCard.appendChild(deeplinkButton('Open L0 cross-checker', 'operate', 'verify-l0'));
  grid.appendChild(card('Verify against L0', verifyCard));
  wrap.appendChild(grid);
  return wrap;
}

// -----------------------------------------------------------------
// Right rail — involved entities (plugins / policies / trust /
// roles / capabilities). Click any → opens a side drawer.
// -----------------------------------------------------------------
function renderRail(rail) {
  rail.replaceChildren();

  const head = document.createElement('div');
  head.className = 'inspect-rail-head';
  const h = document.createElement('h3');
  h.textContent = 'Involved entities';
  head.appendChild(h);
  const sub = document.createElement('p');
  sub.textContent = 'Plugins, policies, and trust profiles that fired during this intent. Click any to open its detail without leaving the spine flow.';
  head.appendChild(sub);
  rail.appendChild(head);

  // Plugins
  const plugins = bundlePluginVersions(cache.evidence);
  rail.appendChild(railSection('Plugins fired', plugins.length, plugins.map((p) => {
    const id = p.pluginId || p.PluginID;
    return {
      label: id,
      sub: `${p.version || p.Version || '—'}`,
      onClick: () => openPluginDrawer(id),
    };
  })));

  // Policies
  const policies = (cache.policies && cache.policies.decisions) || [];
  rail.appendChild(railSection('Policy decisions', policies.length, policies.map((d) => ({
    label: d.policyType,
    sub: `${d.decision} · rule ${d.ruleId || '—'}`,
    statusKind: d.decision === 'allow' ? 'ok' : 'alert',
    onClick: () => openPolicyDecisionDrawer(d),
  }))));

  // Trust
  const trust = bundleTrustAssumptions(cache.evidence);
  rail.appendChild(railSection('Trust profiles', trust.length, trust.map((t) => {
    const id = t.profileId || t.ProfileID;
    return {
      label: id,
      sub: t.evaluation || t.Evaluation || '—',
      statusKind: (t.evaluation || t.Evaluation) === 'passed' ? 'ok' : 'warn',
      onClick: () => openTrustDrawer(id),
    };
  })));

  // Roles (extracted from approval evidence)
  const roleSet = new Set();
  for (const a of bundleApprovalEvidence(cache.evidence)) {
    const r = a.role || a.Role;
    if (r) roleSet.add(r);
  }
  rail.appendChild(railSection('Roles consulted', roleSet.size, Array.from(roleSet).map((role) => ({
    label: role,
    sub: 'click to see holders',
    onClick: () => openRoleDrawer(role),
  }))));
}

function railSection(title, count, items) {
  const wrap = document.createElement('div');
  wrap.className = 'inspect-rail-section';
  const head = document.createElement('div');
  head.className = 'inspect-rail-section-head';
  head.innerHTML = `<span>${title}</span><span class="inspect-rail-count">${count}</span>`;
  wrap.appendChild(head);
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'inspect-rail-empty';
    empty.textContent = '— none —';
    wrap.appendChild(empty);
    return wrap;
  }
  for (const it of items) {
    const row = document.createElement('button');
    row.className = 'inspect-rail-row';
    row.type = 'button';
    if (it.statusKind) row.classList.add('rail-row-' + it.statusKind);
    const lbl = document.createElement('div');
    lbl.className = 'inspect-rail-label mono';
    lbl.textContent = it.label;
    row.appendChild(lbl);
    if (it.sub) {
      const s = document.createElement('div');
      s.className = 'inspect-rail-sub';
      s.textContent = it.sub;
      row.appendChild(s);
    }
    row.addEventListener('click', () => it.onClick());
    wrap.appendChild(row);
  }
  return wrap;
}

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------
function bundleApprovalEvidence(evidenceObj) {
  if (!evidenceObj) return [];
  const f = evidenceObj.fields || evidenceObj.Fields || {};
  let data = f.ApprovalEvidence || f.approvalEvidence;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = []; } }
  return Array.isArray(data) ? data : [];
}
function bundlePluginVersions(evidenceObj) {
  if (!evidenceObj) return [];
  const f = evidenceObj.fields || evidenceObj.Fields || {};
  let data = f.PluginVersions || f.pluginVersions;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = []; } }
  return Array.isArray(data) ? data : [];
}
function bundleTrustAssumptions(evidenceObj) {
  if (!evidenceObj) return [];
  const f = evidenceObj.fields || evidenceObj.Fields || {};
  let data = f.TrustAssumptions || f.trustAssumptions;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = []; } }
  return Array.isArray(data) ? data : [];
}

function extractGoal(obj) {
  const fields = (obj && (obj.fields || obj.Fields)) || {};
  const goalType = fields.GoalType || fields.goalType;
  const customParams = fields.CustomParams || fields.customParams || fields.Goal || fields.goal;
  if (!goalType && !customParams) return null;
  return { goalType: goalType || '', customParams: customParams || {} };
}
function td(text) {
  const t = document.createElement('td');
  t.textContent = (text === undefined || text === null) ? '—' : String(text);
  return t;
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
  if (reachedIdx === -1 && currentState) reachedIdx = states.findIndex((s) => s.label.toLowerCase() === String(currentState).toLowerCase());
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
function renderVerificationResult(result) {
  const wrap = document.createElement('div');
  const summary = document.createElement('div');
  summary.className = `verify-summary verify-${result.verified ? 'pass' : 'fail'}`;
  const passed = (result.checks || []).filter((c) => c.passed).length;
  const total = (result.checks || []).length;
  summary.textContent = `${result.verified ? '✓ All passed' : '✗ Failed'} — ${passed}/${total}`;
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
