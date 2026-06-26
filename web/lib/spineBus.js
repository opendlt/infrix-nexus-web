// Nexus — spine activity bus.
//
// Tiny pub/sub that "live" components subscribe to (the spine strip animates
// connector particles + pulses stage cards; the timeline flashes advancing
// rows; the store invalidates pushed slices).
//
// Events:
//   'intent.advanced' { intentId, fromStage, toStage, timestamp }
//   'intent.completed' { intentId, timestamp }
//   'intent.failed' { intentId, stage, reason, timestamp }
//   'anchor.confirmed' { anchorId, intentId, l0Block, timestamp }
//
// STATUS (RUNBOOK-03): the bus is currently DORMANT — its only publisher was the
// connectLive() WebSocket bridge (lib/liveEvents.js), which RUNBOOK-01 removed
// (no /v4/ws actor in this build). The subscribers above are harmless inert
// wiring (they make no on-screen liveness claim, so the honesty rule holds) and
// are the exact substrate a future "make it real" push layer re-lights by adding
// a publisher. Until then the store's interval poller is the source of truth.

const subscribers = new Map(); // event → Set<handler>
const recentEvents = []; // ring buffer of last 50 events for late subscribers
const MAX_RECENT = 50;

export function publish(event, payload) {
  const enriched = { event, payload, t: Date.now() };
  recentEvents.push(enriched);
  if (recentEvents.length > MAX_RECENT) recentEvents.shift();
  const set = subscribers.get(event);
  if (set) {
    for (const h of set) {
      try { h(payload, enriched); } catch (e) { console.error('spineBus handler', event, e); }
    }
  }
  // wildcard subscribers
  const wildcard = subscribers.get('*');
  if (wildcard) {
    for (const h of wildcard) {
      try { h(payload, enriched); } catch (e) { console.error('spineBus * handler', e); }
    }
  }
}

export function subscribe(event, handler) {
  if (!subscribers.has(event)) subscribers.set(event, new Set());
  subscribers.get(event).add(handler);
  return () => {
    const set = subscribers.get(event);
    if (set) set.delete(handler);
  };
}

export function getRecent(limit = 50) {
  return recentEvents.slice(-limit).reverse();
}

// Convenience: stage transition emitter. The liveEvents bridge calls
// this whenever a subscription event indicates an intent advanced.
export function emitIntentAdvanced(intentId, fromStage, toStage) {
  publish('intent.advanced', {
    intentId, fromStage, toStage, timestamp: Date.now(),
  });
}
