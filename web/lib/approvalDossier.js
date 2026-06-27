// Nexus — approval-dossier renderer.
//
// NEXUS-REIMAGINED-2026-05-10 Phase 3 — Approval Dossier.
//
// Renders the rich dossier returned by the nexus.approvalDossier RPC
// into a single dedicated review screen. The screen's only job is
// to answer the spec questions:
//
//   - What am I approving?
//   - What exact plan hash am I binding to?
//   - What simulation hash am I binding to?
//   - What scope limits apply?
//   - What role or credential am I using?
//   - Who else must sign?
//   - What invalidates this approval?
//
// Layout panels:
//
//   1. Banner       Status (pass / stale / blocked) + plan summary bullets
//   2. Identity     Signer identity + role + key page (filled by view)
//   3. Binding      Plan hash + simulation hash + scope (targets, types, gas)
//   4. Threshold    Required vs signed vs remaining, role-by-role
//   5. Signed list  Every existing approval envelope with state + sign data
//   6. Invalidators Every active stale-reason row with severity tints
//   7. CTA bar      Sign / Reject / Inspect raw envelope
//   8. Raw JSON     Full dossier on demand
//
// The component is presentational only: sign + reject callbacks are
// passed in by the caller (views/approve.js) so the dossier doesn't
// need to know about RPC plumbing.

import { shortHash, formatTime, jsonBlock, hashChip } from '/lib/spineCommon.js';
import { severityBadge, sortBySeverity } from '/lib/severity.js';
import { renderStepGraph, renderGhostPredictions } from '/lib/dossier.js';

// RUNBOOK-04 Task 2 (G3.3) — map known invalidator reason codes to a plain
// "what changed since earlier signatures" phrase (the plan-vs-previous diff).
// Only codes actually present in d.invalidators are rendered.
const DIFF_REASONS = {
  plan_hash_changed:      'The plan was regenerated — its hash differs from earlier signatures.',
  simulation_stale:       'The simulation is stale — re-preview before signing.',
  trust_profile_degraded: 'A trust profile this plan depends on degraded.',
  role_revoked:           'A required role/credential was revoked.',
  policy_changed:         'A governing policy changed since this plan was built.',
};

/**
 * Render a complete approval dossier.
 * @param {Object} dossier — nexus.approvalDossier response
 * @param {Object} [opts]
 * @param {(dossier, slot) => void} [opts.onSign] — slot is the picked {role, stageId, keyPage}
 * @param {(dossier) => void} [opts.onReject]
 * @param {(dossier) => void} [opts.onInspectRaw]
 * @returns {HTMLElement}
 */
export function renderApprovalDossier(dossier, opts = {}) {
  const root = document.createElement('div');
  root.className = 'approval-dossier';

  if (!dossier || typeof dossier !== 'object') {
    const empty = document.createElement('div');
    empty.className = 'dossier-empty';
    empty.textContent = 'No dossier returned.';
    root.appendChild(empty);
    return root;
  }

  // RUNBOOK-04 Task 2 — the sign slot the user commits to. Defaults to the
  // first remaining role-slot; the identity-panel picker (G3.2) updates it, and
  // the CTA passes it to onSign so we no longer auto-pick remaining[0] silently.
  const slot = { stageId: '', role: '' };
  if (Array.isArray(dossier.remaining) && dossier.remaining[0]) {
    slot.stageId = dossier.remaining[0].stageId || '';
    slot.role = dossier.remaining[0].role || '';
  } else if (Array.isArray(dossier.requiredRoles) && dossier.requiredRoles[0]) {
    slot.role = dossier.requiredRoles[0];
  }

  // ── 1. Status banner (+ single max-severity risk badge, G3.3) ──
  root.appendChild(renderApprovalBanner(dossier));

  // ── Plan-vs-previous diff — what changed since earlier signatures ──
  const diff = renderDiffBanner(dossier);
  if (diff) root.appendChild(diff);

  // ── Plan summary bullets ───────────────────────────────────────
  if (Array.isArray(dossier.summary) && dossier.summary.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'approval-summary-list';
    for (const s of dossier.summary) {
      const li = document.createElement('li');
      li.textContent = s;
      ul.appendChild(li);
    }
    root.appendChild(ul);
  }

  // ── Risks rail ─────────────────────────────────────────────────
  const risks = Array.isArray(dossier.risk) ? sortBySeverity(dossier.risk) : [];
  if (risks.length > 0) root.appendChild(renderRisks(risks));

  // ── 2. Identity panel (with role/key picker — G3.2) ────────────
  root.appendChild(renderIdentityPanel(dossier, slot));

  // ── 3. Plan + simulation binding panel ─────────────────────────
  root.appendChild(renderBindingPanel(dossier));

  // ── 3b. What this plan will do — step graph + ghost predictions (G3.1) ──
  // A signer must see at least what the author saw at preview. Rendered only
  // when the dossier carries them (backend field-parity with previewDossier).
  if (dossier.stepGraph && Array.isArray(dossier.stepGraph.nodes) && dossier.stepGraph.nodes.length) {
    const sec = panelSection('What this plan will do (step by step)');
    sec.body.appendChild(renderStepGraph(dossier.stepGraph));
    root.appendChild(sec.element);
  }
  if (dossier.ghostEvidence && Array.isArray(dossier.ghostEvidence.steps) && dossier.ghostEvidence.steps.length) {
    const sec = panelSection('Predicted per-step outcome');
    sec.body.appendChild(renderGhostPredictions(dossier.ghostEvidence));
    root.appendChild(sec.element);
  }

  // ── 4. Threshold panel (requirements gauge) ────────────────────
  root.appendChild(renderThresholdPanel(dossier));

  // ── 5. Signed approvals list ───────────────────────────────────
  if (Array.isArray(dossier.signed) && dossier.signed.length > 0) {
    root.appendChild(renderSignedList(dossier.signed));
  }

  // ── 6. Invalidators panel ──────────────────────────────────────
  root.appendChild(renderInvalidatorsPanel(dossier));

  // ── 7. CTA bar ─────────────────────────────────────────────────
  root.appendChild(renderCTABar(dossier, opts, slot));

  // ── 8. Raw JSON ────────────────────────────────────────────────
  const rawDetails = document.createElement('details');
  rawDetails.className = 'raw-details dossier-raw';
  const rawSum = document.createElement('summary');
  rawSum.textContent = 'Raw approval dossier JSON';
  rawDetails.appendChild(rawSum);
  rawDetails.appendChild(jsonBlock(dossier));
  root.appendChild(rawDetails);

  return root;
}

// =================================================================
// Panels
// =================================================================
function renderApprovalBanner(d) {
  const banner = document.createElement('div');
  banner.className = 'verify-summary approval-banner';
  const blocked = (d.invalidators || []).some((i) => i.severity === 'blocked' || i.severity === 'failed');
  if (!d.plan) {
    banner.classList.add('verify-warn');
    banner.textContent = 'Plan not available yet — can\'t review.';
  } else if (blocked) {
    banner.classList.add('verify-fail');
    banner.textContent = `Don't sign — ${(d.invalidators || []).length} issue(s) make this approval invalid. Fix the underlying problem first.`;
  } else if (Array.isArray(d.remaining) && d.remaining.length > 0) {
    banner.classList.add('verify-warn');
    banner.textContent = `${d.remaining.length} more signer${d.remaining.length === 1 ? '' : 's'} needed.`;
  } else if ((d.signed || []).length > 0) {
    banner.classList.add('verify-pass');
    banner.textContent = 'All required signatures collected.';
  } else {
    banner.textContent = 'Be the first to sign.';
  }
  // RUNBOOK-04 Task 2 (G3.3) — one-glance max-severity badge across the risk
  // signals ∪ the invalidators, so the reviewer triages at a glance.
  const sevItems = [...(d.risk || []), ...(d.invalidators || [])].filter((x) => x && x.severity);
  if (sevItems.length > 0) {
    const worst = sortBySeverity(sevItems)[0];
    if (worst && worst.severity) {
      const badge = severityBadge(worst.severity);
      badge.classList.add('approval-banner-badge');
      banner.appendChild(badge);
    }
  }
  return banner;
}

// RUNBOOK-04 Task 2 (G3.3) — plan-vs-previous diff. Summarises the change-classes
// present in the invalidators as a plain "what changed since this plan was built"
// banner. Pure presentation of the existing invalidators[] — no new RPC.
function renderDiffBanner(d) {
  const codes = new Set((d.invalidators || []).map((i) => i && i.reason).filter(Boolean));
  const lines = [];
  for (const code of codes) if (DIFF_REASONS[code]) lines.push(DIFF_REASONS[code]);
  if (lines.length === 0) return null;
  const wrap = document.createElement('div');
  wrap.className = 'approval-diff-banner';
  const h = document.createElement('div');
  h.className = 'approval-diff-head';
  h.textContent = 'What changed since this plan was built';
  wrap.appendChild(h);
  const ul = document.createElement('ul');
  ul.className = 'approval-diff-list';
  for (const l of lines) { const li = document.createElement('li'); li.textContent = l; ul.appendChild(li); }
  wrap.appendChild(ul);
  return wrap;
}

function renderIdentityPanel(d, slot) {
  const sec = panelSection('Acting identity & role');
  const grid = document.createElement('div');
  grid.className = 'dossier-summary-grid';
  const dc = d.disclosureContext || {};
  grid.appendChild(metaRow('Acting as', dc.actor || '—'));
  grid.appendChild(metaRow('Purpose', dc.purpose || '—'));
  grid.appendChild(metaRow('Workflow', dc.workflowInstance || '—'));
  if (Array.isArray(d.requiredRoles) && d.requiredRoles.length > 0) {
    grid.appendChild(metaRow('Plan requires roles', d.requiredRoles.join(', ')));
  }
  if (Array.isArray(d.requiredCredentials) && d.requiredCredentials.length > 0) {
    grid.appendChild(metaRow('Required credentials', d.requiredCredentials.join(', ')));
  }
  sec.body.appendChild(grid);

  // RUNBOOK-04 Task 2 (G3.2) — role/key-page picker. Replaces the silent
  // remaining[0] auto-pick: the signer chooses which role-slot they sign for.
  const remaining = Array.isArray(d.remaining) ? d.remaining : [];
  const options = remaining.map((r) => ({
    stageId: r.stageId || '', role: r.role || '', keyPage: r.keyPage || '', shortBy: r.shortBy,
  }));
  const covered = new Set(options.map((o) => o.role));
  for (const role of (d.requiredRoles || [])) {
    if (!covered.has(role)) options.push({ stageId: '', role, keyPage: '' });
  }
  if (options.length <= 1) {
    const only = options[0];
    sec.body.appendChild(metaRow('Signing as role',
      only ? (only.role || '—') + (only.stageId ? ' @ ' + only.stageId : '') : '—'));
  } else {
    const row = document.createElement('div');
    row.className = 'cockpit-compose-meta-row approval-role-pick';
    const l = document.createElement('label');
    l.className = 'cockpit-compose-meta-label';
    l.textContent = 'Sign as';
    l.htmlFor = 'approvalRolePick';
    row.appendChild(l);
    const sel = document.createElement('select');
    sel.id = 'approvalRolePick';
    sel.className = 'approval-role-select mono';
    options.forEach((o, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = (o.role || '(role)') + (o.stageId ? ' @ ' + o.stageId : '') +
        (o.shortBy !== undefined ? ` · short by ${o.shortBy}` : '');
      sel.appendChild(opt);
    });
    const apply = (i) => { const o = options[i] || {}; slot.role = o.role || ''; slot.stageId = o.stageId || ''; slot.keyPage = o.keyPage || ''; };
    sel.addEventListener('change', () => apply(Number(sel.value)));
    apply(0); // initialise slot to the first option
    row.appendChild(sel);
    sec.body.appendChild(row);
  }
  return sec.element;
}

function renderBindingPanel(d) {
  const sec = panelSection('Plan binding (what am I committing to?)');
  const grid = document.createElement('div');
  grid.className = 'dossier-summary-grid';
  grid.appendChild(metaRow('Plan ID', d.planId || '—'));
  if (d.intentId) grid.appendChild(metaRow('Intent ID', d.intentId));
  grid.appendChild(metaRowHash('Plan hash', d.planHash));
  grid.appendChild(metaRowHash('Simulation hash', d.simulationHash));
  if (d.scope) {
    if (Array.isArray(d.scope.targets) && d.scope.targets.length > 0) {
      grid.appendChild(metaRow('Targets', d.scope.targets.length === 1
        ? d.scope.targets[0]
        : `${d.scope.targets.length} targets`));
    }
    if (Array.isArray(d.scope.types) && d.scope.types.length > 0) {
      grid.appendChild(metaRow('Step types', d.scope.types.join(', ')));
    }
    if (d.scope.totalGasEstimate) grid.appendChild(metaRow('Total gas', String(d.scope.totalGasEstimate)));
    if (d.scope.deadline) grid.appendChild(metaRow('Plan deadline', String(d.scope.deadline)));
  }
  if (d.driftThreshold) grid.appendChild(metaRow('Drift threshold', String(d.driftThreshold)));
  sec.body.appendChild(grid);
  return sec.element;
}

function renderThresholdPanel(d) {
  const sec = panelSection('Threshold & remaining signers');
  const head = document.createElement('div');
  head.className = 'approval-threshold-head';
  const need = d.threshold || 0;
  const have = (d.signed || []).length;
  const stillNeeded = (d.remaining || []).length;
  head.innerHTML = `<strong>${have}</strong> of <strong>${need}</strong> signature(s) recorded · <strong>${stillNeeded}</strong> role-slot(s) still need signers.`;
  sec.body.appendChild(head);
  if (Array.isArray(d.remaining) && d.remaining.length > 0) {
    const tbl = document.createElement('table');
    tbl.className = 'dossier-table';
    tbl.innerHTML = '<thead><tr><th>Stage</th><th>Role</th><th>Need</th><th>Have</th><th>Short by</th></tr></thead>';
    const tbody = document.createElement('tbody');
    for (const r of d.remaining) {
      const tr = document.createElement('tr');
      tr.appendChild(td(r.stageId, 'mono'));
      tr.appendChild(td(r.role, 'mono'));
      tr.appendChild(td(String(r.need), 'mono'));
      tr.appendChild(td(String(r.have), 'mono'));
      tr.appendChild(td(String(r.shortBy), 'mono'));
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    sec.body.appendChild(tbl);
  }
  return sec.element;
}

function renderSignedList(signedRows) {
  const sec = panelSection(`Signed (${signedRows.length})`);
  const tbl = document.createElement('table');
  tbl.className = 'dossier-table';
  tbl.innerHTML = '<thead><tr><th>Identity</th><th>Role</th><th>State</th><th>Plan hash</th><th>Algorithm</th><th>When</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const a of signedRows) {
    const tr = document.createElement('tr');
    tr.appendChild(td(a.identity || '—', 'mono'));
    tr.appendChild(td(a.role || '—', 'mono'));
    tr.appendChild(td(a.state || '—'));
    const hashCell = document.createElement('td');
    if (a.planHash) hashCell.appendChild(hashChip(a.planHash, { head: 8, tail: 6 }));
    else { hashCell.textContent = '—'; hashCell.className = 'mono'; }
    tr.appendChild(hashCell);
    tr.appendChild(td(a.sigAlgo || '—', 'mono'));
    tr.appendChild(td(formatTime(a.createdAt) || '—', 'mono'));
    tbody.appendChild(tr);
  }
  tbl.appendChild(tbody);
  sec.body.appendChild(tbl);
  return sec.element;
}

function renderInvalidatorsPanel(d) {
  const inv = Array.isArray(d.invalidators) ? d.invalidators : [];
  if (inv.length === 0) {
    const sec = panelSection('What could invalidate this approval');
    const ok = document.createElement('p');
    ok.className = 'approval-invalidators-empty';
    ok.textContent = 'Nothing right now. Signatures here are valid against the current plan, simulation, role, credential, and trust state.';
    sec.body.appendChild(ok);
    return sec.element;
  }
  const sec = panelSection(`Issues that would invalidate this approval (${inv.length})`);
  for (const i of inv) {
    const row = document.createElement('div');
    row.className = `dossier-risk-row risk-${i.severity || 'attention'}`;
    const head = document.createElement('div');
    head.className = 'cockpit-rail-row-head';
    const kind = document.createElement('span');
    kind.className = 'cockpit-rail-row-kind';
    kind.textContent = (i.reason || 'invalidator').replace(/_/g, ' ');
    head.appendChild(kind);
    head.appendChild(severityBadge(i.severity));
    row.appendChild(head);
    const msg = document.createElement('div');
    msg.className = 'cockpit-rail-row-msg';
    msg.textContent = i.message || '';
    row.appendChild(msg);
    if (i.approvalId) {
      const meta = document.createElement('div');
      meta.className = 'cockpit-rail-row-meta mono';
      meta.textContent = 'approval: ' + shortHash(i.approvalId, 22, 6);
      row.appendChild(meta);
    } else if (i.stageId) {
      const meta = document.createElement('div');
      meta.className = 'cockpit-rail-row-meta mono';
      meta.textContent = 'stage: ' + i.stageId;
      row.appendChild(meta);
    }
    sec.body.appendChild(row);
  }
  return sec.element;
}

function renderCTABar(d, opts, slot) {
  const wrap = document.createElement('div');
  wrap.className = 'approval-cta-bar';
  const blocked = (d.invalidators || []).some((i) => i.severity === 'blocked' || i.severity === 'failed');

  const sign = document.createElement('button');
  sign.type = 'button';
  sign.className = 'verify-btn approval-sign-btn';
  // RUNBOOK-04 Task 2 (G3.8, Option A) — honest label. This records a governed
  // approval under the session actor; it is NOT a key-page cryptographic
  // signature (that is the backend/wallet-gated Option B). Don't overstate it.
  sign.textContent = 'Record approval';
  sign.disabled = blocked || !d.plan;
  if (blocked) sign.title = 'Can\'t record right now — at least one issue would invalidate this approval.';
  if (typeof opts.onSign === 'function') sign.addEventListener('click', () => opts.onSign(d, slot));
  wrap.appendChild(sign);

  const reject = document.createElement('button');
  reject.type = 'button';
  reject.className = 'verify-btn approval-reject-btn';
  reject.textContent = 'Reject';
  if (typeof opts.onReject === 'function') reject.addEventListener('click', () => opts.onReject(d));
  wrap.appendChild(reject);

  const inspect = document.createElement('button');
  inspect.type = 'button';
  inspect.className = 'verify-btn approval-inspect-btn';
  inspect.textContent = 'View technical detail';
  if (typeof opts.onInspectRaw === 'function') {
    inspect.addEventListener('click', () => opts.onInspectRaw(d));
  } else {
    // Default behaviour — scroll to the raw JSON section.
    inspect.addEventListener('click', () => {
      const raw = document.querySelector('.dossier-raw');
      if (raw) {
        raw.open = true;
        raw.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
  wrap.appendChild(inspect);

  // RUNBOOK-04 Task 2 (G3.8) — say plainly what "Record approval" does.
  const honesty = document.createElement('p');
  honesty.className = 'approval-cta-honesty';
  honesty.textContent = 'This records a governed approval under your session actor. It is not a key-page cryptographic signature.';
  wrap.appendChild(honesty);

  if (blocked) {
    const note = document.createElement('p');
    note.className = 'approval-cta-blocked-note';
    note.textContent = 'Fix the underlying issue first — regenerate the plan, restore the role, or refresh the trust profile — then come back and record your approval.';
    wrap.appendChild(note);
  }
  return wrap;
}

function renderRisks(risks) {
  const sec = panelSection(`Risks · ${risks.length}`);
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
    sec.body.appendChild(row);
  }
  return sec.element;
}

// =================================================================
// Helpers
// =================================================================
function panelSection(title) {
  const wrap = document.createElement('details');
  wrap.className = 'dossier-section approval-section';
  wrap.open = true;
  const sum = document.createElement('summary');
  sum.className = 'dossier-section-head';
  sum.textContent = title;
  wrap.appendChild(sum);
  const body = document.createElement('div');
  body.className = 'dossier-section-body';
  wrap.appendChild(body);
  return { element: wrap, body };
}
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
function td(text, cls) {
  const c = document.createElement('td');
  if (cls) c.className = cls;
  c.textContent = String(text == null ? '' : text);
  return c;
}
