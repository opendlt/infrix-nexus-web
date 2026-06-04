// Nexus — Anchors view (list + detail + chain + client-side L0 verify).
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 2-G: anchored records as the
// L0-bound proof of every spine artifact. The detail screen surfaces:
//   - Artifact type / id / hash
//   - Anchor class (digest_only | full) + purpose (evidentiary |
//     required_for_finality | cross_domain)
//   - Full L0 binding (tx hash / block / data account / data idx /
//     submitted at / confirmed at)
//   - Origin spine provenance (intent / plan / previous anchor)
//   - "Verify against Accumulate L0" button — runs entirely in the
//     browser, fetches the L0 transaction from the public Accumulate
//     REST endpoint, decodes the WriteData payload, recomputes the
//     digest, and reports a green/red cross-check matrix without
//     trusting the Infrix server.
//
// Subpaths:
//   #/anchors                — paged list (filters: artifact type /
//                              purpose / state)
//   #/anchors/<anchorId>     — single-anchor detail + chain + verify
//   #/anchors/_byIntent/<id> — every anchor record where the
//                              originIntentId equals the supplied
//                              intent ID (used by Evidence detail)

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

export const anchorsView = {
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
  h.textContent = 'Anchors';
  head.appendChild(h);
  const sub = document.createElement('p');
  sub.className = 'spine-section-sub';
  sub.textContent = 'Spine artifacts anchored to Accumulate L0. Click any row to inspect, walk the chain, or verify against the live ledger.';
  head.appendChild(sub);
  rootEl.appendChild(head);

  const filterBar = renderFilterBar(() => renderList());
  rootEl.appendChild(filterBar);

  const wrap = document.createElement('div');
  wrap.className = 'spine-table-wrap';
  wrap.appendChild(loadingNode('Loading anchors…'));
  rootEl.appendChild(wrap);

  let resp;
  try {
    resp = await rpcWithDisclosure('explorer.recentAnchors', { limit: 200 });
  } catch (err) {
    wrap.replaceChildren(errorNode(err));
    return;
  }
  let anchors = (resp && Array.isArray(resp.anchors)) ? resp.anchors : [];
  anchors = applyFilters(anchors);
  if (anchors.length === 0) {
    wrap.replaceChildren(emptyState('No anchor records yet. Anchors appear here as evidence is finalised and submitted to L0.'));
    return;
  }

  const table = document.createElement('table');
  table.className = 'spine-table anchors-table';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const c of ['ID', 'Artifact', 'Class', 'Purpose', 'L0 status', 'Updated']) {
    const th = document.createElement('th');
    th.textContent = c;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const a of anchors) tbody.appendChild(buildAnchorRow(a));
  table.appendChild(tbody);
  wrap.replaceChildren(table);

  const meta = document.createElement('div');
  meta.className = 'spine-table-meta';
  meta.textContent = `${anchors.length} anchor record${anchors.length === 1 ? '' : 's'} shown`;
  rootEl.appendChild(meta);
}

const filterState = {
  artifactType: '',
  anchorPurpose: '',
  status: '',
};

function renderFilterBar(onChange) {
  const bar = document.createElement('div');
  bar.className = 'spine-filter-bar';
  bar.appendChild(textFilter('Artifact type', filterState.artifactType, (v) => {
    filterState.artifactType = v;
    onChange();
  }));
  bar.appendChild(selectFilter('Purpose', filterState.anchorPurpose, [
    { value: '', label: 'all' },
    { value: 'evidentiary', label: 'evidentiary' },
    { value: 'required_for_finality', label: 'required for finality' },
    { value: 'cross_domain', label: 'cross-domain' },
  ], (v) => {
    filterState.anchorPurpose = v;
    onChange();
  }));
  bar.appendChild(selectFilter('Status', filterState.status, [
    { value: '', label: 'all' },
    { value: 'pending', label: 'pending' },
    { value: 'submitted', label: 'submitted' },
    { value: 'confirmed', label: 'confirmed' },
    { value: 'verified', label: 'verified' },
  ], (v) => {
    filterState.status = v;
    onChange();
  }));
  return bar;
}

function applyFilters(anchors) {
  return anchors.filter((a) => {
    const at = (a.artifactType || '').toLowerCase();
    const ap = (a.anchorPurpose || '').toLowerCase();
    const st = (a.anchorStatus || a.state || '').toLowerCase();
    if (filterState.artifactType && !at.includes(filterState.artifactType.toLowerCase())) return false;
    if (filterState.anchorPurpose && ap !== filterState.anchorPurpose) return false;
    if (filterState.status && st !== filterState.status) return false;
    return true;
  });
}

function buildAnchorRow(a) {
  const tr = document.createElement('tr');
  tr.className = 'anchor-row';
  tr.addEventListener('click', () => {
    window.location.hash = '#/anchors/' + encodeURIComponent(a.id);
  });
  const idCell = document.createElement('td');
  idCell.className = 'mono';
  idCell.textContent = shortHash(a.id, 14, 6);
  idCell.title = a.id;
  tr.appendChild(idCell);

  const artifactCell = document.createElement('td');
  artifactCell.textContent = a.artifactType || '—';
  tr.appendChild(artifactCell);

  const classCell = document.createElement('td');
  classCell.textContent = a.anchorType || '—';
  tr.appendChild(classCell);

  const purposeCell = document.createElement('td');
  purposeCell.textContent = a.anchorPurpose || '—';
  tr.appendChild(purposeCell);

  const statusCell = document.createElement('td');
  const st = a.anchorStatus || a.state || 'pending';
  statusCell.appendChild(statusPill(st, st === 'confirmed' || st === 'verified' ? 'ok' : 'warn'));
  tr.appendChild(statusCell);

  const updatedCell = document.createElement('td');
  updatedCell.textContent = formatTime(a.updated);
  tr.appendChild(updatedCell);
  return tr;
}

function textFilter(label, value, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'spine-filter';
  const span = document.createElement('span');
  span.textContent = label;
  wrap.appendChild(span);
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value || '';
  input.addEventListener('input', () => onChange(input.value));
  wrap.appendChild(input);
  return wrap;
}

function selectFilter(label, value, options, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'spine-filter';
  const span = document.createElement('span');
  span.textContent = label;
  wrap.appendChild(span);
  const sel = document.createElement('select');
  for (const opt of options) {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.value === value) option.selected = true;
    sel.appendChild(option);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  wrap.appendChild(sel);
  return wrap;
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
  back.href = '#/anchors';
  back.textContent = '← All anchors';
  head.appendChild(back);
  const h = document.createElement('h2');
  h.textContent = 'Anchors for intent';
  head.appendChild(h);
  const sp = document.createElement('p');
  sp.className = 'spine-section-sub mono';
  sp.textContent = intentId;
  head.appendChild(sp);
  rootEl.appendChild(head);

  const wrap = document.createElement('div');
  wrap.className = 'spine-table-wrap';
  wrap.appendChild(loadingNode('Loading anchors…'));
  rootEl.appendChild(wrap);

  let resp;
  try {
    resp = await rpcWithDisclosure('explorer.recentAnchors', { limit: 500 });
  } catch (err) {
    wrap.replaceChildren(errorNode(err));
    return;
  }
  const all = (resp && Array.isArray(resp.anchors)) ? resp.anchors : [];
  const matching = all.filter((a) => (a.originIntentID === intentId) || (a.createdByIntentID === intentId));
  if (matching.length === 0) {
    wrap.replaceChildren(emptyState('No anchor records found for this intent.'));
    return;
  }

  const table = document.createElement('table');
  table.className = 'spine-table anchors-table';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const c of ['ID', 'Artifact', 'Class', 'Purpose', 'L0 status', 'Updated']) {
    const th = document.createElement('th');
    th.textContent = c;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const a of matching) tbody.appendChild(buildAnchorRow(a));
  table.appendChild(tbody);
  wrap.replaceChildren(table);
}

// -----------------------------------------------------------------
// Detail
// -----------------------------------------------------------------
async function renderDetail(anchorId) {
  rootEl.replaceChildren();
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const back = document.createElement('a');
  back.className = 'spine-back';
  back.href = '#/anchors';
  back.textContent = '← All anchors';
  head.appendChild(back);
  const h = document.createElement('h2');
  h.className = 'mono';
  h.textContent = anchorId;
  head.appendChild(h);
  rootEl.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  rootEl.appendChild(grid);

  let anchor;
  try {
    anchor = await rpcWithDisclosure('explorer.anchorGet', { id: anchorId });
  } catch (err) {
    grid.appendChild(errorNode(err));
    return;
  }
  if (!anchor) {
    grid.appendChild(errorNode(new Error('anchor not found')));
    return;
  }

  const fields = anchor.fields || {};
  const artifactType = fields.artifactType || fields.ArtifactType;
  const artifactID = fields.artifactId || fields.ArtifactID;
  const artifactHash = fields.artifactHash || fields.ArtifactHash;
  const anchorType = fields.anchorType || fields.AnchorType;
  const anchorPurpose = fields.anchorPurpose || fields.AnchorPurpose;
  const status = fields.status || fields.Status || anchor.state || anchor.State;
  const l0TxHash = fields.l0TxHash || fields.L0TxHash;
  const l0Block = fields.l0BlockHeight || fields.L0BlockHeight;
  const l0DataAccount = fields.l0DataAccount || fields.L0DataAccount;
  const l0DataIdx = fields.l0DataIdx || fields.L0DataIdx;
  const submittedAt = fields.submittedAt || fields.SubmittedAt;
  const confirmedAt = fields.confirmedAt || fields.ConfirmedAt;
  const originIntent = fields.originIntentId || fields.OriginIntentID || anchor.createdByIntentID || anchor.CreatedByIntentID;
  const originPlan = fields.originPlanId || fields.OriginPlanID || anchor.createdByPlanID || anchor.CreatedByPlanID;
  const previousAnchorID = fields.previousAnchorId || fields.PreviousAnchorID;
  const signerURL = fields.signerURL || fields.SignerURL;
  const anchoredByPolicy = fields.anchoredByPolicy || fields.AnchoredByPolicy;

  // Header
  const headerBody = document.createElement('div');
  if (artifactType) headerBody.appendChild(kvRow('Artifact type', artifactType));
  if (artifactID) headerBody.appendChild(kvRow('Artifact ID', shortHashLinkToArtifact(artifactID, artifactType)));
  if (artifactHash) headerBody.appendChild(kvRow('Artifact hash', hashChip(artifactHash, { head: 12, tail: 8 })));
  if (anchorType) headerBody.appendChild(kvRow('Anchor class', anchorType));
  if (anchorPurpose) headerBody.appendChild(kvRow('Anchor purpose', anchorPurpose));
  headerBody.appendChild(kvRow('Status', statusPill(status || 'pending', status === 'confirmed' || status === 'verified' ? 'ok' : 'warn')));
  if (anchoredByPolicy) headerBody.appendChild(kvRow('Anchored by policy', anchoredByPolicy));
  grid.appendChild(card('Anchor envelope', headerBody));

  // L0 binding card
  const l0Body = document.createElement('div');
  if (l0TxHash) l0Body.appendChild(kvRow('Tx hash', hashChip(l0TxHash, { head: 12, tail: 8 })));
  if (l0Block !== undefined) l0Body.appendChild(kvRow('Block', l0Block));
  if (l0DataAccount) l0Body.appendChild(kvRow('Data account', l0DataAccount));
  if (l0DataIdx !== undefined) l0Body.appendChild(kvRow('Data index', l0DataIdx));
  if (signerURL) l0Body.appendChild(kvRow('Signer URL', signerURL));
  if (submittedAt) l0Body.appendChild(kvRow('Submitted at', formatTime(submittedAt)));
  if (confirmedAt) l0Body.appendChild(kvRow('Confirmed at', formatTime(confirmedAt)));
  grid.appendChild(card('L0 binding', l0Body));

  // Provenance card
  const provBody = document.createElement('div');
  if (originIntent) provBody.appendChild(kvRow('Origin intent', shortHashLink(originIntent, 'intents')));
  if (originPlan) provBody.appendChild(kvRow('Origin plan', shortHashLink(originPlan, 'plans')));
  if (previousAnchorID) provBody.appendChild(kvRow('Previous anchor', shortHashLink(previousAnchorID, 'anchors')));
  grid.appendChild(card('Origin spine provenance', provBody));

  // Anchor chain walker
  const chainBody = document.createElement('div');
  chainBody.appendChild(loadingNode('Walking anchor chain…'));
  grid.appendChild(card('Anchor chain', chainBody));
  rpcWithDisclosure('explorer.anchorChain', { startId: anchorId, maxDepth: 50 })
    .then((resp) => {
      const chain = (resp && Array.isArray(resp.chain)) ? resp.chain : [];
      chainBody.replaceChildren();
      if (chain.length === 0) {
        chainBody.appendChild(emptyState('Empty chain.'));
        return;
      }
      const list = document.createElement('ol');
      list.className = 'anchor-chain-list';
      for (const link of chain) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.className = 'mono spine-link';
        a.href = '#/anchors/' + encodeURIComponent(link.id);
        a.textContent = shortHash(link.id, 14, 6);
        li.appendChild(a);
        const at = document.createElement('span');
        at.className = 'chain-at';
        at.textContent = ` ${link.artifactType || '?'} · block ${link.l0BlockHeight !== undefined ? link.l0BlockHeight : '?'}`;
        li.appendChild(at);
        list.appendChild(li);
      }
      chainBody.appendChild(list);
      const note = document.createElement('div');
      note.className = 'chain-note';
      note.textContent = `${chain.length} link${chain.length === 1 ? '' : 's'} (newest → oldest)`;
      chainBody.appendChild(note);
    })
    .catch((err) => {
      chainBody.replaceChildren(errorNode(err));
    });

  // Verification: client-side L0 cross-check
  const verifyBody = document.createElement('div');
  const desc = document.createElement('p');
  desc.className = 'verify-init';
  desc.textContent = 'The "Verify against Accumulate L0" check runs entirely in your browser. It fetches the L0 transaction from the Accumulate REST endpoint, decodes the WriteData payload, recomputes the canonical hash, and confirms every cross-binding (artifact hash, block height, signer key page) without trusting the Infrix server.';
  verifyBody.appendChild(desc);

  const epWrap = document.createElement('label');
  epWrap.className = 'spine-filter';
  const epLbl = document.createElement('span');
  epLbl.textContent = 'L0 endpoint';
  epWrap.appendChild(epLbl);
  const epInput = document.createElement('input');
  epInput.type = 'text';
  epInput.style.minWidth = '380px';
  // Default to the operator-configured endpoint if available; the
  // explorer.l0Endpoint RPC fills this in async. Fallback to public testnet.
  epInput.value = '';
  epInput.placeholder = 'https://testnet.accumulatenetwork.io/v3 or http://localhost:26660/v3';
  epWrap.appendChild(epInput);
  rpcWithDisclosure('explorer.l0Endpoint', {})
    .then((r) => {
      if (r && r.endpoint) epInput.value = r.endpoint;
      else epInput.value = 'https://testnet.accumulatenetwork.io/v3';
    })
    .catch(() => { epInput.value = 'https://testnet.accumulatenetwork.io/v3'; });
  verifyBody.appendChild(epWrap);

  const verifyBtn = document.createElement('button');
  verifyBtn.type = 'button';
  verifyBtn.className = 'verify-btn';
  verifyBtn.textContent = 'Verify against Accumulate L0';
  const verifyOut = document.createElement('div');
  verifyOut.className = 'verify-output';
  verifyBtn.addEventListener('click', async () => {
    const ep = epInput.value.trim();
    if (!l0TxHash) {
      verifyOut.replaceChildren(errorNode(new Error('this anchor has no L0 tx hash to verify')));
      return;
    }
    if (!ep) {
      verifyOut.replaceChildren(errorNode(new Error('enter an L0 endpoint first')));
      return;
    }
    verifyBtn.disabled = true;
    verifyOut.replaceChildren(loadingNode('Cross-checking against L0…'));
    try {
      const result = await verifyAgainstL0({
        endpoint: ep,
        txHash: l0TxHash,
        artifactHash: artifactHash,
        l0BlockHeight: l0Block,
        signerURL: signerURL,
      });
      verifyOut.replaceChildren(renderL0VerificationResult(result));
    } catch (err) {
      verifyOut.replaceChildren(errorNode(err));
    } finally {
      verifyBtn.disabled = false;
    }
  });
  verifyBody.appendChild(verifyBtn);
  verifyBody.appendChild(verifyOut);
  grid.appendChild(card('Verify against Accumulate L0', verifyBody));

  // Cross-links
  const linksBody = document.createElement('div');
  linksBody.className = 'action-row';
  if (originIntent) linksBody.appendChild(deeplinkButton('View intent', 'intents', originIntent));
  if (originPlan) linksBody.appendChild(deeplinkButton('View plan', 'plans', originPlan));
  if (artifactType === 'evidence_bundle' && artifactID) linksBody.appendChild(deeplinkButton('View evidence', 'evidence', artifactID));
  grid.appendChild(card('Cross-links', linksBody));

  // Raw envelope
  const rawBody = document.createElement('details');
  rawBody.className = 'raw-details';
  const summary = document.createElement('summary');
  summary.textContent = 'Raw managed object';
  rawBody.appendChild(summary);
  rawBody.appendChild(jsonBlock(anchor));
  grid.appendChild(card('Inspect', rawBody));
}

function shortHashLink(value, route) {
  const a = document.createElement('a');
  a.className = 'mono spine-link';
  a.href = `#/${route}/${encodeURIComponent(value)}`;
  a.textContent = shortHash(value, 14, 6);
  a.title = value;
  return a;
}

function shortHashLinkToArtifact(value, artifactType) {
  const route = ({
    'evidence_bundle': 'evidence',
    'execution_plan': 'plans',
    'plan': 'plans',
    'outcome_record': 'outcomes',
    'intent': 'intents',
  })[artifactType] || null;
  if (!route) {
    const span = document.createElement('span');
    span.className = 'mono';
    span.textContent = String(value);
    return span;
  }
  return shortHashLink(value, route);
}

// -----------------------------------------------------------------
// Client-side L0 verifier
// -----------------------------------------------------------------
//
// Fetches the supplied L0 tx hash from the Accumulate REST endpoint
// and runs the canonical 5-check matrix described in the redesign
// plan Section 6:
//   1. Tx status
//   2. Payload decode + recompute artifact hash
//   3. Hash match (artifact hash on the spine record vs the L0 payload)
//   4. Signer match (the L0 tx signer is in the operator's key page)
//   5. Block match (L0 block height equals the block number stored
//      on the anchor record)
//
// Each check returns its own {passed, detail} so the UI renders a
// per-check breakdown. Missing inputs (e.g. signer URL not yet
// captured on the anchor record) yield a "skipped" result rather
// than a fail — the redesign explicitly allows skipping checks for
// fields that don't apply.
async function verifyAgainstL0({ endpoint, txHash, artifactHash, l0BlockHeight, signerURL }) {
  const checks = [];

  // The Accumulate API is JSON-RPC at /v3/jsonrpc; query method is
  // typically `query` with a Url param like `acc://<txhash>@anchor`.
  // The exact RPC shape varies by network release; we try a fetch-by-tx
  // endpoint shape that works against accumulatenetwork.io and the
  // standard local devnet container (port 26660).
  let txResp;
  try {
    txResp = await fetchAccumulateTx(endpoint, txHash);
  } catch (err) {
    checks.push({ name: 'l0_fetch_transaction', passed: false, error: err.message });
    return { passed: false, checks };
  }
  checks.push({ name: 'l0_fetch_transaction', passed: true, detail: 'tx loaded' });

  // 1. Status
  const status = pickStatus(txResp);
  if (status === 'delivered' || status === 'pending') {
    checks.push({ name: 'l0_status', passed: status === 'delivered', detail: `tx status = ${status}` });
  } else {
    checks.push({ name: 'l0_status', passed: false, detail: `tx status = ${status || 'unknown'}` });
  }

  // 2. Payload decode + recompute artifact hash
  const payloadInfo = extractPayload(txResp);
  if (!payloadInfo || !payloadInfo.bytes) {
    checks.push({ name: 'l0_payload_decode', passed: false, detail: 'no WriteData payload found on tx' });
  } else {
    checks.push({ name: 'l0_payload_decode', passed: true, detail: `${payloadInfo.bytes.length} byte payload` });
    if (artifactHash) {
      const recomputed = await sha256Hex(payloadInfo.bytes);
      const want = String(artifactHash).toLowerCase().replace(/^0x/, '');
      const got = recomputed.toLowerCase();
      if (got === want) {
        checks.push({ name: 'l0_artifact_hash_match', passed: true, detail: `sha256(payload) = ${shortHash(got, 8, 6)}` });
      } else {
        // Some anchor types embed JSON containing a bundleHash field
        // rather than directly hashing the payload; try that.
        try {
          const parsed = JSON.parse(new TextDecoder().decode(payloadInfo.bytes));
          if (parsed && (parsed.bundleHash === want || parsed.artifactHash === want || parsed.hash === want)) {
            checks.push({ name: 'l0_artifact_hash_match', passed: true, detail: 'payload field bundleHash matches' });
          } else {
            checks.push({ name: 'l0_artifact_hash_match', passed: false, detail: `sha256 want ${shortHash(want, 8, 6)} got ${shortHash(got, 8, 6)}` });
          }
        } catch (e) {
          checks.push({ name: 'l0_artifact_hash_match', passed: false, detail: `sha256 want ${shortHash(want, 8, 6)} got ${shortHash(got, 8, 6)}` });
        }
      }
    } else {
      checks.push({ name: 'l0_artifact_hash_match', passed: false, detail: 'no artifact hash on anchor record to compare' });
    }
  }

  // 3. Block match
  if (l0BlockHeight !== undefined && l0BlockHeight !== null) {
    const block = pickBlockHeight(txResp);
    if (block !== null && block !== undefined && Number(block) === Number(l0BlockHeight)) {
      checks.push({ name: 'l0_block_match', passed: true, detail: `block ${block}` });
    } else {
      checks.push({ name: 'l0_block_match', passed: false, detail: `tx block ${block} ≠ anchor block ${l0BlockHeight}` });
    }
  } else {
    checks.push({ name: 'l0_block_match', passed: true, detail: 'skipped — no block height on anchor record' });
  }

  // 4. Signer key-page match (best-effort — only when both signer URL
  //    and signature public key are available)
  if (signerURL) {
    const sigPubKey = pickSignerPubKey(txResp);
    if (!sigPubKey) {
      checks.push({ name: 'l0_signer_match', passed: false, detail: 'no signer pub key on tx' });
    } else {
      try {
        const keyPage = await fetchAccumulateAccount(endpoint, signerURL);
        const found = keyPageContainsKey(keyPage, sigPubKey);
        checks.push({ name: 'l0_signer_match', passed: found, detail: found ? `key in ${signerURL}` : `key not found in ${signerURL}` });
      } catch (err) {
        checks.push({ name: 'l0_signer_match', passed: false, detail: `lookup failed: ${err.message}` });
      }
    }
  } else {
    checks.push({ name: 'l0_signer_match', passed: true, detail: 'skipped — no signer URL on anchor record' });
  }

  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

async function fetchAccumulateTx(endpoint, txHash) {
  // Try JSON-RPC shape first (`POST /v3 method=query` for the canonical
  // Accumulate v3 API; the public testnet exposes this at
  // `https://testnet.accumulatenetwork.io/v3` and the devnet container
  // at `http://localhost:26660/v3`). Newer releases also expose REST
  // shortcut paths like `/v3/transactions/{hash}` on some deployments.
  const cleanedHash = String(txHash).replace(/^0x/, '');
  const accURL = `acc://${cleanedHash}@anchor`;
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'query',
    params: { scope: accURL },
  };
  const resp = await fetch(endpoint.replace(/\/$/, ''), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`L0 query HTTP ${resp.status}`);
  }
  const data = await resp.json();
  if (data.error) throw new Error(`L0 query: ${data.error.message || JSON.stringify(data.error)}`);
  return data.result;
}

async function fetchAccumulateAccount(endpoint, accURL) {
  const body = {
    jsonrpc: '2.0',
    id: 2,
    method: 'query',
    params: { scope: accURL },
  };
  const resp = await fetch(endpoint.replace(/\/$/, ''), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`L0 query HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.error) throw new Error(`L0 query: ${data.error.message || JSON.stringify(data.error)}`);
  return data.result;
}

function pickStatus(txResp) {
  if (!txResp) return null;
  if (txResp.status) return String(txResp.status).toLowerCase();
  if (txResp.value && txResp.value.status) {
    const code = txResp.value.status.code || txResp.value.status;
    return String(code).toLowerCase();
  }
  return null;
}

function pickBlockHeight(txResp) {
  if (!txResp) return null;
  // Accumulate query response varies; try the common shapes.
  if (txResp.blockHeight !== undefined) return txResp.blockHeight;
  if (txResp.value && txResp.value.blockHeight !== undefined) return txResp.value.blockHeight;
  if (txResp.produced && txResp.produced.length && txResp.produced[0].blockHeight !== undefined) return txResp.produced[0].blockHeight;
  if (txResp.txID && txResp.txID.blockHeight !== undefined) return txResp.txID.blockHeight;
  return null;
}

function pickSignerPubKey(txResp) {
  // Try the standard Accumulate signature shape: signatures[0].publicKey
  if (!txResp) return null;
  const sigs = (txResp.signatures || (txResp.value && txResp.value.signatures) || []);
  if (Array.isArray(sigs) && sigs.length > 0) {
    return sigs[0].publicKey || sigs[0].PublicKey || null;
  }
  return null;
}

function keyPageContainsKey(keyPage, pubKey) {
  if (!keyPage || !pubKey) return false;
  // Accumulate key page exposes Keys[].PublicKey or .publicKey.
  const arr = keyPage.keys || keyPage.Keys || (keyPage.value && (keyPage.value.keys || keyPage.value.Keys)) || [];
  if (!Array.isArray(arr)) return false;
  const wanted = String(pubKey).toLowerCase();
  return arr.some((k) => String(k.publicKey || k.PublicKey || '').toLowerCase() === wanted);
}

function extractPayload(txResp) {
  if (!txResp) return null;
  const body = (txResp.transaction && txResp.transaction.body) ||
               (txResp.value && txResp.value.transaction && txResp.value.transaction.body) ||
               (txResp.body) || null;
  if (!body) return null;
  // WriteData entries: body.entry.data is a base64 string OR an array of base64 strings
  let dataPart = null;
  if (body.entry && body.entry.data) dataPart = body.entry.data;
  else if (body.data) dataPart = body.data;
  if (!dataPart) return null;
  const first = Array.isArray(dataPart) ? dataPart[0] : dataPart;
  if (typeof first !== 'string') return null;
  try {
    const bin = atob(first);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes };
  } catch (e) {
    return null;
  }
}

async function sha256Hex(bytes) {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  const arr = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < arr.length; i++) out += arr[i].toString(16).padStart(2, '0');
  return out;
}

function renderL0VerificationResult(result) {
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
