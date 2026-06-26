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
import { onAtChange, isAtLive } from '/lib/timeContext.js';
import {
  OFFLINE_THRESHOLD, healthFromFailures, healthLabel, isStale, nextBackoff,
} from '/lib/liveness.js';

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

// RUNBOOK-03 — liveness state. Consecutive per-slice failures roll into one
// global health signal (Connected / Reconnecting… / Offline); a success tick
// fans out on real data arrival (drives the heartbeat). DOM-free math lives in
// /lib/liveness.js so it is unit-testable on its own.
const failures = new Map();          // sliceKey → consecutive failure count
const healthSubscribers = new Set(); // handler(state)
let healthState = 'ok';              // 'ok' | 'reconnecting' | 'offline'
const tickSubscribers = new Set();   // handler(sliceKey) — fires on a visible setSlice

function recomputeHealth() {
  const next = healthFromFailures(failures, OFFLINE_THRESHOLD);
  if (next === healthState) return;
  healthState = next;
  for (const h of healthSubscribers) {
    try { h(healthState); } catch (e) { console.error('store health handler', e); }
  }
}

export function getHealth() { return healthState; }
export function getHealthLabel() { return healthLabel(healthState); }
export function subscribeHealth(handler) {
  healthSubscribers.add(handler);
  try { handler(healthState); } catch (e) { console.error('store health init', e); } // fire current
  return () => healthSubscribers.delete(handler);
}
export function subscribeTick(handler) {
  tickSubscribers.add(handler);
  return () => tickSubscribers.delete(handler);
}

// Polling cadence per slice (ms). The poller pauses on hidden tabs / frozen
// time and backs off on failure (RUNBOOK-03 Task 5).
const POLL_INTERVAL_MS = {
  recentIntents: 5000,
  runtimePulse:  4000,
  cockpit:       4000,
};
const BACKOFF_CAP_MS = 16000;
const pollers = new Map();       // sliceKey → true (active flag for the scheduler)
const pollTimers = new Map();    // sliceKey → setTimeout handle (backoff scheduler)

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

export function getSlice(key) {
  return slices.get(key) || { status: 'loading' };
}

// RUNBOOK-03 Task 2 — freshness reader for the rails. Returns when the data was
// last actually good and whether it is stale (kept across a transient error or
// older than STALE_INTERVALS poll cadences).
export function sliceFreshness(key) {
  const s = slices.get(key);
  if (!s) return { fetchedAt: 0, stale: false };
  const interval = POLL_INTERVAL_MS[key] || 0;
  return {
    fetchedAt: s.fetchedAt || 0,
    stale: Boolean(s.stale) || isStale(s.fetchedAt, interval),
  };
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
    // If no subscribers remain for a polled slice, stop the scheduler.
    if (set && set.size === 0 && (pollers.has(sliceKey) || pollTimers.has(sliceKey))) {
      const t = pollTimers.get(sliceKey);
      if (t) clearTimeout(t);
      pollTimers.delete(sliceKey);
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
    // RUNBOOK-03 Task 2 — keep last-known-good visible during a refresh. Only
    // show the loading placeholder when there is NO prior data; otherwise leave
    // the slice intact so its data both stays on screen (no flicker on a routine
    // re-poll) and survives into the error branch's keep-last-known-good path.
    const cur0 = slices.get(sliceKey);
    if (!(cur0 && cur0.data)) setSlice(sliceKey, { status: 'loading' });
    try {
      const data = await fetcher();
      const next = normaliseSlice(sliceKey, data);
      setSlice(sliceKey, next);
      // RUNBOOK-03 Task 1 — only polled slices drive global health (a one-shot
      // narrative fetch failing must not paint the whole app offline).
      if (POLL_INTERVAL_MS[sliceKey]) { failures.set(sliceKey, 0); recomputeHealth(); }
      return next;
    } catch (err) {
      if (POLL_INTERVAL_MS[sliceKey]) {
        failures.set(sliceKey, (failures.get(sliceKey) || 0) + 1);
        recomputeHealth();
      }
      // RUNBOOK-03 Task 2 — keep last-known-good. A transient failure must not
      // wipe the operator's data while the dot still implies health: retain the
      // data, flag it stale, and attach the error for badging. fetchedAt stays =
      // the moment the data was actually good (setSlice preserves it via spread).
      const prev = slices.get(sliceKey);
      if (prev && prev.data) {
        const kept = { ...prev, status: 'visible', stale: true, error: err, errorAt: Date.now() };
        setSlice(sliceKey, kept);
        return kept;
      }
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
  // RUNBOOK-03 Task 3 — a generic success tick on REAL data arrival only, so the
  // heartbeat beats on truth (and stops when data stops). A kept-stale slice (a
  // transient error preserving last-known-good) is not a fresh arrival → no tick.
  if (slice.status === 'visible' && !slice.stale) {
    for (const h of tickSubscribers) {
      try { h(key); } catch (e) { console.error('store tick handler', e); }
    }
  }
  return slice;
}

// RUNBOOK-03 Task 5 — self-scheduling poller. Skips a tick when the tab is
// hidden or time is frozen on an (immutable) historical snapshot, and backs off
// 4s→8s→16s on consecutive failures. Resumes immediately on visibilitychange
// (listener at the bottom of this module).
function ensurePoller(sliceKey) {
  if (pollers.has(sliceKey) || pollTimers.has(sliceKey)) return;
  const base = POLL_INTERVAL_MS[sliceKey];
  if (!base) {
    // One-shot fetch for slices without a poll cadence (e.g. narrative).
    refreshSlice(sliceKey).catch(() => {});
    return;
  }
  refreshSlice(sliceKey).catch(() => {});  // initial fetch
  pollers.set(sliceKey, true);             // mark active (teardown checks this)
  scheduleNext(sliceKey, base);
}

function scheduleNext(sliceKey, base) {
  const attempt = failures.get(sliceKey) || 0;
  const delay = attempt > 0 ? nextBackoff(base, attempt - 1, BACKOFF_CAP_MS) : base;
  const t = setTimeout(async () => {
    // Pause when the tab is hidden or the cursor is frozen on a historical
    // snapshot (immutable — re-fetching is pure waste). Reschedule a probe.
    if ((typeof document !== 'undefined' && document.hidden) || !isAtLive()) {
      scheduleNext(sliceKey, base);
      return;
    }
    await refreshSlice(sliceKey).catch(() => {});
    if (pollers.has(sliceKey)) scheduleNext(sliceKey, base); // next gap reads the failures map
  }, delay);
  pollTimers.set(sliceKey, t);
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
// Live event-bus integration — when a pushed event arrives, invalidate the
// relevant slice so the next consumer sees fresh data.
//
// RUNBOOK-03 note: this wiring is currently DORMANT — RUNBOOK-01 removed the
// only publisher (lib/liveEvents.js / connectLive). It is intentionally kept:
// it is INVISIBLE (it makes no on-screen liveness claim, so the honesty rule is
// satisfied), and it is the exact substrate a future "make it real" push layer
// re-lights with one call. Until then the interval poller above is the source.
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

// RUNBOOK-03 Task 4 (P3) — time-cursor correctness. When the cursor moves, every
// read must be re-issued under the new `at` coordinate. rpcWithDisclosure already
// injects withAt(...), so a plain refresh re-fetches at the new point in time.
// Invalidate the polled projections AND every open narrative (which has no poll
// cadence of its own and would otherwise show live data forever — P3).
onAtChange(() => {
  invalidateSlice('recentIntents');
  invalidateSlice('runtimePulse');
  invalidateSlice('cockpit');
  const keys = new Set([...slices.keys(), ...subscribers.keys()]);
  for (const key of keys) {
    if (key.startsWith('narrative:')) invalidateSlice(key);
  }
});

// RUNBOOK-03 Task 5 — when the tab returns to the foreground (and time is live),
// catch every polled slice up immediately rather than waiting out the gap.
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !isAtLive()) return;
    for (const key of pollTimers.keys()) refreshSlice(key).catch(() => {});
  });
}
