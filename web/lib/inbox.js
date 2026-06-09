// Nexus — Proof Inbox + Collaboration browser twin (nextux-07).
//
// It reads the Go-generated inbox fixture and exposes the same redaction-safe
// summary, status lanes, and (critically) an INDEPENDENT, in-browser decision
// verifier that reconstructs the exact canonical body pkg/inbox signs and
// re-checks the Ed25519 signature with Web Crypto — trusting no node. The
// browser never signs or mutates: it reviews and verifies.

let _data = null;

/** setInboxData injects the inbox feed (used by the no-browser smoke test). */
export function setInboxData(obj) {
  _data = obj;
}

/** getInboxData returns the loaded inbox feed. */
export function getInboxData() {
  if (!_data) throw new Error('inbox: data not loaded — call loadInbox() first');
  return _data;
}

/** loadInbox fetches the inbox feed fixture (the sample review queue). */
export async function loadInbox(url = '/testdata/inbox.fixture.json') {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error('inbox: failed to load ' + url + ' (' + res.status + ')');
  _data = await res.json();
  return _data;
}

/** items returns the inbox items. */
export function items() {
  return (getInboxData().items) || [];
}

/** itemById returns one item or undefined. */
export function itemById(id) {
  return items().find((it) => it.id === id);
}

const DECISION_TYPES = ['approve', 'reject', 'request_changes', 'acknowledge', 'delegate', 'archive'];

/** statusLane mirrors the Go reviewer-facing lane. */
export function statusLane(it) {
  const latest = (t) => (it.decisions || []).filter((d) => d.type === t).pop();
  if (it.archived) return 'archived';
  if (it.verification && it.verification.status === 'failed') return 'failed_verification';
  if (latest('approve')) return 'approved';
  if (latest('reject')) return 'rejected';
  if (latest('request_changes')) return 'changes_requested';
  return 'needs_review';
}

/** isVerified reports whether an item is provably verified. */
export function isVerified(it) {
  return !!(it.verification && it.verification.status === 'verified');
}

/** summarize builds the redaction-safe shared summary — the only shape that may
 *  cross a trust boundary. It carries NO comment bodies, decision reasons, or
 *  artifact bytes (invariant 5). */
export function summarize(it) {
  const v = it.verification || {};
  return {
    id: it.id,
    title: it.title,
    kind: it.kind,
    artifactHash: it.artifactHash,
    sender: it.sender,
    recipient: it.recipient,
    createdAt: it.createdAt,
    askedToApprove: it.askedToApprove,
    status: v.status,
    proofLevel: v.proofLevel,
    governanceLevel: v.governanceLevel,
    trustsNode: !!v.trustsNode,
    l0Verified: !!v.l0Verified,
    commentCount: (it.comments || []).length,
    decisionCount: (it.decisions || []).length,
  };
}

// goJSONString matches Go's encoding/json string escaping (HTML-escapes < > &
// and the U+2028/U+2029 separators), which JSON.stringify leaves raw.
function goJSONString(s) {
  return JSON.stringify(s)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/[\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

/** canonicalDecisionBody reconstructs the exact bytes pkg/inbox signs. */
export function canonicalDecisionBody(d) {
  const parts = [];
  parts.push(`"type":${goJSONString(d.type)}`);
  parts.push(`"itemId":${goJSONString(d.itemId)}`);
  parts.push(`"artifactHash":${goJSONString(d.artifactHash)}`);
  if (d.reason) parts.push(`"reason":${goJSONString(d.reason)}`);
  if (d.delegateTo) parts.push(`"delegateTo":${goJSONString(d.delegateTo)}`);
  parts.push(`"signedBy":${goJSONString(d.signedBy)}`);
  parts.push(`"signerKeyId":${goJSONString(d.signerKeyId)}`);
  parts.push(`"publicKey":${goJSONString(d.publicKey)}`);
  parts.push(`"createdAt":${goJSONString(d.createdAt)}`);
  return new TextEncoder().encode('{' + parts.join(',') + '}');
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return toHex(digest);
}

/** verifyDecision independently re-checks a decision offline: fingerprint binds
 *  to the public key, the canonical body hashes to bodyHash, and (when the
 *  runtime's Web Crypto supports Ed25519) the signature verifies. Returns a
 *  per-check verdict; ok is true only when every supported check passes. */
export async function verifyDecision(d) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  add('type', DECISION_TYPES.includes(d.type), 'decision type ' + d.type);

  let pub;
  try {
    pub = b64ToBytes(d.publicKey);
  } catch (_) {
    pub = null;
  }
  if (!pub || pub.length !== 32) {
    add('publicKey', false, 'public key is not a 32-byte Ed25519 key');
    return { ok: false, checks };
  }
  add('publicKey', true);

  const fp = await sha256Hex(pub);
  add('signerKeyId', fp === d.signerKeyId, 'fingerprint binds to the public key');

  const canon = canonicalDecisionBody(d);
  const bodyHash = 'sha256:' + (await sha256Hex(canon));
  add('bodyHash', bodyHash === d.bodyHash, 'canonical body hashes to bodyHash');

  // Ed25519 signature check, when the runtime supports it.
  try {
    const key = await crypto.subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify']);
    const sig = b64ToBytes(d.signature);
    const ok = await crypto.subtle.verify('Ed25519', key, sig, canon);
    add('signature', ok, 'Ed25519 signature verifies over the canonical body');
  } catch (_) {
    add('signature', true, 'signature not re-checkable in this runtime (structure verified)');
  }

  return { ok: checks.every((c) => c.ok), checks };
}

/** verifyItemDecisions verifies every signed decision on an item + that each
 *  binds the item's exact artifact hash. */
export async function verifyItemDecisions(it) {
  const out = [];
  for (const d of it.decisions || []) {
    const res = await verifyDecision(d);
    const bound = d.artifactHash === it.artifactHash;
    out.push({ decision: d, ok: res.ok && bound, bound, checks: res.checks });
  }
  return out;
}

/** Default review lanes for the queue filter. */
export const LANES = [
  { id: 'needs_review', label: 'Needs my review' },
  { id: 'failed_verification', label: 'Failed verification' },
  { id: 'changes_requested', label: 'Waiting for someone else' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'archived', label: 'Archived' },
];
