// Nexus — DAG renderer (causal graph for Live execution).
//
// Cinema-Inbox-Time Effort 1 Commit 2.
//
// Replaces the old "← dep1, dep2" text hints with an SVG overlay
// drawing one curved path per edge between the corresponding step
// cards. Edge classes mirror the executionGraph envelope's per-edge
// `state` field:
//
//   .dag-edge-blocking      — dashed muted gray, source not yet completed
//   .dag-edge-unlocked      — solid accent, source completed; on first
//                             render after unlock the path animates a
//                             stroke-dashoffset "flow" from src→dst
//   .dag-edge-failed-path   — red, thick; drawn over edges connecting
//                             the canonical pathToFailure chain
//   .dag-edge-anchor-wait   — slow dashed gold pulse for edges that
//                             cross into a waiting_anchor step
//
// Layout strategy:
//
//   The DAG canvas owns relative positioning. Each step card is an
//   absolutely-positioned child of the canvas (see executionGraph.js
//   layer rendering — cards live in horizontal layers). The renderer
//   queries each card's bounding rect (relative to the canvas) and
//   routes a cubic Bezier from the source card's right edge to the
//   destination card's left edge. Control points push outward by a
//   constant offset so multiple edges between adjacent layers don't
//   overlap.
//
// Reactive layout:
//
//   A single ResizeObserver attached to the canvas re-runs
//   recomputeEdges() on any layout shift (window resize, card text
//   reflow, dynamic insertion). The SVG <path> elements have stable
//   data-edge-id attributes so we don't re-create them on every
//   recompute — we just update their `d` attribute.

const SVG_NS = 'http://www.w3.org/2000/svg';
const EDGE_OFFSET = 28; // horizontal Bezier control-point offset in px

/**
 * Mount the DAG renderer onto a host container.
 *
 * @param {HTMLElement} host — the container that already holds the
 *   step card layers (.execution-dag-layer with .execution-step-card
 *   children). The renderer positions itself absolutely inside.
 * @param {Object} graph — the nexus.executionGraph response
 * @returns {{ destroy(): void, update(g): void }} controller
 */
export function mountDagRenderer(host, graph) {
  if (!host) return { destroy: () => {}, update: () => {} };

  // Make the host the positioning context for absolutely-positioned
  // children. Each step card is already positioned by the existing
  // .execution-dag-layer flex layout; the SVG overlay just sits on
  // top with `pointer-events:none` so card hover/click still works.
  if (getComputedStyle(host).position === 'static') {
    host.style.position = 'relative';
  }

  let svg = host.querySelector(':scope > svg.dag-edges');
  if (!svg) {
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.classList.add('dag-edges');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    svg.style.inset = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    svg.style.overflow = 'visible';
    host.appendChild(svg);
  }

  // Edges map — keyed by canonical edge id "from→to"
  const edgePaths = new Map();
  // Pre-defs: arrowhead markers (one per state)
  ensureArrowMarkers(svg);

  let currentGraph = graph || { nodes: [], edges: [], pathToFailure: [] };

  function edgeKey(e) { return `${e.from}→${e.to}`; }
  function nodeRect(id) {
    const card = host.querySelector(`.execution-step-card[data-step-id="${cssEscape(id)}"]`);
    if (!card) return null;
    const hostRect = host.getBoundingClientRect();
    const r = card.getBoundingClientRect();
    return {
      left:   r.left   - hostRect.left,
      right:  r.right  - hostRect.left,
      top:    r.top    - hostRect.top,
      bottom: r.bottom - hostRect.top,
      midY:   r.top - hostRect.top + r.height / 2,
    };
  }

  function pathFor(srcRect, dstRect) {
    const sx = srcRect.right;
    const sy = srcRect.midY;
    const dx = dstRect.left;
    const dy = dstRect.midY;
    // Cubic Bezier — control points push outward horizontally so
    // edges curve gracefully even when src/dst are at very different
    // vertical positions.
    const c1x = sx + EDGE_OFFSET;
    const c1y = sy;
    const c2x = dx - EDGE_OFFSET;
    const c2y = dy;
    return `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${dx} ${dy}`;
  }

  function recompute() {
    if (!currentGraph || !Array.isArray(currentGraph.edges)) return;
    const pathSet = new Set();
    if (Array.isArray(currentGraph.pathToFailure)) {
      for (let i = 1; i < currentGraph.pathToFailure.length; i++) {
        pathSet.add(`${currentGraph.pathToFailure[i - 1]}→${currentGraph.pathToFailure[i]}`);
      }
    }
    // The anchor-wait condition: when the destination node is in
    // status waiting_anchor we mark the inbound edges accordingly.
    const nodeStatus = new Map();
    for (const n of (currentGraph.nodes || [])) {
      nodeStatus.set(n.id, n.status);
    }
    const seen = new Set();
    for (const e of currentGraph.edges) {
      const key = edgeKey(e);
      seen.add(key);
      const srcR = nodeRect(e.from);
      const dstR = nodeRect(e.to);
      if (!srcR || !dstR) continue;

      let path = edgePaths.get(key);
      let created = false;
      if (!path) {
        path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('data-edge-id', key);
        path.setAttribute('fill', 'none');
        svg.appendChild(path);
        edgePaths.set(key, path);
        created = true;
      }

      path.setAttribute('d', pathFor(srcR, dstR));

      // Compute class from state + path-to-failure + anchor-wait.
      let cls = 'dag-edge';
      const isFailedPath = pathSet.has(key);
      if (isFailedPath) {
        cls += ' dag-edge-failed-path';
      } else if (e.state === 'unlocked') {
        cls += ' dag-edge-unlocked';
      } else {
        cls += ' dag-edge-blocking';
      }
      if (nodeStatus.get(e.to) === 'waiting_anchor') {
        cls += ' dag-edge-anchor-wait';
      }
      // Detect unlock transition for animation: if the path was
      // previously "blocking" and is now "unlocked" we add the
      // .dag-edge-unlock-animating class for one tick.
      const prevState = path.dataset.state;
      const newState = isFailedPath ? 'failed-path' : (e.state || 'blocking');
      if (!created && prevState === 'blocking' && newState === 'unlocked') {
        path.classList.add('dag-edge-unlock-animating');
        // Remove the one-shot class after animation duration (700ms).
        setTimeout(() => path.classList.remove('dag-edge-unlock-animating'), 720);
      }
      path.dataset.state = newState;

      // Arrowhead marker keyed by state.
      const markerID = isFailedPath
        ? 'dag-arrow-failed'
        : e.state === 'unlocked' ? 'dag-arrow-unlocked' : 'dag-arrow-blocking';
      path.setAttribute('marker-end', `url(#${markerID})`);

      path.setAttribute('class', cls);
    }
    // Garbage-collect paths whose edges no longer exist (e.g. plan
    // regeneration removed a dependency).
    for (const [key, path] of edgePaths) {
      if (!seen.has(key)) {
        path.remove();
        edgePaths.delete(key);
      }
    }
  }

  // ResizeObserver — recompute on any host or card layout shift.
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => recompute());
    ro.observe(host);
    for (const card of host.querySelectorAll('.execution-step-card')) {
      ro.observe(card);
    }
  }
  // Also watch for DOM mutations (cards added/removed by re-render).
  let mo = null;
  if (typeof MutationObserver !== 'undefined') {
    mo = new MutationObserver(() => {
      if (ro) {
        for (const card of host.querySelectorAll('.execution-step-card')) {
          try { ro.observe(card); } catch (e) { /* already observed */ }
        }
      }
      recompute();
    });
    mo.observe(host, { childList: true, subtree: true });
  }

  // Initial render — schedule for the next animation frame so card
  // bounding rects are settled.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(recompute);
  } else {
    setTimeout(recompute, 0);
  }

  return {
    update(newGraph) {
      currentGraph = newGraph || currentGraph;
      recompute();
    },
    destroy() {
      if (ro) ro.disconnect();
      if (mo) mo.disconnect();
      svg.remove();
      edgePaths.clear();
    },
  };
}

function ensureArrowMarkers(svg) {
  // Already present? Skip.
  if (svg.querySelector('defs.dag-arrow-defs')) return;
  const defs = document.createElementNS(SVG_NS, 'defs');
  defs.classList.add('dag-arrow-defs');
  for (const variant of ['blocking', 'unlocked', 'failed']) {
    const marker = document.createElementNS(SVG_NS, 'marker');
    marker.setAttribute('id', `dag-arrow-${variant}`);
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '7');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('orient', 'auto-start-reverse');
    const tri = document.createElementNS(SVG_NS, 'path');
    tri.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    tri.setAttribute('class', `dag-arrow-fill dag-arrow-fill-${variant}`);
    marker.appendChild(tri);
    defs.appendChild(marker);
  }
  svg.appendChild(defs);
}

// CSS.escape polyfill — we use querySelector with arbitrary step IDs
// (which can contain `://`, `:`, `/`, etc.) so we need to escape.
function cssEscape(s) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(s);
  }
  return String(s).replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

/**
 * Smoke-test export — given a graph and a host containing N cards with
 * matching data-step-id attributes, returns the number of edge paths
 * actually drawn. Used by the JS smoke fence to assert the renderer
 * produces N-1 edges given a known DAG with N nodes in a chain.
 *
 * The export is intentionally side-effect free apart from creating the
 * SVG overlay; tests can use document.body as the host and tear down
 * with the returned destroy().
 */
export function _smokeRender(host, graph) {
  return mountDagRenderer(host, graph);
}
