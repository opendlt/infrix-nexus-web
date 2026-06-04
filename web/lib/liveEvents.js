// Nexus — live spine events.
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 1: connects to /v4/ws and
// multiplexes the four canonical subscription topics (intent /
// approval / evidence / outcome) the server exposes via
// pkg/api/v4/websocket. When the WebSocket is unavailable or the
// connection drops, this module silently falls back to a 5-second
// polling loop against the explorer.recentIntents +
// explorer.recentAnchors RPC methods so the Spine view continues to
// receive updates either way.
//
// The module exposes a single connect() entry point that returns an
// EventStream object with on(topic, handler) and close() methods. The
// event shapes are normalised so consumers don't care whether the
// event arrived via WebSocket push or polling diff.

import { rpc } from '/lib/rpc.js';
import { publish } from '/lib/spineBus.js';

/**
 * @typedef {Object} StreamEvent
 * @property {string} topic                — 'intent' | 'approval' | 'evidence' | 'outcome' | 'anchor' | 'snapshot'
 * @property {string} [intentId]
 * @property {string} [planId]
 * @property {string} [stage]              — for intent events: submitted|planned|approved|executing|completed|failed
 * @property {string} [state]              — for approval / outcome / anchor events
 * @property {object} payload              — original event body
 */

/**
 * @typedef {Object} EventStream
 * @property {(topic: string, handler: (e: StreamEvent) => void) => () => void} on
 * @property {() => void} close
 * @property {() => 'ws' | 'polling' | 'closed'} mode  — current transport mode
 */

const WS_PATH = '/v4/ws';
const POLL_INTERVAL_MS = 5000;
const RECONNECT_BACKOFF_MS = [500, 1000, 2000, 4000, 8000];

/**
 * Connect to the live event stream.
 * @param {Object} cfg
 * @param {string} cfg.actor              — disclosure-context actor URL
 * @param {string} cfg.purpose            — disclosure-context purpose
 * @param {string} cfg.workflowInstance   — disclosure-context workflow instance ID
 * @returns {EventStream}
 */
export function connectLive(cfg) {
  const handlers = new Map(); // topic → Set<handler>
  let ws = null;
  let pollTimer = null;
  let pollIntentSeen = new Map();   // id → updatedAt
  let pollAnchorSeen = new Map();   // id → updatedAt
  let mode = 'closed';
  let closed = false;
  let reconnectAttempt = 0;
  let nextSubId = 1;
  const subscriptions = new Map(); // subId → topic

  function on(topic, handler) {
    if (!handlers.has(topic)) handlers.set(topic, new Set());
    handlers.get(topic).add(handler);
    return () => {
      const set = handlers.get(topic);
      if (set) set.delete(handler);
    };
  }

  function emit(ev) {
    // Publish onto the global spine activity bus so the hero canvas,
    // event log, header pulse meter, and any other live-aware view
    // can react to the same event without per-component plumbing.
    try {
      publish('spine.' + ev.topic, ev);
      // Stage-transition convenience: when an intent event arrives
      // with a stage field, emit a normalised "intent.advanced" so
      // the hero canvas can animate connector flow on it.
      if (ev.topic === 'intent' && ev.stage && ev.intentId) {
        publish('intent.advanced', {
          intentId: ev.intentId,
          stage: ev.stage,
          timestamp: Date.now(),
        });
      }
      if (ev.topic === 'anchor' && ev.intentId) {
        publish('anchor.observed', {
          anchorId: (ev.payload && ev.payload.id) || '',
          intentId: ev.intentId,
          state: ev.state,
          timestamp: Date.now(),
        });
      }
    } catch (e) { /* never let bus errors break the view subscribers */ }
    const set = handlers.get(ev.topic);
    if (!set) return;
    for (const h of set) {
      try { h(ev); } catch (err) { console.error('handler error', topicSafe(ev), err); }
    }
  }

  function topicSafe(ev) { return (ev && ev.topic) || '?'; }

  function startWS() {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const qs = new URLSearchParams({
      actor: cfg.actor,
      purpose: cfg.purpose,
      workflowInstance: cfg.workflowInstance,
    });
    const url = `${proto}://${window.location.host}${WS_PATH}?${qs.toString()}`;
    let socket;
    try {
      socket = new WebSocket(url);
    } catch (err) {
      console.warn('WebSocket construction failed; falling back to polling', err);
      startPolling();
      return;
    }
    ws = socket;

    socket.onopen = () => {
      mode = 'ws';
      reconnectAttempt = 0;
      // Subscribe to all four canonical topics. Each subscribe is
      // its own JSON-RPC call; the server returns subId synchronously
      // on the same socket.
      for (const topic of ['intent', 'approval', 'evidence', 'outcome']) {
        const id = nextSubId++;
        subscriptions.set(id, topic);
        socket.send(JSON.stringify({
          jsonrpc: '2.0',
          id,
          method: 'infrix_subscribe',
          params: {
            subscriptionType: topic,
            disclosure: {
              actor: cfg.actor,
              purpose: cfg.purpose,
              workflowInstance: cfg.workflowInstance,
            },
          },
        }));
      }
    };

    socket.onmessage = (msg) => {
      let data;
      try { data = JSON.parse(msg.data); } catch (err) { return; }
      if (data.method === 'infrix_subscription' && data.params) {
        const result = data.params.result || {};
        const topic = inferTopic(result);
        emit({
          topic,
          intentId:  result.intentId  || result.intentID  || '',
          planId:    result.planId    || result.planID    || '',
          stage:     result.stage     || '',
          state:     result.state     || result.finality  || '',
          payload:   result,
        });
      }
    };

    socket.onclose = () => {
      ws = null;
      if (closed) return;
      // Schedule reconnect with backoff; fall back to polling in
      // the meantime so the UI continues to update.
      if (mode !== 'polling') startPolling();
      const delay = RECONNECT_BACKOFF_MS[Math.min(reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1)];
      reconnectAttempt++;
      setTimeout(() => {
        if (closed) return;
        startWS();
      }, delay);
    };

    socket.onerror = (err) => {
      console.warn('WebSocket error', err);
      // onclose will follow and trigger fallback + reconnect.
    };
  }

  function inferTopic(result) {
    // The four IntentLifecycle / Approval / Evidence / OutcomeUpdate
    // event shapes are distinguishable by which optional fields are
    // present. Use the most specific field as the discriminant.
    if ('finality' in result)   return 'outcome';
    if ('approver' in result || 'planHash' in result && 'state' in result && !('evidenceId' in result)) return 'approval';
    if ('evidenceId' in result) return 'evidence';
    if ('goalType' in result || 'stage' in result && 'intentId' in result) return 'intent';
    return 'unknown';
  }

  function startPolling() {
    if (pollTimer) return;
    mode = 'polling';
    pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
    // Kick off an immediate poll so the UI populates without waiting.
    pollOnce();
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function pollOnce() {
    if (closed) return;
    try {
      const r = await rpc('explorer.recentIntents', {
        actor: cfg.actor,
        purpose: cfg.purpose,
        workflowInstance: cfg.workflowInstance,
        limit: 25,
      });
      const intents = r.intents || [];
      for (const intent of intents) {
        const seen = pollIntentSeen.get(intent.id);
        const updated = intent.updated || '';
        if (seen !== updated) {
          pollIntentSeen.set(intent.id, updated);
          emit({
            topic: 'intent',
            intentId: intent.id,
            planId: intent.planId || '',
            stage: derivePolledStage(intent),
            state: intent.state || '',
            payload: intent,
          });
        }
      }
    } catch (err) { /* polling errors are tolerated; UI shows last good state */ }

    try {
      const r = await rpc('explorer.recentAnchors', {
        actor: cfg.actor,
        purpose: cfg.purpose,
        workflowInstance: cfg.workflowInstance,
        limit: 10,
      });
      const anchors = r.anchors || [];
      for (const a of anchors) {
        const seen = pollAnchorSeen.get(a.id);
        const updated = (a.updated && (a.updated.toString ? a.updated.toString() : String(a.updated))) || '';
        if (seen !== updated) {
          pollAnchorSeen.set(a.id, updated);
          emit({
            topic: 'anchor',
            intentId: a.originIntentID || a.createdByIntentID || '',
            planId: a.originPlanID || a.createdByPlanID || '',
            state: a.anchorStatus || a.state || '',
            payload: a,
          });
        }
      }
    } catch (err) { /* same */ }
  }

  function derivePolledStage(intent) {
    const stages = intent.stages || [];
    let lastDone = '';
    for (const s of stages) if (s.completed) lastDone = s.stage;
    return lastDone;
  }

  function close() {
    closed = true;
    if (ws) {
      try { ws.close(); } catch (e) {}
      ws = null;
    }
    stopPolling();
    mode = 'closed';
  }

  // Try WebSocket first; if the global ctor isn't available (very old
  // browsers) jump straight to polling.
  if (typeof WebSocket !== 'undefined') {
    startWS();
  } else {
    startPolling();
  }

  return { on, close, mode: () => mode };
}
