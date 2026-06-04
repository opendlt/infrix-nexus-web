// Nexus — central client-side state store.
//
// Phase 0: today the spine strip, timeline, telemetry rail, and
// narrative each issue their own polling RPCs. The result: 4-5
// separate fetches every refresh tick, each with their own clock,
// each independently subject to error. NexusStore consolidates this:
//
//   - One canonical poller per slice (recentIntents, runtime pulse,
//     active narrative). Subscribers read from the slice.
//   - Subscribers register interest; the store notifies on change.
//   - Detail views ask the store to pre-fetch a narrative; the store
//     caches and dedupes concurrent fetches.
//   - Live event-bus events invalidate the relevant slice and trigger
//     a refresh — no need to hand-wire every component to the bus.
//
// The store is the spine narrative's source of truth. Every UI
// component should read through it. This eliminates duplicate polling
// and gives us one consistent state model.

import { rpcWithDisclosure } from '/lib/spineCommon.js';
import { subscribe } from '/lib/spineBus.js';

// ---------------------------------------------------------------------
// Slice types — the canonical state model.
// ---------------------------------------------------------------------
//
// Each slice has a status reflecting the disclosure-aware contract
// described in 04-data-api-contract.md:
//   visible      — data loaded, available
//   hidden       — disclosure policy redacted
//   notProduced  — artifact does not yet exist (still upstream)
//   unavailable  — backend could not retrieve
//   loading      — in-flight
//   error        — transient failure
//
// Subscribers branch on status to render the right state component.

/** @typedef {'visible'|'hidden'|'notProduced'|'unavailable'|'loading'|'error'} SliceStatus */

const subscribers = new Map(); // sliceKey → Set<handler>
const slices = new Map();      // sliceKey → { status, data, error, fetchedAt }
const inflight = new Map();    // sliceKey → Promise

// Polling cadence per slice (ms). Live event bus collapses these
// when activity is observed.
const POLL_INTERVAL_MS = {
  recentIntents: 5000,
  runtimePulse:  4000,
  cockpit:       4000,
};
const pollers = new Map();

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

export function getSlice(key) {
  return slices.get(key) || { status: 'loading' };
}

export function subscribe2(sliceKey, handler) {
  if (!subscribers.has(sliceKey)) subscribers.set(sliceKey, new Set());
  subscribers.get(sliceKey).add(handler);
  // Fire immediately with current state if we have it
  const current = slices.get(sliceKey);
  if (current) {
    try { handler(current); } catch (e) { console.error('store init handler', sliceKey, e); }
  }
  // Lazy-start the poller for this slice on first subscription.
  ensurePoller(sliceKey);
  return () => {
    const set = subscribers.get(sliceKey);
    if (set) set.delete(handler);
    // If no subscribers remain for a polled slice, stop the poller.
    if (set && set.size === 0 && pollers.has(sliceKey)) {
      clearInterval(pollers.get(sliceKey));
      pollers.delete(sliceKey);
    }
  };
}

export async function ensureSlice(sliceKey) {
  // If we already have data, return it; otherwise fetch fresh.
  const cur = slices.get(sliceKey);
  if (cur && cur.status === 'visible') return cur;
  return refreshSlice(sliceKey);
}

export function refreshSlice(sliceKey) {
  // Dedupe concurrent fetches.
  if (inflight.has(sliceKey)) return inflight.get(sliceKey);
  const fetcher = sliceFetcher(sliceKey);
  if (!fetcher) {
    return Promise.resolve(setSlice(sliceKey, { status: 'unavailable', reason: 'unknown slice' }));
  }
  const p = (async () => {
    setSlice(sliceKey, { status: slices.get(sliceKey)?.data ? slices.get(sliceKey).status : 'loading' });
    try {
      const data = await fetcher();
      const next = normaliseSlice(sliceKey, data);
      setSlice(sliceKey, next);
      return next;
    } catch (err) {
      const errSlice = { status: 'error', error: err, fetchedAt: Date.now() };
      setSlice(sliceKey, errSlice);
      return errSlice;
    } finally {
      inflight.delete(sliceKey);
    }
  })();
  inflight.set(sliceKey, p);
  return p;
}

export function invalidateSlice(sliceKey) {
  // Subscribers will see the next refresh.
  refreshSlice(sliceKey).catch(() => {});
}

// Narrative caching — per-intent. Keyed by intent ID.
export async function fetchNarrative(intentId, force = false) {
  const key = 'narrative:' + intentId;
  if (!force) {
    const cur = slices.get(key);
    if (cur && cur.status === 'visible') return cur;
  }
  return refreshSlice(key);
}

export function subscribeNarrative(intentId, handler) {
  return subscribe2('narrative:' + intentId, handler);
}

// ---------------------------------------------------------------------
// Internal — set + notify
// ---------------------------------------------------------------------

function setSlice(key, slice) {
  slice.fetchedAt = slice.fetchedAt || Date.now();
  slices.set(key, slice);
  const set = subscribers.get(key);
  if (set) {
    for (const h of set) {
      try { h(slice); } catch (e) { console.error('store notify handler', key, e); }
    }
  }
  return slice;
}

function ensurePoller(sliceKey) {
  if (pollers.has(sliceKey)) return;
  const interval = POLL_INTERVAL_MS[sliceKey];
  if (!interval) {
    // One-shot fetch for slices without a poll cadence
    refreshSlice(sliceKey).catch(() => {});
    return;
  }
  // Initial fetch + interval
  refreshSlice(sliceKey).catch(() => {});
  const t = setInterval(() => refreshSlice(sliceKey).catch(() => {}), interval);
  pollers.set(sliceKey, t);
}

// ---------------------------------------------------------------------
// Slice fetchers — each returns the raw RPC response.
// normaliseSlice() then adapts it to the canonical { status, data, ... }
// shape so subscribers always see the same envelope.
// ---------------------------------------------------------------------

function sliceFetcher(sliceKey) {
  if (sliceKey === 'recentIntents') {
    return () => rpcWithDisclosure('explorer.recentIntents', { limit: 200 });
  }
  if (sliceKey === 'runtimePulse') {
    return async () => {
      const [anchor, plugin, trust, workflow] = await Promise.all([
        rpcWithDisclosure('explorer.anchorMode', {}).catch(() => null),
        rpcWithDisclosure('explorer.pluginStatus', {}).catch(() => null),
        rpcWithDisclosure('explorer.trustDrift', {}).catch(() => null),
        rpcWithDisclosure('explorer.workflowHealth', {}).catch(() => null),
      ]);
      return { anchor, plugin, trust, workflow };
    };
  }
  if (sliceKey === 'cockpit') {
    // Phase 1 — single projection that powers the entire cockpit.
    return () => rpcWithDisclosure('nexus.cockpit', { limit: 100 });
  }
  if (sliceKey.startsWith('narrative:')) {
    const intentId = sliceKey.slice('narrative:'.length);
    return () => fetchNarrativeRaw(intentId);
  }
  return null;
}

async function fetchNarrativeRaw(intentId) {
  // Parallel-fetch every layer of the spine for this intent.
  const [intentObj, recentResp] = await Promise.all([
    rpcWithDisclosure('intent.get', { id: intentId }).catch((e) => ({ __error: e })),
    rpcWithDisclosure('explorer.recentIntents', { limit: 200 }).catch(() => null),
  ]);
  if (intentObj && intentObj.__error) throw intentObj.__error;
  if (!intentObj) throw new Error('intent not found');

  const spineRow = recentResp && Array.isArray(recentResp.intents)
    ? recentResp.intents.find((r) => r.id === intentId) : null;
  const planID = (spineRow && spineRow.planId) || ('plan-' + intentId);
  const evidenceID = spineRow && spineRow.evidenceId;
  const anchorID = spineRow && spineRow.anchorRecordId;
  const outcomeID = spineRow && spineRow.outcomeId;

  const [planObj, approvalsResp, outcomeObj, evidenceObj, anchorObj, policiesResp, anchorChainResp] = await Promise.all([
    rpcWithDisclosure('explorer.planGet', { id: planID }).catch(() => null),
    rpcWithDisclosure('explorer.approvalByPlan', { planId: planID }).catch(() => null),
    outcomeID ? rpcWithDisclosure('explorer.outcomeGet', { id: outcomeID }).catch(() => null) : Promise.resolve(null),
    evidenceID ? rpcWithDisclosure('evidence.get', { id: evidenceID }).catch(() => null) : Promise.resolve(null),
    anchorID ? rpcWithDisclosure('explorer.anchorGet', { id: anchorID }).catch(() => null) : Promise.resolve(null),
    rpcWithDisclosure('explorer.policyDecisionTrace', { intentId }).catch(() => null),
    anchorID ? rpcWithDisclosure('explorer.anchorChain', { startId: anchorID, maxDepth: 50 }).catch(() => null) : Promise.resolve(null),
  ]);

  return {
    intent: intentObj,
    spineRow,
    plan: planObj,
    approvals: approvalsResp,
    outcome: outcomeObj,
    evidence: evidenceObj,
    anchor: anchorObj,
    policies: policiesResp,
    anchorChain: anchorChainResp,
    planID,
    evidenceID,
    anchorID,
    outcomeID,
  };
}

// ---------------------------------------------------------------------
// normaliseSlice — adapt raw RPC result into the canonical
// { status, data, reason } envelope. Subscribers branch on status.
// ---------------------------------------------------------------------

function normaliseSlice(sliceKey, data) {
  if (sliceKey === 'recentIntents') {
    if (!data || !Array.isArray(data.intents)) {
      return { status: 'unavailable', reason: 'recentIntents returned no list', fetchedAt: Date.now() };
    }
    return { status: 'visible', data, fetchedAt: Date.now() };
  }
  if (sliceKey === 'runtimePulse') {
    return { status: 'visible', data, fetchedAt: Date.now() };
  }
  if (sliceKey === 'cockpit') {
    if (!data) return { status: 'unavailable', reason: 'cockpit returned no data', fetchedAt: Date.now() };
    return { status: 'visible', data, fetchedAt: Date.now() };
  }
  if (sliceKey.startsWith('narrative:')) {
    if (!data || !data.intent) {
      return { status: 'notProduced', reason: 'no intent record yet', fetchedAt: Date.now() };
    }
    return { status: 'visible', data, fetchedAt: Date.now() };
  }
  return { status: 'visible', data, fetchedAt: Date.now() };
}

// ---------------------------------------------------------------------
// Live event-bus integration — when a relevant event arrives, mark the
// slice stale so the next consumer sees fresh data.
// ---------------------------------------------------------------------

subscribe('intent.advanced', (p) => {
  invalidateSlice('recentIntents');
  invalidateSlice('cockpit');
  if (p && p.intentId) invalidateSlice('narrative:' + p.intentId);
});
subscribe('anchor.observed', (p) => {
  invalidateSlice('recentIntents');
  invalidateSlice('cockpit');
  if (p && p.intentId) invalidateSlice('narrative:' + p.intentId);
});
subscribe('spine.intent', () => { invalidateSlice('recentIntents'); invalidateSlice('cockpit'); });
subscribe('spine.evidence', (ev) => {
  invalidateSlice('recentIntents');
  invalidateSlice('cockpit');
  if (ev && ev.intentId) invalidateSlice('narrative:' + ev.intentId);
});
subscribe('spine.anchor', () => { invalidateSlice('recentIntents'); invalidateSlice('cockpit'); });
subscribe('spine.approval', (ev) => {
  invalidateSlice('recentIntents');
  invalidateSlice('cockpit');
  if (ev && ev.intentId) invalidateSlice('narrative:' + ev.intentId);
});
