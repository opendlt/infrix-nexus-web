// Nexus — operator-trust-free portable-package verifier UI.
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 5: a top-level Verify tab
// where the user can drop or paste a `.json` PortableEvidencePackage
// file and watch the 10-check matrix run entirely in the browser
// — no Infrix-server roundtrip. The user has stepped outside the
// operator's trust boundary and is verifying directly from the
// package's self-contained witness.
//
// The view is also where the Accumulate-L0 cross-check tool lives:
// paste an L0 endpoint + a tx hash + an artifact hash, and the
// browser fetches the L0 transaction, decodes the WriteData payload,
// recomputes its digest, and reports the cross-binding matrix.
// Same operator-trust-free guarantee.
//
// Subpaths:
//   #/verify              — drop-zone + textarea + "verify" button
//   #/verify/_l0          — L0 cross-check tool

import {
  emptyState,
  errorNode,
  loadingNode,
  card,
  kvRow,
  jsonBlock,
  formatTime,
  shortHash,
  statusPill,
  hashChip,
  rpcWithDisclosure,
  deeplinkButton,
} from '/lib/spineCommon.js';
import { verifyPortablePackage } from '/lib/portableVerifier.js';

let rootEl = null;
let currentSubpath = [];

export const verifyView = {
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
  if (currentSubpath[0] === '_l0') {
    renderL0Check();
  } else {
    renderPortableVerify();
  }
}

// -----------------------------------------------------------------
// Portable-package drop-in verifier
// -----------------------------------------------------------------
function renderPortableVerify() {
  rootEl.replaceChildren();

  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const h = document.createElement('h2');
  h.textContent = 'Verify portable evidence package';
  head.appendChild(h);
  const sub = document.createElement('p');
  sub.className = 'spine-section-sub';
  sub.textContent = 'Drop or paste a .json file produced by "Export portable package". Verification runs entirely in your browser — the 10-check matrix mirrors pkg/evidence/portable.go::VerifyPortablePackage byte-exact. No Infrix-server roundtrip.';
  head.appendChild(sub);
  const actions = document.createElement('div');
  actions.className = 'action-row';
  actions.appendChild(deeplinkButton('Switch to L0 cross-check', 'verify', '_l0'));
  head.appendChild(actions);
  rootEl.appendChild(head);

  // Drop zone + textarea
  const zone = document.createElement('div');
  zone.className = 'verify-dropzone';
  zone.textContent = 'Drop a portable-package .json file here, or paste below';
  rootEl.appendChild(zone);

  const ta = document.createElement('textarea');
  ta.className = 'verify-textarea';
  // Advertise the version the verifier actually accepts. Pass-17 audit P1-6:
  // this nested Operate-console Verify tab still showed the legacy "version":"3"
  // placeholder (fixed on the main #/prove surface to "4"), guiding console
  // users into an instant version mismatch. Keep it in lock-step with prove.js.
  ta.placeholder = '{ "version": "4", "bundleData": "...", "exportHash": [...], ... }';
  ta.spellcheck = false;
  rootEl.appendChild(ta);

  const btnRow = document.createElement('div');
  btnRow.className = 'action-row verify-actions';
  const verifyBtn = document.createElement('button');
  verifyBtn.type = 'button';
  verifyBtn.className = 'verify-btn';
  verifyBtn.textContent = 'Verify package';
  btnRow.appendChild(verifyBtn);

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'deeplink-btn';
  clearBtn.textContent = 'Clear';
  clearBtn.addEventListener('click', () => {
    ta.value = '';
    out.replaceChildren();
  });
  btnRow.appendChild(clearBtn);
  rootEl.appendChild(btnRow);

  const out = document.createElement('div');
  out.className = 'verify-output';
  rootEl.appendChild(out);

  // File-drop wiring
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      ta.value = text;
      runVerification(text, out, verifyBtn);
    } catch (err) {
      out.replaceChildren(errorNode(new Error('failed to read dropped file: ' + err.message)));
    }
  });

  // Optional file picker (click-to-open)
  zone.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      try {
        const text = await f.text();
        ta.value = text;
        runVerification(text, out, verifyBtn);
      } catch (err) {
        out.replaceChildren(errorNode(err));
      }
    });
    document.body.appendChild(input);
    input.click();
    setTimeout(() => document.body.removeChild(input), 0);
  });

  verifyBtn.addEventListener('click', () => runVerification(ta.value, out, verifyBtn));
}

async function runVerification(text, out, btn) {
  if (!text || !text.trim()) {
    out.replaceChildren(emptyState('Paste or drop a portable-package JSON first.'));
    return;
  }
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch (err) {
    out.replaceChildren(errorNode(new Error('JSON parse failed: ' + err.message)));
    return;
  }
  btn.disabled = true;
  out.replaceChildren(loadingNode('Running 10-check verifier…'));
  try {
    const result = await verifyPortablePackage(pkg);
    out.replaceChildren(renderVerifyResult(result, pkg));
  } catch (err) {
    out.replaceChildren(errorNode(err));
  } finally {
    btn.disabled = false;
  }
}

function renderVerifyResult(result, pkg) {
  const wrap = document.createElement('div');

  const summary = document.createElement('div');
  summary.className = `verify-summary verify-${result.passed ? 'pass' : 'fail'}`;
  const passedCount = result.checks.filter((c) => c.passed).length;
  summary.textContent = `${result.passed ? '✓ All checks passed' : '✗ Verification failed'} — ${passedCount}/${result.checks.length}`;
  wrap.appendChild(summary);

  const list = document.createElement('ul');
  list.className = 'verify-checks';
  for (const c of result.checks) {
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
      const d = document.createElement('span');
      d.className = 'verify-detail';
      d.textContent = c.detail;
      li.appendChild(d);
    }
    if (c.error) {
      const e = document.createElement('span');
      e.className = 'verify-error';
      e.textContent = c.error;
      li.appendChild(e);
    }
    list.appendChild(li);
  }
  wrap.appendChild(list);

  // Package envelope summary
  const env = document.createElement('div');
  env.className = 'verify-envelope';
  env.appendChild(kvRow('Version', pkg.version));
  env.appendChild(kvRow('Bundle ID', (pkg.bundleData && (pkg.bundleData.id || pkg.bundleData.ID)) || (typeof pkg.bundleData === 'string' ? '(raw)' : '?')));
  env.appendChild(kvRow('Anchor', (pkg.anchorTxHash ? `tx ${shortHash(pkg.anchorTxHash, 12, 8)} block ${pkg.anchorBlockHeight}` : 'unanchored')));
  env.appendChild(kvRow('Trust snapshot', `${(pkg.trustSnapshot || []).length} entries`));
  env.appendChild(kvRow('Inclusion proofs', `${(pkg.inclusionProofs || []).length} proofs`));
  env.appendChild(kvRow('Plugin versions', `${(pkg.pluginVersions || []).length} entries`));
  wrap.appendChild(env);

  return wrap;
}

// -----------------------------------------------------------------
// L0 cross-check tool
// -----------------------------------------------------------------
function renderL0Check() {
  rootEl.replaceChildren();

  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const back = document.createElement('a');
  back.className = 'spine-back';
  back.href = '#/verify';
  back.textContent = '← Verify';
  head.appendChild(back);
  const h = document.createElement('h2');
  h.textContent = 'Verify against Accumulate L0';
  head.appendChild(h);
  const sub = document.createElement('p');
  sub.className = 'spine-section-sub';
  sub.textContent = 'Cross-check an Infrix anchor record against the live Accumulate ledger. The browser issues a JSON-RPC `query` to the L0 endpoint, decodes the WriteData payload, recomputes the canonical digest, and reports the cross-binding matrix without trusting the Infrix server.';
  head.appendChild(sub);
  rootEl.appendChild(head);

  // Form
  const form = document.createElement('div');
  form.className = 'spine-filter-bar';

  const epWrap = labelInput('L0 endpoint', 'http://localhost:26660/v3', 'https://testnet.accumulatenetwork.io/v3');
  const txWrap = labelInput('Tx hash', '', '0x… or 64-char hex');
  const artWrap = labelInput('Artifact hash (hex)', '', 'expected sha256(payload)');
  const blockWrap = labelInput('Anchor block (optional)', '', 'numeric — recorded on the anchor record');
  const signerWrap = labelInput('Signer URL (optional)', '', 'acc://operator.acme/book/1');
  for (const w of [epWrap, txWrap, artWrap, blockWrap, signerWrap]) form.appendChild(w);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'verify-btn';
  btn.textContent = 'Verify against L0';
  form.appendChild(btn);
  rootEl.appendChild(form);

  const out = document.createElement('div');
  out.className = 'verify-output';
  rootEl.appendChild(out);

  btn.addEventListener('click', async () => {
    const ep = epWrap.input.value.trim();
    const tx = txWrap.input.value.trim();
    const art = artWrap.input.value.trim();
    const block = blockWrap.input.value.trim();
    const signer = signerWrap.input.value.trim();
    if (!ep || !tx) {
      out.replaceChildren(errorNode(new Error('endpoint and tx hash are required')));
      return;
    }
    btn.disabled = true;
    out.replaceChildren(loadingNode('Querying Accumulate L0…'));
    try {
      const result = await verifyAgainstAccumulate({
        endpoint: ep,
        txHash: tx,
        artifactHash: art,
        anchorBlock: block ? Number(block) : undefined,
        signerURL: signer || undefined,
      });
      out.replaceChildren(renderL0Result(result));
    } catch (err) {
      out.replaceChildren(errorNode(err));
    } finally {
      btn.disabled = false;
    }
  });
}

function renderL0Result(result) {
  const wrap = document.createElement('div');
  const summary = document.createElement('div');
  summary.className = `verify-summary verify-${result.passed ? 'pass' : 'fail'}`;
  const passed = result.checks.filter((c) => c.passed).length;
  summary.textContent = `${result.passed ? '✓ All cross-checks passed' : '✗ One or more cross-checks failed'} — ${passed}/${result.checks.length}`;
  wrap.appendChild(summary);
  const list = document.createElement('ul');
  list.className = 'verify-checks';
  for (const c of result.checks) {
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
      const d = document.createElement('span');
      d.className = 'verify-detail';
      d.textContent = c.detail;
      li.appendChild(d);
    }
    if (c.error) {
      const e = document.createElement('span');
      e.className = 'verify-error';
      e.textContent = c.error;
      li.appendChild(e);
    }
    list.appendChild(li);
  }
  wrap.appendChild(list);
  if (result.raw) {
    const raw = document.createElement('details');
    raw.className = 'raw-details';
    const summary2 = document.createElement('summary');
    summary2.textContent = 'Raw L0 query response';
    raw.appendChild(summary2);
    raw.appendChild(jsonBlock(result.raw));
    wrap.appendChild(raw);
  }
  return wrap;
}

// -----------------------------------------------------------------
// Accumulate L0 client (browser-side)
// -----------------------------------------------------------------
//
// The Accumulate v3 JSON-RPC accepts a `query` method with a `scope`
// parameter (acc:// URL). Transactions are queried via
// `acc://<txHash>@anchor` or `acc://<txHash>` depending on
// network release. We probe both shapes and surface whichever
// returns a non-error response.

async function verifyAgainstAccumulate({ endpoint, txHash, artifactHash, anchorBlock, signerURL }) {
  const checks = [];
  const cleanedHash = String(txHash).replace(/^0x/, '').toLowerCase();

  // 1. Fetch the tx
  let txResp;
  try {
    txResp = await queryAccumulate(endpoint, `acc://${cleanedHash}@anchor`);
  } catch (e1) {
    try {
      txResp = await queryAccumulate(endpoint, `acc://${cleanedHash}`);
    } catch (e2) {
      checks.push({ name: 'l0_fetch_tx', passed: false, error: `${e1.message}; fallback: ${e2.message}` });
      return { passed: false, checks };
    }
  }
  checks.push({ name: 'l0_fetch_tx', passed: true, detail: 'tx loaded from L0' });

  // 2. Status check
  const status = pickStatus(txResp);
  if (status === 'delivered' || status === 'success' || (typeof status === 'number' && status === 200)) {
    checks.push({ name: 'l0_status', passed: true, detail: `tx status = ${status}` });
  } else if (status === 'pending') {
    checks.push({ name: 'l0_status', passed: false, detail: 'tx pending (not yet delivered)' });
  } else {
    checks.push({ name: 'l0_status', passed: false, detail: `tx status = ${status || 'unknown'}` });
  }

  // 3. Payload decode + artifact-hash recomputation
  const payload = extractWriteDataPayload(txResp);
  if (!payload) {
    checks.push({ name: 'l0_payload', passed: false, detail: 'no WriteData entry on tx' });
  } else {
    checks.push({ name: 'l0_payload', passed: true, detail: `${payload.length} byte payload` });
    if (artifactHash) {
      const want = artifactHash.replace(/^0x/, '').toLowerCase();
      const got = await sha256Hex(payload);
      if (got === want) {
        checks.push({ name: 'l0_artifact_hash_match', passed: true, detail: `sha256(payload) = ${got.slice(0, 12)}…` });
      } else {
        // Some anchors embed a JSON envelope with a bundleHash field.
        try {
          const obj = JSON.parse(new TextDecoder().decode(payload));
          const candidate = (obj.bundleHash || obj.artifactHash || obj.hash || '').replace(/^0x/, '').toLowerCase();
          if (candidate === want) {
            checks.push({ name: 'l0_artifact_hash_match', passed: true, detail: 'embedded JSON bundleHash matches' });
          } else {
            checks.push({ name: 'l0_artifact_hash_match', passed: false, detail: `sha256 want ${want.slice(0, 12)}… got ${got.slice(0, 12)}…` });
          }
        } catch (e) {
          checks.push({ name: 'l0_artifact_hash_match', passed: false, detail: `sha256 want ${want.slice(0, 12)}… got ${got.slice(0, 12)}…` });
        }
      }
    } else {
      checks.push({ name: 'l0_artifact_hash_match', passed: true, detail: 'skipped — no artifact hash supplied' });
    }
  }

  // 4. Block-height match
  if (anchorBlock !== undefined) {
    const block = pickBlockHeight(txResp);
    if (block !== null && Number(block) === Number(anchorBlock)) {
      checks.push({ name: 'l0_block_match', passed: true, detail: `block ${block}` });
    } else {
      checks.push({ name: 'l0_block_match', passed: false, detail: `tx block ${block} ≠ supplied ${anchorBlock}` });
    }
  } else {
    checks.push({ name: 'l0_block_match', passed: true, detail: 'skipped — no block supplied' });
  }

  // 5. Signer key-page match
  if (signerURL) {
    const sigPubKey = pickSignerPubKey(txResp);
    if (!sigPubKey) {
      checks.push({ name: 'l0_signer_match', passed: false, detail: 'no signer pub key on tx' });
    } else {
      try {
        const acct = await queryAccumulate(endpoint, signerURL);
        const found = keyPageContainsKey(acct, sigPubKey);
        checks.push({ name: 'l0_signer_match', passed: found, detail: found ? `key in ${signerURL}` : `key not found in ${signerURL}` });
      } catch (err) {
        checks.push({ name: 'l0_signer_match', passed: false, detail: `account fetch failed: ${err.message}` });
      }
    }
  } else {
    checks.push({ name: 'l0_signer_match', passed: true, detail: 'skipped — no signer URL' });
  }

  const passed = checks.every((c) => c.passed);
  return { passed, checks, raw: txResp };
}

async function queryAccumulate(endpoint, scope) {
  const body = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'query',
    params: { scope },
  };
  const resp = await fetch(endpoint.replace(/\/$/, ''), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.error) throw new Error(`RPC error: ${data.error.message || JSON.stringify(data.error)}`);
  return data.result;
}

function pickStatus(r) {
  if (!r) return null;
  // Accumulate query response variants:
  //   { status: 'delivered', ... }                — top level
  //   { value: { status: 'delivered', ... } }     — nested
  //   { status: { code: 'delivered' } }           — code object
  //   { status: 200 }                             — numeric status code
  if (typeof r.status === 'string') return r.status.toLowerCase();
  if (typeof r.status === 'number') return r.status;
  if (r.status && typeof r.status === 'object' && r.status.code) return String(r.status.code).toLowerCase();
  if (r.value && typeof r.value === 'object') return pickStatus(r.value);
  return null;
}

function pickBlockHeight(r) {
  if (!r) return null;
  if (r.blockHeight !== undefined) return r.blockHeight;
  if (r.minorBlock !== undefined) return r.minorBlock;
  if (r.value && typeof r.value === 'object') return pickBlockHeight(r.value);
  if (Array.isArray(r.produced) && r.produced.length > 0) {
    const first = r.produced[0];
    if (first && first.blockHeight !== undefined) return first.blockHeight;
  }
  return null;
}

function pickSignerPubKey(r) {
  if (!r) return null;
  const sigs = r.signatures || (r.value && r.value.signatures) || [];
  if (Array.isArray(sigs) && sigs.length > 0) {
    return sigs[0].publicKey || sigs[0].PublicKey || null;
  }
  return null;
}

function keyPageContainsKey(acct, pubKey) {
  if (!acct || !pubKey) return false;
  const arr = acct.keys || acct.Keys ||
    (acct.account && (acct.account.keys || acct.account.Keys)) ||
    (acct.value && (acct.value.keys || acct.value.Keys)) ||
    [];
  if (!Array.isArray(arr)) return false;
  const wanted = String(pubKey).toLowerCase();
  return arr.some((k) => String(k.publicKey || k.PublicKey || '').toLowerCase() === wanted);
}

function extractWriteDataPayload(r) {
  if (!r) return null;
  const body = (r.transaction && r.transaction.body) ||
               (r.value && r.value.transaction && r.value.transaction.body) ||
               r.body || null;
  if (!body) return null;
  let data = null;
  if (body.entry && body.entry.data) data = body.entry.data;
  else if (body.data) data = body.data;
  if (!data) return null;
  const first = Array.isArray(data) ? data[0] : data;
  if (typeof first !== 'string') return null;
  try {
    const bin = atob(first);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch (e) {
    return null;
  }
}

async function sha256Hex(bytes) {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  const arr = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < arr.length; i++) s += arr[i].toString(16).padStart(2, '0');
  return s;
}

function labelInput(label, value, placeholder) {
  const wrap = document.createElement('label');
  wrap.className = 'spine-filter';
  const span = document.createElement('span');
  span.textContent = label;
  wrap.appendChild(span);
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value || '';
  if (placeholder) input.placeholder = placeholder;
  wrap.appendChild(input);
  wrap.input = input;
  return wrap;
}
