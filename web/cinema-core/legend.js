/**
 * Infrix Cinema — legend.
 *
 * Renders the canonical visual vocabulary (node kinds, edge kinds, status /
 * disclosure / anchor / approval / trust / replay / anomaly states) so a
 * viewer can read the scene. The same legend renders on every surface; it is
 * the human-facing twin of visualVocabulary.js.
 */
(function (root) {
  'use strict';
  const ns = (root.InfrixCinema = root.InfrixCinema || {});

  // RUNBOOK-05 Task 6 — 16×16 polygon point sets matching the canvas shape
  // builders, so each legend swatch is the SAME glyph the renderer draws (was a
  // CSS border-radius fake that didn't match). circle/gauge handled inline.
  const POINTS = {
    diamond:  '8,1 15,8 8,15 1,8',
    hexagon:  '14,8 11,13 5,13 2,8 5,3 11,3',
    octagon:  '5,1 11,1 15,5 15,11 11,15 5,15 1,11 1,5',
    pentagon: '8,1 15,6 12,15 4,15 1,6',
    shield:   '8,1 14,4 14,9 8,15 2,9 2,4',
    gate:     '2,15 2,7 8,1 14,7 14,15',
    document: '3,1 11,1 14,4 14,15 3,15',
    arrow:    '1,5 9,5 9,2 15,8 9,14 9,11 1,11',
    star:     '8,1 10,6 15,6 11,9 13,15 8,11 3,15 5,9 1,6 6,6',
    rectangle:'1,4 15,4 15,12 1,12',
  };
  function shapeSvg(shape, fill) {
    if (typeof document === 'undefined' || !document.createElementNS) {
      const span = document.createElement('span');   // graceful fallback
      span.style.background = fill;
      return span;
    }
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '14'); svg.setAttribute('height', '14');
    const circular = (shape === 'circle' || shape === 'gauge');
    const el = document.createElementNS(NS, circular ? 'circle' : 'polygon');
    if (circular) { el.setAttribute('cx', '8'); el.setAttribute('cy', '8'); el.setAttribute('r', '6'); }
    else el.setAttribute('points', POINTS[shape] || POINTS.rectangle);
    el.setAttribute('fill', fill);
    svg.appendChild(el);
    return svg;
  }

  // Curated legend rows: [label, colorKey, shape, note]. We surface the
  // semantically important states rather than all ~40 kinds, grouped by family.
  const LEGEND_ROWS = [
    ['Contract / account', 'Normal', 'circle', 'Healthy execution node'],
    ['Throttled', 'Throttled', 'circle', 'Circuit breaker throttling'],
    ['Paused', 'Paused', 'circle', 'Circuit breaker paused'],
    ['Frozen', 'Frozen', 'circle', 'Circuit breaker frozen'],
    ['Anomaly', 'Anomaly', 'circle', 'Anomalous activity'],
    ['Private (redacted)', 'Encrypted', 'circle', '🔒 hidden by disclosure policy'],
    ['Intent', 'Intent', 'arrow', 'Lifecycle: submitted intent'],
    ['Outcome', 'Outcome', 'star', 'Lifecycle: produced outcome'],
    ['Approval pending', 'ApprovalPending', 'gate', 'Awaiting approvals'],
    ['Approval granted', 'ApprovalGranted', 'gate', 'Approval satisfied'],
    ['Policy allow', 'PolicyAllow', 'octagon', 'Policy permitted'],
    ['Policy deny', 'PolicyDeny', 'octagon', 'Policy denied'],
    ['Evidence', 'Evidence', 'document', 'Evidence bundle'],
    ['Evidence anchored', 'EvidenceAnchored', 'document', 'Anchored evidence'],
    ['Anchor (L0)', 'Anchor', 'diamond', 'Accumulate L0 anchor'],
    ['L0 bridge', 'L0Bridge', 'hexagon', 'Connection to Accumulate'],
    ['Disclosure grant', 'DisclosureGrant', 'diamond', 'Active disclosure grant'],
    ['Trust healthy', 'TrustHealthy', 'pentagon', 'Trust profile healthy'],
    ['Trust degraded', 'TrustDegraded', 'pentagon', 'Trust degraded'],
    ['Settlement', 'Settlement', 'circle', 'Settlement leg'],
    ['Escrow', 'Escrow', 'circle', 'Escrow account'],
  ];

  class CinemaLegend {
    constructor(hostEl) { this.host = hostEl; this.el = null; this.build(); this.hide(); }
    build() {
      const wrap = document.createElement('aside');
      wrap.className = 'cinema-legend hidden';
      wrap.id = 'cinema-legend';
      wrap.setAttribute('aria-label', 'Cinema legend');
      const h = document.createElement('h4'); h.textContent = 'Legend'; wrap.appendChild(h);
      const note = document.createElement('p');
      note.className = 'cinema-legend-note';
      note.textContent = 'Cinema visualizes canonical artifacts. It is not canonical truth.';
      wrap.appendChild(note);
      for (const [label, colorKey, shape, hint] of LEGEND_ROWS) {
        const row = document.createElement('div');
        row.className = 'cinema-legend-row';
        const c = (ns.COLORS && ns.COLORS[colorKey]) || { r: 120, g: 140, b: 170, a: 255 };
        const fill = ns.colorCss ? ns.colorCss(c) : `rgb(${c.r},${c.g},${c.b})`;
        const sw = shapeSvg(shape, fill);   // real SVG glyph matching the canvas
        sw.classList.add('cinema-legend-swatch');
        const lab = document.createElement('span'); lab.className = 'cinema-legend-label'; lab.textContent = label;
        const hi = document.createElement('span'); hi.className = 'cinema-legend-hint'; hi.textContent = hint;
        row.appendChild(sw); row.appendChild(lab); row.appendChild(hi);
        wrap.appendChild(row);
      }
      this.el = wrap;
      if (this.host) this.host.appendChild(wrap);
    }
    toggle() { if (this.el) this.el.classList.toggle('hidden'); }
    show() { if (this.el) this.el.classList.remove('hidden'); }
    hide() { if (this.el) this.el.classList.add('hidden'); }
  }

  ns.CinemaLegend = CinemaLegend;
  ns.LEGEND_ROWS = LEGEND_ROWS;
  if (typeof module !== 'undefined' && module.exports) module.exports = { CinemaLegend, LEGEND_ROWS };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
