// Nexus — v4 REST client.
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 0: scaffold for the v4 REST
// surface (/v4/intents, /v4/approvals, /v4/evidence, /v4/anchors,
// /v4/policies, /v4/objects, …). Phase 2 wires these into the new
// per-stage view modules. Phase 0 ships the wrapper so the modules
// can be authored against a stable import.

/**
 * GET a v4 REST endpoint.
 * @param {string} path — '/v4/...' path.
 * @returns {Promise<any>} — parsed JSON body.
 */
export async function getJSON(path) {
  const res = await fetch(window.location.origin + path, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const err = new Error(`REST ${path}: ${res.status} ${res.statusText}`);
    err.status = res.status;
    err.path = path;
    throw err;
  }
  return res.json();
}

/**
 * POST JSON to a v4 REST endpoint (mutation routes).
 */
export async function postJSON(path, body) {
  const res = await fetch(window.location.origin + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const err = new Error(`REST POST ${path}: ${res.status} ${res.statusText}`);
    err.status = res.status;
    err.path = path;
    throw err;
  }
  return res.json();
}
