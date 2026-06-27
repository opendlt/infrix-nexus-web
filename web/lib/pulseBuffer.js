// RUNBOOK-07 SP7 — capped client-side ring buffer of runtimePulse samples.
//
// runtimePulse is polled every few seconds and each sample is rendered then
// discarded. This keeps a bounded history (≈10 min) so the telemetry rail can
// draw sparklines and compute trend/σ alerts. The buffer lives at module scope
// (in the store-shared lib) so it survives telemetry unmount/remount.

export const CAP = 150;                          // 150 samples * ~4s ≈ 10 min
const buf = [];

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * pushSample(slice, t?) → the appended sample, or null if the slice wasn't
 * visible. `t` is injectable for deterministic tests (defaults to now).
 */
export function pushSample(slice, t) {
  if (!slice || slice.status !== 'visible' || !slice.data) return null;
  const d = slice.data;
  const sample = {
    t: t != null ? t : Date.now(),
    driftingProfiles: num(d.trust && d.trust.driftingProfiles),
    outcomeFail: num(d.workflow && d.workflow.outcomeCaptureFailures),
    compFail: num(d.workflow && d.workflow.compensationStageFailures),
    admitted: num(d.plugin && d.plugin.totalAdmitted),
    backlog: num(d.anchor && (d.anchor.backlog != null ? d.anchor.backlog : d.anchor.pending)),
  };
  buf.push(sample);
  while (buf.length > CAP) buf.shift();          // ring eviction (FIFO)
  return sample;
}

/** series(key) → [{t, v}] in chronological order. */
export function series(key) {
  return buf.map((s) => ({ t: s.t, v: s[key] }));
}

/** The raw buffer (read-only copy) — for trend computation. */
export function snapshot() { return buf.slice(); }

/** Current buffer length. */
export function size() { return buf.length; }

/** Reset (tests + fresh board load). */
export function resetBuffer() { buf.length = 0; }

export const TRENDED_KEYS = ['driftingProfiles', 'outcomeFail', 'compFail', 'backlog'];
