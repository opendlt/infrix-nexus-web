// Nexus — #/studio Visual Workflow Studio (nextux-12).
//
// A high-quality interactive lab: a node palette, the flow graph, an honest
// assurance preview, a read-only simulation, and one-click export to the
// existing verified primitives (scenario, task, SDK, agent plan, markdown).
// Honest by construction: a simulation is a preview, never a live proof; a
// local flow never previews L4; the producing node is never trusted; and the
// generated code never skips approval or dry-run.

import { elt, setAttrs } from '/lib/uxDom.js';
import {
  loadStudio, isLive, flow, validation, simulation, exportsMap,
  nodes, edges, orderedNodeIds, nodeById, assuranceBadge, generatedSdkIsSafe, whyItMatters,
} from '/lib/studioGraph.js';
import { paletteGroups, kindLabel } from '/lib/studioPalette.js';

function sourceBanner() {
  const sim = simulation();
  const wrap = elt('section', 'studio-banner');
  setAttrs(wrap, { role: 'note', 'data-simulated': String(!!(sim && sim.simulated)) });
  wrap.appendChild(elt('strong', 'studio-banner-tag', 'Simulation preview'));
  wrap.appendChild(elt('span', 'studio-banner-text',
    ' — this is a preview, not a live proof. The producing node is never trusted; export the flow and run it through the gated surfaces to produce real, verifiable proof.'));
  const src = elt('p', 'studio-source');
  setAttrs(src, { 'data-live': String(isLive()) });
  src.textContent = isLive()
    ? 'Live studio context connected.'
    : 'Showing a sample flow (run `infrix studio validate <flow.infrixflow.json>` on your own).';
  wrap.appendChild(src);
  return wrap;
}

function palettePanel() {
  const panel = elt('section', 'studio-palette');
  setAttrs(panel, { 'aria-label': 'Node palette' });
  panel.appendChild(elt('h3', 'studio-subtitle', 'Palette'));
  for (const g of paletteGroups()) {
    const grp = elt('div', 'studio-palette-group');
    grp.appendChild(elt('h4', 'studio-palette-group-title', g.group));
    for (const it of g.items || []) {
      const item = elt('div', 'studio-palette-item');
      setAttrs(item, { 'data-kind': it.kind, draggable: 'false' });
      item.appendChild(elt('span', 'studio-palette-label', it.defaultLabel));
      const exp = elt('span', 'studio-palette-expert', it.expert || '');
      setAttrs(exp, { 'aria-hidden': 'false' });
      item.appendChild(exp);
      grp.appendChild(item);
    }
    panel.appendChild(grp);
  }
  return panel;
}

function graphPanel() {
  const panel = elt('section', 'studio-graph');
  setAttrs(panel, { 'aria-label': 'Flow graph' });
  panel.appendChild(elt('h3', 'studio-subtitle', flow().title || 'Flow'));

  const ids = orderedNodeIds();
  const track = elt('ol', 'studio-graph-track');
  ids.forEach((id, i) => {
    const n = nodeById(id);
    if (!n) return;
    const li = elt('li', 'studio-node');
    setAttrs(li, { 'data-kind': n.kind, 'data-node': n.id });
    const head = elt('div', 'studio-node-head');
    head.appendChild(elt('span', 'studio-node-kind', kindLabel(n.kind)));
    head.appendChild(elt('span', 'studio-node-chip', n.kind));
    li.appendChild(head);
    li.appendChild(elt('p', 'studio-node-label', n.label));
    const detail = nodeDetail(n);
    if (detail) li.appendChild(elt('p', 'studio-node-detail mono', detail));
    track.appendChild(li);
    if (i < ids.length - 1) {
      const arrow = elt('li', 'studio-edge', '↓');
      setAttrs(arrow, { 'aria-hidden': 'true' });
      track.appendChild(arrow);
    }
  });
  panel.appendChild(track);

  // An explicit connection list keeps the graph legible and gives the edges a
  // stable, testable presence even when laid out as a column.
  const es = edges();
  if (es.length) {
    const det = elt('details', 'studio-edges');
    det.appendChild(elt('summary', 'studio-edges-summary', `Connections (${es.length})`));
    const ul = elt('ul', 'studio-edges-list');
    for (const e of es) {
      ul.appendChild(elt('li', 'studio-edge-row mono', `${e.from} → ${e.to}`));
    }
    det.appendChild(ul);
    panel.appendChild(det);
  }
  return panel;
}

function nodeDetail(n) {
  if (n.action) return 'action: ' + n.action;
  if (n.actor) return 'actor: ' + n.actor;
  if (n.config && n.config.regulatorCanView) return 'discloses: ' + (n.config.regulatorCanView || []).join(', ');
  if (n.config && typeof n.config.threshold !== 'undefined') return 'threshold: ' + n.config.threshold;
  return '';
}

function assurancePanel() {
  const sim = simulation();
  const panel = elt('section', 'studio-assurance');
  setAttrs(panel, { 'aria-label': 'Assurance preview' });
  panel.appendChild(elt('h3', 'studio-subtitle', 'Assurance preview'));
  const badge = assuranceBadge();
  const badgeEl = elt('span', 'studio-badge', badge.label);
  setAttrs(badgeEl, { 'data-tone': badge.tone });
  panel.appendChild(badgeEl);

  const dl = elt('dl', 'studio-assurance-grid');
  const row = (k, v) => { dl.appendChild(elt('dt', null, k)); dl.appendChild(elt('dd', 'mono', String(v))); };
  if (sim) {
    row('Network', sim.network);
    row('Proof level cap', sim.proofLevelCap);
    row('Governance cap', sim.governanceCap);
    row('Trusts node', sim.nodeTrusted ? 'yes' : 'no — verified without trusting the node');
    row('Live proof', sim.simulated ? 'no — this is a simulation' : 'n/a');
  }
  panel.appendChild(dl);
  const honesty = elt('p', 'studio-assurance-honesty');
  honesty.textContent = sim && sim.proofLevelCap === 'L4'
    ? 'L4 is previewed only because a live L0 verify step is part of this run on Kermit.'
    : 'L4 is never previewed without a live L0 verify step on Kermit. This flow caps at ' + (sim ? sim.proofLevelCap : 'L3') + '.';
  panel.appendChild(honesty);
  if (sim) panel.appendChild(elt('p', 'studio-trust-boundary', sim.trustBoundary));
  return panel;
}

function simulationPanel() {
  const sim = simulation();
  const panel = elt('section', 'studio-sim');
  setAttrs(panel, { 'aria-label': 'Simulation' });
  panel.appendChild(elt('h3', 'studio-subtitle', 'Simulation (read-only)'));
  if (!sim) {
    panel.appendChild(elt('p', null, 'Simulate the flow to preview the path, approvals, and proof posture.'));
    return panel;
  }
  const list = (title, items, cls) => {
    if (!items || !items.length) return;
    panel.appendChild(elt('h4', 'studio-sim-title', title));
    const ul = elt('ul', cls);
    for (const it of items) ul.appendChild(elt('li', null, it));
    panel.appendChild(ul);
  };
  panel.appendChild(elt('p', 'studio-sim-path mono', sim.pathTaken.join(' → ')));
  list('Required approvals', sim.requiredApprovals, 'studio-sim-approvals');
  list('Missing inputs', sim.missingInputs, 'studio-sim-missing');
  list('Expected artifacts', sim.expectedArtifacts, 'studio-sim-artifacts');
  list('Possible failures', sim.possibleFailures, 'studio-sim-failures');
  return panel;
}

function exportPanel() {
  const ex = exportsMap();
  const formats = ['scenario', 'task', 'sdk-ts', 'agent-plan', 'markdown'];
  const panel = elt('section', 'studio-export');
  setAttrs(panel, { 'aria-label': 'Export' });
  panel.appendChild(elt('h3', 'studio-subtitle', 'Export to a verified primitive'));

  const chips = elt('div', 'studio-export-chips');
  setAttrs(chips, { role: 'tablist', 'aria-label': 'Export format' });
  const meta = elt('div', 'studio-export-meta');
  const pre = elt('pre', 'studio-export-artifact');
  setAttrs(pre, { 'aria-label': 'Exported artifact', tabindex: '0', role: 'region' });

  function show(fmt) {
    const res = ex[fmt];
    chips.querySelectorAll('.studio-export-chip').forEach((c) => {
      c.setAttribute('aria-selected', String(c.getAttribute('data-format') === fmt));
    });
    meta.replaceChildren();
    if (!res) { pre.textContent = '(no export)'; return; }
    const safe = fmt === 'sdk-ts' ? generatedSdkIsSafe() : true;
    const safeWord = res.safety && res.safety.mainnetDisabled && !res.safety.nodeTrusted && res.validation.valid && safe;
    const badge = elt('span', 'studio-export-safe', safeWord ? 'validated · mainnet disabled · node not trusted' : 'review needed');
    setAttrs(badge, { 'data-safe': String(!!safeWord) });
    meta.appendChild(badge);
    meta.appendChild(elt('p', 'studio-export-verify mono', 'Verify: ' + (res.verifierCommand || '')));
    meta.appendChild(elt('p', 'studio-export-docs', 'Docs: ' + (res.docsLinks || []).join(', ')));
    pre.textContent = res.artifact || '';
  }

  formats.forEach((fmt, i) => {
    const chip = elt('button', 'studio-export-chip', fmt);
    setAttrs(chip, { type: 'button', role: 'tab', 'data-format': fmt, 'aria-selected': String(i === 0) });
    chip.addEventListener('click', () => show(fmt));
    chips.appendChild(chip);
  });
  panel.appendChild(chips);
  panel.appendChild(meta);
  panel.appendChild(pre);
  show('scenario');
  return panel;
}

function whyPanel() {
  const panel = elt('details', 'studio-why');
  panel.appendChild(elt('summary', 'studio-why-summary', 'Show me why this matters'));
  panel.appendChild(elt('p', 'studio-why-body', whyItMatters()));
  return panel;
}

function expertPanel() {
  const panel = elt('details', 'studio-expert');
  panel.appendChild(elt('summary', 'studio-expert-summary', 'Expert details'));
  const body = elt('div', 'studio-expert-body');
  const val = validation();
  const dl = elt('dl', 'studio-expert-grid');
  const row = (k, v) => { dl.appendChild(elt('dt', null, k)); dl.appendChild(elt('dd', 'mono', String(v))); };
  row('Nodes', nodes().length);
  row('Edges', edges().length);
  row('Validation', val.valid ? 'valid' : 'invalid');
  for (const w of val.warnings || []) row('Warning', w);
  body.appendChild(dl);
  panel.appendChild(body);
  return panel;
}

function populate(body) {
  body.appendChild(sourceBanner());
  const grid = elt('div', 'studio-grid-layout');
  grid.appendChild(palettePanel());
  grid.appendChild(graphPanel());
  const side = elt('div', 'studio-side');
  side.appendChild(assurancePanel());
  side.appendChild(simulationPanel());
  grid.appendChild(side);
  body.appendChild(grid);
  body.appendChild(exportPanel());
  body.appendChild(whyPanel());
  body.appendChild(expertPanel());
}

export const studioView = {
  async mount(root) {
    root.replaceChildren();
    const shell = elt('div', 'workspace studio-view');
    const header = elt('header', 'workspace-header');
    header.appendChild(setAttrs(elt('h1', 'workspace-title', 'Studio'), { id: 'studio-title' }));
    header.appendChild(elt('p', 'workspace-subtitle',
      'Compose a governed workflow, simulate it, and export it to a scenario, task, SDK snippet, or agent plan. No node bypasses the gated execution paths, and a simulation is never a live proof.'));
    shell.appendChild(header);
    const body = elt('div', 'studio-body');
    body.appendChild(elt('p', 'studio-loading', 'Loading the studio…'));
    shell.appendChild(body);
    root.appendChild(shell);

    try {
      await loadStudio();
      body.replaceChildren();
      populate(body);
    } catch (err) {
      body.replaceChildren();
      const msg = elt('div', 'studio-error');
      msg.setAttribute('role', 'alert');
      msg.appendChild(elt('strong', null, 'Could not load the studio.'));
      msg.appendChild(elt('p', null, String((err && err.message) || err)));
      body.appendChild(msg);
    }
  },
};
