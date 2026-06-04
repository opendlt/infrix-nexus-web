// Nexus — Subsystems hub.
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 4: a unified hub for the
// fourteen subsystem screens described in Section 3 + 4 of the
// redesign plan. The hub renders a left-rail navigation with the
// subsystems grouped by family (cross-domain / adaptive / privacy /
// tools), and the content pane renders the active subsystem's
// typed-object list (or detail when a sub-subpath is supplied).
//
// Subpaths:
//   #/subsystems                              — landing pane (defaults to settlement)
//   #/subsystems/<sub>                        — subsystem list
//   #/subsystems/<sub>/<id>                   — subsystem detail
//
// Where <sub> is one of:
//   settlement / bridge / arbitration       (cross-domain)
//   genome / immune / mission / awareness / shapeshift  (adaptive)
//   disclosure / confidential / verifier    (privacy/verification)
//   ghost / replay / temporal               (tools)
//
// Each subsystem either:
//   - Plugs into buildObjectBrowse with its list/detail RPC and column
//     map (Settlement, Bridge proof, Arbitration, Confidential
//     module, Verifier, Disclosure grant, Genome, Shapeshift, Pending
//     state)
//   - OR uses a dedicated function-based renderer (Immune, Mission,
//     Awareness, Ghost, Replay, Temporal — these subsystems already
//     have rich JSON-RPC entry points like immune.alerts /
//     mission.getMetrics / temporal.simulate)

import {
  rpcWithDisclosure,
  shortHash,
  formatTime,
  hashChip,
  jsonBlock,
  emptyState,
  kvRow,
  card,
  statusPill,
  loadingNode,
  errorNode,
  deeplinkButton,
} from '/lib/spineCommon.js';
import { buildObjectBrowse } from '/lib/objectBrowse.js';

// ---------------------------------------------------------------
// Subsystem registry — each entry has a render(root, subpath)
// function. The subpath at this level is everything after
// `#/subsystems/<sub>/`, so [] means list, [id] means detail.
// ---------------------------------------------------------------

const SETTLEMENT = buildObjectBrowse({
  listMethod:   'explorer.settlementList',
  detailMethod: 'explorer.settlementGet',
  title:        'Settlement instructions',
  subtitle:     'Multi-leg settlement with per-leg trust profiles, compensation policies, and finality bindings.',
  columns: [
    { label: 'ID',          shape: 'id',     width: 22 },
    { label: 'State',       shape: 'state' },
    { label: 'Source',      field: 'SourceAccount' },
    { label: 'Destination', field: 'DestAccount' },
    { label: 'Asset',       field: 'Asset' },
    { label: 'Amount',      field: 'Amount' },
    { label: 'Updated',     shape: 'updated' },
  ],
});

const BRIDGE = buildObjectBrowse({
  listMethod:   'explorer.bridgeProofList',
  detailMethod: 'explorer.bridgeProofGet',
  title:        'Bridge proofs',
  subtitle:     'Cross-chain proof envelopes — destination chain, source chain, message hash, finality status.',
  columns: [
    { label: 'ID',           shape: 'id',     width: 22 },
    { label: 'State',        shape: 'state' },
    { label: 'Source chain', field: 'SourceChain' },
    { label: 'Dest chain',   field: 'DestChain' },
    { label: 'Message',      shape: 'hash',   field: 'MessageHash' },
    { label: 'Updated',      shape: 'updated' },
  ],
});

const ARBITRATION = buildObjectBrowse({
  listMethod:   'explorer.arbitrationCaseList',
  detailMethod: 'explorer.arbitrationCaseGet',
  title:        'Arbitration cases',
  subtitle:     'Open / ruled / appealed cases with quorum signatures (3-of-5 or 5-of-7 panels) and ResolutionAttestations.',
  columns: [
    { label: 'ID',          shape: 'id',     width: 22 },
    { label: 'State',       shape: 'state' },
    { label: 'Quorum',      field: 'Quorum' },
    { label: 'Threshold',   field: 'Threshold' },
    { label: 'Panel',       field: 'PanelID' },
    { label: 'Updated',     shape: 'updated' },
  ],
});

const CONFIDENTIAL = buildObjectBrowse({
  listMethod:   'explorer.confidentialModuleList',
  detailMethod: 'explorer.confidentialModuleGet',
  title:        'Confidential modules',
  subtitle:     'Confidential execution modules. Each declares an isolation backend (gramine-sgx, nitro-cli, offline-attestation) and a HardwareIsolationProver.',
  columns: [
    { label: 'ID',                shape: 'id',     width: 22 },
    { label: 'Backend',           field: 'BackendClass' },
    { label: 'Isolation',         field: 'ConfidentialMode' },
    { label: 'Code hash',         shape: 'hash',   field: 'CodeHash' },
    { label: 'State',             shape: 'state' },
    { label: 'Updated',           shape: 'updated' },
  ],
});

const PENDING = buildObjectBrowse({
  listMethod:   'explorer.pendingStateList',
  detailMethod: 'explorer.pendingStateGet',
  title:        'Pending state',
  subtitle:     'Async-plugin shadow records (Bridge / ExternalAdapter / Agent / Confidential). Each tracks an in-flight async operation and its compensation policy.',
  columns: [
    { label: 'ID',          shape: 'id',     width: 22 },
    { label: 'Family',      field: 'Family' },
    { label: 'State',       shape: 'state' },
    { label: 'Stage',       field: 'Stage' },
    { label: 'Updated',     shape: 'updated' },
  ],
});

const VERIFIER = buildObjectBrowse({
  listMethod:   'explorer.verifierList',
  detailMethod: 'explorer.verifierGet',
  title:        'Verifier registry',
  subtitle:     'ZKP / external verifier registrations. Each declares the proof system + circuit name + verification key digest.',
  columns: [
    { label: 'ID',           shape: 'id',     width: 22 },
    { label: 'Proof system', field: 'ProofSystem' },
    { label: 'Circuit',      field: 'CircuitName' },
    { label: 'VK digest',    shape: 'hash',   field: 'VerificationKeyDigest' },
    { label: 'State',        shape: 'state' },
    { label: 'Updated',      shape: 'updated' },
  ],
});

const DISCLOSURE = buildObjectBrowse({
  listMethod:   'explorer.disclosureList',
  detailMethod: 'explorer.disclosureGet',
  title:        'Disclosure grants',
  subtitle:     'Per-actor disclosure permissions over private fields. Each grant carries a purpose, a scope, and an expiry.',
  columns: [
    { label: 'ID',         shape: 'id',     width: 22 },
    { label: 'Grantee',    field: 'Grantee' },
    { label: 'Object',     field: 'TargetObjectURL' },
    { label: 'Purpose',    field: 'Purpose' },
    { label: 'State',      shape: 'state' },
    { label: 'Updated',    shape: 'updated' },
  ],
});

const GENOME = buildObjectBrowse({
  listMethod:   'explorer.genomeList',
  detailMethod: 'explorer.genomeGet',
  title:        'Genome components',
  subtitle:     'Component versions with propagation events and quarantine state.',
  columns: [
    { label: 'ID',         shape: 'id',     width: 22 },
    { label: 'Component',  field: 'ComponentName' },
    { label: 'Version',    field: 'Version' },
    { label: 'State',      shape: 'state' },
    { label: 'Updated',    shape: 'updated' },
  ],
});

const SHAPESHIFT = buildObjectBrowse({
  listMethod:   'explorer.shapeTransitionList',
  detailMethod: '',  // no per-transition detail; events are atomic
  title:        'Shape transitions',
  subtitle:     'Recorded shape transitions across registered shape-shift behaviours.',
  columns: [
    { label: 'ID',         shape: 'id',     width: 22 },
    { label: 'Shape',      field: 'ShapeID' },
    { label: 'From',       field: 'From' },
    { label: 'To',         field: 'To' },
    { label: 'State',      shape: 'state' },
    { label: 'Updated',    shape: 'updated' },
  ],
});

// ---------------------------------------------------------------
// Function-based subsystems (no typed-object table — they call
// already-rich JSON-RPC entry points like immune.alerts /
// mission.getMetrics / temporal.simulate)
// ---------------------------------------------------------------

const IMMUNE = {
  async render(root) {
    root.replaceChildren();
    const head = document.createElement('div');
    head.className = 'spine-section-head';
    const h = document.createElement('h2');
    h.textContent = 'Immune';
    head.appendChild(h);
    const sub = document.createElement('p');
    sub.className = 'spine-section-sub';
    sub.textContent = 'Invariant violations + alert feed + quarantine list. Driven by the immune subsystem\'s per-contract circuit-breaker and forensic-report engine.';
    head.appendChild(sub);
    root.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'detail-grid';
    root.appendChild(grid);

    const alertsBody = document.createElement('div');
    alertsBody.appendChild(loadingNode('Loading alerts…'));
    grid.appendChild(card('Alerts', alertsBody));

    const quarBody = document.createElement('div');
    quarBody.appendChild(loadingNode('Loading quarantine list…'));
    grid.appendChild(card('Quarantine', quarBody));

    const violBody = document.createElement('div');
    violBody.appendChild(loadingNode('Loading violations…'));
    grid.appendChild(card('Violations', violBody));

    Promise.all([
      rpcWithDisclosure('immune.alerts', {}).catch((e) => ({ error: e })),
      rpcWithDisclosure('immune.quarantineList', {}).catch((e) => ({ error: e })),
      rpcWithDisclosure('immune.violations', {}).catch((e) => ({ error: e })),
    ]).then(([alerts, quar, viol]) => {
      renderArrayCard(alertsBody, alerts, 'No active alerts.');
      renderArrayCard(quarBody, quar, 'No quarantined items.');
      renderArrayCard(violBody, viol, 'No invariant violations.');
    });
  },
};

const MISSION = {
  async render(root) {
    root.replaceChildren();
    const head = document.createElement('div');
    head.className = 'spine-section-head';
    const h = document.createElement('h2');
    h.textContent = 'Mission';
    head.appendChild(h);
    const sub = document.createElement('p');
    sub.className = 'spine-section-sub';
    sub.textContent = 'System-level mission metrics, alerts, and snapshots.';
    head.appendChild(sub);
    root.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'detail-grid';
    root.appendChild(grid);

    const sysBody = document.createElement('div');
    sysBody.appendChild(loadingNode('Loading system metrics…'));
    grid.appendChild(card('System metrics', sysBody));

    const alertBody = document.createElement('div');
    alertBody.appendChild(loadingNode('Loading mission alerts…'));
    grid.appendChild(card('Alerts', alertBody));

    const snapBody = document.createElement('div');
    snapBody.appendChild(loadingNode('Loading snapshot…'));
    grid.appendChild(card('Snapshot', snapBody));

    Promise.all([
      rpcWithDisclosure('mission.getSystemMetrics', {}).catch((e) => ({ error: e })),
      rpcWithDisclosure('mission.getAlerts', {}).catch((e) => ({ error: e })),
      rpcWithDisclosure('mission.getSnapshot', {}).catch((e) => ({ error: e })),
    ]).then(([sys, alerts, snap]) => {
      renderObjectCard(sysBody, sys);
      renderArrayCard(alertBody, alerts, 'No mission alerts.');
      renderObjectCard(snapBody, snap);
    });
  },
};

const AWARENESS = {
  async render(root) {
    root.replaceChildren();
    const head = document.createElement('div');
    head.className = 'spine-section-head';
    const h = document.createElement('h2');
    h.textContent = 'Awareness';
    head.appendChild(h);
    const sub = document.createElement('p');
    sub.className = 'spine-section-sub';
    sub.textContent = 'Per-contract behavioural fingerprints — call count, gas trend, unique callers, value outflow, anomaly score. Provide a contract URL to inspect.';
    head.appendChild(sub);
    root.appendChild(head);

    const form = document.createElement('div');
    form.className = 'spine-filter-bar';
    const lbl = document.createElement('label');
    lbl.className = 'spine-filter';
    const span = document.createElement('span');
    span.textContent = 'Contract URL';
    lbl.appendChild(span);
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'acc://contract.acme';
    lbl.appendChild(input);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'verify-btn';
    btn.textContent = 'Profile';
    form.appendChild(lbl);
    form.appendChild(btn);
    root.appendChild(form);

    const out = document.createElement('div');
    out.className = 'detail-grid';
    root.appendChild(out);
    out.appendChild(emptyState('Provide a contract URL to load its behavioural profile.'));

    btn.addEventListener('click', async () => {
      const url = input.value.trim();
      if (!url) return;
      out.replaceChildren(loadingNode('Loading profile…'));
      try {
        const profile = await rpcWithDisclosure('awareness.profile', { contract: url });
        out.replaceChildren();
        const c = document.createElement('section');
        c.className = 'spine-card';
        const t = document.createElement('h3');
        t.className = 'spine-card-title';
        t.textContent = 'Behavioural profile';
        c.appendChild(t);
        c.appendChild(jsonBlock(profile));
        out.appendChild(c);
      } catch (err) {
        out.replaceChildren(errorNode(err));
      }
    });
  },
};

const GHOST = {
  async render(root) {
    root.replaceChildren();
    const head = document.createElement('div');
    head.className = 'spine-section-head';
    const h = document.createElement('h2');
    h.textContent = 'Ghost (simulator)';
    head.appendChild(h);
    const sub = document.createElement('p');
    sub.className = 'spine-section-sub';
    sub.textContent = 'Predicted vs actual drift on simulated calls. Use ghost.simulate to run a counterfactual without committing.';
    head.appendChild(sub);
    root.appendChild(head);

    const form = document.createElement('div');
    form.className = 'spine-filter-bar';

    const ctxWrap = document.createElement('label');
    ctxWrap.className = 'spine-filter';
    const ctxSpan = document.createElement('span');
    ctxSpan.textContent = 'Simulation params (JSON)';
    ctxWrap.appendChild(ctxSpan);
    const ctxInput = document.createElement('textarea');
    ctxInput.style.minWidth = '480px';
    ctxInput.style.minHeight = '120px';
    ctxInput.style.fontFamily = 'var(--mono)';
    ctxInput.value = '{ "contract": "acc://test.acme/counter", "function": "increment" }';
    ctxWrap.appendChild(ctxInput);
    form.appendChild(ctxWrap);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'verify-btn';
    btn.textContent = 'Simulate';
    form.appendChild(btn);
    root.appendChild(form);

    const out = document.createElement('div');
    root.appendChild(out);

    btn.addEventListener('click', async () => {
      let params = {};
      try { params = JSON.parse(ctxInput.value || '{}'); }
      catch (err) { out.replaceChildren(errorNode(new Error('JSON parse: ' + err.message))); return; }
      btn.disabled = true;
      out.replaceChildren(loadingNode('Simulating…'));
      try {
        const r = await rpcWithDisclosure('ghost.simulate', params);
        out.replaceChildren();
        const c = document.createElement('section');
        c.className = 'spine-card';
        const t = document.createElement('h3');
        t.className = 'spine-card-title';
        t.textContent = 'Simulation result';
        c.appendChild(t);
        c.appendChild(jsonBlock(r));
        out.appendChild(c);
      } catch (err) {
        out.replaceChildren(errorNode(err));
      } finally {
        btn.disabled = false;
      }
    });
  },
};

const REPLAY = {
  async render(root) {
    root.replaceChildren();
    const head = document.createElement('div');
    head.className = 'spine-section-head';
    const h = document.createElement('h2');
    h.textContent = 'Replay';
    head.appendChild(h);
    const sub = document.createElement('p');
    sub.className = 'spine-section-sub';
    sub.textContent = 'Deterministic re-execution of a past tx. Provide a tx hash; the result includes step-by-step trace + memory diff + gas flamegraph.';
    head.appendChild(sub);
    root.appendChild(head);

    const form = document.createElement('div');
    form.className = 'spine-filter-bar';
    const lbl = document.createElement('label');
    lbl.className = 'spine-filter';
    const span = document.createElement('span');
    span.textContent = 'Tx hash';
    lbl.appendChild(span);
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '0x… or tx hash';
    lbl.appendChild(input);
    const replayBtn = document.createElement('button');
    replayBtn.type = 'button';
    replayBtn.className = 'verify-btn';
    replayBtn.textContent = 'Replay';
    const flameBtn = document.createElement('button');
    flameBtn.type = 'button';
    flameBtn.className = 'verify-btn';
    flameBtn.textContent = 'Flamegraph';
    form.appendChild(lbl);
    form.appendChild(replayBtn);
    form.appendChild(flameBtn);
    root.appendChild(form);

    const out = document.createElement('div');
    out.className = 'detail-grid';
    root.appendChild(out);

    replayBtn.addEventListener('click', async () => {
      const tx = input.value.trim();
      if (!tx) return;
      replayBtn.disabled = true;
      out.replaceChildren(loadingNode('Replaying…'));
      try {
        const r = await rpcWithDisclosure('replay.execute', { txHash: tx });
        out.replaceChildren();
        const c = document.createElement('section');
        c.className = 'spine-card';
        const t = document.createElement('h3');
        t.className = 'spine-card-title';
        t.textContent = 'Replay trace';
        c.appendChild(t);
        c.appendChild(jsonBlock(r));
        out.appendChild(c);
      } catch (err) {
        out.replaceChildren(errorNode(err));
      } finally {
        replayBtn.disabled = false;
      }
    });

    flameBtn.addEventListener('click', async () => {
      const tx = input.value.trim();
      if (!tx) return;
      flameBtn.disabled = true;
      out.replaceChildren(loadingNode('Building flamegraph…'));
      try {
        const r = await rpcWithDisclosure('replay.flamegraph', { txHash: tx });
        out.replaceChildren();
        const c = document.createElement('section');
        c.className = 'spine-card';
        const t = document.createElement('h3');
        t.className = 'spine-card-title';
        t.textContent = 'Flamegraph';
        c.appendChild(t);
        c.appendChild(jsonBlock(r));
        out.appendChild(c);
      } catch (err) {
        out.replaceChildren(errorNode(err));
      } finally {
        flameBtn.disabled = false;
      }
    });
  },
};

const TEMPORAL = {
  async render(root) {
    root.replaceChildren();
    const head = document.createElement('div');
    head.className = 'spine-section-head';
    const h = document.createElement('h2');
    h.textContent = 'Temporal';
    head.appendChild(h);
    const sub = document.createElement('p');
    sub.className = 'spine-section-sub';
    sub.textContent = 'Time-travel state queries and counterfactual simulations. Lookup state at a past block, list scheduled callbacks, simulate "what if".';
    head.appendChild(sub);
    root.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'detail-grid';
    root.appendChild(grid);

    // State at block tool
    const stateBody = document.createElement('div');
    const stateForm = document.createElement('div');
    stateForm.className = 'spine-filter-bar';
    const cWrap = inlineInput('Contract URL', '', 'acc://contract.acme');
    const bWrap = inlineInput('Block', '', 'numeric');
    stateForm.appendChild(cWrap.wrap);
    stateForm.appendChild(bWrap.wrap);
    const stateBtn = document.createElement('button');
    stateBtn.type = 'button';
    stateBtn.className = 'verify-btn';
    stateBtn.textContent = 'Lookup';
    stateForm.appendChild(stateBtn);
    stateBody.appendChild(stateForm);
    const stateOut = document.createElement('div');
    stateBody.appendChild(stateOut);
    stateBtn.addEventListener('click', async () => {
      stateBtn.disabled = true;
      stateOut.replaceChildren(loadingNode('Querying past state…'));
      try {
        const r = await rpcWithDisclosure('temporal.stateAtBlock', {
          contract: cWrap.input.value.trim(),
          blockHeight: Number(bWrap.input.value),
        });
        stateOut.replaceChildren(jsonBlock(r));
      } catch (err) {
        stateOut.replaceChildren(errorNode(err));
      } finally {
        stateBtn.disabled = false;
      }
    });
    grid.appendChild(card('State at block', stateBody));

    // Scheduled callbacks
    const cbBody = document.createElement('div');
    const cbForm = document.createElement('div');
    cbForm.className = 'spine-filter-bar';
    const ccWrap = inlineInput('Contract URL', '', 'acc://contract.acme');
    cbForm.appendChild(ccWrap.wrap);
    const cbBtn = document.createElement('button');
    cbBtn.type = 'button';
    cbBtn.className = 'verify-btn';
    cbBtn.textContent = 'List callbacks';
    cbForm.appendChild(cbBtn);
    cbBody.appendChild(cbForm);
    const cbOut = document.createElement('div');
    cbBody.appendChild(cbOut);
    cbBtn.addEventListener('click', async () => {
      cbBtn.disabled = true;
      cbOut.replaceChildren(loadingNode('Loading callbacks…'));
      try {
        const r = await rpcWithDisclosure('temporal.listCallbacks', { contract: ccWrap.input.value.trim() });
        renderArrayCard(cbOut, r, 'No scheduled callbacks.');
      } catch (err) {
        cbOut.replaceChildren(errorNode(err));
      } finally {
        cbBtn.disabled = false;
      }
    });
    grid.appendChild(card('Scheduled callbacks', cbBody));

    // Simulate
    const simBody = document.createElement('div');
    const simForm = document.createElement('div');
    simForm.className = 'spine-filter-bar';
    const simWrap = document.createElement('label');
    simWrap.className = 'spine-filter';
    const simSpan = document.createElement('span');
    simSpan.textContent = 'Simulation params (JSON)';
    simWrap.appendChild(simSpan);
    const simInput = document.createElement('textarea');
    simInput.style.minWidth = '380px';
    simInput.style.minHeight = '100px';
    simInput.style.fontFamily = 'var(--mono)';
    simInput.value = '{ "contract": "acc://test.acme/counter" }';
    simWrap.appendChild(simInput);
    simForm.appendChild(simWrap);
    const simBtn = document.createElement('button');
    simBtn.type = 'button';
    simBtn.className = 'verify-btn';
    simBtn.textContent = 'Simulate';
    simForm.appendChild(simBtn);
    simBody.appendChild(simForm);
    const simOut = document.createElement('div');
    simBody.appendChild(simOut);
    simBtn.addEventListener('click', async () => {
      simBtn.disabled = true;
      simOut.replaceChildren(loadingNode('Simulating…'));
      let params = {};
      try { params = JSON.parse(simInput.value || '{}'); }
      catch (err) { simOut.replaceChildren(errorNode(new Error('JSON parse: ' + err.message))); simBtn.disabled = false; return; }
      try {
        const r = await rpcWithDisclosure('temporal.simulate', params);
        simOut.replaceChildren(jsonBlock(r));
      } catch (err) {
        simOut.replaceChildren(errorNode(err));
      } finally {
        simBtn.disabled = false;
      }
    });
    grid.appendChild(card('Counterfactual simulate', simBody));
  },
};

// ---------------------------------------------------------------
// Hub registry
// ---------------------------------------------------------------

const SUBSYSTEMS = [
  { group: 'Cross-domain', id: 'settlement',   label: 'Settlement',   handler: SETTLEMENT },
  { group: 'Cross-domain', id: 'bridge',       label: 'Bridge',       handler: BRIDGE },
  { group: 'Cross-domain', id: 'arbitration',  label: 'Arbitration',  handler: ARBITRATION },
  { group: 'Adaptive',     id: 'genome',       label: 'Genome',       handler: GENOME },
  { group: 'Adaptive',     id: 'immune',       label: 'Immune',       handler: IMMUNE },
  { group: 'Adaptive',     id: 'mission',      label: 'Mission',      handler: MISSION },
  { group: 'Adaptive',     id: 'awareness',    label: 'Awareness',    handler: AWARENESS },
  { group: 'Adaptive',     id: 'shapeshift',   label: 'Shapeshift',   handler: SHAPESHIFT },
  { group: 'Privacy',      id: 'disclosure',   label: 'Disclosure',   handler: DISCLOSURE },
  { group: 'Privacy',      id: 'confidential', label: 'Confidential', handler: CONFIDENTIAL },
  { group: 'Privacy',      id: 'verifier',     label: 'Verifier',     handler: VERIFIER },
  { group: 'Async',        id: 'pending',      label: 'Pending state', handler: PENDING },
  { group: 'Tools',        id: 'ghost',        label: 'Ghost',        handler: GHOST },
  { group: 'Tools',        id: 'replay',       label: 'Replay',       handler: REPLAY },
  { group: 'Tools',        id: 'temporal',     label: 'Temporal',     handler: TEMPORAL },
];

let rootEl = null;
let currentSubpath = [];

export const subsystemsView = {
  mount(root, subpath) {
    rootEl = root;
    currentSubpath = Array.isArray(subpath) ? subpath : [];
    renderHub();
  },
  onSubpathChange(subpath) {
    currentSubpath = Array.isArray(subpath) ? subpath : [];
    if (rootEl) renderContent();
  },
};

function renderHub() {
  rootEl.replaceChildren();
  const layout = document.createElement('div');
  layout.className = 'subsystems-layout';

  const rail = document.createElement('aside');
  rail.className = 'subsystems-rail';
  let lastGroup = '';
  for (const s of SUBSYSTEMS) {
    if (s.group !== lastGroup) {
      const g = document.createElement('div');
      g.className = 'subsystems-group';
      g.textContent = s.group;
      rail.appendChild(g);
      lastGroup = s.group;
    }
    const a = document.createElement('a');
    a.className = 'subsystems-link';
    a.dataset.sub = s.id;
    a.href = '#/subsystems/' + s.id;
    a.textContent = s.label;
    rail.appendChild(a);
  }
  layout.appendChild(rail);

  const content = document.createElement('div');
  content.className = 'subsystems-content';
  content.id = 'subsystems-content';
  layout.appendChild(content);

  rootEl.appendChild(layout);

  renderContent();
}

function renderContent() {
  if (!rootEl) return;
  const content = rootEl.querySelector('#subsystems-content');
  if (!content) return;
  // Highlight the active rail link
  const activeId = currentSubpath[0] || 'settlement';
  for (const link of rootEl.querySelectorAll('.subsystems-link')) {
    if (link.dataset.sub === activeId) link.classList.add('active');
    else link.classList.remove('active');
  }
  const sub = SUBSYSTEMS.find((s) => s.id === activeId);
  if (!sub) {
    content.replaceChildren(emptyState('Unknown subsystem.'));
    return;
  }
  // Detail vs list dispatch
  const handler = sub.handler;
  if (typeof handler.render === 'function') {
    handler.render(content);
    return;
  }
  // ObjectBrowse handler — has renderList / renderDetail
  const detailID = currentSubpath[1];
  if (detailID && typeof handler.renderDetail === 'function' && handler.renderDetail) {
    handler.renderDetail(content, sub.id, detailID);
  } else if (typeof handler.renderList === 'function') {
    handler.renderList(content, sub.id);
  } else {
    content.replaceChildren(emptyState('Subsystem not yet wired.'));
  }
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function inlineInput(label, value, placeholder) {
  const wrap = document.createElement('label');
  wrap.className = 'spine-filter';
  const span = document.createElement('span');
  span.textContent = label;
  wrap.appendChild(span);
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  if (placeholder) input.placeholder = placeholder;
  wrap.appendChild(input);
  return { wrap, input };
}

function renderArrayCard(parent, resp, emptyMessage) {
  parent.replaceChildren();
  if (resp && resp.error) {
    parent.appendChild(errorNode(resp.error));
    return;
  }
  let arr = [];
  if (Array.isArray(resp)) arr = resp;
  else if (Array.isArray(resp && resp.items)) arr = resp.items;
  else if (Array.isArray(resp && resp.alerts)) arr = resp.alerts;
  else if (Array.isArray(resp && resp.callbacks)) arr = resp.callbacks;
  else if (Array.isArray(resp && resp.violations)) arr = resp.violations;
  else if (Array.isArray(resp && resp.quarantined)) arr = resp.quarantined;
  if (arr.length === 0) {
    parent.appendChild(emptyState(emptyMessage));
    return;
  }
  parent.appendChild(jsonBlock(arr));
}

function renderObjectCard(parent, resp) {
  parent.replaceChildren();
  if (resp && resp.error) {
    parent.appendChild(errorNode(resp.error));
    return;
  }
  if (!resp) {
    parent.appendChild(emptyState('No data.'));
    return;
  }
  parent.appendChild(jsonBlock(resp));
}
