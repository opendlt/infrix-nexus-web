// Nexus — canonical Cinema mount.
//
// Priority 05 ("one canonical Cinema product surface"): Nexus mounts the SAME
// Cinema core as the standalone product, the embed widget, and the portable
// proof viewer — in `cinema.nexus` mode (focused on the selected intent,
// sharing the Nexus chrome). It loads the core via the ESM loader and feeds it
// a scene derived from the execution-graph projection the execute view already
// holds, so there is no extra polling and disclosure scoping is inherited from
// rpcWithDisclosure upstream.
//
// This is additive: the execute view keeps its step-DAG; this gives operators
// the canonical scene-cinema view of the same run, on demand.

import { loadCinemaCore } from '/cinema-core/loader.js';

let mounted = null;

// graphToScene converts the Nexus execution-graph projection (steps + deps)
// into a Cinema SceneGraph using the canonical visual vocabulary. Pure: no
// network, no mutation of the input.
export function graphToScene(g, vocab) {
  const steps = (g && Array.isArray(g.nodes)) ? g.nodes : [];
  const edgesIn = (g && Array.isArray(g.edges)) ? g.edges : [];
  const COLORS = (vocab && vocab.COLORS) || {};
  // RUNBOOK-05 Task 6 — emit the vocabulary shape per kind (was all-rectangles).
  const shapeForKind = (vocab && vocab.shapeForKind) || ((k) => (k === 'outcome' ? 'star' : 'rectangle'));

  // Layer nodes by dependency depth for a readable left-to-right layout.
  const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
  const depthCache = {};
  const depthOf = (id, seen) => {
    if (depthCache[id] != null) return depthCache[id];
    seen = seen || new Set();
    if (seen.has(id)) return 0;
    seen.add(id);
    const s = byId[id];
    const deps = (s && (s.dependsOn || [])) || [];
    let d = 0;
    for (const p of deps) d = Math.max(d, depthOf(p, seen) + 1);
    depthCache[id] = d;
    return d;
  };
  const perLayer = {};
  const nodes = steps.map((s) => {
    const depth = depthOf(s.id);
    const row = (perLayer[depth] = (perLayer[depth] || 0)) ;
    perLayer[depth] = row + 1;
    const color = COLORS[colorKeyForStatus(s.status)] || COLORS.PlanStep || { r: 100, g: 181, b: 246, a: 180 };
    const kind = s.kind || 'plan_step';
    return {
      id: s.id,
      kind,
      label: s.name || s.label || s.id,
      position: { x: depth * 140, y: row * 90 },
      size: 16,
      color,
      shape: shapeForKind(kind),    // was hardcoded 'rectangle'
      breakerState: undefined,
      createdAtEvent: s.startedAtBlock || 0,
      lastUpdated: s.completedAtBlock || 0,
    };
  });

  const edges = edgesIn.map((e, i) => ({
    id: e.id || ('e' + i),
    kind: 'dependency',
    fromNodeId: e.from || e.fromNodeId,
    toNodeId: e.to || e.toNodeId,
    label: e.reason || 'depends',
    color: COLORS.Plan || { r: 33, g: 150, b: 243, a: 200 },
    width: 2,
    animated: false,
    createdAtEvent: e.unlockedAtBlock || 0,
  }));

  // Surface the outcome as a terminal node so the scene tells the whole story.
  if (g && g.outcome && g.outcome.id) {
    const ok = g.outcome.overallStatus === 'completed';
    nodes.push({
      id: 'outcome:' + g.outcome.id,
      kind: 'outcome',
      label: 'outcome: ' + g.outcome.overallStatus,
      position: { x: (Object.keys(perLayer).length + 1) * 140, y: 0 },
      size: 18,
      color: ok ? (COLORS.Outcome || { r: 121, g: 134, b: 203, a: 220 }) : (COLORS.OutcomeFailed || { r: 239, g: 83, b: 80, a: 220 }),
      shape: shapeForKind('outcome'),   // 'star' — was 'circle'
      createdAtEvent: 0, lastUpdated: 0,
    });
  }

  return {
    id: (g && g.intentId) || 'nexus-cinema',
    sessionId: (g && g.intentId) || '',
    nodes, edges,
    blockHeight: maxBlock(steps),
    totalGasUsed: steps.reduce((a, s) => a + (s.gasUsed || s.gasPlanned || 0), 0),
    timestamp: '',
    version: 1,
  };
}

function colorKeyForStatus(status) {
  switch (status) {
    case 'completed': return 'Normal';
    case 'failed': return 'Frozen';
    case 'compensated': return 'Throttled';
    case 'running': return 'IntentActive';
    default: return 'Encrypted'; // pending / unknown
  }
}
function maxBlock(steps) { let m = 0; for (const s of steps) { if ((s.completedAtBlock || 0) > m) m = s.completedAtBlock; } return m; }

// Exposed for tests: the status→vocabulary-color-key mapping.
export const colorKeyForStepStatus = colorKeyForStatus;

/**
 * mountNexusCinema mounts the canonical core into `host` showing `graph` as a
 * scene. Disclosure context (viewer/purpose/workflow) is passed through so the
 * Nexus-mounted Cinema enforces the same redaction as the rest of the SPA.
 * Returns the controller (or null if the core failed to load).
 */
export async function mountNexusCinema(host, { graph, disclosureContext } = {}) {
  try {
    const ns = await loadCinemaCore();
    const scene = graphToScene(graph, ns);
    if (mounted && mounted.destroy) { try { mounted.destroy(); } catch (e) { /* ignore */ } }
    mounted = ns.mountCinema({
      mode: 'cinema.nexus',
      root: host,
      scene,
      disclosureContext: disclosureContext || {},
    });
    return mounted;
  } catch (e) {
    host.replaceChildren();
    const p = document.createElement('p');
    p.className = 'execute-empty';
    p.textContent = 'Scene cinema unavailable: ' + (e && e.message ? e.message : e);
    host.appendChild(p);
    return null;
  }
}
