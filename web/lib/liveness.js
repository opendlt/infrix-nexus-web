// Nexus — pure liveness math (RUNBOOK-03).
//
// Shared by the store (health FSM, success-tick, backoff) and the rails
// (staleness). No DOM, no /lib/ imports — unit-tested directly under
// `node --test` (web/test/liveness_smoke.mjs), mirroring the browser-twin
// pattern used elsewhere.

export const OFFLINE_THRESHOLD = 3;   // consecutive failures on a polled slice → offline
export const STALE_INTERVALS   = 3;   // a slice older than 3 poll intervals is "stale"

/** Roll a per-slice consecutive-failure map into one global health state. */
export function healthFromFailures(failuresByKey, offlineThreshold = OFFLINE_THRESHOLD) {
  let worst = 0;
  for (const n of failuresByKey.values()) if (n > worst) worst = n;
  if (worst >= offlineThreshold) return 'offline';
  if (worst >= 1) return 'reconnecting';
  return 'ok';
}

/** Human-friendly "updated Ns ago". `now`/`then` are epoch ms. */
export function agoLabel(then, now = Date.now()) {
  if (!then) return 'never';
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 2)  return 'just now';
  if (s < 60) return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  return Math.floor(m / 60) + 'h ago';
}

/** A slice is stale when its data is older than STALE_INTERVALS poll cadences. */
export function isStale(fetchedAt, intervalMs, now = Date.now()) {
  if (!fetchedAt || !intervalMs) return false;
  return (now - fetchedAt) > STALE_INTERVALS * intervalMs;
}

/** Exponential backoff: base·2^attempt, capped. 4s→8s→16s(→16s…) for attempt 0,1,2,3. */
export function nextBackoff(baseMs, attempt, capMs) {
  const d = baseMs * Math.pow(2, Math.max(0, attempt));
  return Math.min(d, capMs);
}

/** Status-line copy for each health state. */
export function healthLabel(state) {
  switch (state) {
    case 'offline':      return 'Offline';
    case 'reconnecting': return 'Reconnecting…';
    default:             return 'Connected';
  }
}
