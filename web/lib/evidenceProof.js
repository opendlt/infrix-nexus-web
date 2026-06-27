// Nexus — evidence-proof renderer.
//
// NEXUS-REIMAGINED-2026-05-10 Phase 5 — Evidence Reader And Portable
// Verification.
//
// Renders the rich projection returned by the nexus.evidenceProof
// RPC into the Phase 5 layered proof reader:
//
//   1. Banner       — overall proof status (pass / partial / failed)
//   2. Summary      — plain-language bullets about the bundle
//   3. Risks        — every failed/blocked claim sorted by severity
//   4. Claim matrix — the canonical claim → artifact → recompute →
//                     external check matrix, one card per claim, with
//                     a status pill (pass / fail / unverifiable /
//                     not_applicable)
//   5. Cross-bindings — portable-package invariants the verifier
//                     catches even after a rehash attack
//   6. Anchor + L0 cross-check — anchor metadata + cross-check action
//   7. Chain walker — intent → plan → outcome → evidence → anchor
//   8. Plugin versions — descriptors that produced bundle content
//   9. Raw sources — every RPC the user can hit for a "view raw"
//   10. Export portable + report — the only mutating control
//
// The renderer is presentational only — RPC plumbing (export download,
// raw fetches) lives in views/prove.js.

import { shortHash, formatTime, jsonBlock, hashChip, STAGE_KEYS } from '/lib/spineCommon.js';
import { severityBadge, sortBySeverity } from '/lib/severity.js';
import { crossCheckL0 } from '/lib/l0CrossCheck.js';

const STATUS_LABEL = {
  pass:           'PASS',
  fail:           'FAIL',
  unverifiable:   'UNVERIFIABLE',
  not_applicable: 'N/A',
};
const STATUS_SEVERITY = {
  pass:           'normal',
  fail:           'failed',
  unverifiable:   'unverifiable',
  not_applicable: 'attention',
};

/**
 * Render the evidence-proof reader into a DOM tree.
 * @param {Object} proof — nexus.evidenceProof response
 * @param {Object} [opts]
 * @param {() => void} [opts.onExportPortable]
 * @param {() => void} [opts.onDownloadReport]
 * @returns {HTMLElement}
 */
export function renderEvidenceProof(proof, opts = {}) {
  const root = document.createElement('div');
  root.className = 'evidence-proof';
  if (!proof || typeof proof !== 'object') {
    const empty = document.createElement('div');
    empty.className = 'dossier-empty';
    empty.textContent = 'No proof returned.';
    root.appendChild(empty);
    return root;
  }

  // 1. Banner
  root.appendChild(renderProofBanner(proof));

  // 1.5 Assurance & verification panel (platform-review-3 Epic 6):
  // proof level, governance, L0 / replay / witness status, what was
  // proven, what was not required, and the one-click verify commands.
  root.appendChild(renderAssurancePanel(proof));

  // 2. Plain-language summary
  if (Array.isArray(proof.summary) && proof.summary.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'approval-summary-list';
    for (const s of proof.summary) {
      const li = document.createElement('li');
      li.textContent = s;
      ul.appendChild(li);
    }
    root.appendChild(ul);
  }

  // 3. Risks (failed / blocked rows)
  const risks = Array.isArray(proof.risk) ? sortBySeverity(proof.risk) : [];
  if (risks.length > 0) root.appendChild(renderRisks(risks));

  // 4. Identity panel
  root.appendChild(renderProofIdentityPanel(proof));

  // 5. Claim matrix
  root.appendChild(renderClaimMatrix(proof));

  // 6. Cross-bindings
  if (Array.isArray(proof.crossBindings) && proof.crossBindings.length > 0) {
    root.appendChild(renderCrossBindings(proof.crossBindings));
  }

  // 7. Anchor + L0 cross-check (RUNBOOK-07 SP8 — onL0Verified upgrades the receipt)
  if (proof.anchor) root.appendChild(renderAnchorPanel(proof.anchor, opts.onL0Verified));

  // 8. Chain walker
  if (Array.isArray(proof.chain) && proof.chain.length > 0) {
    root.appendChild(renderChainWalker(proof.chain));
  }

  // 9. Plugin versions
  if (Array.isArray(proof.pluginVersions) && proof.pluginVersions.length > 0) {
    root.appendChild(renderPluginVersions(proof.pluginVersions));
  }

  // 10. Raw sources index
  if (Array.isArray(proof.rawSources) && proof.rawSources.length > 0) {
    root.appendChild(renderRawSources(proof.rawSources));
  }

  // 11. Export controls
  root.appendChild(renderExportControls(proof, opts));

  // 12. Raw JSON
  const rawDetails = document.createElement('details');
  rawDetails.className = 'raw-details dossier-raw';
  const rawSum = document.createElement('summary');
  rawSum.textContent = 'Raw evidence proof JSON';
  rawDetails.appendChild(rawSum);
  rawDetails.appendChild(jsonBlock(proof));
  root.appendChild(rawDetails);

  return root;
}

function renderProofBanner(p) {
  const banner = document.createElement('div');
  banner.className = 'verify-summary evidence-proof-banner';
  const failed = (p.checks || []).filter((c) => c.status === 'fail').length;
  const passed = (p.checks || []).filter((c) => c.status === 'pass').length;
  const total = (p.checks || []).length;
  if (failed > 0) {
    banner.classList.add('verify-fail');
    banner.textContent = `Failed verification — ${failed} of ${total} checks didn't pass.`;
  } else if (passed === total && total > 0) {
    banner.classList.add('verify-pass');
    banner.textContent = `Verified — all ${passed} checks pass.`;
  } else {
    banner.classList.add('verify-warn');
    banner.textContent = `Partial — ${passed} of ${total} checks pass; the rest can't be verified from local data alone.`;
  }
  return banner;
}

// renderAssurancePanel renders the Epic 6 proof-viewer assurance block:
// the achieved tier, the per-layer verification status (crypto / L0 /
// replay / witness), the substrate link, what was proven, what was not
// required, and the copy-paste independent-verification commands.
function renderAssurancePanel(p) {
  const sec = panelSection('Assurance & verification');

  // Tier badge.
  const tierRow = document.createElement('div');
  tierRow.className = 'assurance-tier';
  const tier = document.createElement('span');
  tier.className = 'assurance-tier-badge mono';
  tier.textContent = p.tier || `${p.proofLevel || 'L?'}/${p.governanceLevel || 'G?'}`;
  tierRow.appendChild(tier);
  sec.body.appendChild(tierRow);

  // Per-layer status chips.
  const chips = document.createElement('div');
  chips.className = 'assurance-status-chips';
  chips.appendChild(statusChip('Cryptographic', p.cryptographicallyVerified ?? p.localVerified));
  chips.appendChild(statusChip('L0 anchor', p.l0Verified, p.anchorStatus !== 'anchored' && p.anchorStatus !== 'verified'));
  chips.appendChild(statusChip('Replay', p.replayVerified, !p.replayAvailable));
  chips.appendChild(statusChip('Witness', (p.witnessCount || 0) > 0, !p.witnessAvailable));
  chips.appendChild(statusChip('Fully verified', p.fullyVerified));
  sec.body.appendChild(chips);

  // What was proven.
  if (Array.isArray(p.whatWasProven) && p.whatWasProven.length) {
    sec.body.appendChild(bulletBlock('What was proven', p.whatWasProven, 'proven'));
  }
  // What was NOT required (honest caveats).
  if (Array.isArray(p.whatWasNotRequired) && p.whatWasNotRequired.length) {
    sec.body.appendChild(bulletBlock('What was not required', p.whatWasNotRequired, 'not-required'));
  }

  // Substrate readiness link.
  const sub = document.createElement('p');
  sub.className = 'assurance-substrate-link';
  sub.innerHTML = 'Substrate status: <a href="#/operate/readiness">Readiness dashboard</a>';
  sec.body.appendChild(sub);

  // One-click independent-verification commands.
  if (p.verifyCommand) sec.body.appendChild(commandBlock('Verify independently (live L0)', p.verifyCommand));
  if (p.runLocally) sec.body.appendChild(commandBlock('Run locally', p.runLocally));
  if (p.verifyCommandWitness) sec.body.appendChild(commandBlock('Verify with witness threshold', p.verifyCommandWitness));

  return sec.element;
}

function statusChip(label, ok, notApplicable) {
  const chip = document.createElement('span');
  let cls = ok ? 'pass' : 'fail';
  let mark = ok ? '✓' : '✗';
  if (notApplicable && !ok) {
    cls = 'na';
    mark = '–';
  }
  chip.className = `assurance-chip assurance-chip-${cls}`;
  chip.textContent = `${mark} ${label}`;
  return chip;
}

function bulletBlock(title, items, kind) {
  const wrap = document.createElement('div');
  wrap.className = `assurance-bullets assurance-bullets-${kind}`;
  const h = document.createElement('div');
  h.className = 'assurance-bullets-title';
  h.textContent = title;
  wrap.appendChild(h);
  const ul = document.createElement('ul');
  for (const it of items) {
    const li = document.createElement('li');
    li.textContent = it;
    ul.appendChild(li);
  }
  wrap.appendChild(ul);
  return wrap;
}

function commandBlock(label, cmd) {
  const wrap = document.createElement('div');
  wrap.className = 'assurance-command';
  const lbl = document.createElement('div');
  lbl.className = 'assurance-command-label';
  lbl.textContent = label;
  wrap.appendChild(lbl);
  const pre = document.createElement('pre');
  pre.className = 'assurance-command-code mono';
  pre.textContent = cmd;
  wrap.appendChild(pre);
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'verify-btn assurance-copy-btn';
  copy.textContent = 'Copy';
  copy.addEventListener('click', () => {
    if (navigator.clipboard) navigator.clipboard.writeText(cmd);
  });
  wrap.appendChild(copy);
  return wrap;
}

function renderProofIdentityPanel(p) {
  const sec = panelSection('Bundle identity');
  const grid = document.createElement('div');
  grid.className = 'dossier-summary-grid';
  grid.appendChild(metaRow('Bundle ID', p.bundleId || '—'));
  if (p.intentId) grid.appendChild(metaRow('Intent', p.intentId));
  if (p.planId) grid.appendChild(metaRow('Plan', p.planId));
  if (p.outcomeRecordId) grid.appendChild(metaRow('Outcome', p.outcomeRecordId));
  grid.appendChild(metaRow('Level', p.level || '—'));
  grid.appendChild(metaRowHash('Bundle hash', p.bundleHash));
  if (p.planHash) grid.appendChild(metaRowHash('Plan hash', p.planHash));
  if (p.outcomeDigest) grid.appendChild(metaRowHash('Outcome digest', p.outcomeDigest));
  grid.appendChild(metaRow('Sealed at block', String(p.sealedBlockHeight || 0)));
  grid.appendChild(metaRow('Created at', formatTime(p.createdAt)));
  sec.body.appendChild(grid);
  return sec.element;
}

// =================================================================
// Claim matrix — the heart of the reader
// =================================================================
function renderClaimMatrix(p) {
  const checks = Array.isArray(p.checks) ? p.checks : [];
  const sec = panelSection(`Claim matrix · ${checks.length}`);
  const wrap = document.createElement('div');
  wrap.className = 'evidence-claim-matrix';
  for (const c of checks) {
    wrap.appendChild(renderClaimCard(c));
  }
  sec.body.appendChild(wrap);
  return sec.element;
}

function renderClaimCard(c) {
  const card = document.createElement('div');
  card.className = `evidence-claim-card status-${c.status || 'unverifiable'}`;

  // Header — name + status pill
  const head = document.createElement('div');
  head.className = 'evidence-claim-head';
  const name = document.createElement('span');
  name.className = 'evidence-claim-name mono';
  name.textContent = c.name || '';
  head.appendChild(name);
  const pill = document.createElement('span');
  pill.className = `evidence-claim-status status-${c.status || 'unverifiable'}`;
  pill.textContent = STATUS_LABEL[c.status] || (c.status || '?').toUpperCase();
  pill.appendChild(severityBadge(STATUS_SEVERITY[c.status] || 'normal'));
  head.appendChild(pill);
  card.appendChild(head);

  // Claim line
  const claim = document.createElement('p');
  claim.className = 'evidence-claim-text';
  claim.textContent = c.claim || '';
  card.appendChild(claim);

  // 4-column matrix
  const grid = document.createElement('div');
  grid.className = 'evidence-claim-grid';
  grid.appendChild(claimCol('Artifact', c.artifact));
  grid.appendChild(claimCol('Recompute', c.recompute));
  grid.appendChild(claimCol('External check', c.externalCheck));
  card.appendChild(grid);

  // Detail
  if (c.detail) {
    const det = document.createElement('p');
    det.className = 'evidence-claim-detail mono';
    det.textContent = c.detail;
    card.appendChild(det);
  }
  return card;
}

function claimCol(label, body) {
  const wrap = document.createElement('div');
  wrap.className = 'evidence-claim-col';
  const lbl = document.createElement('div');
  lbl.className = 'evidence-claim-col-label';
  lbl.textContent = label;
  wrap.appendChild(lbl);
  const txt = document.createElement('div');
  txt.className = 'evidence-claim-col-body';
  txt.textContent = body || '—';
  wrap.appendChild(txt);
  return wrap;
}

// =================================================================
// Cross-bindings panel
// =================================================================
function renderCrossBindings(rows) {
  const sec = panelSection(`Cross-bindings · ${rows.length}`);
  const tbl = document.createElement('table');
  tbl.className = 'dossier-table';
  tbl.innerHTML = '<thead><tr><th>Binding</th><th>Detail</th><th>Value</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.appendChild(td(r.name, 'mono'));
    tr.appendChild(td(r.detail));
    tr.appendChild(td(r.value || '—', 'mono'));
    tbody.appendChild(tr);
  }
  tbl.appendChild(tbody);
  sec.body.appendChild(tbl);
  return sec.element;
}

// =================================================================
// Anchor panel
// =================================================================
function renderAnchorPanel(a, onL0Verified) {
  const sec = panelSection('Anchor & L0 cross-check');
  const grid = document.createElement('div');
  grid.className = 'dossier-summary-grid';
  grid.appendChild(metaRow('Status', a.status || '—'));
  grid.appendChild(metaRow('Anchor record', a.recordId || '—'));
  if (a.txHash) grid.appendChild(metaRowHash('L0 tx hash', a.txHash));
  if (a.blockHeight) grid.appendChild(metaRow('Block height', String(a.blockHeight)));
  if (a.dataIndex !== undefined) grid.appendChild(metaRow('Data index', String(a.dataIndex)));
  sec.body.appendChild(grid);
  if (a.l0CrossCheck) {
    const note = document.createElement('p');
    note.className = 'evidence-anchor-note';
    note.textContent = a.l0CrossCheck.available
      ? '✓ L0 cross-check available — ' + a.l0CrossCheck.action
      : 'L0 cross-check not yet available — anchor pending.';
    sec.body.appendChild(note);
  }
  if (a.txHash && a.blockHeight) {
    // RUNBOOK-07 SP8 — the anchor coordinates (tx + block) are on screen, so the
    // browser can confirm the anchor DIRECTLY against Accumulate L0 (not via the
    // Infrix node). This is the working in-app cross-check. It fails closed when
    // L0 isn't CORS-reachable; the copy-paste "Verify independently (live L0)"
    // command above remains the fallback for locked-down deployments. On a
    // confirmation it notifies onL0Verified so the caller can upgrade the receipt.
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'verify-btn evidence-l0-crosscheck';
    x.textContent = 'Cross-check against L0 now';
    const status = document.createElement('p');
    status.className = 'evidence-l0-status';
    status.hidden = true;
    x.addEventListener('click', async () => {
      x.disabled = true;
      status.hidden = false;
      status.className = 'evidence-l0-status is-checking';
      status.textContent = 'Checking L0…';
      const r = await crossCheckL0(a);
      if (r.ok && r.l0Verified) {
        status.className = 'evidence-l0-status is-ok';
        status.textContent = `✓ Confirmed on ${r.network} at block ${a.blockHeight} — anchor exists on L0.`;
        if (typeof onL0Verified === 'function') { try { onL0Verified(r); } catch (_) {} }
      } else {
        status.className = 'evidence-l0-status is-fail';
        status.textContent = `✗ ${r.reason || 'L0 cross-check failed'} — receipt stays L3; use the CLI command above.`;
        x.disabled = false;
      }
    });
    sec.body.appendChild(x);
    sec.body.appendChild(status);
  } else if (a.txHash) {
    const note = document.createElement('p');
    note.className = 'evidence-anchor-note';
    note.textContent = 'Anchor tx present but no block height yet — cross-check available once the anchor finalizes.';
    sec.body.appendChild(note);
  }
  return sec.element;
}

// =================================================================
// Chain walker
// =================================================================
function renderChainWalker(chain) {
  const sec = panelSection(`Chain walker · ${chain.length}`);
  const wrap = document.createElement('ol');
  wrap.className = 'evidence-chain-walker';
  for (const link of chain) {
    const li = document.createElement('li');
    li.className = `evidence-chain-link kind-${link.kind || 'unknown'}`;
    li.dataset.stage = stageIndex(link.kind);
    const head = document.createElement('div');
    head.className = 'evidence-chain-link-head';
    const kind = document.createElement('span');
    kind.className = 'evidence-chain-link-kind';
    kind.textContent = link.kind || '—';
    head.appendChild(kind);
    const id = document.createElement('span');
    id.className = 'evidence-chain-link-id mono';
    id.textContent = shortHash(link.id || '', 22, 6);
    head.appendChild(id);
    li.appendChild(head);
    if (link.timestamp) {
      const ts = document.createElement('div');
      ts.className = 'evidence-chain-link-ts mono';
      ts.textContent = formatTime(link.timestamp);
      li.appendChild(ts);
    }
    if (link.bundleHash || link.planHash || link.outcomeDigest || link.txHash) {
      const meta = document.createElement('div');
      meta.className = 'evidence-chain-link-meta';
      if (link.planHash) meta.appendChild(textChip('plan', link.planHash));
      if (link.outcomeDigest) meta.appendChild(textChip('outcome', link.outcomeDigest));
      if (link.bundleHash) meta.appendChild(textChip('bundle', link.bundleHash));
      if (link.txHash) meta.appendChild(textChip('tx', link.txHash));
      li.appendChild(meta);
    }
    if (link.status) {
      const s = document.createElement('span');
      s.className = 'evidence-chain-link-status';
      s.textContent = link.status;
      li.appendChild(s);
    }
    wrap.appendChild(li);
  }
  sec.body.appendChild(wrap);
  return sec.element;
}

function textChip(label, value) {
  const wrap = document.createElement('span');
  wrap.className = 'evidence-chain-chip';
  const l = document.createElement('span');
  l.className = 'evidence-chain-chip-label';
  l.textContent = label;
  wrap.appendChild(l);
  wrap.appendChild(hashChip(value, { head: 8, tail: 6 }));
  return wrap;
}

function stageIndex(kind) {
  const idx = STAGE_KEYS.indexOf(kind);
  return idx >= 0 ? String(idx + 1) : '4';
}

// =================================================================
// Plugin versions
// =================================================================
function renderPluginVersions(rows) {
  const sec = panelSection(`Plugin versions · ${rows.length}`);
  const tbl = document.createElement('table');
  tbl.className = 'dossier-table';
  tbl.innerHTML = '<thead><tr><th>Plugin</th><th>Version</th><th>Implementation hash</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.appendChild(td(r.pluginId || '—', 'mono'));
    tr.appendChild(td(r.version || '—', 'mono'));
    const hashCell = document.createElement('td');
    if (r.implementationHash) hashCell.appendChild(hashChip(r.implementationHash, { head: 8, tail: 6 }));
    else { hashCell.textContent = '—'; hashCell.className = 'mono'; }
    tr.appendChild(hashCell);
    tbody.appendChild(tr);
  }
  tbl.appendChild(tbody);
  sec.body.appendChild(tbl);
  return sec.element;
}

// =================================================================
// Raw sources
// =================================================================
function renderRawSources(rows) {
  const sec = panelSection('Raw sources');
  const ul = document.createElement('ul');
  ul.className = 'evidence-raw-sources';
  for (const r of rows) {
    const li = document.createElement('li');
    const lbl = document.createElement('strong');
    lbl.textContent = r.label;
    li.appendChild(lbl);
    li.appendChild(document.createTextNode('  '));
    const code = document.createElement('code');
    code.className = 'mono';
    code.textContent = r.method;
    li.appendChild(code);
    ul.appendChild(li);
  }
  sec.body.appendChild(ul);
  return sec.element;
}

// =================================================================
// Export controls — only mutating actions
// =================================================================
function renderExportControls(proof, opts) {
  const wrap = document.createElement('div');
  wrap.className = 'evidence-export-bar';

  const portable = document.createElement('button');
  portable.type = 'button';
  portable.className = 'verify-btn evidence-export-portable-btn';
  portable.textContent = 'Download proof file';
  portable.disabled = !proof.portableExportAvailable;
  if (typeof opts.onExportPortable === 'function') {
    portable.addEventListener('click', () => opts.onExportPortable(proof));
  }
  wrap.appendChild(portable);

  const report = document.createElement('button');
  report.type = 'button';
  report.className = 'verify-btn evidence-export-report-btn';
  report.textContent = 'Download report';
  if (typeof opts.onDownloadReport === 'function') {
    report.addEventListener('click', () => opts.onDownloadReport(proof));
  }
  wrap.appendChild(report);

  const note = document.createElement('p');
  note.className = 'evidence-export-note';
  note.textContent = proof.portableExportAvailable
    ? 'A self-contained file your auditors can verify offline. No need to trust this UI.'
    : 'A downloadable proof file will be available once the result is finalized.';
  wrap.appendChild(note);
  return wrap;
}

// =================================================================
// Risks
// =================================================================
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
  wrap.className = 'dossier-section evidence-section';
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
