// Nexus — canonical spine pipeline canvas.
//
// The visual hero of the Live mode. Renders the 7-stage canonical
// pipeline (Intent → Plan → Approval → Execution → Outcome →
// Evidence → Anchor) as a horizontal flow chart. Each stage card
// shows its current throughput (count of intents currently in that
// stage). When a live event observes an intent advancing stage
// N → N+1, an animated PARTICLE travels along the connector
// between cards N and N+1 with the stage gradient, and the
// destination card pulses briefly.
//
// This is the spine made visceral.

import { rpcWithDisclosure } from '/lib/spineCommon.js';
import { subscribe } from '/lib/spineBus.js';

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

let unsubscribe = null;
let lastStageByIntent = new Map();

export function renderSpineHero() {
  const root = document.createElement('section');
  root.className = 'spine-hero';
  root.id = 'spine-hero';

  const head = document.createElement('div');
  head.className = 'spine-hero-head';
  const eyebrow = document.createElement('div');
  eyebrow.className = 'spine-hero-eyebrow';
  eyebrow.textContent = '◢ Canonical pipeline';
  head.appendChild(eyebrow);
  const title = document.createElement('h1');
  title.className = 'spine-hero-title';
  title.textContent = 'The spine';
  head.appendChild(title);
  const sub = document.createElement('p');
  sub.className = 'spine-hero-sub';
  sub.textContent = 'Every state-changing operation flows through these seven stages. Plugins, policies, trust profiles, capabilities, and roles all fire inside this pipeline as the spine drives an intent forward.';
  head.appendChild(sub);
  root.appendChild(head);

  const pipeline = document.createElement('div');
  pipeline.className = 'spine-pipeline';
  STAGES.forEach((s, idx) => {
    const card = document.createElement('div');
    card.className = 'stage-pipe-card';
    card.dataset.stage = String(idx + 1);
    card.dataset.key = s.key;
    card.id = 'stage-pipe-' + s.key;

    const dotWrap = document.createElement('div');
    dotWrap.className = 'stage-pipe-dot-wrap';
    const dot = document.createElement('div');
    dot.className = 'stage-pipe-dot stage-dot done';
    dot.dataset.stage = String(idx + 1);
    dotWrap.appendChild(dot);
    card.appendChild(dotWrap);

    const num = document.createElement('div');
    num.className = 'stage-pipe-num';
    num.textContent = String(idx + 1).padStart(2, '0');
    card.appendChild(num);

    const name = document.createElement('div');
    name.className = 'stage-pipe-name';
    name.textContent = s.label;
    card.appendChild(name);

    const blurb = document.createElement('div');
    blurb.className = 'stage-pipe-blurb';
    blurb.textContent = s.blurb;
    card.appendChild(blurb);

    const tp = document.createElement('div');
    tp.className = 'stage-pipe-throughput';
    tp.id = `pipeline-throughput-${s.key}`;
    tp.textContent = '—';
    card.appendChild(tp);

    pipeline.appendChild(card);

    if (idx < STAGES.length - 1) {
      const conn = document.createElement('div');
      conn.className = 'stage-pipe-conn';
      conn.dataset.from = String(idx + 1);
      conn.dataset.to = String(idx + 2);
      conn.id = `stage-pipe-conn-${idx + 1}-${idx + 2}`;
      // Gradient track baseline
      const track = document.createElement('div');
      track.className = 'stage-pipe-conn-track';
      conn.appendChild(track);
      pipeline.appendChild(conn);
    }
  });
  root.appendChild(pipeline);

  // Initial throughput load
  loadThroughput().catch(() => {});

  // Subscribe to spine bus events so the canvas animates on activity.
  if (unsubscribe) unsubscribe();
  unsubscribe = subscribe('intent.advanced', (payload) => {
    handleAdvance(payload.intentId, payload.stage);
  });
  // Periodic throughput refresh (in case events drop)
  setInterval(() => loadThroughput().catch(() => {}), 4000);

  return root;
}

function handleAdvance(intentId, stageKey) {
  const idx = KEY_INDEX[stageKey];
  if (!idx) return;
  // Determine which connector to animate based on the previous stage
  // we observed for this intent.
  const prev = lastStageByIntent.get(intentId) || idx - 1;
  if (idx > prev) {
    for (let s = prev; s < idx; s++) {
      animateConnector(s, s + 1);
    }
  }
  lastStageByIntent.set(intentId, idx);
  pulseStageCard(stageKey);
  loadThroughput().catch(() => {});
}

function animateConnector(fromIdx, toIdx) {
  const conn = document.getElementById(`stage-pipe-conn-${fromIdx}-${toIdx}`);
  if (!conn) return;
  const particle = document.createElement('div');
  particle.className = 'stage-pipe-particle';
  particle.style.background = `linear-gradient(90deg, var(--spine-${fromIdx}), var(--spine-${toIdx}))`;
  conn.appendChild(particle);
  // Force reflow so the animation actually runs
  // eslint-disable-next-line no-unused-expressions
  particle.offsetWidth;
  particle.classList.add('go');
  setTimeout(() => particle.remove(), 1200);
}

function pulseStageCard(stageKey) {
  const card = document.getElementById('stage-pipe-' + stageKey);
  if (!card) return;
  card.classList.remove('pulsing');
  // eslint-disable-next-line no-unused-expressions
  card.offsetWidth;
  card.classList.add('pulsing');
  setTimeout(() => card.classList.remove('pulsing'), 1200);
}

async function loadThroughput() {
  let resp;
  try { resp = await rpcWithDisclosure('explorer.recentIntents', { limit: 200 }); }
  catch (e) { return; }
  const intents = (resp && resp.intents) || [];
  const counts = { intent: 0, plan: 0, approval: 0, execution: 0, outcome: 0, evidence: 0, anchor: 0 };
  for (const intent of intents) {
    const stages = intent.stages || [];
    let lastDone = 'intent';
    for (const s of stages) if (s.completed) lastDone = s.stage;
    if (counts[lastDone] !== undefined) counts[lastDone] += 1;
  }
  for (const key of Object.keys(counts)) {
    const el = document.getElementById(`pipeline-throughput-${key}`);
    if (el) {
      const c = counts[key];
      const wasZero = el.classList.contains('non-zero') === false;
      el.textContent = c === 1 ? '1 here' : `${c} here`;
      el.classList.toggle('non-zero', c > 0);
      // Subtle bump animation when count changes
      if (Number(el.dataset.count || 0) !== c) {
        el.dataset.count = String(c);
        el.classList.remove('bump');
        // eslint-disable-next-line no-unused-expressions
        el.offsetWidth;
        el.classList.add('bump');
        setTimeout(() => el.classList.remove('bump'), 600);
      }
    }
  }
}

export function refreshSpineHero() {
  loadThroughput().catch(() => {});
}
