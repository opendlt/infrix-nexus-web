// Nexus — Verify Batch view.
//
// Cinema-Inbox-Time E3C8 — operator surface for nexus.verifyBatch.
//
// Routes:
//   #/verifyBatch                     — empty start state
//   #/verifyBatch/<jobId>             — poll an in-flight or completed job
//
// Flow:
//   1. User picks a target set (paste evidence IDs, leave blank for
//      "last 100 visible bundles").
//   2. Press "Run batch" — view fires nexus.verifyBatch with async=true,
//      stores the jobId in the URL, then polls every 1s until complete.
//   3. Final report shows summary + per-row table.
//   4. "Export report" button serialises the entire job to a JSON Blob
//      and triggers a download.
//
// Honours the time-travel cursor: when the at-cursor is anchored to the
// past, the batch runs against the registry snapshot at that point.

import { rpcWithDisclosure, errorStateNode, formatTime, shortHash, emptyState } from '/lib/spineCommon.js';
import { isAtLive, getAt } from '/lib/timeContext.js';

let rootEl = null;
let currentJobID = null;
let pollHandle = null;
let lastReport = null;

export const verifyBatchView = {
  mount(root, subpath) {
    rootEl = root;
    currentJobID = (subpath && subpath[0]) || null;
    render();
    if (currentJobID) startPolling();
  },
  onSubpathChange(subpath) {
    const next = (subpath && subpath[0]) || null;
    if (next === currentJobID) return;
    currentJobID = next;
    stopPolling();
    render();
    if (currentJobID) startPolling();
  },
  unmount() {
    stopPolling();
    rootEl = null;
  },
};

function render() {
  if (!rootEl) return;
  rootEl.replaceChildren();
  const shell = document.createElement('div');
  shell.className = 'workspace verify-batch-canvas';
  rootEl.appendChild(shell);

  const head = document.createElement('header');
  head.className = 'workspace-header';
  const title = document.createElement('h2');
  title.className = 'workspace-title';
  title.textContent = 'Batch verifier';
  head.appendChild(title);
  const sub = document.createElement('p');
  sub.className = 'workspace-subtitle';
  sub.textContent = 'Verify every evidence bundle in a batch. Returns a per-row report with anchor + chain + signature checks.';
  head.appendChild(sub);
  if (!isAtLive()) {
    const banner = document.createElement('div');
    banner.className = 'verify-batch-banner';
    const at = getAt();
    banner.textContent = 'Running against a past snapshot' + (at && at.block ? ` (block ${at.block})` : '') + '.';
    head.appendChild(banner);
  }
  shell.appendChild(head);

  if (!currentJobID) {
    shell.appendChild(buildLauncher());
  } else {
    const body = document.createElement('div');
    body.className = 'verify-batch-body';
    body.id = 'verifyBatchBody';
    shell.appendChild(body);
    body.replaceChildren(loadingNode('Resolving job…'));
    refreshReport().catch((e) => body.replaceChildren(errorStateNode(e)));
  }
}

function buildLauncher() {
  const card = document.createElement('section');
  card.className = 'verify-batch-launcher';

  const idsLabel = document.createElement('label');
  idsLabel.className = 'verify-batch-label';
  idsLabel.textContent = 'Evidence IDs (one per line, blank → last 100 visible bundles)';
  card.appendChild(idsLabel);
  const idsInput = document.createElement('textarea');
  idsInput.className = 'verify-batch-ids';
  idsInput.rows = 6;
  idsInput.placeholder = 'ev-intent-acc://test.acme-12\nev-intent-acc://test.acme-13';
  card.appendChild(idsInput);

  const row = document.createElement('div');
  row.className = 'verify-batch-row';
  const limitLabel = document.createElement('label');
  limitLabel.className = 'verify-batch-label';
  limitLabel.textContent = 'Limit (when no list provided)';
  row.appendChild(limitLabel);
  const limit = document.createElement('input');
  limit.type = 'number';
  limit.min = '1';
  limit.value = '100';
  limit.className = 'verify-batch-limit';
  row.appendChild(limit);
  card.appendChild(row);

  const run = document.createElement('button');
  run.type = 'button';
  run.className = 'verify-batch-run';
  run.textContent = 'Run batch';
  run.addEventListener('click', async () => {
    const ids = idsInput.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const params = { async: true };
    if (ids.length > 0) params.evidenceIds = ids;
    else params.limit = Number(limit.value || 100);
    run.disabled = true;
    try {
      const r = await rpcWithDisclosure('nexus.verifyBatch', params);
      const jobID = r && r.jobId;
      if (!jobID) throw new Error('verifyBatch did not return a jobId');
      window.location.hash = '#/verifyBatch/' + encodeURIComponent(jobID);
    } catch (e) {
      const err = document.createElement('div');
      err.className = 'verify-batch-error';
      err.textContent = 'Batch failed to start: ' + (e && e.message ? e.message : e);
      card.appendChild(err);
      run.disabled = false;
    }
  });
  card.appendChild(run);

  return card;
}

async function refreshReport() {
  if (!currentJobID) return;
  const r = await rpcWithDisclosure('nexus.verifyBatch', { jobId: currentJobID });
  lastReport = r;
  const body = document.getElementById('verifyBatchBody');
  if (!body) return;
  body.replaceChildren(renderReport(r));
  if (r && r.status === 'complete') stopPolling();
}

function renderReport(r) {
  const card = document.createElement('section');
  card.className = 'verify-batch-report';

  const head = document.createElement('div');
  head.className = 'verify-batch-report-head';
  const idEl = document.createElement('span');
  idEl.className = 'mono';
  idEl.textContent = r.jobId || '';
  head.appendChild(idEl);
  const statusEl = document.createElement('span');
  statusEl.className = 'verify-batch-status status-' + (r.status || 'unknown');
  statusEl.textContent = r.status || 'unknown';
  head.appendChild(statusEl);
  card.appendChild(head);

  const progress = document.createElement('div');
  progress.className = 'verify-batch-progress';
  const done = (r.done || 0);
  const total = (r.total || 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  progress.textContent = `${done} / ${total} (${pct}%)`;
  card.appendChild(progress);

  if (r.summary) {
    const s = document.createElement('div');
    s.className = 'verify-batch-summary';
    s.innerHTML = `<span class="ok">${r.summary.ok || 0} ok</span> · <span class="fail">${r.summary.fail || 0} failed</span> · <span>total ${r.summary.total || 0}</span>`;
    card.appendChild(s);
  }

  if (r.status === 'complete') {
    const exp = document.createElement('button');
    exp.type = 'button';
    exp.className = 'verify-batch-export';
    exp.textContent = 'Export report (JSON)';
    exp.addEventListener('click', () => exportReport(r));
    card.appendChild(exp);

    const csv = document.createElement('button');
    csv.type = 'button';
    csv.className = 'verify-batch-export';
    csv.textContent = 'Export report (CSV)';
    csv.addEventListener('click', () => exportReportCSV(r));
    card.appendChild(csv);
  }

  // Per-row table
  if (Array.isArray(r.results) && r.results.length > 0) {
    const table = document.createElement('table');
    table.className = 'verify-batch-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Evidence</th><th>Intent</th><th>Plan</th><th>Status</th><th>Errors</th></tr>';
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const row of r.results) {
      const tr = document.createElement('tr');
      tr.className = row.ok ? 'is-ok' : 'is-fail';
      tr.innerHTML = `
        <td class="mono">${shortHash(row.evidenceId || '', 16, 6)}</td>
        <td class="mono">${shortHash(row.intentId || '', 16, 6)}</td>
        <td class="mono">${shortHash(row.planId || '', 16, 6)}</td>
        <td>${row.ok ? '✓ ok' : '✗ fail'}</td>
        <td>${row.errors ? row.errors.join('; ') : ''}</td>
      `;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    card.appendChild(table);
  } else if (r.status === 'complete') {
    card.appendChild(emptyState('No results to display.'));
  }

  if (r.startedAt) {
    const meta = document.createElement('div');
    meta.className = 'verify-batch-meta';
    meta.textContent = 'started ' + formatTime(r.startedAt) +
      (r.finishedAt ? ' · finished ' + formatTime(r.finishedAt) : '');
    card.appendChild(meta);
  }

  return card;
}

function exportReport(report) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `verifyBatch-${(report.jobId || 'export').replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportReportCSV(report) {
  const lines = ['evidenceId,intentId,planId,ok,errors'];
  for (const r of (report.results || [])) {
    const errs = (r.errors || []).join(' | ').replace(/,/g, ';');
    lines.push([
      r.evidenceId || '',
      r.intentId || '',
      r.planId || '',
      r.ok ? '1' : '0',
      JSON.stringify(errs),
    ].join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `verifyBatch-${(report.jobId || 'export').replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function loadingNode(label) {
  const div = document.createElement('div');
  div.className = 'verify-batch-loading';
  div.textContent = label || 'Loading…';
  return div;
}

function startPolling() {
  stopPolling();
  pollHandle = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    refreshReport().catch(() => {});
  }, 1000);
}
function stopPolling() {
  if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
}
