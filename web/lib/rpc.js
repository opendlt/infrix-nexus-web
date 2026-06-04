// Nexus — JSON-RPC v4 client.
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 0: extracted from the inline
// IIFE in the pre-redesign index.html. This is the single canonical
// JSON-RPC entry point. Future view modules import { rpc } from
// './lib/rpc.js'; legacy view (views/spine.js) keeps its own private
// closure for byte-faithful behaviour preservation but now delegates
// to this same fetch shape.

const RPC_PATH = '/rpc';

/**
 * Issue a JSON-RPC v2 call to the Infrix devnet.
 * @param {string} method — JSON-RPC method name (e.g. 'explorer.status').
 * @param {object} [params] — params payload (defaults to empty object).
 * @returns {Promise<any>} — the .result field on success.
 * @throws {Error} — when the server returns a JSON-RPC error.
 */
export async function rpc(method, params) {
  const res = await fetch(window.location.origin + RPC_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params: params || {},
      id: Date.now(),
    }),
  });
  const data = await res.json();
  if (data.error) {
    const err = new Error(data.error.message || 'rpc error');
    err.code = data.error.code;
    err.rpcMethod = method;
    throw err;
  }
  return data.result;
}

/**
 * Disclosure-context-aware variant that auto-injects the actor + purpose
 * the explorer is browsing as. Phase 0 stub — Phase 1 wires the actual
 * disclosure context into every call.
 */
export async function rpcAs(actor, purpose, method, params) {
  const wrapped = Object.assign({}, params || {}, {
    disclosureContext: { actor, purpose },
  });
  return rpc(method, wrapped);
}
