// Nexus — LIVE mode.
//
// The cockpit's main viewport. Layout:
//
//   ┌─ canonical spine pipeline (hero) ─────────────────┐
//   │                                                    │
//   ├─ intent stream ──────────────┬─ runtime pulse ────┤
//   │ (recent intents flowing      │ block / anchor /   │
//   │  through the spine)          │ admission / drift  │
//   │                              │                    │
//   │                              ├─ event log ────────┤
//   │                              │ stage transitions  │
//   │                              │ (live, animated)   │
//   └──────────────────────────────┴────────────────────┘
//
// The hero animates connector particles + stage pulses on every
// live event. The event log accumulates the last N transitions
// so an operator can see exactly what just happened.

import { spineFlowView } from '/views/spineFlow.js';
import { renderSpineHero, refreshSpineHero } from '/lib/spineHero.js';
import { rpcWithDisclosure, formatTime, statusPill, shortHash } from '/lib/spineCommon.js';
import { subscribe, getRecent } from '/lib/spineBus.js';

let rootEl = null;
let unsubscribers = [];

export const liveView = {
  mount(root) {
    rootEl = root;
    rootEl.replaceChildren();
    // Cleanup any prior subscriptions
    for (const u of unsubscribers) u();
    unsubscribers = [];

    // Hero canvas (canonical pipeline)
    rootEl.appendChild(renderSpineHero());

    // Layout: stream on left, runtime + event log on right
    const layout = document.createElement('div');
    layout.className = 'live-layout';

    const streamFrame = document.createElement('div');
    streamFrame.className = 'live-stream';
    layout.appendChild(streamFrame);

    const sidebar = document.createElement('aside');
    sidebar.className = 'live-sidebar';
    layout.appendChild(sidebar);

    rootEl.appendChild(layout);

    // Mount the existing spineFlow into the stream frame.
    spineFlowView.mount(streamFrame);

    // Build the runtime pulse + event log
    sidebar.appendChild(renderRuntimePulse());
    sidebar.appendChild(renderEventLog());

    // Periodic refresh for the runtime pulse meters
    refreshRuntimePulse();
    const t = setInterval(() => refreshRuntimePulse().catch(() => {}), 4000);
    unsubscribers.push(() => clearInterval(t));
  },
  onSubpathChange() { /* Live has no subpath */ },
};

// =================================================================
// Runtime pulse — block height, anchor mode, plugin admission,
// trust drift, workflow health. Compact, glanceable.
// =================================================================
function renderRuntimePulse() {
  const card = document.createElement('section');
  card.className = 'live-pulse-card';
  card.id = 'live-pulse';

  const head = document.createElement('div');
  head.className = 'live-pulse-head';
  const title = document.createElement('h3');
  title.textContent = 'Runtime pulse';
  head.appendChild(title);
  const dot = document.createElement('span');
  dot.className = 'live-pulse-heartbeat';
  head.appendChild(dot);
  card.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'live-pulse-grid';
  for (const m of [
    { id: 'pulse-block',     label: 'Infrix block' },
    { id: 'pulse-anchor',    label: 'Anchor mode' },
    { id: 'pulse-plugins',   label: 'Plugins admitted' },
    { id: 'pulse-trust',     label: 'Trust drift' },
    { id: 'pulse-outcome',   label: 'Outcome failures' },
    { id: 'pulse-comp',      label: 'Compensation failures' },
  ]) {
    const tile = document.createElement('div');
    tile.className = 'live-pulse-tile';
    tile.id = m.id;
    const lbl = document.createElement('div');
    lbl.className = 'live-pulse-label';
    lbl.textContent = m.label;
    tile.appendChild(lbl);
    const val = document.createElement('div');
    val.className = 'live-pulse-value';
    val.textContent = '—';
    val.id = m.id + '-val';
    tile.appendChild(val);
    grid.appendChild(tile);
  }
  card.appendChild(grid);

  return card;
}

async function refreshRuntimePulse() {
  const [anchor, plugin, trust, workflow] = await Promise.all([
    rpcWithDisclosure('explorer.anchorMode', {}).catch(() => null),
    rpcWithDisclosure('explorer.pluginStatus', {}).catch(() => null),
    rpcWithDisclosure('explorer.trustDrift', {}).catch(() => null),
    rpcWithDisclosure('explorer.workflowHealth', {}).catch(() => null),
  ]);
  setVal('pulse-block-val', headerBlockHeight());
  if (anchor) setVal('pulse-anchor-val', anchor.mode || '—');
  if (plugin) setVal('pulse-plugins-val', `${plugin.totalAdmitted || 0}/${plugin.totalRegistered || 0}`);
  if (trust) {
    setVal('pulse-trust-val', String(trust.driftingProfiles || 0));
    setKind('pulse-trust', (trust.driftingProfiles || 0) > 0 ? 'alert' : 'ok');
  }
  if (workflow) {
    const o = workflow.outcomeCaptureFailures || 0;
    const c = workflow.compensationStageFailures || 0;
    setVal('pulse-outcome-val', String(o));
    setKind('pulse-outcome', o > 0 ? 'alert' : 'ok');
    setVal('pulse-comp-val', String(c));
    setKind('pulse-comp', c > 0 ? 'alert' : 'ok');
  }
}

function headerBlockHeight() {
  const el = document.getElementById('headerBlockHeight');
  return el ? el.textContent : '?';
}
function setVal(id, v) {
  const el = document.getElementById(id);
  if (el && el.textContent !== String(v)) {
    el.textContent = String(v);
    el.classList.remove('bump');
    // eslint-disable-next-line no-unused-expressions
    el.offsetWidth;
    el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 500);
  }
}
function setKind(tileId, kind) {
  const el = document.getElementById(tileId);
  if (!el) return;
  el.classList.remove('ok', 'alert', 'warn');
  el.classList.add(kind);
}

// =================================================================
// Event log — live stream of stage transitions with animated entry.
// =================================================================
function renderEventLog() {
  const card = document.createElement('section');
  card.className = 'live-eventlog';
  const head = document.createElement('div');
  head.className = 'live-eventlog-head';
  const title = document.createElement('h3');
  title.textContent = 'Recent activity';
  head.appendChild(title);
  const sub = document.createElement('span');
  sub.className = 'live-eventlog-sub';
  sub.textContent = 'live · last 20';
  head.appendChild(sub);
  card.appendChild(head);

  const list = document.createElement('div');
  list.className = 'live-eventlog-list';
  list.id = 'live-eventlog-list';
  card.appendChild(list);

  // Seed with any recent buffered events
  for (const e of getRecent(20)) appendEventRow(list, e.event, e.payload, e.t, true);

  // Subscribe to the bus
  const unsubAdv = subscribe('intent.advanced', (p) => {
    appendEventRow(list, 'intent.advanced', p, Date.now());
  });
  const unsubAnchor = subscribe('anchor.observed', (p) => {
    appendEventRow(list, 'anchor.observed', p, Date.now());
  });
  unsubscribers.push(unsubAdv, unsubAnchor);

  return card;
}

function appendEventRow(list, event, payload, t, seed) {
  if (!list || !payload) return;
  const row = document.createElement('div');
  row.className = 'live-eventlog-row';
  if (!seed) row.classList.add('live-eventlog-row-new');

  const dot = document.createElement('span');
  dot.className = 'live-eventlog-dot';
  if (event === 'intent.advanced' && payload.stage) {
    const idx = stageIndex(payload.stage);
    if (idx) dot.style.background = `var(--spine-${idx})`;
  } else if (event === 'anchor.observed') {
    dot.style.background = 'var(--spine-7)';
  }
  row.appendChild(dot);

  const text = document.createElement('div');
  text.className = 'live-eventlog-text';
  if (event === 'intent.advanced') {
    text.innerHTML = `<span class="evlog-stage">${payload.stage}</span> <span class="mono evlog-id">${shortHash(payload.intentId, 14, 6)}</span>`;
  } else if (event === 'anchor.observed') {
    text.innerHTML = `<span class="evlog-stage">anchor</span> <span class="mono evlog-id">${shortHash(payload.intentId || payload.anchorId || '?', 14, 6)}</span>`;
  } else {
    text.textContent = event;
  }
  row.appendChild(text);

  const ts = document.createElement('span');
  ts.className = 'live-eventlog-ts';
  ts.textContent = formatTimeShort(t);
  row.appendChild(ts);

  // Insert at top
  list.insertBefore(row, list.firstChild);

  // Cap to 20 rows
  while (list.children.length > 20) list.removeChild(list.lastChild);
}

function stageIndex(stageKey) {
  const map = { intent: 1, plan: 2, approval: 3, execution: 4, outcome: 5, evidence: 6, anchor: 7 };
  return map[stageKey];
}
function formatTimeShort(t) {
  if (!t) return '';
  const d = new Date(t);
  return d.toLocaleTimeString();
}
