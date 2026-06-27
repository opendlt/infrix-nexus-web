// RUNBOOK-07 SP7 — trend/σ anomaly detection + sparkline rendering.
//
// detectAnomalies is pure (no DOM). renderSparkline builds a tiny inline SVG
// polyline (no animation → reduced-motion safe by construction). Thresholds are
// constants so they're tunable.

const SVG_NS = 'http://www.w3.org/2000/svg';
const SIGMA_THRESHOLD = 3;                       // +Nσ over the windowed mean
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;         // 5 minutes

const LABELS = {
  driftingProfiles: 'Trust drift',
  outcomeFail: 'Outcome-capture failures',
  compFail: 'Compensation failures',
  backlog: 'Anchor backlog',
};

function stats(xs) {
  const n = xs.length;
  if (n === 0) return { mean: 0, sd: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  return { mean, sd: Math.sqrt(variance) };
}

function hhmm(t) {
  const d = new Date(t);
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * detectAnomalies(buf, opts) → alerts[]
 * buf = [{t, driftingProfiles, outcomeFail, compFail, backlog}] (from pulseBuffer).
 * Two alert kinds: a ≥3σ spike over the windowed mean, and a 0→nonzero "newly
 * drifted" step. `now` is injectable for deterministic tests.
 */
export function detectAnomalies(buf, opts = {}) {
  const windowMs = opts.windowMs || DEFAULT_WINDOW_MS;
  const now = opts.now != null ? opts.now : Date.now();
  const recent = (buf || []).filter((s) => now - s.t <= windowMs);
  const alerts = [];
  if (recent.length < 2) return alerts;          // need at least 2 points to trend

  for (const key of ['driftingProfiles', 'outcomeFail', 'compFail', 'backlog']) {
    const xs = recent.map((s) => Number(s[key]) || 0);
    const last = xs[xs.length - 1];
    const { mean, sd } = stats(xs);

    // σ spike: only when there is real variance (sd>0) so a flat series can't
    // false-positive (last-mean would be 0 anyway, but guard explicitly).
    if (sd > 0) {
      const z = (last - mean) / sd;
      if (z >= SIGMA_THRESHOLD) {
        alerts.push({
          key, level: 'high',
          text: `${LABELS[key]} +${z.toFixed(1)}σ in ${Math.round(windowMs / 60000)} min`,
          ref: refFor(key),
        });
      }
    }

    // Step alert: a metric that went 0 → >0 across the window ("newly drifted").
    if (xs[0] === 0 && last > 0) {
      alerts.push({
        key, level: 'medium',
        text: `${LABELS[key]} newly nonzero at ${hhmm(now)}`,
        ref: refFor(key),
      });
    }
  }
  return alerts;
}

function refFor(key) {
  if (key === 'driftingProfiles') return '#/govern/trustProfiles';
  if (key === 'backlog') return '#/anchors';
  return '#/operate';                            // outcome/comp failures → operate console
}

/**
 * renderSparkline(series, opts) → SVGElement
 * series = [{t, v}]. A static polyline scaled to the value range.
 */
export function renderSparkline(series, opts = {}) {
  const w = opts.width || 80;
  const h = opts.height || 20;
  const pad = 1;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'sparkline');
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', opts.label || 'trend sparkline');
  svg.setAttribute('preserveAspectRatio', 'none');

  const vals = (series || []).map((s) => Number(s.v) || 0);
  if (vals.length < 2) return svg;               // nothing to draw yet

  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const stepX = (w - 2 * pad) / (vals.length - 1);
  const pts = vals.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / span) * (h - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const poly = document.createElementNS(SVG_NS, 'polyline');
  poly.setAttribute('class', 'sparkline-line');
  poly.setAttribute('fill', 'none');
  poly.setAttribute('points', pts);
  svg.appendChild(poly);

  // A dot on the latest sample.
  const lastX = pad + (vals.length - 1) * stepX;
  const lastY = h - pad - ((vals[vals.length - 1] - min) / span) * (h - 2 * pad);
  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('class', 'sparkline-dot');
  dot.setAttribute('cx', lastX.toFixed(1));
  dot.setAttribute('cy', lastY.toFixed(1));
  dot.setAttribute('r', '1.6');
  svg.appendChild(dot);
  return svg;
}

export { LABELS as SPARK_LABELS };
