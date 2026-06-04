// Nexus — Evidence view (list + detail + verify + portable export).
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 2-F: the verifiable artifact at
// the heart of the spine. Each detail screen renders:
//   - Bundle metadata (level, anchor status, hash, created at)
//   - Hash-chained links viewer (one row per link)
//   - 8-check verification panel (driven by evidence.verify RPC)
//   - Cross-binding matrix (PluginVersions / PolicyDecisionDigest /
//     AnchorTxHash / TrustSnapshot — all pulled from the verify
//     response + bundle envelope)
//   - "Export portable package" download button (triggers
//     explorer.evidenceExportPortable, JSON-encodes the result, and
//     pushes it to the user via a Blob download)
//
// Subpaths:
//   #/evidence                  — list
//   #/evidence/<bundleId>       — single-bundle detail + verify
//   #/evidence/_byIntent/<id>   — every bundle attached to an intent

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
  readField,
  loadingNode,
  errorNode,
  deeplinkButton,
} from '/lib/spineCommon.js';

let rootEl = null;
let currentSubpath = [];

export const evidenceView = {
  mount(root, subpath) {
    rootEl = root;
    currentSubpath = Array.isArray(subpath) ? subpath : [];
    render();
  },
  onSubpathChange(subpath) {
    currentSubpath = Array.isArray(subpath) ? subpath : [];
    render();
  },
};

function render() {
  if (!rootEl) return;
  if (currentSubpath.length === 0) {
    renderList();
  } else if (currentSubpath[0] === '_byIntent' && currentSubpath[1]) {
    renderByIntent(currentSubpath[1]);
  } else {
    renderDetail(currentSubpath[0]);
  }
}

// -----------------------------------------------------------------
// List
// -----------------------------------------------------------------
async function renderList() {
  rootEl.replaceChildren();
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const h = document.createElement('h2');
  h.textContent = 'Evidence';
  head.appendChild(h);
  const sub = document.createElement('p');
  sub.className = 'spine-section-sub';
  sub.textContent = 'Hash-chained evidence bundles. Each bundle has an 8-check verifier and an offline portable-package export.';
  head.appendChild(sub);
  rootEl.appendChild(head);

  const wrap = document.createElement('div');
  wrap.className = 'spine-table-wrap';
  wrap.appendChild(loadingNode('Loading evidence bundles…'));
  rootEl.appendChild(wrap);

  let resp;
  try {
    resp = await rpcWithDisclosure('explorer.evidenceList', { limit: 100 });
  } catch (err) {
    wrap.replaceChildren(errorNode(err));
    return;
  }
  const items = (resp && Array.isArray(resp.items)) ? resp.items : [];
  if (items.length === 0) {
    wrap.replaceChildren(emptyState('No evidence bundles yet. Bundles are produced when an intent reaches Stage 6.'));
    return;
  }

  const table = document.createElement('table');
  table.className = 'spine-table evidence-table';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const c of ['ID', 'Intent ID', 'Level', 'Bundle hash', 'Anchor', 'Created']) {
    const th = document.createElement('th');
    th.textContent = c;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const e of items) tbody.appendChild(buildEvidenceRow(e));
  table.appendChild(tbody);
  wrap.replaceChildren(table);

  const meta = document.createElement('div');
  meta.className = 'spine-table-meta';
  meta.textContent = `${items.length} bundle${items.length === 1 ? '' : 's'} shown`;
  rootEl.appendChild(meta);
}

function buildEvidenceRow(e) {
  const tr = document.createElement('tr');
  tr.className = 'evidence-row';
  tr.addEventListener('click', () => {
    window.location.hash = '#/evidence/' + encodeURIComponent(e.id || e.ID);
  });
  const idCell = document.createElement('td');
  idCell.className = 'mono';
  idCell.textContent = shortHash(e.id || e.ID, 14, 6);
  idCell.title = e.id || e.ID;
  tr.appendChild(idCell);

  const intentCell = document.createElement('td');
  intentCell.className = 'mono';
  const intentID = readField(e, 'IntentID') || e.createdByIntentID || e.CreatedByIntentID;
  intentCell.textContent = shortHash(intentID, 14, 6);
  intentCell.title = intentID || '';
  tr.appendChild(intentCell);

  const lvlCell = document.createElement('td');
  const lvl = readField(e, 'Level') || readField(e, 'level') || 'standard';
  lvlCell.appendChild(statusPill(lvl, lvl === 'full' ? 'ok' : (lvl === 'light' ? 'warn' : 'info')));
  tr.appendChild(lvlCell);

  const hashCell = document.createElement('td');
  hashCell.appendChild(hashChip(readField(e, 'BundleHash')));
  tr.appendChild(hashCell);

  const anchorCell = document.createElement('td');
  const anchor = readField(e, 'Anchor') || readField(e, 'AnchorStatus') || 'pending';
  anchorCell.appendChild(statusPill(anchor, anchor === 'anchored' || anchor === 'verified' ? 'ok' : 'warn'));
  tr.appendChild(anchorCell);

  const createdCell = document.createElement('td');
  createdCell.textContent = formatTime(e.created || e.Created);
  tr.appendChild(createdCell);
  return tr;
}

// -----------------------------------------------------------------
// By intent
// -----------------------------------------------------------------
async function renderByIntent(intentId) {
  rootEl.replaceChildren();
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const back = document.createElement('a');
  back.className = 'spine-back';
  back.href = '#/evidence';
  back.textContent = '← All evidence';
  head.appendChild(back);
  const h = document.createElement('h2');
  h.textContent = 'Evidence for intent';
  head.appendChild(h);
  const subPlan = document.createElement('p');
  subPlan.className = 'spine-section-sub mono';
  subPlan.textContent = intentId;
  head.appendChild(subPlan);
  rootEl.appendChild(head);

  const wrap = document.createElement('div');
  wrap.className = 'spine-table-wrap';
  wrap.appendChild(loadingNode('Loading bundles…'));
  rootEl.appendChild(wrap);

  let resp;
  try {
    resp = await rpcWithDisclosure('explorer.evidenceList', { limit: 200 });
  } catch (err) {
    wrap.replaceChildren(errorNode(err));
    return;
  }
  const all = (resp && Array.isArray(resp.items)) ? resp.items : [];
  const matching = all.filter((b) => {
    const iid = readField(b, 'IntentID') || b.createdByIntentID || b.CreatedByIntentID;
    return iid === intentId;
  });
  if (matching.length === 0) {
    wrap.replaceChildren(emptyState('No evidence bundles for this intent.'));
    return;
  }

  const table = document.createElement('table');
  table.className = 'spine-table evidence-table';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const c of ['ID', 'Level', 'Bundle hash', 'Anchor', 'Created']) {
    const th = document.createElement('th');
    th.textContent = c;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const e of matching) {
    const row = document.createElement('tr');
    row.className = 'evidence-row';
    row.addEventListener('click', () => { window.location.hash = '#/evidence/' + encodeURIComponent(e.id || e.ID); });

    const idCell = document.createElement('td');
    idCell.className = 'mono';
    idCell.textContent = shortHash(e.id || e.ID, 14, 6);
    idCell.title = e.id || e.ID;
    row.appendChild(idCell);

    const lvlCell = document.createElement('td');
    const lvl = readField(e, 'Level') || readField(e, 'level') || 'standard';
    lvlCell.appendChild(statusPill(lvl, lvl === 'full' ? 'ok' : (lvl === 'light' ? 'warn' : 'info')));
    row.appendChild(lvlCell);

    const hashCell = document.createElement('td');
    hashCell.appendChild(hashChip(readField(e, 'BundleHash')));
    row.appendChild(hashCell);

    const anchorCell = document.createElement('td');
    const anchor = readField(e, 'Anchor') || readField(e, 'AnchorStatus') || 'pending';
    anchorCell.appendChild(statusPill(anchor, anchor === 'anchored' || anchor === 'verified' ? 'ok' : 'warn'));
    row.appendChild(anchorCell);

    const createdCell = document.createElement('td');
    createdCell.textContent = formatTime(e.created || e.Created);
    row.appendChild(createdCell);

    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  wrap.replaceChildren(table);
}

// -----------------------------------------------------------------
// Detail
// -----------------------------------------------------------------
async function renderDetail(bundleId) {
  rootEl.replaceChildren();
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const back = document.createElement('a');
  back.className = 'spine-back';
  back.href = '#/evidence';
  back.textContent = '← All evidence';
  head.appendChild(back);
  const h = document.createElement('h2');
  h.className = 'mono';
  h.textContent = bundleId;
  head.appendChild(h);
  rootEl.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  rootEl.appendChild(grid);

  let bundle;
  try {
    bundle = await rpcWithDisclosure('evidence.get', { id: bundleId });
  } catch (err) {
    grid.appendChild(errorNode(err));
    return;
  }
  if (!bundle) {
    grid.appendChild(errorNode(new Error('evidence bundle not found')));
    return;
  }

  const intentID = readField(bundle, 'IntentID') || bundle.createdByIntentID || bundle.CreatedByIntentID;
  const planID = readField(bundle, 'PlanID') || bundle.createdByPlanID || bundle.CreatedByPlanID;
  const outcomeID = readField(bundle, 'OutcomeID');
  const lvl = readField(bundle, 'Level') || 'standard';
  const anchor = readField(bundle, 'Anchor') || readField(bundle, 'AnchorStatus') || 'pending';
  const bundleHash = readField(bundle, 'BundleHash');
  const anchorTx = readField(bundle, 'AnchorTxHash');
  const anchorBlock = readField(bundle, 'AnchorBlock');

  // Header card
  const headerBody = document.createElement('div');
  headerBody.appendChild(kvRow('Level', statusPill(lvl, lvl === 'full' ? 'ok' : (lvl === 'light' ? 'warn' : 'info'))));
  headerBody.appendChild(kvRow('Anchor', statusPill(anchor, anchor === 'anchored' || anchor === 'verified' ? 'ok' : 'warn')));
  headerBody.appendChild(kvRow('Bundle hash', hashChip(bundleHash, { head: 12, tail: 8 })));
  if (intentID) headerBody.appendChild(kvRow('Intent ID', shortHashLink(intentID, 'intents')));
  if (planID) headerBody.appendChild(kvRow('Plan ID', shortHashLink(planID, 'plans')));
  if (outcomeID) headerBody.appendChild(kvRow('Outcome ID', shortHashLink(outcomeID, 'outcomes')));
  if (anchorTx) headerBody.appendChild(kvRow('L0 tx hash', hashChip(anchorTx, { head: 12, tail: 8 })));
  if (anchorBlock !== undefined) headerBody.appendChild(kvRow('L0 block', anchorBlock));
  headerBody.appendChild(kvRow('Created', formatTime(bundle.created || bundle.Created)));
  headerBody.appendChild(kvRow('Updated', formatTime(bundle.updated || bundle.Updated)));
  grid.appendChild(card('Bundle envelope', headerBody));

  // Verification panel — runs evidence.verify on demand.
  const verifyBody = document.createElement('div');
  const verifyButton = document.createElement('button');
  verifyButton.className = 'verify-btn';
  verifyButton.type = 'button';
  verifyButton.textContent = 'Run verification';
  const verifyOutput = document.createElement('div');
  verifyOutput.className = 'verify-output';

  const initialNote = document.createElement('p');
  initialNote.className = 'verify-init';
  initialNote.textContent = 'Click "Run verification" to execute the canonical 8-check VerifyBundle and render the per-check pass/fail breakdown.';
  verifyOutput.appendChild(initialNote);

  verifyButton.addEventListener('click', async () => {
    verifyButton.disabled = true;
    verifyOutput.replaceChildren(loadingNode('Running 8-check verifier…'));
    try {
      const result = await rpcWithDisclosure('evidence.verify', { id: bundleId });
      verifyOutput.replaceChildren(renderVerificationResult(result));
    } catch (err) {
      verifyOutput.replaceChildren(errorNode(err));
    } finally {
      verifyButton.disabled = false;
    }
  });
  verifyBody.appendChild(verifyButton);
  verifyBody.appendChild(verifyOutput);
  grid.appendChild(card('Verification', verifyBody));

  // Portable package export
  const exportBody = document.createElement('div');
  const exportButton = document.createElement('button');
  exportButton.className = 'verify-btn';
  exportButton.type = 'button';
  exportButton.textContent = 'Export portable package (JSON)';
  const exportOutput = document.createElement('div');
  exportOutput.className = 'verify-output';
  const exportNote = document.createElement('p');
  exportNote.className = 'verify-init';
  exportNote.textContent = 'Builds a self-contained PortableEvidencePackage v3 with cross-bindings (plan hash, outcome digest, plugin versions, policy decision digest, trust snapshot, anchor proof) and downloads it as JSON. Verifiable offline by anyone with the package and the canonical verifier.';
  exportOutput.appendChild(exportNote);
  exportButton.addEventListener('click', async () => {
    exportButton.disabled = true;
    exportOutput.replaceChildren(loadingNode('Building portable package…'));
    try {
      const pkg = await rpcWithDisclosure('explorer.evidenceExportPortable', { id: bundleId });
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portable-${bundleId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      const ok = document.createElement('div');
      ok.className = 'verify-summary verify-pass';
      ok.textContent = `✓ Portable package downloaded (version=${pkg.version || '3'}, hash=${shortHash(pkg.exportHash || '', 12, 8)}). Anyone can verify it offline using pkg/evidence.VerifyPortablePackage.`;
      exportOutput.replaceChildren(ok);
    } catch (err) {
      exportOutput.replaceChildren(errorNode(err));
    } finally {
      exportButton.disabled = false;
    }
  });
  exportBody.appendChild(exportButton);
  exportBody.appendChild(exportOutput);
  grid.appendChild(card('Portable export', exportBody));

  // Cross-links
  const linksBody = document.createElement('div');
  linksBody.className = 'action-row';
  if (intentID) linksBody.appendChild(deeplinkButton('View intent', 'intents', intentID));
  if (planID) linksBody.appendChild(deeplinkButton('View plan', 'plans', planID));
  if (outcomeID) linksBody.appendChild(deeplinkButton('View outcome', 'outcomes', outcomeID));
  // Find anchor record by intent
  if (intentID) linksBody.appendChild(deeplinkButton('View anchor', 'anchors', '_byIntent', intentID));
  grid.appendChild(card('Cross-links', linksBody));

  // Raw envelope
  const rawBody = document.createElement('details');
  rawBody.className = 'raw-details';
  const summary = document.createElement('summary');
  summary.textContent = 'Raw managed object';
  rawBody.appendChild(summary);
  rawBody.appendChild(jsonBlock(bundle));
  grid.appendChild(card('Inspect', rawBody));
}

function renderVerificationResult(result) {
  const wrap = document.createElement('div');
  const summary = document.createElement('div');
  summary.className = `verify-summary verify-${result.verified ? 'pass' : 'fail'}`;
  const passed = (result.checks || []).filter((c) => c.passed).length;
  const total = (result.checks || []).length;
  summary.textContent = `${result.verified ? '✓ All passed' : '✗ Verification failed'} — ${passed}/${total} checks${result.summary ? ' — ' + result.summary : ''}`;
  wrap.appendChild(summary);

  if (result.verifiedAt) {
    const ts = document.createElement('div');
    ts.className = 'verify-ts';
    ts.textContent = `verified at ${formatTime(result.verifiedAt)}`;
    wrap.appendChild(ts);
  }

  const list = document.createElement('ul');
  list.className = 'verify-checks';
  for (const c of (result.checks || [])) {
    const li = document.createElement('li');
    li.className = `verify-check verify-${c.passed ? 'pass' : 'fail'}`;
    const mark = document.createElement('span');
    mark.className = 'verify-mark';
    mark.textContent = c.passed ? '✓' : '✗';
    li.appendChild(mark);
    const name = document.createElement('span');
    name.className = 'verify-name';
    name.textContent = c.name;
    li.appendChild(name);
    if (c.detail) {
      const detail = document.createElement('span');
      detail.className = 'verify-detail';
      detail.textContent = c.detail;
      li.appendChild(detail);
    }
    if (c.error) {
      const err = document.createElement('span');
      err.className = 'verify-error';
      err.textContent = c.error;
      li.appendChild(err);
    }
    list.appendChild(li);
  }
  wrap.appendChild(list);
  return wrap;
}

function shortHashLink(value, route) {
  const a = document.createElement('a');
  a.className = 'mono spine-link';
  a.href = `#/${route}/${encodeURIComponent(value)}`;
  a.textContent = shortHash(value, 14, 6);
  a.title = value;
  return a;
}
