// Nexus — telemetry rail.
//
// Always-on right column. Three sections:
//   1. Pulse — runtime heartbeat + 6 key metrics (block / anchor mode /
//      plugins admitted / trust drift / outcome failures / compensation).
//      Values bump when they change. Tile color tracks state (alert / ok).
//   2. Activity — live event log of the last 20 spine transitions with
//      color-coded stage dots and tabular timestamps.
//   3. Console trigger — small button that opens the operate slide-in
//      (Network / Verify / Subsystems).

import { rpcWithDisclosure, formatTime, shortHash } from '/lib/spineCommon.js';
import { subscribe, getRecent } from '/lib/spineBus.js';
import { subscribe2 } from '/lib/store.js';
import { openOperateConsole } from '/lib/operateConsole.js';

const STAGE_INDEX = { intent: 1, plan: 2, approval: 3, execution: 4, outcome: 5, evidence: 6, anchor: 7 };

export function createTelemetry() {
  const root = document.createElement('aside');
  root.className = 'spine-telemetry';

  // ── Pulse ──
  const pulse = document.createElement('section');
  pulse.className = 'tele-card tele-pulse';
  const pulseHead = document.createElement('div');
  pulseHead.className = 'tele-head';
  const pulseTitle = document.createElement('h3');
  pulseTitle.textContent = 'Runtime pulse';
  pulseHead.appendChild(pulseTitle);
  const heartbeat = document.createElement('span');
  heartbeat.className = 'tele-heartbeat';
  pulseHead.appendChild(heartbeat);
  pulse.appendChild(pulseHead);
  const grid = document.createElement('div');
  grid.className = 'tele-grid';
  for (const m of [
    { id: 'tele-block',   label: 'Infrix block' },
    { id: 'tele-anchor',  label: 'Anchor mode' },
    { id: 'tele-plugins', label: 'Plugins' },
    { id: 'tele-trust',   label: 'Trust drift' },
    { id: 'tele-outcome', label: 'Outc fail' },
    { id: 'tele-comp',    label: 'Comp fail' },
  ]) {
    const tile = document.createElement('div');
    tile.className = 'tele-tile';
    tile.id = m.id;
    const lbl = document.createElement('div');
    lbl.className = 'tele-label';
    lbl.textContent = m.label;
    tile.appendChild(lbl);
    const v = document.createElement('div');
    v.className = 'tele-value';
    v.id = m.id + '-v';
    v.textContent = '—';
    tile.appendChild(v);
    grid.appendChild(tile);
  }
  pulse.appendChild(grid);
  root.appendChild(pulse);

  // ── Activity feed ──
  const activity = document.createElement('section');
  activity.className = 'tele-card tele-activity';
  const actHead = document.createElement('div');
  actHead.className = 'tele-head';
  const actTitle = document.createElement('h3');
  actTitle.textContent = 'Activity';
  actHead.appendChild(actTitle);
  const actSub = document.createElement('span');
  actSub.className = 'tele-sub';
  actSub.textContent = 'live';
  actHead.appendChild(actSub);
  activity.appendChild(actHead);
  const list = document.createElement('div');
  list.className = 'tele-activity-list';
  list.id = 'tele-activity-list';
  activity.appendChild(list);
  root.appendChild(activity);

  // ── Console trigger ──
  const consoleBtn = document.createElement('button');
  consoleBtn.type = 'button';
  consoleBtn.className = 'tele-console-btn';
  consoleBtn.innerHTML = '<span class="console-icon">⚙</span><span>Operate console</span><span class="console-chevron">→</span>';
  consoleBtn.addEventListener('click', () => openOperateConsole());
  root.appendChild(consoleBtn);

  // Seed with any buffered events
  for (const e of getRecent(20)) addRow(list, e.event, e.payload, e.t, true);

  // Live event subscriptions
  const subs = [];
  subs.push(subscribe('intent.advanced', (p) => addRow(list, 'intent.advanced', p, Date.now())));
  subs.push(subscribe('anchor.observed', (p) => addRow(list, 'anchor.observed', p, Date.now())));
  subs.push(subscribe('spine.evidence', (p) => addRow(list, 'evidence', p, Date.now())));

  // Phase 0: read runtime pulse from the central store (one fetch per
  // 4s tick fans out to every component that consumes runtimePulse).
  subs.push(subscribe2('runtimePulse', (slice) => {
    if (!slice || slice.status !== 'visible' || !slice.data) return;
    const { anchor, plugin, trust, workflow } = slice.data;
    setVal('tele-block-v', headerBlockHeight());
    if (anchor) setVal('tele-anchor-v', anchor.mode || '—');
    if (plugin) setVal('tele-plugins-v', `${plugin.totalAdmitted || 0}/${plugin.totalRegistered || 0}`);
    if (trust) {
      setVal('tele-trust-v', String(trust.driftingProfiles || 0));
      setKind('tele-trust', (trust.driftingProfiles || 0) > 0 ? 'alert' : 'ok');
    }
    if (workflow) {
      const o = workflow.outcomeCaptureFailures || 0;
      const c = workflow.compensationStageFailures || 0;
      setVal('tele-outcome-v', String(o));
      setKind('tele-outcome', o > 0 ? 'alert' : 'ok');
      setVal('tele-comp-v', String(c));
      setKind('tele-comp', c > 0 ? 'alert' : 'ok');
    }
  }));

  return {
    element: root,
    destroy() { for (const u of subs) try { u(); } catch (e) { /* */ } },
  };

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
}

function addRow(list, event, payload, t, seed) {
  if (!list || !payload) return;
  const row = document.createElement('div');
  row.className = 'tele-row';
  if (!seed) row.classList.add('arrive');

  const dot = document.createElement('span');
  dot.className = 'tele-row-dot';
  if (event === 'intent.advanced' && payload.stage) {
    const idx = STAGE_INDEX[payload.stage];
    if (idx) dot.style.background = `var(--spine-${idx})`;
  } else if (event === 'anchor.observed') {
    dot.style.background = 'var(--spine-7)';
  } else if (event === 'evidence') {
    dot.style.background = 'var(--spine-6)';
  }
  row.appendChild(dot);

  const txt = document.createElement('div');
  txt.className = 'tele-row-txt';
  if (event === 'intent.advanced') {
    txt.innerHTML = `<span class="tele-stage">${payload.stage}</span><span class="mono tele-id">${shortHash(payload.intentId, 14, 6)}</span>`;
  } else if (event === 'anchor.observed') {
    txt.innerHTML = `<span class="tele-stage">anchor</span><span class="mono tele-id">${shortHash(payload.intentId || payload.anchorId || '?', 14, 6)}</span>`;
  } else {
    txt.textContent = event;
  }
  row.appendChild(txt);

  const ts = document.createElement('span');
  ts.className = 'tele-row-ts mono';
  ts.textContent = new Date(t).toLocaleTimeString();
  row.appendChild(ts);

  list.insertBefore(row, list.firstChild);
  while (list.children.length > 20) list.removeChild(list.lastChild);
}
