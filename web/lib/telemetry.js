// Nexus — telemetry rail.
//
// Always-on right column. Two sections:
//   1. Pulse — runtime heartbeat + 6 key metrics (block / anchor mode /
//      plugins admitted / trust drift / outcome failures / compensation).
//      Values bump when they change; the heartbeat beats on real data arrival
//      (RUNBOOK-03 Task 3). Tile color tracks state (alert / ok).
//   2. Console trigger — small button that opens the operate slide-in
//      (Network / Verify / Subsystems).
//
// RUNBOOK-03 Task 6: the old "Activity" live-event-log section was removed — it
// subscribed to a spine bus with no publisher (RUNBOOK-01 deleted connectLive),
// so it was a permanently-empty panel labelled "live". The honest live signals
// are the heartbeat (beats on real fetches) and the value bumps.

import { subscribe2, subscribeTick } from '/lib/store.js';
import { openOperateConsole } from '/lib/operateConsole.js';
import { series, snapshot } from '/lib/pulseBuffer.js';
import { detectAnomalies, renderSparkline, SPARK_LABELS } from '/lib/trendAlerts.js';

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
  // RUNBOOK-07 SP7 — `key` ties a tile to a trended series in the pulse buffer
  // so it can carry a sparkline (drift / outcome-fail / comp-fail).
  for (const m of [
    { id: 'tele-block',   label: 'Infrix block' },
    { id: 'tele-anchor',  label: 'Anchor mode' },
    { id: 'tele-plugins', label: 'Plugins' },
    { id: 'tele-trust',   label: 'Trust drift', key: 'driftingProfiles' },
    { id: 'tele-outcome', label: 'Outc fail',   key: 'outcomeFail' },
    { id: 'tele-comp',    label: 'Comp fail',    key: 'compFail' },
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
    if (m.key) {
      const spark = document.createElement('div');
      spark.className = 'tele-spark';
      spark.id = m.id + '-spark';
      spark.dataset.key = m.key;
      tile.appendChild(spark);
    }
    grid.appendChild(tile);
  }
  pulse.appendChild(grid);
  root.appendChild(pulse);

  // RUNBOOK-07 SP7 — anomaly alerts strip between Pulse and the console trigger.
  const alertsStrip = document.createElement('section');
  alertsStrip.className = 'tele-alerts';
  alertsStrip.id = 'tele-alerts';
  alertsStrip.hidden = true;
  root.appendChild(alertsStrip);

  // ── Console trigger ──
  const consoleBtn = document.createElement('button');
  consoleBtn.type = 'button';
  consoleBtn.className = 'tele-console-btn';
  consoleBtn.innerHTML = '<span class="console-icon">⚙</span><span>Operate console</span><span class="console-chevron">→</span>';
  consoleBtn.addEventListener('click', () => openOperateConsole());
  root.appendChild(consoleBtn);

  const subs = [];

  // RUNBOOK-03 Task 3 — beat the heartbeat on REAL data arrival (any visible
  // store update), not a fixed CSS loop. It stops when data stops, so the beat
  // is a truthful "alive" signal. Reduced-motion is honored in CSS.
  subs.push(subscribeTick(() => {
    heartbeat.classList.remove('beat');
    // eslint-disable-next-line no-unused-expressions
    heartbeat.offsetWidth;           // reflow so the animation re-triggers
    heartbeat.classList.add('beat');
    setTimeout(() => heartbeat.classList.remove('beat'), 650);
  }));

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
    // RUNBOOK-07 SP7 — refresh the sparklines + anomaly alerts from the shared
    // pulse buffer (the store pushes each live sample before publishing).
    updateTrends();
  }));

  // updateTrends — redraw each trended tile's sparkline and the alerts strip.
  function updateTrends() {
    for (const spark of grid.querySelectorAll('.tele-spark')) {
      const key = spark.dataset.key;
      const data = series(key);
      spark.replaceChildren(renderSparkline(data, { label: (SPARK_LABELS[key] || key) + ' trend' }));
    }
    const alerts = detectAnomalies(snapshot());
    const strip = document.getElementById('tele-alerts');
    if (!strip) return;
    strip.replaceChildren();
    if (!alerts.length) { strip.hidden = true; return; }
    strip.hidden = false;
    for (const a of alerts) {
      const row = document.createElement('a');
      row.className = 'tele-alert tele-alert-' + a.level;
      row.href = a.ref || '#';
      const dot = document.createElement('span');
      dot.className = 'tele-alert-dot';
      row.appendChild(dot);
      const txt = document.createElement('span');
      txt.className = 'tele-alert-text';
      txt.textContent = a.text;
      row.appendChild(txt);
      strip.appendChild(row);
    }
  }

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
