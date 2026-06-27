// RUNBOOK-07 SP1/SP2 — explicit-`at` snapshot helpers.
//
// THE EXPLICIT-AT PROBLEM. Every governed read normally goes through
// rpcWithDisclosure → withAt(), which OVERRIDES any caller-supplied `at` with
// the *global* time cursor whenever that cursor is set (timeContext.withAt).
// That is correct for the live board, but it makes it impossible to fetch
// "block A" while the board is frozen at block B — the global cursor always
// wins. The temporal diff (SP2) needs two independent fixed-block snapshots, so
// it needs a sanctioned way to bypass the global cursor.
//
// `rpcAt` is that one sanctioned place: it calls the raw `rpc` directly with the
// disclosure context + an EXPLICIT `at`, ignoring the global cursor entirely.
// Do NOT use it for live reads — those must keep using rpcWithDisclosure so the
// scrubber/URL stay authoritative. It exists only for snapshot/diff fetchers.

import { rpc } from '/lib/rpc.js';
import { DISCLOSURE } from '/lib/spineCommon.js';

/**
 * Explicit-`at` read: disclosure context + an EXPLICIT at coordinate, bypassing
 * the global time cursor. atCoord ∈ {block:N} | {version:N} | {time:ISO} | null.
 */
export function rpcAt(method, params = {}, atCoord = null) {
  const p = { ...DISCLOSURE, ...params };
  if (atCoord) p.at = atCoord;
  return rpc(method, p);
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const pick = (obj, keys) => {
  for (const k of keys) if (obj && obj[k] != null) return obj[k];
  return undefined;
};

// Module-level snapshot cache, keyed by block (re-diffing the same A/B is cheap).
const snapshotCache = new Map();

/** Clear the snapshot cache (used by tests and on a fresh board load). */
export function clearSnapshotCache() { snapshotCache.clear(); }

/**
 * fetchBoardSnapshot(atCoord) → BoardSnapshot — a board-wide, cross-artifact
 * snapshot AS OF a fixed block, assembled with rpcAt so it is immune to the
 * global cursor. Two-phase fan-out mirroring fetchNarrativeRaw: the board list
 * first, then per-intent depth in parallel. Cached by block.
 *
 * Shape:
 *   { at, intents: Map<id, {...}>, trust: Map<pid, {...}>, anchorBacklog }
 */
export async function fetchBoardSnapshot(atCoord, opts = {}) {
  const blockKey = atCoord && atCoord.block != null ? atCoord.block
    : atCoord && atCoord.version != null ? 'v' + atCoord.version
    : atCoord && atCoord.time ? 't' + atCoord.time : 'live';
  if (!opts.force && snapshotCache.has(blockKey)) return snapshotCache.get(blockKey);

  // Phase 1 — the board list + the runtime pulse (for the anchor backlog) at `at`.
  const [recent, pulse] = await Promise.all([
    rpcAt('explorer.recentIntents', { limit: 200 }, atCoord).catch(() => null),
    rpcAt('explorer.trustDrift', {}, atCoord).catch(() => null),
  ]);

  const rows = (recent && (recent.intents || recent.Intents)) || [];
  const limit = opts.depthLimit != null ? opts.depthLimit : 40; // cap per-intent fan-out
  const deep = rows.slice(0, limit);

  // Phase 2 — per-intent depth in parallel (the same set fetchNarrativeRaw pulls,
  // but at the fixed `at`). Each intent resolves to a compact diffable record.
  const intentRecords = await Promise.all(deep.map((row) => fetchIntentDepth(row, atCoord)));

  const intents = new Map();
  for (const rec of intentRecords) if (rec && rec.id) intents.set(rec.id, rec);

  // Trust profiles → a small map keyed by profileId.
  const trust = new Map();
  const profiles = (pulse && (pulse.profiles || pulse.driftedProfiles || pulse.Profiles)) || [];
  for (const p of profiles) {
    const pid = pick(p, ['profileId', 'id', 'ID', 'profileID']);
    if (!pid) continue;
    trust.set(String(pid), {
      state: pick(p, ['state', 'State']) || 'active',
      version: num(pick(p, ['version', 'Version'])),
      driftImpactCount: num(pick(p, ['driftImpactCount', 'DriftImpactCount', 'impactCount'])),
    });
  }

  const snapshot = {
    at: atCoord || null,
    intents,
    trust,
    anchorBacklog: num(pick(pulse || {}, ['backlog', 'anchorBacklog']) ?? 0),
  };
  snapshotCache.set(blockKey, snapshot);
  return snapshot;
}

// fetchIntentDepth — pull the diffable depth for ONE intent at a fixed `at`.
// Tolerant of redaction: every sub-fetch fails soft to null, and the record
// records what it could resolve (the diff treats missing sub-artifacts as
// "unchanged"/"redacted", never as a fabricated value).
async function fetchIntentDepth(row, atCoord) {
  const id = pick(row, ['id', 'ID', 'intentId', 'IntentID']);
  if (!id) return null;
  const planID = pick(row, ['planId', 'planID', 'PlanID', 'PlanId']);

  const [plan, approvals, outcome, anchor, policies] = await Promise.all([
    planID ? rpcAt('explorer.planGet', { id: planID }, atCoord).catch(() => null) : Promise.resolve(null),
    planID ? rpcAt('explorer.approvalByPlan', { planId: planID }, atCoord).catch(() => null) : Promise.resolve(null),
    rpcAt('explorer.outcomeGet', { intentId: id }, atCoord).catch(() => null),
    rpcAt('explorer.anchorGet', { intentId: id }, atCoord).catch(() => null),
    rpcAt('explorer.policyDecisionTrace', { intentId: id }, atCoord).catch(() => null),
  ]);

  return normalizeIntentRecord({ id, row, plan, approvals, outcome, anchor, policies });
}

// normalizeIntentRecord — fold the raw RPC responses into the flat, diffable
// record shape SP2's diffSnapshots expects. Pure given its input; exported so
// tests can build records without RPC.
export function normalizeIntentRecord({ id, row = {}, plan, approvals, outcome, anchor, policies }) {
  const denials = decisionDenials(policies);
  const allowed = policies ? !(denials.length > 0) : null;
  return {
    id: String(id),
    state: pick(row, ['state', 'State', 'status', 'Status']) || 'unknown',
    stage: pick(row, ['stage', 'Stage', 'currentStage']) || 'intent',
    planId: plan ? pick(plan, ['id', 'ID', 'planId']) : pick(row, ['planId', 'PlanID']),
    planHash: plan ? pick(plan, ['planHash', 'PlanHash', 'hash']) : undefined,
    approvals: {
      required: num(pick(approvals || {}, ['required', 'Required', 'requiredCount'])),
      signed: num(pick(approvals || {}, ['signed', 'Signed', 'signedCount'])),
      remaining: num(pick(approvals || {}, ['remaining', 'Remaining', 'remainingCount'])),
      invalidated: num(pick(approvals || {}, ['invalidated', 'Invalidated', 'invalidatedCount'])),
    },
    outcome: outcome ? {
      id: pick(outcome, ['id', 'ID', 'outcomeId']),
      overallStatus: pick(outcome, ['overallStatus', 'OverallStatus', 'status']),
    } : null,
    anchor: anchor ? {
      recordId: pick(anchor, ['recordId', 'RecordID', 'id']),
      status: pick(anchor, ['status', 'Status']),
      txHash: pick(anchor, ['txHash', 'TxHash', 'txid']),
      blockHeight: num(pick(anchor, ['blockHeight', 'BlockHeight', 'block'])),
    } : null,
    policyDecision: policies ? { allowed, denials } : null,
  };
}

// decisionDenials — extract the denied decisions from a policyDecisionTrace
// response (array of decisions, or {decisions:[...]} / {policies:[...]}).
function decisionDenials(policies) {
  if (!policies) return [];
  const arr = Array.isArray(policies) ? policies
    : (policies.decisions || policies.Decisions || policies.policies || policies.trace || []);
  const out = [];
  for (const d of (Array.isArray(arr) ? arr : [])) {
    const allowed = pick(d, ['allowed', 'Allowed']);
    if (allowed === false) {
      out.push({
        policyId: pick(d, ['policyId', 'PolicyID', 'policyID', 'id']),
        rule: pick(d, ['rule', 'Rule', 'matchedRule']),
        reason: pick(d, ['reason', 'Reason', 'message']),
        trustProfileId: pick(d, ['trustProfileId', 'TrustProfileID', 'profileId']),
      });
    }
  }
  return out;
}
