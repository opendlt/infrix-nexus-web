// Nexus — execution-graph renderer.
//
// NEXUS-REIMAGINED-2026-05-10 Phase 4 — Execution Cinema.
//
// Renders the rich projection returned by the nexus.executionGraph
// RPC into a single live-execution canvas:
//
//   1. Header strip — current spine stage + waiting state badge
//   2. Plan + outcome summary grid
//   3. Causal-failure panel (only when overallStatus == "failed")
//   4. Step-graph DAG with one card per node + dep edges
//   5. Plugin-fallback rail
//   6. Drift-warning rail
//   7. Event timeline
//   8. Replay control (only when replayAvailable)
//   9. Raw JSON details
//
// The DAG is laid out using a topological-sort algorithm so steps
// appear in dependency order. Each step card paints its left border
// in the spine-stage gradient (data-stage 1-7 → spine-1..spine-7) and
// wears a status-tinted right border (running / completed / failed /
// waiting). Dep edges show the lock state — a "blocking" edge looks
// muted; an "unlocked" edge animates a gentle pulse.

import { shortHash, formatTime, jsonBlock, hashChip } from '/lib/spineCommon.js';
import { severityBadge, sortBySeverity } from '/lib/severity.js';
import { mountDagRenderer } from '/lib/dagRenderer.js';
import { applyStepCardTransitions, applyFailureOverlay, applyAnchorWaitOnStageStrip } from '/lib/stepCardAnimations.js';

const STATUS_LABEL = {
  pending:           'pending',
  running:           'running',
  completed:         'done',
  failed:            'failed',
  skipped:           'skipped',
  waiting_approval:  'awaiting approval',
  waiting_anchor:    'awaiting proof',
  compensated:       'rolled back',
};
const STATUS_SEVERITY = {
  pending:           'normal',
  running:           'attention',
  completed:         'normal',
  failed:            'failed',
  skipped:           'attention',
  waiting_approval:  'attention',
  waiting_anchor:    'attention',
  compensated:       'attention',
};

/**
 * Render an execution-graph canvas.
 * @param {Object} graph  — nexus.executionGraph response
 * @param {Object} [opts]
 * @param {() => void} [opts.onReplay]
 * @returns {HTMLElement}
 */
export function renderExecutionGraph(graph, opts = {}) {
  const root = document.createElement('div');
  root.className = 'execution-graph';
  if (!graph || typeof graph !== 'object') {
    const empty = document.createElement('div');
    empty.className = 'dossier-empty';
    empty.textContent = 'No execution graph returned.';
    root.appendChild(empty);
    return root;
  }

  // 1. Spine-stage header strip
  root.appendChild(renderStageHeader(graph));

  // 2. Plan + outcome summary
  root.appendChild(renderPlanOutcomeSummary(graph));

  // 3. Causal failure panel (only when failure is set)
  if (graph.failure) {
    root.appendChild(renderFailurePanel(graph.failure));
  }

  // 4. DAG of steps
  root.appendChild(renderStepDAG(graph));

  // 5. Plugin fallbacks rail
  if (Array.isArray(graph.pluginFallbacks) && graph.pluginFallbacks.length > 0) {
    root.appendChild(renderFallbackRail(graph.pluginFallbacks));
  }

  // 6. Drift warnings rail
  if (Array.isArray(graph.driftWarnings) && graph.driftWarnings.length > 0) {
    root.appendChild(renderDriftRail(graph.driftWarnings));
  }

  // 7. Event timeline
  if (Array.isArray(graph.events) && graph.events.length > 0) {
    root.appendChild(renderEventTimeline(graph.events));
  }

  // 8. Replay control
  if (graph.replayAvailable && typeof opts.onReplay === 'function') {
    const wrap = document.createElement('div');
    wrap.className = 'execution-replay-wrap';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'verify-btn execution-replay-btn';
    btn.textContent = 'Replay step-by-step';
    btn.addEventListener('click', () => opts.onReplay(graph));
    wrap.appendChild(btn);
    const note = document.createElement('p');
    note.className = 'execution-replay-note';
    note.textContent = 'Walk through what happened, one step at a time.';
    wrap.appendChild(note);
    root.appendChild(wrap);
  }

  // 9. Raw JSON
  const rawDetails = document.createElement('details');
  rawDetails.className = 'raw-details dossier-raw';
  const rawSum = document.createElement('summary');
  rawSum.textContent = 'Raw execution graph JSON';
  rawDetails.appendChild(rawSum);
  rawDetails.appendChild(jsonBlock(graph));
  root.appendChild(rawDetails);

  // E1C3 — wire state-transition animations + failure overlay +
  // anchor-wait differentiation. Run after the DOM is mounted so
  // querySelector finds the cards we just appended. We use
  // requestAnimationFrame so the very first paint applies the
  // anchor-wait class before the user sees the unstyled chip.
  const apply = () => {
    const dagHost = root.querySelector('.execution-dag');
    applyStepCardTransitions(dagHost);
    applyFailureOverlay(dagHost, graph.pathToFailure);
    const stageTrack = root.querySelector('.execution-stage-track');
    applyAnchorWaitOnStageStrip(stageTrack, graph);
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(apply);
  } else {
    setTimeout(apply, 0);
  }

  return root;
}

// =================================================================
// Header strip — current spine stage + waiting state
// =================================================================
function renderStageHeader(g) {
  const wrap = document.createElement('div');
  wrap.className = 'execution-stage-header';
  const stages = ['intent', 'plan', 'approval', 'execution', 'outcome', 'evidence', 'anchor'];
  const currentIdx = stages.indexOf(g.spineStage || 'execution');
  const track = document.createElement('div');
  track.className = 'execution-stage-track';
  stages.forEach((s, idx) => {
    const node = document.createElement('div');
    node.className = 'execution-stage-node';
    node.dataset.stage = String(idx + 1);
    if (idx < currentIdx) node.classList.add('done');
    if (idx === currentIdx) node.classList.add('active');
    const label = document.createElement('span');
    label.className = 'execution-stage-label';
    label.textContent = s;
    node.appendChild(label);
    track.appendChild(node);
  });
  wrap.appendChild(track);
  if (g.waiting) {
    const badge = document.createElement('span');
    badge.className = 'execution-waiting-badge';
    badge.dataset.kind = g.waiting;
    badge.textContent = formatWaiting(g.waiting);
    wrap.appendChild(badge);
  }
  return wrap;
}
function formatWaiting(w) {
  return ({
    intent_unknown:  'request not found',
    plan_pending:    'building plan…',
    executing:       'running',
    finalising:      'finalising result',
    anchoring:       'recording proof',
    failed:          'failed',
    compensated:     'rolled back',
  })[w] || w;
}

// =================================================================
// Plan + outcome summary
// =================================================================
function renderPlanOutcomeSummary(g) {
  const sec = panelSection('Plan & outcome');
  const grid = document.createElement('div');
  grid.className = 'dossier-summary-grid';
  if (g.intent) {
    grid.appendChild(metaRow('Intent', g.intent.id || '—'));
    grid.appendChild(metaRow('Actor', g.intent.actor || '—'));
  }
  if (g.plan) {
    grid.appendChild(metaRow('Plan ID', g.plan.id || g.planId || '—'));
    grid.appendChild(metaRowHash('Plan hash', g.plan.planHash));
    grid.appendChild(metaRow('Step count', String(g.plan.stepCount || 0)));
    grid.appendChild(metaRow('Total gas estimate', String(g.plan.totalGasEstimate || 0)));
    if (g.plan.driftThreshold) grid.appendChild(metaRow('Drift threshold', String(g.plan.driftThreshold)));
    if (g.plan.deadline) grid.appendChild(metaRow('Deadline', String(g.plan.deadline)));
  }
  if (g.outcome) {
    grid.appendChild(metaRow('Overall status', g.outcome.overallStatus || '—'));
    grid.appendChild(metaRow('Total gas used', String(g.outcome.totalGasUsed || 0)));
    if (g.outcome.gasDrift !== undefined) grid.appendChild(metaRow('Gas drift', g.outcome.gasDrift.toFixed ? g.outcome.gasDrift.toFixed(4) : String(g.outcome.gasDrift)));
    if (g.outcome.finality) grid.appendChild(metaRow('Finality', g.outcome.finality));
    if (g.outcome.anchorStatus) grid.appendChild(metaRow('Anchor', g.outcome.anchorStatus));
    if (g.outcome.evidenceBundleId) grid.appendChild(metaRow('Evidence bundle', shortHash(g.outcome.evidenceBundleId, 22, 6)));
  }
  sec.body.appendChild(grid);
  return sec.element;
}

// =================================================================
// Causal failure panel
// =================================================================
function renderFailurePanel(f) {
  const sec = panelSection('Failure causal panel');
  sec.element.classList.add('execution-failure-section');
  const grid = document.createElement('div');
  grid.className = 'dossier-summary-grid';
  grid.appendChild(metaRow('Overall status', f.overallStatus || '—'));
  if (f.failedStepId) grid.appendChild(metaRow('Failed step', f.failedStepId));
  if (f.failureClass) grid.appendChild(metaRow('Failure class', f.failureClass));
  if (f.lastSuccessfulStepId) grid.appendChild(metaRow('Last successful step', f.lastSuccessfulStepId));
  if (f.executedPluginId) grid.appendChild(metaRow('Executed plugin', f.executedPluginId));
  if (f.executedPluginVersion) grid.appendChild(metaRow('Plugin version', f.executedPluginVersion));
  if (f.compensationStatus) grid.appendChild(metaRow('Compensation', f.compensationStatus));
  if (f.error) grid.appendChild(metaRow('Error', f.error));
  if (f.finalityTransitionError) grid.appendChild(metaRow('Finality blocker', f.finalityTransitionError));
  sec.body.appendChild(grid);
  return sec.element;
}

// =================================================================
// Step DAG
// =================================================================
function renderStepDAG(g) {
  const sec = panelSection(`Steps (${(g.nodes || []).length})`);
  if (!Array.isArray(g.nodes) || g.nodes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'execution-empty';
    empty.textContent = 'No plan steps available — plan has not yet compiled.';
    sec.body.appendChild(empty);
    return sec.element;
  }
  const layout = topologicalLayout(g.nodes, g.edges || []);
  const wrap = document.createElement('div');
  wrap.className = 'execution-dag';
  for (const layer of layout) {
    const row = document.createElement('div');
    row.className = 'execution-dag-layer';
    for (const node of layer) {
      row.appendChild(renderStepCard(node, g));
    }
    wrap.appendChild(row);
  }
  sec.body.appendChild(wrap);
  // Mount the SVG-edge overlay on top of the wrap. The renderer
  // queries cards by data-step-id and draws cubic Bezier paths
  // between them; ResizeObserver/MutationObserver keep edges in sync
  // with layout shifts and re-renders.
  mountDagRenderer(wrap, g);
  return sec.element;
}

// topologicalLayout walks the graph computing layers — every node
// whose dependencies are satisfied lives in the same layer; the next
// layer is the set of nodes whose deps are now satisfied. For
// non-DAG-friendly inputs (cycles, unknown deps) it falls back to a
// single layer to avoid stalling.
function topologicalLayout(nodes, edges) {
  const incoming = new Map();
  const idToNode = new Map();
  for (const n of nodes) {
    idToNode.set(n.id, n);
    incoming.set(n.id, new Set());
  }
  for (const e of edges) {
    if (idToNode.has(e.to) && idToNode.has(e.from)) {
      incoming.get(e.to).add(e.from);
    }
  }
  const layers = [];
  const remaining = new Set(idToNode.keys());
  let safety = 16;
  while (remaining.size > 0 && safety-- > 0) {
    const layer = [];
    for (const id of Array.from(remaining)) {
      const inSet = incoming.get(id);
      const stillBlocked = Array.from(inSet).some((dep) => remaining.has(dep));
      if (!stillBlocked) layer.push(idToNode.get(id));
    }
    if (layer.length === 0) {
      // Cycle / unresolvable — emit remaining as one final layer.
      layer.push(...Array.from(remaining).map((id) => idToNode.get(id)));
    }
    layers.push(layer);
    for (const n of layer) remaining.delete(n.id);
  }
  return layers;
}

function renderStepCard(node, graph) {
  const card = document.createElement('div');
  card.className = `execution-step-card status-${node.status || 'pending'}`;
  card.dataset.stage = stageIndex(node.spineStage);
  // Stable ID for the DAG renderer to query against — the canonical
  // step ID from the executionGraph response. CSS.escape handles the
  // acc://... characters in upstream callers.
  card.dataset.stepId = node.id;

  // Header — name + type + severity badge
  const head = document.createElement('div');
  head.className = 'execution-step-head';
  const name = document.createElement('span');
  name.className = 'execution-step-name';
  name.textContent = node.name || node.id;
  head.appendChild(name);
  const type = document.createElement('span');
  type.className = 'execution-step-type mono';
  type.textContent = node.type || '';
  head.appendChild(type);
  card.appendChild(head);

  // Status pill
  const status = document.createElement('div');
  status.className = `execution-step-status status-${node.status || 'pending'}`;
  const sevLabel = STATUS_LABEL[node.status] || node.status || 'pending';
  status.textContent = sevLabel;
  status.appendChild(severityBadge(STATUS_SEVERITY[node.status] || 'normal'));
  card.appendChild(status);

  if (node.description) {
    const desc = document.createElement('p');
    desc.className = 'execution-step-desc';
    desc.textContent = node.description;
    card.appendChild(desc);
  }

  // Meta grid — gas planned/actual, target, plugin, trust, output
  const meta = document.createElement('div');
  meta.className = 'execution-step-meta';
  if (node.executionTarget) meta.appendChild(metaMicroRow('target', node.executionTarget));
  meta.appendChild(metaMicroRow('gas planned', String(node.gasPlanned || 0)));
  if (node.gasActual !== undefined) meta.appendChild(metaMicroRow('gas actual', String(node.gasActual)));
  if (node.gasDrift !== undefined && node.gasDrift !== 0) meta.appendChild(metaMicroRow('gas drift', node.gasDrift.toFixed ? node.gasDrift.toFixed(4) : String(node.gasDrift)));
  if (node.spineStage) meta.appendChild(metaMicroRow('spine', node.spineStage));
  if (node.pluginPlanned) meta.appendChild(metaMicroRow('plugin planned', node.pluginPlanned));
  if (node.pluginExecuted) {
    const ran = document.createElement('div');
    ran.className = 'execution-step-meta-row';
    const lbl = document.createElement('span');
    lbl.className = 'execution-step-meta-label';
    lbl.textContent = 'plugin executed';
    ran.appendChild(lbl);
    const val = document.createElement('span');
    val.className = 'execution-step-meta-value mono';
    val.textContent = node.pluginExecuted;
    if (node.pluginFallbackUsed) {
      val.classList.add('execution-fallback');
      val.title = 'Fallback plugin was used (primary failed transiently)';
    }
    ran.appendChild(val);
    meta.appendChild(ran);
  }
  if (node.trustProfileId) meta.appendChild(metaMicroRow('trust', `${node.trustProfileId} (${node.trustState || '?'})`));
  if (node.policyCondition) meta.appendChild(metaMicroRow('policy', node.policyCondition));
  if (node.outputHash) {
    const row = document.createElement('div');
    row.className = 'execution-step-meta-row';
    const lbl = document.createElement('span');
    lbl.className = 'execution-step-meta-label';
    lbl.textContent = 'output';
    row.appendChild(lbl);
    const val = document.createElement('span');
    val.className = 'execution-step-meta-value';
    val.appendChild(hashChip(node.outputHash, { head: 8, tail: 6 }));
    row.appendChild(val);
    meta.appendChild(row);
  }
  card.appendChild(meta);

  // Failure detail
  if (node.error || node.failureClass) {
    const f = document.createElement('div');
    f.className = 'execution-step-failure';
    f.textContent = `${node.failureClass || 'failed'}: ${node.error || ''}`;
    card.appendChild(f);
  }

  // Dependency hints
  if (Array.isArray(node.dependsOn) && node.dependsOn.length > 0) {
    const deps = document.createElement('div');
    deps.className = 'execution-step-deps mono';
    const lockedDeps = node.dependsOn.filter((dep) => {
      // Find that dep's node and check status
      const depNode = (graph.nodes || []).find((n) => n.id === dep);
      return !depNode || (depNode.status !== 'completed' && depNode.status !== 'success');
    });
    if (lockedDeps.length === 0) deps.classList.add('unlocked');
    deps.textContent = `← ${node.dependsOn.join(', ')}`;
    card.appendChild(deps);
  }

  return card;
}

function stageIndex(stage) {
  const idx = ['intent', 'plan', 'approval', 'execution', 'outcome', 'evidence', 'anchor'].indexOf(stage);
  return idx >= 0 ? String(idx + 1) : '4';
}

// =================================================================
// Plugin fallback rail
// =================================================================
function renderFallbackRail(rows) {
  const sec = panelSection(`Plugin fallbacks (${rows.length})`);
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = `dossier-risk-row risk-${r.severity || 'attention'}`;
    const head = document.createElement('div');
    head.className = 'cockpit-rail-row-head';
    const kind = document.createElement('span');
    kind.className = 'cockpit-rail-row-kind';
    kind.textContent = 'plugin fallback';
    head.appendChild(kind);
    head.appendChild(severityBadge(r.severity));
    row.appendChild(head);
    const msg = document.createElement('div');
    msg.className = 'cockpit-rail-row-msg';
    msg.textContent = r.message;
    row.appendChild(msg);
    const meta = document.createElement('div');
    meta.className = 'cockpit-rail-row-meta mono';
    meta.textContent = `${r.stepId} · planned: ${r.plannedPlugin} · executed: ${r.executedPlugin}`;
    row.appendChild(meta);
    sec.body.appendChild(row);
  }
  return sec.element;
}

// =================================================================
// Drift warnings rail
// =================================================================
function renderDriftRail(rows) {
  const sec = panelSection(`Drift warnings (${rows.length})`);
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = `dossier-risk-row risk-${r.severity || 'attention'}`;
    const head = document.createElement('div');
    head.className = 'cockpit-rail-row-head';
    const kind = document.createElement('span');
    kind.className = 'cockpit-rail-row-kind';
    kind.textContent = 'drift exceeded';
    head.appendChild(kind);
    head.appendChild(severityBadge(r.severity));
    row.appendChild(head);
    const msg = document.createElement('div');
    msg.className = 'cockpit-rail-row-msg';
    msg.textContent = r.message;
    row.appendChild(msg);
    const meta = document.createElement('div');
    meta.className = 'cockpit-rail-row-meta mono';
    meta.textContent = `${r.stepId} · planned: ${r.plannedGas} · actual: ${r.actualGas}`;
    row.appendChild(meta);
    sec.body.appendChild(row);
  }
  return sec.element;
}

// =================================================================
// Event timeline
// =================================================================
function renderEventTimeline(events) {
  const sec = panelSection(`Event timeline (${events.length})`);
  const tbl = document.createElement('table');
  tbl.className = 'dossier-table execution-events-table';
  tbl.innerHTML = '<thead><tr><th>Kind</th><th>When</th><th>Object</th><th>Detail</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const e of events) {
    const tr = document.createElement('tr');
    tr.appendChild(td(e.kind || '—', 'mono'));
    tr.appendChild(td(formatTime(e.timestamp) || '—', 'mono'));
    tr.appendChild(td(shortHash(e.objectId || '', 22, 6), 'mono'));
    const detail = [];
    if (e.identity) detail.push('identity: ' + e.identity);
    if (e.role) detail.push('role: ' + e.role);
    if (e.status) detail.push('status: ' + e.status);
    tr.appendChild(td(detail.join(' · ') || '—'));
    tbody.appendChild(tr);
  }
  tbl.appendChild(tbody);
  sec.body.appendChild(tbl);
  return sec.element;
}

// =================================================================
// Helpers
// =================================================================
function panelSection(title) {
  const wrap = document.createElement('details');
  wrap.className = 'dossier-section execution-section';
  wrap.open = true;
  const sum = document.createElement('summary');
  sum.className = 'dossier-section-head';
  sum.textContent = title;
  wrap.appendChild(sum);
  const body = document.createElement('div');
  body.className = 'dossier-section-body';
  wrap.appendChild(body);
  return { element: wrap, body };
}
function metaRow(label, value) {
  const row = document.createElement('div');
  row.className = 'cockpit-compose-meta-row';
  const l = document.createElement('span');
  l.className = 'cockpit-compose-meta-label';
  l.textContent = label;
  row.appendChild(l);
  const v = document.createElement('span');
  v.className = 'cockpit-compose-meta-value mono';
  v.textContent = String(value);
  row.appendChild(v);
  return row;
}
function metaMicroRow(label, value) {
  const row = document.createElement('div');
  row.className = 'execution-step-meta-row';
  const l = document.createElement('span');
  l.className = 'execution-step-meta-label';
  l.textContent = label;
  row.appendChild(l);
  const v = document.createElement('span');
  v.className = 'execution-step-meta-value mono';
  v.textContent = String(value);
  row.appendChild(v);
  return row;
}
function metaRowHash(label, hashStr) {
  const row = document.createElement('div');
  row.className = 'cockpit-compose-meta-row';
  const l = document.createElement('span');
  l.className = 'cockpit-compose-meta-label';
  l.textContent = label;
  row.appendChild(l);
  const v = document.createElement('span');
  v.className = 'cockpit-compose-meta-value';
  if (hashStr) v.appendChild(hashChip(hashStr, { head: 10, tail: 8 }));
  else { v.classList.add('mono'); v.textContent = '—'; }
  row.appendChild(v);
  return row;
}
function td(text, cls) {
  const c = document.createElement('td');
  if (cls) c.className = cls;
  c.textContent = String(text == null ? '' : text);
  return c;
}
