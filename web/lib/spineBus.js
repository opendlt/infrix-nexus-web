// Nexus — spine activity bus.
//
// Tiny pub/sub that every "live" component subscribes to:
//   - spineHero animates particle flow + pulses stage cards
//   - live event log adds a row
//   - header pulse meter flashes
//   - inspect view (when looking at the same intent) refreshes
//
// Events:
//   'intent.advanced' { intentId, fromStage, toStage, timestamp }
//   'intent.completed' { intentId, timestamp }
//   'intent.failed' { intentId, stage, reason, timestamp }
//   'anchor.confirmed' { anchorId, intentId, l0Block, timestamp }
//
// The connectLive() WebSocket bridge (lib/liveEvents.js) emits the
// events; subscribers act on them. This decouples the data layer
// from the visual layer.

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
