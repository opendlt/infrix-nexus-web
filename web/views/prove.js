// Nexus — Evidence Reader / Prove view.
//
// NEXUS-REIMAGINED-2026-05-10 Phase 5 — Evidence Reader And Portable
// Verification.
//
// Routes:
//   #/prove                  — drag-and-drop portable-package verifier
//   #/prove/<evidenceId>     — live evidence reader for a bundle
//
// The drop zone runs the existing client-side portable verifier
// (lib/portableVerifier.js) without any server round-trip — the user
// has stepped outside the operator's trust boundary and verifies
// directly from the file's self-contained witness.
//
// The bundle reader uses the new nexus.evidenceProof projection to
// surface the canonical claim → artifact → recompute → external check
// matrix, the chain walker, and cross-bindings. Export-portable +
// download-report controls let the user persist the proof.

import { rpcWithDisclosure, errorStateNode, jsonBlock } from '/lib/spineCommon.js';
import { renderEvidenceProof } from '/lib/evidenceProof.js';
import { verifyPortablePackage } from '/lib/portableVerifier.js';
import { buildReceiptFromVerifier, validateReceipt } from '/lib/proofReceipt.js';
import { mountProofReceipt } from '/components/proofReceiptView.js';
import { crossCheckL0 } from '/lib/l0CrossCheck.js';

let rootEl = null;
let bodyEl = null;
let currentEvidenceId = null;

export const proveView = {
  async mount(root, subpath) {
    rootEl = root;
    rootEl.replaceChildren();
    const shell = document.createElement('div');
    shell.className = 'workspace prove-canvas';
    rootEl.appendChild(shell);

    const head = document.createElement('header');
    head.className = 'workspace-header';
    const title = document.createElement('h2');
    title.className = 'workspace-title';
    title.textContent = 'Verifier';
    head.appendChild(title);
    const sub = document.createElement('p');
    sub.className = 'workspace-subtitle';
    sub.textContent = 'Prove what happened. Drop a verification file, or open a result to check every claim against its source.';
    head.appendChild(sub);
    // RUNBOOK-01 IA — Verify is the single verification door; the batch verifier
    // (previously reachable only by typing #/verifyBatch) is surfaced from here.
    const batchLink = document.createElement('a');
    batchLink.className = 'prove-batch-link';
    batchLink.href = '#/verifyBatch';
    batchLink.textContent = 'Verify many at once (batch) →';
    head.appendChild(batchLink);
    shell.appendChild(head);

    const main = document.createElement('section');
    main.className = 'prove-main';
    shell.appendChild(main);

    bodyEl = document.createElement('div');
    bodyEl.className = 'prove-body';
    bodyEl.id = 'proveBody';
    main.appendChild(bodyEl);

    const evidenceId = subpath && subpath[0];
    if (!evidenceId) {
      currentEvidenceId = null;
      renderDropZone();
      return;
    }
    currentEvidenceId = evidenceId;
    await refreshProof();
  },

  onSubpathChange(subpath) {
    const evidenceId = subpath && subpath[0];
    if (evidenceId === currentEvidenceId) return;
    if (!evidenceId) {
      currentEvidenceId = null;
      renderDropZone();
      return;
    }
    currentEvidenceId = evidenceId;
    refreshProof().catch(() => {});
  },
};

// =================================================================
// Live evidence reader (bundle id supplied)
// =================================================================
async function refreshProof() {
  if (!currentEvidenceId || !bodyEl) return;
  try {
    const proof = await rpcWithDisclosure('nexus.evidenceProof', { evidenceId: currentEvidenceId });
    bodyEl.replaceChildren(renderEvidenceProof(proof, {
      onExportPortable: () => exportPortable(currentEvidenceId),
      onDownloadReport: () => downloadReport(proof),
      // RUNBOOK-07 SP8 — a real L0 confirmation from the anchor panel surfaces a
      // banner. (The portable offline path is where the receipt upgrades to L4;
      // here the proof is a node projection, so we confirm without re-badging.)
      onL0Verified: (r) => {
        const banner = document.createElement('div');
        banner.className = 'verify-summary verify-pass evidence-action-status';
        banner.textContent = `✓ Anchor confirmed directly on ${r.network} L0 — independent of the Infrix node.`;
        bodyEl.prepend(banner);
      },
    }));
  } catch (err) {
    bodyEl.replaceChildren(errorStateNode(err));
  }
}

async function exportPortable(evidenceId) {
  const banner = document.createElement('div');
  banner.className = 'verify-summary verify-warn evidence-action-status';
  banner.textContent = 'Building portable export…';
  bodyEl.prepend(banner);
  try {
    const pkg = await rpcWithDisclosure('explorer.evidenceExportPortable', { id: evidenceId });
    downloadJSON(`evidence-${evidenceId}.portable.json`, pkg);
    banner.classList.remove('verify-warn');
    banner.classList.add('verify-pass');
    banner.textContent = `✓ Portable package downloaded — share it with anyone who needs to verify this outcome offline.`;
  } catch (err) {
    banner.classList.remove('verify-warn');
    banner.classList.add('verify-fail');
    banner.textContent = 'Export failed: ' + (err.message || 'unknown error');
  }
}

function downloadReport(proof) {
  const banner = document.createElement('div');
  banner.className = 'verify-summary verify-pass evidence-action-status';
  banner.textContent = '✓ Verification report downloaded.';
  bodyEl.prepend(banner);
  const report = {
    generatedAt:        new Date().toISOString(),
    bundleId:           proof.bundleId,
    intentId:           proof.intentId,
    planId:             proof.planId,
    outcomeRecordId:    proof.outcomeRecordId,
    level:              proof.level,
    bundleHash:         proof.bundleHash,
    planHash:           proof.planHash,
    outcomeDigest:      proof.outcomeDigest,
    anchorStatus:       proof.anchorStatus,
    sealedBlockHeight:  proof.sealedBlockHeight,
    chainVerified:      proof.chainVerified,
    summary:            proof.summary,
    risk:               proof.risk,
    checks:             proof.checks,
    crossBindings:      proof.crossBindings,
    chain:              proof.chain,
    pluginVersions:     proof.pluginVersions,
    verificationResult: proof.verificationResult,
    rawSources:         proof.rawSources,
  };
  downloadJSON(`verification-report-${proof.bundleId || 'bundle'}.json`, report);
}

function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// =================================================================
// Drag-and-drop portable-package verifier
// =================================================================
function renderDropZone() {
  bodyEl.replaceChildren();
  const intro = document.createElement('p');
  intro.className = 'prove-drop-intro';
  intro.textContent = 'Drop a proof file (.portable.json) here, or paste its contents below. Verification runs entirely in your browser — no server round-trip, nothing leaves your machine.';
  bodyEl.appendChild(intro);

  const drop = document.createElement('div');
  drop.className = 'prove-drop-zone';
  drop.tabIndex = 0;
  const dropMsg = document.createElement('div');
  dropMsg.className = 'prove-drop-msg';
  dropMsg.textContent = 'Drop a proof file here';
  drop.appendChild(dropMsg);
  const orPick = document.createElement('label');
  orPick.className = 'prove-drop-or';
  orPick.textContent = 'or click to browse';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.style.display = 'none';
  orPick.appendChild(fileInput);
  drop.appendChild(orPick);
  bodyEl.appendChild(drop);

  // Or paste JSON directly
  const pasteWrap = document.createElement('details');
  pasteWrap.className = 'prove-paste-details';
  const pasteSum = document.createElement('summary');
  pasteSum.textContent = 'Or paste the proof file contents';
  pasteWrap.appendChild(pasteSum);
  const ta = document.createElement('textarea');
  ta.className = 'prove-paste-textarea';
  ta.spellcheck = false;
  // RUNBOOK-04 Task 6 (Gate 0) — advertise the version the verifier actually
  // accepts (portableVerifier PORTABLE_VERSION === '4'). The old "3" placeholder
  // produced an instant, confusing "version mismatch" for anyone who typed it.
  ta.placeholder = '{ "version": "4", "bundleData": "...", ... }';
  pasteWrap.appendChild(ta);
  const pasteBtn = document.createElement('button');
  pasteBtn.type = 'button';
  pasteBtn.className = 'verify-btn prove-paste-btn';
  pasteBtn.textContent = 'Verify';
  pasteWrap.appendChild(pasteBtn);
  bodyEl.appendChild(pasteWrap);

  const result = document.createElement('div');
  result.className = 'prove-drop-result';
  bodyEl.appendChild(result);

  const verify = async (text) => {
    result.replaceChildren();
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (err) { result.appendChild(errorStateNode(new Error('JSON parse: ' + err.message))); return; }
    const banner = document.createElement('div');
    banner.className = 'verify-summary verify-warn';
    banner.textContent = 'Running 10-check verifier…';
    result.appendChild(banner);
    try {
      const out = await verifyPortablePackage(parsed);
      banner.classList.remove('verify-warn');
      banner.classList.add(out.passed ? 'verify-pass' : 'verify-fail');
      banner.textContent = out.passed
        ? `✓ Verified — ${out.checks.length} checks passed.`
        : `✗ Failed — ${out.checks.filter((c) => !c.passed).length} of ${out.checks.length} checks didn't pass.`;
      // adoption-06 — the compact proof receipt the user actually reads first.
      const bundle = (parsed && typeof parsed.bundleData === 'object') ? parsed.bundleData : {};
      const receipt = buildReceiptFromVerifier(out, {
        subjectType: 'evidence',
        subjectId: String(bundle.id || bundle.bundleId || ''),
        evidenceId: String(bundle.id || bundle.bundleId || ''),
        intentId: String(bundle.intentId || ''),
        anchorTx: String(bundle.anchorTxHash || ''),
        verifier: 'Nexus offline verifier',
        verifiedAt: new Date().toISOString(),
      });
      const receiptHost = document.createElement('div');
      receiptHost.className = 'prove-receipt-host';
      result.appendChild(receiptHost);
      mountProofReceipt(receiptHost, receipt);

      // RUNBOOK-07 SP8 — when the bundle is anchored (tx + block on hand) and the
      // offline verifier passed, offer a DIRECT L0 cross-check that upgrades the
      // receipt to L4 — honestly. The upgrade is rebuilt and RE-VALIDATED; an L4
      // receipt that fails validateReceipt is discarded and we keep L3.
      const anchorTx = String(bundle.anchorTxHash || bundle.anchorTx || '');
      const anchorBlock = Number(bundle.sealedBlockHeight || bundle.anchorBlockHeight || bundle.blockHeight || 0);
      if (out.passed && anchorTx && anchorBlock > 0) {
        mountL0Upgrade(result, receiptHost, {
          out, baseOpts: {
            subjectType: 'evidence',
            subjectId: String(bundle.id || bundle.bundleId || ''),
            evidenceId: String(bundle.id || bundle.bundleId || ''),
            intentId: String(bundle.intentId || ''),
            anchorTx,
            verifier: 'Nexus offline verifier',
            verifiedAt: new Date().toISOString(),
          },
          anchor: { status: 'anchored', txHash: anchorTx, blockHeight: anchorBlock },
        });
      }

      result.appendChild(renderPortableChecks(out.checks));
      // RUNBOOK-04 Task 6 — the offline path is where an external auditor (outside
      // the operator's trust boundary) most needs a durable artifact. Let them
      // download the verification result, like the live bundle-reader path can.
      const dl = document.createElement('button');
      dl.type = 'button';
      dl.className = 'verify-btn prove-offline-download';
      dl.textContent = 'Download verification result';
      dl.addEventListener('click', () => downloadJSON(
        `offline-verification-${(bundle.id || bundle.bundleId || 'bundle')}.json`,
        { generatedAt: new Date().toISOString(), passed: out.passed, checks: out.checks, receipt },
      ));
      result.appendChild(dl);
    } catch (err) {
      banner.classList.remove('verify-warn');
      banner.classList.add('verify-fail');
      banner.textContent = 'Verifier error: ' + (err.message || 'unknown');
    }
  };

  drop.addEventListener('dragover', (ev) => { ev.preventDefault(); drop.classList.add('drag-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
  drop.addEventListener('drop', async (ev) => {
    ev.preventDefault();
    drop.classList.remove('drag-over');
    const file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (!file) return;
    const text = await file.text();
    verify(text);
  });
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const text = await file.text();
    verify(text);
  });
  pasteBtn.addEventListener('click', () => verify(ta.value));
}

// RUNBOOK-07 SP8 — the "Cross-check against L0 now → L4" control for the offline
// verifier. Runs a DIRECT L0 query; on confirmation it rebuilds the receipt with
// l0Verified + network + command, RE-VALIDATES it, and only re-mounts as L4 when
// validateReceipt returns clean. Fails closed to L3 with the reason otherwise —
// it is impossible to render an L4 badge without a real, recorded confirmation.
function mountL0Upgrade(result, receiptHost, { out, baseOpts, anchor }) {
  const wrap = document.createElement('div');
  wrap.className = 'prove-l0-upgrade';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'verify-btn prove-l0-crosscheck';
  btn.textContent = 'Cross-check against L0 now';
  const status = document.createElement('p');
  status.className = 'prove-l0-status';
  status.hidden = true;
  wrap.appendChild(btn);
  wrap.appendChild(status);
  result.appendChild(wrap);

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    status.hidden = false;
    status.className = 'prove-l0-status is-checking';
    status.textContent = 'Checking L0…';
    const r = await crossCheckL0(anchor);
    if (!r.ok || !r.l0Verified) {
      status.className = 'prove-l0-status is-fail';
      status.textContent = `✗ ${r.reason || 'L0 cross-check failed'} — receipt stays L3. Use the CLI command for a locked-down deployment.`;
      btn.disabled = false;
      return;
    }
    // Rebuild as L4 with the recorded confirmation, then RE-VALIDATE.
    const l4 = buildReceiptFromVerifier(out, {
      ...baseOpts,
      l0Verified: true,
      proofLevel: 'L4',
      network: r.network,
      command: r.command,
    });
    const violations = validateReceipt(l4);
    if (violations.length) {
      // Never show an unvalidated L4 — keep L3 and surface the violation.
      status.className = 'prove-l0-status is-fail';
      status.textContent = '✗ The upgraded receipt failed validation (' + violations[0] + ') — keeping L3.';
      btn.disabled = false;
      return;
    }
    mountProofReceipt(receiptHost, l4);
    status.className = 'prove-l0-status is-ok';
    status.textContent = `✓ Confirmed on ${r.network} at block ${anchor.blockHeight} — receipt upgraded to L4.`;
    btn.remove();
  });
}

function renderPortableChecks(checks) {
  const tbl = document.createElement('table');
  tbl.className = 'dossier-table prove-checks-table';
  tbl.innerHTML = '<thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const c of checks) {
    const tr = document.createElement('tr');
    tr.className = c.passed ? 'check-pass' : 'check-fail';
    const name = document.createElement('td');
    name.className = 'mono';
    name.textContent = c.name;
    tr.appendChild(name);
    const st = document.createElement('td');
    st.className = 'mono';
    st.textContent = c.passed ? '✓ pass' : '✗ fail';
    tr.appendChild(st);
    const det = document.createElement('td');
    det.textContent = c.detail || c.error || '';
    tr.appendChild(det);
    tbody.appendChild(tr);
  }
  tbl.appendChild(tbody);
  return tbl;
}
