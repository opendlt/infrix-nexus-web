// Nexus — the timeline ribbon.
//
// Default content of the flow canvas when no intent is selected.
// Each row is one intent. The 7 stage cells inside the row align
// horizontally with the 7 cards on the spine strip above, so the
// user can read each row as a Gantt-style trace through the spine.
//
// Selection model:
//   - Click a row → fires onIntentSelect(intentId).
//   - The Spine view slides the narrative panel up over this view.
//   - Until that happens, hovering a row gives a subtle lift.
//
// Live updates:
//   - On 'spine.intent' bus events, the affected row updates in
//     place and gets a brief accent flash to draw the eye.
//   - New rows arrive at the top with a slide-in animation.

import { rpcWithDisclosure, formatTime, statusPill, shortHash } from '/lib/spineCommon.js';
import { subscribe } from '/lib/spineBus.js';
import { subscribe2, refreshSlice } from '/lib/store.js';

const STAGE_KEYS = ['intent', 'plan', 'approval', 'execution', 'outcome', 'evidence', 'anchor'];

export function createTimeline({ onIntentSelect }) {
  const root = document.createElement('section');
  root.className = 'spine-timeline';

  const head = document.createElement('div');
  head.className = 'timeline-head';
  const title = document.createElement('h2');
  title.className = 'timeline-title';
  title.textContent = 'Recent intents';
  head.appendChild(title);
  const sub = document.createElement('p');
  sub.className = 'timeline-sub';
  sub.textContent = 'Each row traces an intent through the spine. Click any row to read its full story.';
  head.appendChild(sub);

  // Filter chips
  const chips = document.createElement('div');
  chips.className = 'timeline-chips';
  const allChip = mkChip('All', null, true);
  chips.appendChild(allChip);
  const stageChips = STAGE_KEYS.map((k, i) => {
    const chip = mkChip(capitalize(k), k);
    chip.dataset.stage = String(i + 1);
    chips.appendChild(chip);
    return chip;
  });
  head.appendChild(chips);
  root.appendChild(head);

  // Container for rows
  const list = document.createElement('div');
  list.className = 'timeline-list';
  root.appendChild(list);

  // State
  let allIntents = [];
  let activeFilter = null;

  function setFilter(key) {
    activeFilter = key;
    allChip.classList.toggle('active', key === null);
    for (const chip of stageChips) {
      chip.classList.toggle('active', chip.dataset.key === key);
    }
    render();
  }
  allChip.addEventListener('click', () => setFilter(null));
  for (const chip of stageChips) chip.addEventListener('click', () => setFilter(chip.dataset.key));

  function mkChip(label, key, active = false) {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'timeline-chip';
    if (active) c.classList.add('active');
    c.textContent = label;
    c.dataset.key = key || '';
    return c;
  }
  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function render() {
    list.replaceChildren();
    const rows = filtered();
    if (rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'timeline-empty';
      // NEXUS-REIMAGINED-2026-05-10 Phase 8 — friendly fresh-devnet
      // empty state: instead of a one-line nudge, list the canonical
      // entry points so the operator can pick one immediately.
      empty.innerHTML = `
        <div class="timeline-empty-mark">⚡</div>
        <div class="timeline-empty-title">Nothing happening yet</div>
        <div class="timeline-empty-sub">Start an action from any of the workspaces below. Every action gets reviewed, approved, run, and proven before anything takes effect.</div>
        <div class="timeline-empty-actions">
          <a href="#/compose" class="timeline-empty-action">New action →</a>
          <a href="#/operate" class="timeline-empty-action">Operations console →</a>
          <a href="#/govern" class="timeline-empty-action">Authority &amp; permissions →</a>
          <a href="#/prove" class="timeline-empty-action">Verify a result →</a>
        </div>
        <div class="timeline-empty-hint">Press <span class="mono">?</span> for keyboard shortcuts · <span class="mono">Cmd/Ctrl+K</span> for the command palette.</div>
      `;
      list.appendChild(empty);
      return;
    }
    for (const intent of rows) list.appendChild(buildRow(intent));
  }

  function filtered() {
    if (!activeFilter) return allIntents;
    return allIntents.filter((intent) => {
      const stages = intent.stages || [];
      // "in stage X" means: stage X is the LATEST completed stage.
      let lastDone = 'intent';
      for (const s of stages) if (s.completed) lastDone = s.stage;
      return lastDone === activeFilter;
    });
  }

  function buildRow(intent) {
    const row = document.createElement('div');
    row.className = 'timeline-row';
    row.dataset.intentId = intent.id;
    row.tabIndex = 0;
    row.role = 'button';

    // ── Identity column ─────────────────────────────────────────────
    const ident = document.createElement('div');
    ident.className = 'timeline-ident';
    const idEl = document.createElement('div');
    idEl.className = 'mono timeline-id';
    idEl.textContent = shortHash(intent.id, 22, 6);
    idEl.title = intent.id;
    ident.appendChild(idEl);
    const meta = document.createElement('div');
    meta.className = 'timeline-meta';
    const goalEl = document.createElement('span');
    goalEl.className = 'timeline-goal';
    goalEl.textContent = intent.goalType || '—';
    meta.appendChild(goalEl);
    if (intent.actor) {
      const actorEl = document.createElement('span');
      actorEl.className = 'timeline-actor mono';
      actorEl.textContent = intent.actor;
      actorEl.title = intent.actor;
      meta.appendChild(actorEl);
    }
    ident.appendChild(meta);
    row.appendChild(ident);

    // ── 7 stage cells ───────────────────────────────────────────────
    const track = document.createElement('div');
    track.className = 'timeline-track';
    const stages = intent.stages || STAGE_KEYS.map((k) => ({ stage: k, completed: false }));
    for (let i = 0; i < STAGE_KEYS.length; i++) {
      const cell = document.createElement('div');
      cell.className = 'timeline-cell';
      cell.dataset.stage = String(i + 1);
      const stageState = stages.find((s) => s.stage === STAGE_KEYS[i]) || { completed: false };
      if (stageState.completed) cell.classList.add('completed');
      if (stageState.failed) cell.classList.add('failed');
      // The "currently in" marker — last completed
      const lastDoneIdx = stages.reduce((acc, s, idx) => s.completed ? idx : acc, -1);
      if (i === lastDoneIdx) cell.classList.add('current');
      const fill = document.createElement('div');
      fill.className = 'timeline-cell-fill';
      cell.appendChild(fill);
      track.appendChild(cell);
    }
    row.appendChild(track);

    // ── Tail metadata ───────────────────────────────────────────────
    const tail = document.createElement('div');
    tail.className = 'timeline-tail';
    const tsEl = document.createElement('div');
    tsEl.className = 'timeline-ts';
    tsEl.textContent = formatTime(intent.created);
    tail.appendChild(tsEl);
    const stEl = document.createElement('div');
    stEl.className = 'timeline-state';
    stEl.appendChild(statusPill(intent.state || 'pending', stateClass(intent)));
    tail.appendChild(stEl);
    row.appendChild(tail);

    // Selection
    row.addEventListener('click', () => {
      if (onIntentSelect) onIntentSelect(intent.id);
    });
    row.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        if (onIntentSelect) onIntentSelect(intent.id);
      }
    });

    return row;
  }

  function stateClass(intent) {
    const s = (intent.state || '').toLowerCase();
    if (s === 'failed') return 'alert';
    if (s === 'completed' || intent.anchorRecordId) return 'ok';
    if (s === 'resolved') return 'info';
    return 'warn';
  }

  // Phase 0: read from the central store instead of polling directly.
  // The store dedupes fetches across the strip, timeline, telemetry,
  // and narrative — they all consume the same recentIntents slice.
  const subs = [];
  subs.push(subscribe2('recentIntents', (slice) => {
    if (slice && slice.status === 'visible' && slice.data) {
      allIntents = slice.data.intents || [];
      render();
    }
  }));
  subs.push(subscribe('intent.advanced', (p) => {
    // Brief flash on the affected row when an event arrives
    const row = list.querySelector(`[data-intent-id="${cssEscape(p.intentId)}"]`);
    if (row) {
      row.classList.remove('flash');
      // eslint-disable-next-line no-unused-expressions
      row.offsetWidth;
      row.classList.add('flash');
      setTimeout(() => row.classList.remove('flash'), 800);
    }
  }));

  function refresh() { return refreshSlice('recentIntents'); }

  return {
    element: root,
    refresh,
    setFilter,
    destroy() { for (const u of subs) try { u(); } catch (e) { /* */ } },
  };
}

function cssEscape(s) {
  if (window.CSS && window.CSS.escape) return window.CSS.escape(String(s));
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
