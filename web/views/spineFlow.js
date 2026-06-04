// Nexus — live spine flow view (Phase 1).
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 1: replaces the legacy
// transaction-centric home page with the canonical spine flow:
//   1. Recent intents lane — each row a 7-dot stage progression
//      (Intent → Plan → Approval → Execution → Outcome → Evidence →
//      Anchor) live-streamed via WebSocket.
//   2. Health card grid — block height, anchor mode, L0 endpoint,
//      plugins admitted, pending approvals, trust drift, outcome
//      capture failures, last anchor lag.
//   3. Recent anchor chain — last N anchors with type / class /
//      purpose / L0 status.
//
// Everything renders against real RPC data:
//   explorer.recentIntents, explorer.recentAnchors,
//   explorer.anchorMode, explorer.l0Endpoint,
//   explorer.pluginStatus, explorer.trustDrift,
//   explorer.workflowHealth, explorer.status,
//   approval.pending (counted from pending intents).
//
// The WebSocket subscription drives per-stage updates as they
// happen; polling falls back at 5s when WS is unavailable.

import { rpc } from '/lib/rpc.js';
import { connectLive } from '/lib/liveEvents.js';

// Disclosure context — Phase 0 used the operator identity
// (acc://test.acme + operational) which the devnet bootstraps with
// every needed capability. Phase 6 will surface the actor switcher
// in the header; Phase 1 takes the same baseline.
const DISCLOSURE = {
  actor: 'acc://test.acme',
  purpose: 'operational',
  workflowInstance: 'nexus-explorer',
};

const STAGE_ORDER = ['intent', 'plan', 'approval', 'execution', 'outcome', 'evidence', 'anchor'];
const STAGE_TIPS = {
  intent:    'Intent admitted — typed goal accepted by the mediator.',
  plan:      'Plan compiled — deterministic step graph + plan hash bound.',
  approval:  'Approval(s) collected — quorum reached against plan hash.',
  execution: 'Execution complete — every step ran through PluginRegistry.',
  outcome:   'Outcome captured — finality state recorded.',
  evidence:  'Evidence bundle finalized — chain hashed.',
  anchor:    'Anchored to Accumulate L0 — bundle hash committed.',
};

// View state — kept as module-level so handlers can mutate without
// touching the DOM directly. All renders are driven from this state.
const state = {
  intents: new Map(),  // id → row object
  anchors: [],
  health: {},
  liveMode: 'connecting',
  refreshTimer: null,
  events: null,
};

let mounted = false;
let rootEl = null;

const HTML = `
  <div class="container">
    <section class="spine-section" id="health-section">
      <div class="spine-section-header">
        <h2>Network &amp; Spine Health</h2>
        <span class="live-badge" id="health-live-badge">Live</span>
      </div>
      <div class="health-grid" id="health-grid">
        ${healthSkeleton()}
      </div>
    </section>

    <section class="spine-section" id="intents-section">
      <div class="spine-section-header">
        <h2>Recent Intents <span class="section-badge" id="intent-count">0</span></h2>
        <span class="health-sub">7-dot progression: Intent → Plan → Approval → Execution → Outcome → Evidence → Anchor</span>
      </div>
      <div class="intent-list" id="intent-list">
        <div class="empty-spine">
          <div class="big-icon">⚡</div>
          <p>No intents yet</p>
          <div class="hint">Submit a typed intent via REST or the CLI to see the spine traverse.</div>
        </div>
      </div>
    </section>

    <section class="spine-section" id="anchors-section">
      <div class="spine-section-header">
        <h2>Recent Anchor Chain <span class="section-badge" id="anchor-count">0</span></h2>
        <span class="health-sub">Last N AnchoredRecord entries — bundle hash → Accumulate L0 WriteData</span>
      </div>
      <div class="anchor-chain" id="anchor-chain">
        <div class="empty-spine">
          <div class="big-icon">⚓</div>
          <p>No anchors yet</p>
          <div class="hint">When the orchestrator anchors a bundle, it appears here with its L0 binding.</div>
        </div>
      </div>
    </section>
  </div>
`;

function healthSkeleton() {
  // Eight cards rendered as placeholders so layout doesn't jump on
  // first paint. Real values land within ~500ms of mount.
  const cards = [
    ['Block height',           'block-height',       'info'],
    ['Anchor mode',            'anchor-mode',        'info'],
    ['L0 endpoint',            'l0-endpoint',        'info'],
    ['Plugins admitted',       'plugins-admitted',   'info'],
    ['Pending approvals',      'pending-approvals',  'info'],
    ['Trust drift',            'trust-drift',        'info'],
    ['Outcome capture fails',  'outcome-failures',   'info'],
    ['Last anchor lag',        'anchor-lag',         'info'],
  ];
  return cards.map(([label, id, tone]) => `
    <div class="health-card ${tone}" id="card-${id}">
      <div class="health-label">${label}</div>
      <div class="health-value">—</div>
    </div>
  `).join('');
}

export const spineFlowView = {
  mount(root) {
    rootEl = root;
    root.innerHTML = HTML;

    if (!mounted) {
      mounted = true;
      bootStream();
      schedulePolling();
    }
    // Trigger an immediate render with whatever state we already have
    // (covers re-mount when navigating back to /spine).
    renderHealth();
    renderIntents();
    renderAnchors();
    refreshAll().catch((err) => console.warn('initial refresh failed', err));
  },
  unmount() {
    // Phase 1 keeps the live stream + polling alive across nav so
    // returning to the Spine view shows fully-fresh state without
    // re-paying the startup cost. The connection closes only when
    // the page unloads.
  },
};

window.addEventListener('beforeunload', () => {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  if (state.events) state.events.close();
});

function bootStream() {
  state.events = connectLive(DISCLOSURE);
  const live = state.events;

  live.on('intent',   onIntentEvent);
  live.on('approval', onApprovalEvent);
  live.on('outcome',  onOutcomeEvent);
  live.on('evidence', onEvidenceEvent);
  live.on('anchor',   onAnchorEvent);

  // Update the Live badge every 2s with the current transport mode.
  setInterval(() => {
    const badge = document.getElementById('health-live-badge');
    if (!badge || !live) return;
    const m = live.mode();
    badge.classList.remove('polling', 'closed');
    if (m === 'polling') {
      badge.classList.add('polling');
      badge.textContent = 'Polling';
    } else if (m === 'closed') {
      badge.classList.add('closed');
      badge.textContent = 'Disconnected';
    } else {
      badge.textContent = 'Live';
    }
  }, 2000);
}

function schedulePolling() {
  // Health + anchors are queried at 5s cadence regardless of WS
  // mode — they're scalar snapshots rather than streamable events.
  state.refreshTimer = setInterval(() => {
    refreshHealth().catch(() => {});
    refreshAnchors().catch(() => {});
  }, 5000);
}

async function refreshAll() {
  await Promise.all([
    refreshIntents(),
    refreshAnchors(),
    refreshHealth(),
  ]);
}

async function refreshIntents() {
  try {
    const r = await rpc('explorer.recentIntents', { ...DISCLOSURE, limit: 25 });
    const intents = r.intents || [];
    // Replace the in-memory cache with the freshly-listed records;
    // live events between polls will mutate-in-place from here.
    state.intents = new Map(intents.map((i) => [i.id, i]));
    renderIntents();
  } catch (err) { /* leave previous render */ }
}

async function refreshAnchors() {
  try {
    const r = await rpc('explorer.recentAnchors', { ...DISCLOSURE, limit: 10 });
    state.anchors = r.anchors || [];
    renderAnchors();
  } catch (err) { /* leave previous render */ }
}

async function refreshHealth() {
  try {
    const [status, mode, ep, plugins, trust, wf, pending] = await Promise.all([
      rpcOk('explorer.status', {}),
      rpcOk('explorer.anchorMode', {}),
      rpcOk('explorer.l0Endpoint', {}),
      rpcOk('explorer.pluginStatus', {}),
      rpcOk('explorer.trustDrift', {}),
      rpcOk('explorer.workflowHealth', {}),
      rpcOk('intent.list', { state: 'pending' }),  // pending count via canonical list path
    ]);
    state.health = {
      blockHeight:        status?.blockHeight ?? null,
      anchorMode:         mode?.mode ?? null,
      submitsExternally:  mode?.submitsExternally ?? false,
      l0Endpoint:         ep?.endpoint ?? '',
      pluginsAdmitted:    plugins?.totalAdmitted ?? null,
      pluginsRegistered:  plugins?.totalRegistered ?? null,
      familyCount:        plugins?.familyCount ?? null,
      trustDrift:         trust?.driftingProfiles ?? null,
      trustTotal:         trust?.totalProfiles ?? null,
      outcomeFailures:    wf?.outcomeCaptureFailures ?? null,
      compensationFailures: wf?.compensationStageFailures ?? null,
      pendingIntents:     Array.isArray(pending?.intents) ? pending.intents.length : null,
    };
    renderHealth();
  } catch (err) { /* leave previous render */ }
}

async function rpcOk(method, params) {
  try {
    return await rpc(method, { ...DISCLOSURE, ...(params || {}) });
  } catch (err) {
    return null;
  }
}

// ===== Live event handlers =====

function onIntentEvent(ev) {
  const id = ev.intentId;
  if (!id) return;
  const existing = state.intents.get(id) || { id, stages: defaultStages() };
  // Mark whatever stage the event reports as completed; the WebSocket
  // emits IntentLifecycleEvent with a `stage` string per the Go-side
  // shape (submitted | planned | approved | executing | completed | failed).
  applyStageMutation(existing, ev.stage);
  if (ev.payload?.goalType)  existing.goalType = ev.payload.goalType;
  if (ev.payload?.actor)     existing.actor    = ev.payload.actor;
  if (ev.payload?.timestamp) existing.updated  = ev.payload.timestamp;
  if (ev.payload?.status)    existing.outcomeStatus = ev.payload.status;
  state.intents.set(id, existing);
  renderIntents();
}

function onApprovalEvent(ev) {
  const id = ev.intentId;
  if (!id) return;
  const existing = state.intents.get(id) || { id, stages: defaultStages() };
  // Approval events fire when an approval is added; mark the approval
  // dot as done. Quorum is detected via subsequent intent.advanced
  // event with stage="approved".
  setStage(existing, 'approval', true);
  state.intents.set(id, existing);
  renderIntents();
}

function onOutcomeEvent(ev) {
  const id = ev.intentId;
  if (!id) return;
  const existing = state.intents.get(id) || { id, stages: defaultStages() };
  setStage(existing, 'outcome', true);
  if (ev.state) existing.finality = ev.state;
  state.intents.set(id, existing);
  renderIntents();
}

function onEvidenceEvent(ev) {
  const id = ev.intentId;
  if (!id) return;
  const existing = state.intents.get(id) || { id, stages: defaultStages() };
  setStage(existing, 'evidence', true);
  // EvidenceEvent.stage is "created" | "linked" | "anchored".
  if (ev.payload?.stage === 'anchored') {
    setStage(existing, 'anchor', true);
  }
  if (ev.payload?.evidenceId) existing.evidenceId = ev.payload.evidenceId;
  state.intents.set(id, existing);
  renderIntents();
}

function onAnchorEvent(ev) {
  // Anchor events come from the polling fallback, not the WS stream
  // (the canonical four topics are intent / approval / evidence /
  // outcome). We detect an anchor by polling explorer.recentAnchors;
  // when a new row arrives, mark the corresponding intent's anchor
  // stage done.
  const intentId = ev.intentId;
  if (intentId) {
    const existing = state.intents.get(intentId);
    if (existing) {
      setStage(existing, 'anchor', true);
      renderIntents();
    }
  }
  // The anchors panel itself refreshes on the polling tick.
}

function defaultStages() {
  return STAGE_ORDER.map((s) => ({ stage: s, completed: s === 'intent' }));
}

function setStage(intent, stageName, completed) {
  if (!intent.stages) intent.stages = defaultStages();
  for (const s of intent.stages) {
    if (s.stage === stageName) { s.completed = completed; break; }
  }
}

function applyStageMutation(intent, eventStage) {
  if (!eventStage) return;
  if (!intent.stages) intent.stages = defaultStages();
  // Map server-side IntentLifecycleEvent.stage → our 7 dots.
  const map = {
    submitted: 'intent',
    planned:   'plan',
    approved:  'approval',
    executing: 'execution',
    completed: 'outcome',  // also marks evidence + anchor below
    failed:    null,        // mark final intent state, no stage flip
  };
  const dot = map[eventStage];
  if (dot) {
    // Mark every dot up to and including dot as done.
    let stop = false;
    for (const s of intent.stages) {
      if (!stop) s.completed = true;
      if (s.stage === dot) stop = true;
    }
    if (eventStage === 'completed') {
      // The "completed" event is fired when the workflow reaches a
      // terminal state, which means the whole spine fired. Outcome
      // and evidence usually follow within milliseconds; anchor may
      // lag. Mark outcome+evidence; let the polled anchor record
      // light the anchor dot when it confirms.
      setStage(intent, 'outcome', true);
      setStage(intent, 'evidence', true);
    }
  }
  intent.lastStageEvent = eventStage;
}

// ===== Renderers =====

function renderHealth() {
  if (!rootEl) return;
  const h = state.health;

  setHealth('block-height', h.blockHeight ?? '—', h.blockHeight !== null ? 'ok' : 'info');
  setHealthMode('anchor-mode', h.anchorMode);
  setHealth('l0-endpoint', truncEndpoint(h.l0Endpoint), 'info', { small: true });

  setHealth('plugins-admitted',
    h.pluginsAdmitted !== null ? `${h.pluginsAdmitted} / ${h.familyCount ?? '?'}` : '—',
    pluginTone(h),
    { sub: h.pluginsRegistered !== null ? `${h.pluginsRegistered} plugins registered` : '' });

  setHealth('pending-approvals',
    h.pendingIntents ?? '—',
    h.pendingIntents > 0 ? 'warn' : 'ok',
    { sub: 'awaiting quorum' });

  setHealth('trust-drift',
    h.trustDrift ?? '—',
    h.trustDrift > 0 ? 'alert' : 'ok',
    { sub: h.trustTotal !== null ? `${h.trustTotal} profiles total` : '' });

  setHealth('outcome-failures',
    h.outcomeFailures ?? '—',
    h.outcomeFailures > 0 ? 'alert' : 'ok',
    { sub: (h.compensationFailures ?? 0) > 0 ? `+ ${h.compensationFailures} compensation` : 'spine clean' });

  setHealth('anchor-lag', computeAnchorLag(), 'info', { sub: 'last anchor confirmation' });
}

function setHealth(id, value, tone, opts) {
  const card = document.getElementById('card-' + id);
  if (!card) return;
  card.classList.remove('ok', 'warn', 'alert', 'info');
  card.classList.add(tone || 'info');
  let v = card.querySelector('.health-value');
  if (v) {
    v.textContent = value;
    v.classList.remove('small', 'tag');
    if (opts?.small) v.classList.add('small');
  }
  // Sub-line.
  let sub = card.querySelector('.health-sub');
  if (opts?.sub) {
    if (!sub) {
      sub = document.createElement('div');
      sub.className = 'health-sub';
      card.appendChild(sub);
    }
    sub.textContent = opts.sub;
  } else if (sub) {
    sub.remove();
  }
}

function setHealthMode(id, mode) {
  const card = document.getElementById('card-' + id);
  if (!card) return;
  const v = card.querySelector('.health-value');
  if (!v) return;
  v.textContent = mode || '—';
  v.classList.remove('small');
  v.classList.add('tag');
  v.classList.remove('testnet', 'mainnet', 'bookkeeping', 'off');
  if (mode === 'testnet') v.classList.add('testnet');
  else if (mode === 'mainnet') v.classList.add('mainnet');
  else if (mode === 'bookkeeping') v.classList.add('bookkeeping');
  else if (mode === 'off') v.classList.add('off');
  card.classList.remove('ok', 'warn', 'alert', 'info');
  if (mode === 'off') card.classList.add('warn');
  else if (mode === 'mainnet') card.classList.add('alert'); // mainnet = real money — flag
  else card.classList.add('info');
}

function pluginTone(h) {
  if (h.pluginsAdmitted === null) return 'info';
  if (h.familyCount && h.pluginsAdmitted < h.familyCount) return 'warn';
  return 'ok';
}

function computeAnchorLag() {
  if (!state.anchors.length) return '—';
  const a = state.anchors[0];
  if (!a) return '—';
  // Need both submitted and confirmed timestamps. Fall back to
  // updated if specific fields missing.
  const submitted = a.submittedAt || a.updated;
  const confirmed = a.confirmedAt || a.updated;
  if (!submitted || !confirmed) return '—';
  const ms = Date.parse(confirmed) - Date.parse(submitted);
  if (!isFinite(ms) || ms < 0) return '<1s';
  if (ms < 1000) return '<1s';
  if (ms < 60_000) return Math.round(ms / 100) / 10 + 's';
  return Math.round(ms / 6000) / 10 + 'min';
}

function truncEndpoint(ep) {
  if (!ep) return 'local-only';
  // Show host only for visual brevity.
  try {
    const u = new URL(ep);
    return u.host + (u.pathname && u.pathname !== '/' ? u.pathname : '');
  } catch { return ep; }
}

function renderIntents() {
  const list = document.getElementById('intent-list');
  if (!list) return;
  const intents = Array.from(state.intents.values()).sort((a, b) => {
    const at = Date.parse(a.updated || a.created || 0) || 0;
    const bt = Date.parse(b.updated || b.created || 0) || 0;
    return bt - at;
  });
  document.getElementById('intent-count').textContent = intents.length;
  if (!intents.length) {
    list.innerHTML = `
      <div class="empty-spine">
        <div class="big-icon">⚡</div>
        <p>No intents yet</p>
        <div class="hint">Submit a typed intent via REST or the CLI to see the spine traverse.</div>
      </div>
    `;
    return;
  }
  let html = '';
  for (const intent of intents) {
    html += renderIntentRow(intent);
  }
  list.innerHTML = html;
}

function renderIntentRow(intent) {
  const stages = intent.stages || defaultStages();
  const status = pickStatus(intent, stages);
  const rowClass = status.cls;
  const goal = intent.goalType || '—';
  const actor = intent.actor || '';
  const ts = formatRelative(intent.updated || intent.created);

  let track = '';
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    const cls = s.completed ? 'done' : (i > 0 && stages[i-1].completed && !s.completed ? 'active' : '');
    // data-stage drives the per-stage gradient colour (Aurora design).
    track += `<span class="stage-dot ${cls}" data-stage="${i + 1}" data-tip="${escapeAttr(STAGE_TIPS[s.stage] || s.stage)}"></span>`;
    if (i < stages.length - 1) {
      const conn = s.completed && stages[i+1].completed ? 'done' : '';
      track += `<span class="stage-connector ${conn}"></span>`;
    }
  }

  return `
    <div class="intent-row ${rowClass}" data-intent-id="${escapeAttr(intent.id)}" onclick="window.__nexusOpenIntent('${escapeAttr(intent.id)}')">
      <div class="meta">
        <div class="meta-row">
          <span class="intent-id">${escapeText(intent.id)}</span>
          <span class="goal-pill">${escapeText(goal)}</span>
        </div>
        <div class="meta-row">
          ${actor ? `<span class="actor">${escapeText(actor)}</span>` : ''}
          ${ts ? `<span class="timestamp">${escapeText(ts)}</span>` : ''}
        </div>
      </div>
      <div class="stage-track">${track}</div>
      <div class="status-cluster">
        <span class="status-pill ${status.cls}">${escapeText(status.label)}</span>
      </div>
    </div>
  `;
}

function pickStatus(intent, stages) {
  if (intent.lastStageEvent === 'failed' || intent.outcomeStatus === 'failed') {
    return { cls: 'failed', label: 'failed' };
  }
  // All seven dots done → completed.
  if (stages.every((s) => s.completed)) {
    return { cls: 'completed', label: 'anchored' };
  }
  // Last completed stage gives status name.
  let last = '';
  for (const s of stages) if (s.completed) last = s.stage;
  switch (last) {
    case 'intent':    return { cls: 'pending',   label: 'awaiting plan' };
    case 'plan':      return { cls: 'pending',   label: 'awaiting approval' };
    case 'approval':  return { cls: 'pending',   label: 'approved' };
    case 'execution': return { cls: 'executing', label: 'executing' };
    case 'outcome':   return { cls: 'executing', label: 'outcome captured' };
    case 'evidence':  return { cls: 'executing', label: 'evidence finalized' };
    default:          return { cls: 'created',   label: 'created' };
  }
}

function renderAnchors() {
  const list = document.getElementById('anchor-chain');
  if (!list) return;
  const anchors = state.anchors || [];
  document.getElementById('anchor-count').textContent = anchors.length;
  if (!anchors.length) {
    list.innerHTML = `
      <div class="empty-spine">
        <div class="big-icon">⚓</div>
        <p>No anchors yet</p>
        <div class="hint">When the orchestrator anchors a bundle, it appears here with its L0 binding.</div>
      </div>
    `;
    return;
  }
  let html = '';
  for (const a of anchors) {
    html += renderAnchorRow(a);
  }
  list.innerHTML = html;
}

function renderAnchorRow(a) {
  const stateCls = String(a.anchorStatus || a.state || '').toLowerCase();
  const block = a.l0BlockHeight ?? a.infrixBlockHeight ?? '—';
  const tx = (a.l0TxHash || '').slice(0, 12);
  const purpose = (a.anchorPurpose || '—').replace(/_/g, ' ');
  const klass = a.anchorType || a.anchorClass || '—';
  const artifact = a.artifactType || '—';
  return `
    <div class="anchor-row ${stateCls}" data-anchor-id="${escapeAttr(a.id)}">
      <span class="block-num">#${escapeText(String(block))}</span>
      <span class="artifact-type">${escapeText(artifact)}</span>
      <span class="anchor-class">${escapeText(klass)}</span>
      <span class="anchor-purpose">${escapeText(purpose)}</span>
      <span class="anchor-state-pill" style="color: ${stateColor(stateCls)}">${escapeText(stateCls || 'unknown')}${tx ? ` · ${escapeText(tx)}…` : ''}</span>
    </div>
  `;
}

function stateColor(s) {
  switch (s) {
    case 'confirmed':  return 'var(--mint)';
    case 'submitted':  return 'var(--electric-blue)';
    case 'pending':    return 'var(--sunny)';
    case 'failed':     return 'var(--red)';
    case 'verified':   return 'var(--indigo)';
    default:           return 'var(--text-secondary)';
  }
}

function formatRelative(ts) {
  if (!ts) return '';
  const d = ts instanceof Date ? ts : new Date(ts);
  if (isNaN(d.getTime())) return '';
  const ms = Date.now() - d.getTime();
  if (ms < 0) return d.toLocaleTimeString();
  if (ms < 1500) return 'just now';
  if (ms < 60_000) return Math.floor(ms / 1000) + 's ago';
  if (ms < 3_600_000) return Math.floor(ms / 60_000) + 'm ago';
  return d.toLocaleTimeString();
}

function escapeText(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Click-through hook: the redesign plan's Phase 2 will land the
// Intent detail view. Phase 1 publishes a window-level seam so the
// router can intercept clicks even before that view exists; today
// the click logs to console + flips the URL hash so a returning
// Phase 2 build picks up the deep-link automatically.
window.__nexusOpenIntent = (id) => {
  if (!id) return;
  // For Phase 1 we leave the SPA on /spine and just record the
  // click intent in the URL so Phase 2's intent-detail view picks
  // it up when implemented. No view change yet.
  const url = new URL(window.location.href);
  url.hash = '#/intents?focus=' + encodeURIComponent(id);
  window.history.replaceState({ intentId: id }, '', url.toString());
};
