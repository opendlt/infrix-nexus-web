// Nexus — Conversational Proof Tutor data + honest helpers (nextux-13).
//
// Reads the Go-generated tutor fixture (lessons + audiences + a worked example
// explanation of an OFFLINE proof) and exposes the same honest, read-only view
// the CLI, SDK, and agent see. The browser never invents a claim: the sample
// explanation it renders was produced by the real Go explainer, so it already
// refuses L4 for an offline proof and is never green unless verified.

let _data = null;

/** setTutorData injects the data (used by the no-browser smoke test). */
export function setTutorData(obj) {
  _data = obj;
}

/** getTutorData returns the loaded data. */
export function getTutorData() {
  if (!_data) throw new Error('tutor: data not loaded — call loadTutor() first');
  return _data;
}

/** loadTutor fetches a live tutor context if one is served, falling back to the
 *  deterministic fixture. */
export async function loadTutor(liveUrl = '/v1/tutor/context', fixtureUrl = '/testdata/tutor.fixture.json') {
  try {
    const res = await fetch(liveUrl, { cache: 'no-cache' });
    if (res.ok) {
      _data = await res.json();
      _data._live = true;
      return _data;
    }
  } catch (_) {
    /* no live tutor endpoint — fall back to the fixture */
  }
  const res = await fetch(fixtureUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error('tutor: failed to load ' + fixtureUrl + ' (' + res.status + ')');
  _data = await res.json();
  _data._live = false;
  return _data;
}

export function isLive() { return !!getTutorData()._live; }
export function lessons() { return getTutorData().lessons || []; }
export function audiences() { return getTutorData().audiences || []; }
export function sample() { return getTutorData().sample || null; }
export function sampleQuiz() { return getTutorData().sampleQuiz || null; }

/** lessonByTopic returns a lesson by its canonical topic or an alias. */
export function lessonByTopic(topic) {
  const key = String(topic || '').toLowerCase();
  return lessons().find((l) =>
    l.topic.toLowerCase() === key ||
    l.id.toLowerCase() === key ||
    (l.aliases || []).some((a) => a.toLowerCase() === key)) || null;
}

/** sampleStatusTone maps the worked-example status to a UX tone. A partial or
 *  failed status is NEVER positive — only a fully verified proof is. */
export function sampleStatusTone() {
  const s = sample();
  if (!s) return 'info';
  switch (s.status) {
    case 'verified': return 'positive';
    case 'failed': return 'negative';
    default: return 'caution';
  }
}

/** sampleIsHonest reports whether the worked example respects the honesty rails:
 *  an offline proof must not claim L4 and must disclose that live L0 was not
 *  performed. This is the browser-side echo of the Go grounding guard. */
export function sampleIsHonest() {
  const s = sample();
  if (!s) return true;
  // No canClaim line may assert a current L4 proof.
  for (const c of s.canClaim || []) {
    if (/\bl4\b/i.test(c)) return false;
  }
  if (s.status === 'verified') return false; // the sample is an OFFLINE proof
  return (s.cannotClaim || []).some((c) => /live accumulate l0 verification was not performed/i.test(c));
}

/** whyItMatters returns the encouraging "why this matters" copy. */
export function whyItMatters() {
  return 'Every answer here is grounded in a real, parsed Infrix artifact and the canonical product ' +
    'copy — never a free-form guess. The tutor never claims a stronger assurance level than the ' +
    'verifier supports (no L4 without a live L0 confirmation), never invents a proof claim, and never ' +
    'tells you to bypass a gate. That is the point: learning and answers are honest end to end.';
}
