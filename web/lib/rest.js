// Nexus — v4 REST client.
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 0: scaffold for the v4 REST
// surface (/v4/intents, /v4/approvals, /v4/evidence, /v4/anchors,
// /v4/policies, /v4/objects, …). Phase 2 wires these into the new
// per-stage view modules. Phase 0 ships the wrapper so the modules
// can be authored against a stable import.
//
// adoption-08: when a v4 response carries a translated error envelope
// ({error:{code,message,details}}), the thrown Error gets `.userError`
// attached (the normalized UserError) so any view can mount the shared
// userErrorCard and show the same title/impact/fixes/docs the CLI prints.

import { parseUserError } from '/lib/userError.js';

// errorFromResponse reads the v4 error body (if any), builds an Error whose
// message is the translated title when available, and attaches the parsed
// UserError. Never throws while parsing — a body that is not JSON falls back
// to the HTTP status line.
async function errorFromResponse(prefix, path, res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const ue = body && body.error ? parseUserError(body.error) : null;
  const msg = ue && ue.title ? ue.title : `${prefix} ${path}: ${res.status} ${res.statusText}`;
  const err = new Error(msg);
  err.status = res.status;
  err.path = path;
  if (ue) {
    err.userError = ue;
    err.code = ue.code;
  }
  return err;
}

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
    throw await errorFromResponse('REST', path, res);
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
    throw await errorFromResponse('REST POST', path, res);
  }
  return res.json();
}
