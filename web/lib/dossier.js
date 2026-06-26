// Nexus — preview-dossier renderer.
//
// NEXUS-REIMAGINED-2026-05-10 Phase 2 — Intent Studio And Preview.
//
// Renders the rich preview dossier returned by the nexus.previewDossier
// RPC into a layered, three-depth UI:
//
//   Depth 1 — Summary       (plain language + plan hash + total gas + approvals/waiver banner)
//   Depth 2 — Operational   (step graph + plugin selections + trust assumptions + expected evidence)
//   Depth 3 — Cryptographic (raw plan hash, ghost evidence hash, simulation fields, raw JSON)
//
// Each depth is collapsible. The default state shows Summary expanded
// and Operational + Cryptographic collapsed so the first-glance answer
// to "what will this do?" is one paragraph. Reviewers who want more
// open the deeper sections.
//
// Risks are surfaced at the top with severity badges so a blocking
// signal (policy denial) can never be missed even if the reviewer
// only reads the Summary.

import { shortHash, formatTime, jsonBlock, hashChip, STAGE_KEYS } from '/lib/spineCommon.js';
import { severityBadge, sortBySeverity } from '/lib/severity.js';

/**
 * Render a complete preview dossier into a DOM tree.
 * @param {Object} dossier — the nexus.previewDossier response payload
 * @param {Object} [opts]
 * @param {(payload:Object)=>void} [opts.onSubmit] — called when the user clicks "Submit this plan"
 * @returns {HTMLElement}
 */
export function renderDossier(dossier, opts = {}) {
  const root = document.createElement('div');
  root.className = 'dossier';

  if (!dossier || typeof dossier !== 'object') {
    const empty = document.createElement('div');
    empty.className = 'dossier-empty';
    empty.textContent = 'No dossier returned.';
    root.appendChild(empty);
    return root;
  }

  // Top status banner — pass / fail / blocked
  root.appendChild(renderStatusBanner(dossier));

  // Plain-language summary
  if (dossier.summary) {
    const sum = document.createElement('p');
    sum.className = 'dossier-summary-text';
    sum.textContent = dossier.summary;
    root.appendChild(sum);
  }

  // Risks rail (always visible; severity-sorted)
  const risks = Array.isArray(dossier.risks) ? sortBySeverity(dossier.risks) : [];
  if (risks.length > 0) root.appendChild(renderRisks(risks));

  // ── Depth 1: Summary ──────────────────────────────────────────────
  const summarySection = makeSection('Overview', true);
  summarySection.body.appendChild(renderSummaryGrid(dossier));
  root.appendChild(summarySection.element);

  // ── Depth 2: Operational ──────────────────────────────────────────
  const opSection = makeSection('Details', false);
  opSection.body.appendChild(renderOperational(dossier));
  root.appendChild(opSection.element);

  // ── Depth 3: Cryptographic ────────────────────────────────────────
  const cryptoSection = makeSection('Technical & cryptographic detail', false);
  cryptoSection.body.appendChild(renderCryptographic(dossier));
  root.appendChild(cryptoSection.element);

  // Submit handoff. Disabled when the policy denied the preview or
  // there is no plan to submit.
  if (typeof opts.onSubmit === 'function') {
    const submitWrap = document.createElement('div');
    submitWrap.className = 'dossier-submit-wrap';
    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'verify-btn dossier-submit-btn';
    const policyDenied = dossier.policyDecision && dossier.policyDecision.allowed === false;
    const noPlan = !dossier.plan;
    if (policyDenied) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Can\'t submit — blocked by policy';
    } else if (noPlan) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Can\'t submit — no plan';
    } else {
      submitBtn.textContent = `Submit (${dossier.plan.stepCount} step${dossier.plan.stepCount === 1 ? '' : 's'})`;
    }
    submitBtn.addEventListener('click', () => opts.onSubmit(dossier));
    submitWrap.appendChild(submitBtn);
    if (!submitBtn.disabled) {
      const note = document.createElement('p');
      note.className = 'dossier-submit-note';
      note.textContent = 'Submitting starts the action. This is your last chance to review.';
      submitWrap.appendChild(note);
    }
    root.appendChild(submitWrap);
  }

  // Raw payload — always at the bottom of Cryptographic, but also
  // available as a top-level "view raw" on every dossier.
  const rawDetails = document.createElement('details');
  rawDetails.className = 'raw-details dossier-raw';
  const rawSum = document.createElement('summary');
  rawSum.textContent = 'Raw dossier JSON';
  rawDetails.appendChild(rawSum);
  rawDetails.appendChild(jsonBlock(dossier));
  root.appendChild(rawDetails);

  return root;
}

// =================================================================
// Section helpers
// =================================================================
function makeSection(title, openByDefault) {
  const wrap = document.createElement('details');
  wrap.className = 'dossier-section';
  if (openByDefault) wrap.open = true;
  const sum = document.createElement('summary');
  sum.className = 'dossier-section-head';
  sum.textContent = title;
  wrap.appendChild(sum);
  const body = document.createElement('div');
  body.className = 'dossier-section-body';
  wrap.appendChild(body);
  return { element: wrap, body };
}

function renderStatusBanner(d) {
  const banner = document.createElement('div');
  banner.className = 'verify-summary dossier-banner';
  const status = d.status || 'unknown';
  const policyAllowed = !d.policyDecision || d.policyDecision.allowed !== false;
  if (status === 'preview_ok' && policyAllowed) {
    banner.classList.add('verify-pass');
    banner.textContent = 'Ready to submit. Review the details below before clicking Submit.';
  } else if (d.policyDecision && d.policyDecision.allowed === false) {
    banner.classList.add('verify-fail');
    banner.textContent = `Blocked by policy: ${d.policyDecision.auditMsg || 'no matching rule'}`;
  } else if (status === 'preview_failed') {
    banner.classList.add('verify-fail');
    banner.textContent = `Preview failed: ${d.error || 'unknown error'}`;
  } else if (status === 'no_plan_produced') {
    banner.classList.add('verify-warn');
    banner.textContent = 'Couldn\'t build a plan for this action — see the details below.';
  } else {
    banner.textContent = `Status: ${status}`;
  }
  return banner;
}

function renderRisks(risks) {
  const sec = document.createElement('div');
  sec.className = 'dossier-risks';
  const h = document.createElement('h4');
  h.textContent = `Risks · ${risks.length}`;
  sec.appendChild(h);
  for (const r of risks) {
    const row = document.createElement('div');
    row.className = `dossier-risk-row risk-${r.severity || 'normal'}`;
    const head = document.createElement('div');
    head.className = 'cockpit-rail-row-head';
    const kind = document.createElement('span');
    kind.className = 'cockpit-rail-row-kind';
    kind.textContent = (r.kind || 'risk').replace(/_/g, ' ');
    head.appendChild(kind);
    head.appendChild(severityBadge(r.severity));
    row.appendChild(head);
    const msg = document.createElement('div');
    msg.className = 'cockpit-rail-row-msg';
    msg.textContent = r.message || '';
    row.appendChild(msg);
    sec.appendChild(row);
  }
  return sec;
}

// =================================================================
// Depth 1 — Summary grid
// =================================================================
function renderSummaryGrid(d) {
  const grid = document.createElement('div');
  grid.className = 'dossier-summary-grid';

  if (d.plan) {
    grid.appendChild(metaRow('Goal type', d.goalType));
    grid.appendChild(metaRow('Plan ID', d.plan.id || '—'));
    grid.appendChild(metaRowHash('Plan hash', d.plan.planHash));
    grid.appendChild(metaRow('Steps', String(d.plan.stepCount || 0)));
    grid.appendChild(metaRow('Total gas estimate', String(d.plan.totalGasEstimate || 0)));
    if (d.plan.driftThreshold) grid.appendChild(metaRow('Drift threshold', String(d.plan.driftThreshold)));
    if (d.plan.deadline) grid.appendChild(metaRow('Deadline', String(d.plan.deadline)));
  } else {
    grid.appendChild(metaRow('Goal type', d.goalType));
    grid.appendChild(metaRow('Status', d.status));
    if (d.error) grid.appendChild(metaRow('Error', d.error));
  }

  // Approvals or waiver
  const ap = d.approvals || {};
  if (ap.waiver) {
    grid.appendChild(metaRow('Approval', `WAIVED — ${ap.waiver.reason}`));
    if (ap.waiver.policyId) grid.appendChild(metaRow('Waiver policy', shortHash(ap.waiver.policyId, 28, 6)));
  } else if (Array.isArray(ap.required) && ap.required.length > 0) {
    grid.appendChild(metaRow('Approvals required', String(ap.required.length)));
  } else if (d.plan) {
    grid.appendChild(metaRow('Approvals', 'none and no waiver'));
  }

  if (Array.isArray(d.trustAssumptions) && d.trustAssumptions.length > 0) {
    grid.appendChild(metaRow('Trust profiles', d.trustAssumptions.length === 1
      ? d.trustAssumptions[0]
      : `${d.trustAssumptions.length} profiles`));
  }
  if (d.expectedEvidence) {
    grid.appendChild(metaRow('Evidence level', d.expectedEvidence.level || '—'));
    grid.appendChild(metaRow('Anchor posture', d.expectedEvidence.anchorPosture || '—'));
  }
  if (d.disclosureContext) {
    grid.appendChild(metaRow('Acting as', d.disclosureContext.actor || '—'));
    grid.appendChild(metaRow('Purpose', d.disclosureContext.purpose || '—'));
  }
  return grid;
}

// =================================================================
// Depth 2 — Operational
// =================================================================
function renderOperational(d) {
  const wrap = document.createElement('div');
  wrap.className = 'dossier-op';

  // Step graph
  if (d.stepGraph && Array.isArray(d.stepGraph.nodes) && d.stepGraph.nodes.length > 0) {
    const sec = subSection('Step graph');
    sec.body.appendChild(renderStepGraph(d.stepGraph));
    wrap.appendChild(sec.element);
  }

  // Approvals (full detail)
  if (d.approvals && (Array.isArray(d.approvals.required) ? d.approvals.required.length : 0) > 0) {
    const sec = subSection('Required approvals');
    for (const a of d.approvals.required) {
      const row = document.createElement('div');
      row.className = 'dossier-approval-row';
      const head = document.createElement('div');
      head.className = 'cockpit-rail-row-head';
      head.appendChild(spanLabel(a.stageId || 'stage'));
      head.appendChild(severityBadge('attention'));
      row.appendChild(head);
      const det = document.createElement('div');
      det.className = 'cockpit-rail-row-meta';
      const roles = (a.roles || []).join(', ') || '—';
      const idents = (a.identities || []).length;
      det.textContent = `roles: ${roles} · identity candidates: ${idents} · threshold: ${a.threshold || 0}`;
      row.appendChild(det);
      sec.body.appendChild(row);
    }
    wrap.appendChild(sec.element);
  }

  // Waiver detail
  if (d.approvals && d.approvals.waiver) {
    const sec = subSection('Approval waiver');
    const row = document.createElement('div');
    row.className = 'dossier-approval-row';
    const head = document.createElement('div');
    head.className = 'cockpit-rail-row-head';
    head.appendChild(spanLabel(d.approvals.waiver.reason || 'WAIVED'));
    head.appendChild(severityBadge('normal'));
    row.appendChild(head);
    const det = document.createElement('div');
    det.className = 'cockpit-rail-row-meta';
    det.textContent = `policy: ${d.approvals.waiver.policyId || '—'}`;
    row.appendChild(det);
    sec.body.appendChild(row);
  }

  // Plugin selections
  if (Array.isArray(d.pluginSelections) && d.pluginSelections.length > 0) {
    const sec = subSection('Plugin selections');
    const tbl = document.createElement('table');
    tbl.className = 'dossier-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Step</th><th>Family</th><th>Plugin</th><th>Fallbacks</th></tr>';
    tbl.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const sel of d.pluginSelections) {
      const tr = document.createElement('tr');
      tr.appendChild(td(sel.stepId, 'mono'));
      tr.appendChild(td(sel.chosen, 'mono'));
      tr.appendChild(td(sel.pluginId || '—', 'mono'));
      tr.appendChild(td((sel.fallbacks || []).join(', ') || '—', 'mono'));
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    sec.body.appendChild(tbl);
    wrap.appendChild(sec.element);
  }

  // Trust assumptions
  if (Array.isArray(d.trustAssumptions) && d.trustAssumptions.length > 0) {
    const sec = subSection('Trust assumptions');
    const ul = document.createElement('ul');
    ul.className = 'dossier-list';
    for (const t of d.trustAssumptions) {
      const li = document.createElement('li');
      li.className = 'mono';
      li.textContent = t;
      ul.appendChild(li);
    }
    sec.body.appendChild(ul);
    wrap.appendChild(sec.element);
  }

  // Expected evidence
  if (d.expectedEvidence) {
    const sec = subSection('Expected evidence and anchor');
    const grid = document.createElement('div');
    grid.className = 'dossier-summary-grid';
    grid.appendChild(metaRow('Evidence level', d.expectedEvidence.level || '—'));
    grid.appendChild(metaRow('Anchor posture', d.expectedEvidence.anchorPosture || '—'));
    if (Array.isArray(d.expectedEvidence.externalProofs) && d.expectedEvidence.externalProofs.length > 0) {
      grid.appendChild(metaRow('External proofs', String(d.expectedEvidence.externalProofs.length)));
    }
    grid.appendChild(metaRow('Compensation steps', String(d.expectedEvidence.compensationLen || 0)));
    sec.body.appendChild(grid);
    wrap.appendChild(sec.element);
  }

  // Policy decision
  if (d.policyDecision) {
    const sec = subSection('Policy decision');
    const grid = document.createElement('div');
    grid.className = 'dossier-summary-grid';
    grid.appendChild(metaRow('Allowed', d.policyDecision.allowed ? 'yes' : 'no'));
    grid.appendChild(metaRow('Effect', d.policyDecision.effect || '—'));
    if (d.policyDecision.matchedRule) grid.appendChild(metaRow('Matched rule', d.policyDecision.matchedRule));
    if (d.policyDecision.auditMsg) grid.appendChild(metaRow('Audit message', d.policyDecision.auditMsg));
    if (d.policyDecision.ruleCount !== undefined) grid.appendChild(metaRow('Rules evaluated', String(d.policyDecision.ruleCount)));
    sec.body.appendChild(grid);
    wrap.appendChild(sec.element);
  }

  return wrap;
}

function renderStepGraph(graph) {
  const wrap = document.createElement('div');
  wrap.className = 'dossier-step-graph';
  for (const node of graph.nodes) {
    const card = document.createElement('div');
    card.className = 'dossier-step-card';
    card.dataset.stage = stageIndex(node.spineStage);
    const h = document.createElement('div');
    h.className = 'dossier-step-head';
    const name = document.createElement('span');
    name.className = 'dossier-step-name';
    name.textContent = node.name || node.id || 'step';
    h.appendChild(name);
    const type = document.createElement('span');
    type.className = 'dossier-step-type mono';
    type.textContent = node.type || '';
    h.appendChild(type);
    card.appendChild(h);
    if (node.description) {
      const desc = document.createElement('p');
      desc.className = 'dossier-step-desc';
      desc.textContent = node.description;
      card.appendChild(desc);
    }
    const meta = document.createElement('div');
    meta.className = 'dossier-step-meta';
    if (node.executionTarget) meta.appendChild(metaRow('target', node.executionTarget));
    meta.appendChild(metaRow('gas', String(node.gasEstimate || 0)));
    if (node.spineStage) meta.appendChild(metaRow('spine', node.spineStage));
    if (node.policyCondition) meta.appendChild(metaRow('policy', node.policyCondition));
    card.appendChild(meta);
    // Find inbound deps for the user's mental model
    const incoming = (graph.edges || []).filter((e) => e.to === node.id);
    if (incoming.length > 0) {
      const deps = document.createElement('div');
      deps.className = 'dossier-step-deps mono';
      deps.textContent = '← ' + incoming.map((e) => e.from).join(', ');
      card.appendChild(deps);
    }
    wrap.appendChild(card);
  }
  return wrap;
}

function stageIndex(stageName) {
  const idx = STAGE_KEYS.indexOf(stageName);
  return idx >= 0 ? String(idx + 1) : '4';
}

// =================================================================
// Depth 3 — Cryptographic
// =================================================================
function renderCryptographic(d) {
  const wrap = document.createElement('div');
  wrap.className = 'dossier-crypto';

  // Hashes table
  const grid = document.createElement('div');
  grid.className = 'dossier-summary-grid';
  if (d.plan) {
    grid.appendChild(metaRowHash('Plan hash', d.plan.planHash));
    if (d.plan.ghostEvidenceHash) grid.appendChild(metaRowHash('Ghost evidence hash', d.plan.ghostEvidenceHash));
    grid.appendChild(metaRow('Generated at', formatTime(d.plan.generatedAt)));
    grid.appendChild(metaRow('Block height', String(d.plan.blockHeight || 0)));
  }
  if (d.simulation) {
    grid.appendChild(metaRow('Predicted success', d.simulation.predictedSuccess ? 'yes' : 'no'));
    grid.appendChild(metaRow('Estimated gas', String(d.simulation.estimatedGas || 0)));
    if (d.simulation.policyPreview) grid.appendChild(metaRow('Policy preview', d.simulation.policyPreview));
    if (Array.isArray(d.simulation.riskFlags) && d.simulation.riskFlags.length > 0) {
      grid.appendChild(metaRow('Risk flags', d.simulation.riskFlags.join(', ')));
    }
  }
  if (d.identity) {
    grid.appendChild(metaRow('Actor verified', d.identity.verified ? 'yes' : 'no'));
    if (d.identity.adiUrl) grid.appendChild(metaRow('Actor ADI', d.identity.adiUrl));
  }
  wrap.appendChild(grid);

  // Ghost evidence per-step predictions
  if (d.ghostEvidence && Array.isArray(d.ghostEvidence.steps) && d.ghostEvidence.steps.length > 0) {
    const sec = subSection('Ghost simulation per-step predictions');
    const tbl = document.createElement('table');
    tbl.className = 'dossier-table';
    tbl.innerHTML = '<thead><tr><th>Step</th><th>Predicted gas</th><th>Predicted status</th><th>State root after</th><th>Read · Write</th></tr></thead>';
    const tbody = document.createElement('tbody');
    for (const s of d.ghostEvidence.steps) {
      const tr = document.createElement('tr');
      tr.appendChild(td(s.stageId, 'mono'));
      tr.appendChild(td(String(s.gasPredicted || 0), 'mono'));
      tr.appendChild(td(s.statusPredicted, 'mono'));
      const rootCell = document.createElement('td');
      rootCell.appendChild(hashChip(s.stateRootAfter, { head: 10, tail: 6 }));
      tr.appendChild(rootCell);
      tr.appendChild(td(`${s.readSetSize} · ${s.writeSetSize}`, 'mono'));
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    sec.body.appendChild(tbl);
    const head = document.createElement('div');
    head.className = 'cockpit-rail-row-meta';
    head.textContent = `confidence: ${(d.ghostEvidence.overallConfidence || 0).toFixed(3)} · freshness: ${d.ghostEvidence.freshnessStatus || '—'}`;
    sec.body.insertBefore(head, sec.body.firstChild);
    wrap.appendChild(sec.element);
  }

  return wrap;
}

// =================================================================
// Helpers
// =================================================================
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

function spanLabel(text) {
  const s = document.createElement('span');
  s.textContent = text;
  return s;
}

function td(text, cls) {
  const c = document.createElement('td');
  if (cls) c.className = cls;
  c.textContent = String(text == null ? '' : text);
  return c;
}

function subSection(title) {
  const wrap = document.createElement('details');
  wrap.className = 'dossier-subsection';
  wrap.open = true;
  const sum = document.createElement('summary');
  sum.className = 'dossier-subsection-head';
  sum.textContent = title;
  wrap.appendChild(sum);
  const body = document.createElement('div');
  body.className = 'dossier-subsection-body';
  wrap.appendChild(body);
  return { element: wrap, body };
}
