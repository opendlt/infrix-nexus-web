// Nexus — the spine strip.
//
// Always-visible. The 7-stage canonical pipeline rendered as a row of
// stage cards across the top of the canvas. The strip serves dual
// purpose:
//   - In timeline view (no intent selected): shows live throughput
//     under each stage (count of intents currently in that stage).
//     Click a card → filter the timeline to that stage.
//   - In narrative view (intent selected): the cards become jump
//     anchors. Click stage 4 → narrative scrolls to chapter 4.
//     The cards reflect the selected intent's progression.
//
// The strip subscribes to the spine bus so connector particles fly
// when intents advance and stage cards pulse on activity.

import { rpcWithDisclosure } from '/lib/spineCommon.js';
import { subscribe } from '/lib/spineBus.js';
import { subscribe2, refreshSlice } from '/lib/store.js';

const STAGES = [
  { key: 'intent',    label: 'Intent',    blurb: 'goal submitted' },
  { key: 'plan',      label: 'Plan',      blurb: 'compiled + hashed' },
  { key: 'approval',  label: 'Approval',  blurb: 'signers + waivers' },
  { key: 'execution', label: 'Execution', blurb: 'plugins fire' },
  { key: 'outcome',   label: 'Outcome',   blurb: 'finality bound' },
  { key: 'evidence',  label: 'Evidence',  blurb: 'hash chain sealed' },
  { key: 'anchor',    label: 'Anchor',    blurb: 'L0 commitment' },
];
const KEY_INDEX = Object.fromEntries(STAGES.map((s, i) => [s.key, i + 1]));

export function createSpineStrip({ onStageClick }) {
  const root = document.createElement('section');
  root.className = 'spine-strip';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'spine-strip-eyebrow';
  eyebrow.innerHTML = '<span class="eyebrow-mark">◢</span><span>The spine</span><span class="eyebrow-tag">canonical pipeline</span>';
  root.appendChild(eyebrow);

  const grid = document.createElement('div');
  grid.className = 'spine-strip-grid';

  const stageCards = {};
  STAGES.forEach((s, idx) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'strip-card';
    card.dataset.stage = String(idx + 1);
    card.dataset.key = s.key;
    card.addEventListener('click', () => onStageClick && onStageClick(s.key, idx + 1));

    const dot = document.createElement('div');
    dot.className = 'strip-dot stage-dot';
    dot.dataset.stage = String(idx + 1);
    dot.classList.add('done');
    card.appendChild(dot);

    const num = document.createElement('div');
    num.className = 'strip-num';
    num.textContent = String(idx + 1).padStart(2, '0');
    card.appendChild(num);

    const name = document.createElement('div');
    name.className = 'strip-name';
    name.textContent = s.label;
    card.appendChild(name);

    const blurb = document.createElement('div');
    blurb.className = 'strip-blurb';
    blurb.textContent = s.blurb;
    card.appendChild(blurb);

    const meta = document.createElement('div');
    meta.className = 'strip-meta';
    meta.id = `strip-meta-${s.key}`;
    meta.textContent = '—';
    card.appendChild(meta);

    grid.appendChild(card);
    stageCards[s.key] = card;

    if (idx < STAGES.length - 1) {
      const conn = document.createElement('div');
      conn.className = 'strip-conn';
      conn.id = `strip-conn-${idx + 1}-${idx + 2}`;
      const track = document.createElement('div');
      track.className = 'strip-conn-track';
      conn.appendChild(track);
      grid.appendChild(conn);
    }
  });
  root.appendChild(grid);

  // Track previously observed stage per intent so we can animate the
  // exact connector segment that was traversed.
  const lastStageByIntent = new Map();
  const subs = [];
  subs.push(subscribe('intent.advanced', (p) => {
    const idx = KEY_INDEX[p.stage];
    if (!idx) return;
    const prev = lastStageByIntent.get(p.intentId) || idx - 1;
    if (idx > prev) {
      for (let s = prev; s < idx; s++) animateConnector(s, s + 1);
    }
    lastStageByIntent.set(p.intentId, idx);
    pulseStage(p.stage);
    refreshThroughput().catch(() => {});
  }));

  // Phase 0: subscribe to the canonical recentIntents slice instead
  // of polling separately. The store fans out a single fetch to every
  // subscriber (timeline + strip + telemetry + narrative).
  subs.push(subscribe2('recentIntents', (slice) => {
    if (slice && slice.status === 'visible' && slice.data) {
      applyThroughput(slice.data.intents || []);
    }
  }));

  // ----- API -----
  return {
    element: root,

    /** Set this strip into "no selection" mode — cards show throughput, click filters timeline. */
    showThroughput() {
      root.classList.remove('strip-narrative-mode');
      refreshThroughput().catch(() => {});
    },

    /** Set this strip into "intent selected" mode — cards become jump links. Pass the intent's stage progression so cards reflect completion. */
    showIntentProgression(stages) {
      root.classList.add('strip-narrative-mode');
      stages.forEach((s, i) => {
        const card = stageCards[s.stage];
        if (!card) return;
        card.classList.toggle('completed', !!s.completed);
        card.classList.toggle('failed', !!s.failed);
        const meta = card.querySelector('.strip-meta');
        if (meta) {
          meta.textContent = s.completed ? '✓' : (s.failed ? '✗' : '○');
        }
      });
    },

    /** Highlight the active chapter (called as the user scrolls in narrative). */
    setActiveChapter(stageKey) {
      for (const k of Object.keys(stageCards)) {
        stageCards[k].classList.toggle('active-chapter', k === stageKey);
      }
    },

    /** Cleanup — call when the spine view unmounts. */
    destroy() {
      for (const u of subs) try { u(); } catch (e) { /* */ }
    },
  };

  function animateConnector(from, to) {
    const conn = document.getElementById(`strip-conn-${from}-${to}`);
    if (!conn) return;
    const p = document.createElement('div');
    p.className = 'strip-particle';
    p.style.background = `linear-gradient(90deg, var(--spine-${from}), var(--spine-${to}))`;
    conn.appendChild(p);
    // eslint-disable-next-line no-unused-expressions
    p.offsetWidth;
    p.classList.add('go');
    setTimeout(() => p.remove(), 1300);
  }

  function pulseStage(stageKey) {
    const card = stageCards[stageKey];
    if (!card) return;
    card.classList.remove('pulse');
    // eslint-disable-next-line no-unused-expressions
    card.offsetWidth;
    card.classList.add('pulse');
    setTimeout(() => card.classList.remove('pulse'), 1200);
  }

  function applyThroughput(intents) {
    if (root.classList.contains('strip-narrative-mode')) return;
    const counts = { intent: 0, plan: 0, approval: 0, execution: 0, outcome: 0, evidence: 0, anchor: 0 };
    for (const intent of intents) {
      let lastDone = 'intent';
      for (const s of (intent.stages || [])) if (s.completed) lastDone = s.stage;
      if (counts[lastDone] !== undefined) counts[lastDone] += 1;
    }
    for (const key of Object.keys(counts)) {
      const meta = document.getElementById(`strip-meta-${key}`);
      if (!meta) continue;
      const c = counts[key];
      const old = Number(meta.dataset.count || -1);
      const next = c === 0 ? '—' : (c === 1 ? '1 in flight' : `${c} in flight`);
      if (meta.textContent !== next) {
        meta.textContent = next;
        meta.dataset.count = String(c);
        if (old >= 0 && c !== old) {
          meta.classList.remove('bump');
          // eslint-disable-next-line no-unused-expressions
          meta.offsetWidth;
          meta.classList.add('bump');
          setTimeout(() => meta.classList.remove('bump'), 600);
        }
      }
      meta.classList.toggle('non-zero', c > 0);
    }
  }

  function refreshThroughput() { return refreshSlice('recentIntents'); }
}
