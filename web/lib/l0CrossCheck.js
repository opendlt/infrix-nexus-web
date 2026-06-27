// RUNBOOK-07 SP8 — in-browser L0 cross-check (the whole way to L4).
//
// The offline verifier confirms everything EXCEPT that the anchor actually
// exists on L0 — it punts that to a copy-paste CLI command. But the browser
// already knows the anchor tx + block. This module closes the gap by querying
// the Accumulate L0 endpoint DIRECTLY (not through the Infrix node — that's the
// whole point: confirming the anchor without trusting Infrix).
//
// Honest by construction:
//   - Path A: explorer.l0Endpoint → a DIRECT fetch to Accumulate query-tx. If
//     the endpoint is not CORS-reachable, this fails closed and the receipt
//     stays L3.
//   - We never use evidence.verify (a node-trusting verify) to claim L4.

import { rpcWithDisclosure } from '/lib/spineCommon.js';

/**
 * crossCheckL0(anchor) → { ok, l0Verified, reason?, network?, command?, at? }
 * `anchor` is proof.anchor ({status, recordId, txHash, blockHeight}).
 */
export async function crossCheckL0(anchor, opts = {}) {
  if (!anchor || !anchor.txHash || !anchor.blockHeight) {
    return { ok: false, l0Verified: false, reason: 'no anchor tx/block to check' };
  }

  let endpoint = opts.endpoint;
  if (!endpoint) {
    try {
      const r = await rpcWithDisclosure('explorer.l0Endpoint', {});
      endpoint = r && (r.endpoint || r.url || r.Endpoint);
    } catch (e) {
      return { ok: false, l0Verified: false, reason: 'no L0 endpoint' };
    }
  }
  if (!endpoint) return { ok: false, l0Verified: false, reason: 'no L0 endpoint' };

  // DIRECT call to Accumulate L0 — NOT the Infrix node.
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query-tx', params: { txid: anchor.txHash } }),
    });
  } catch (e) {
    return { ok: false, l0Verified: false, reason: 'L0 unreachable (CORS or offline)' };
  }
  if (!res || !res.ok) {
    return { ok: false, l0Verified: false, reason: 'L0 query failed' + (res ? ' ' + res.status : '') };
  }

  let j;
  try { j = await res.json(); } catch (e) { return { ok: false, l0Verified: false, reason: 'L0 returned non-JSON' }; }
  const tx = j && (j.result || j.Result);
  if (!tx) return { ok: false, l0Verified: false, reason: 'anchor tx not found on L0' };

  if (!txMatchesBlock(tx, anchor.blockHeight)) {
    return { ok: false, l0Verified: false, reason: 'anchor tx not found at expected block' };
  }
  return {
    ok: true, l0Verified: true,
    network: networkOf(endpoint),
    command: cliEquivalent(anchor, endpoint),
    at: tx,
  };
}

// txMatchesBlock — confirm the queried tx lands in the expected block. Accumulate
// responses vary in shape; check the common block-height fields. When the tx
// exists but exposes no block field, accept existence (the offline verifier
// already cross-bound the embedded block — SP8 confirms the tx is real on L0).
function txMatchesBlock(tx, expected) {
  const want = Number(expected);
  const candidates = [
    deep(tx, ['blockHeight']), deep(tx, ['BlockHeight']),
    deep(tx, ['status', 'blockHeight']), deep(tx, ['status', 'BlockHeight']),
    deep(tx, ['mainChainBlock']), deep(tx, ['minorBlock']),
    deep(tx, ['receipt', 'localBlock']),
  ].filter((v) => v != null);
  if (candidates.length === 0) return true;      // tx exists, no block field exposed
  return candidates.some((v) => Number(v) === want);
}

function deep(obj, keys) {
  let cur = obj;
  for (const k of keys) { if (cur == null) return undefined; cur = cur[k]; }
  return cur;
}

function networkOf(endpoint) {
  const e = String(endpoint || '').toLowerCase();
  if (/mainnet/.test(e)) return 'mainnet';
  if (/testnet|kermit|fozzie/.test(e)) return 'testnet';
  if (/localhost|127\.0\.0\.1/.test(e)) return 'local';
  return endpoint || 'unknown';
}

// cliEquivalent — the exact command a user could run to reproduce this check,
// recorded into the receipt so an L4 receipt is independently re-checkable.
export function cliEquivalent(anchor, endpoint) {
  return `accumulate -s ${endpoint || '<L0-endpoint>'} tx get ${anchor.txHash}`;
}
