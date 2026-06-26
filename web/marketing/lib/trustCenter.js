// Nexus — Trust Center data + honest helpers (plan-12).
//
// Reads a live trust-center context if one is served, falling back to the
// Go-generated fixture (built from pkg/launch.BuildTrustCenter). The live CLI
// fills in the real git HEAD and release-evidence freshness; the fixture pins a
// deterministic commit and the honest default state (no evidence generated yet),
// so the browser twin never drifts from the Go builder.

let _data = null;

/** setTrustCenterData injects the data (used by the no-browser smoke test). */
export function setTrustCenterData(obj) {
  _data = obj;
}

/** getTrustCenterData returns the loaded data. */
export function getTrustCenterData() {
  if (!_data) throw new Error('trust-center: data not loaded — call loadTrustCenter() first');
  return _data;
}

/** loadTrustCenter fetches a live context if served, falling back to the fixture. */
export async function loadTrustCenter(liveUrl = '/v1/trust-center/context', fixtureUrl = '/testdata/trust-center.fixture.json') {
  try {
    const res = await fetch(liveUrl, { cache: 'no-cache' });
    if (res.ok) {
      _data = await res.json();
      _data._live = true;
      return _data;
    }
  } catch (_) {
    /* no live trust-center endpoint — fall back to the fixture */
  }
  const res = await fetch(fixtureUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error('trust-center: failed to load ' + fixtureUrl + ' (' + res.status + ')');
  _data = await res.json();
  _data._live = false;
  return _data;
}

export function isLive() { return !!getTrustCenterData()._live; }
export function center() { return getTrustCenterData().center || {}; }
export function commit() { return center().commit || ''; }
export function network() { return center().network || ''; }
export function generatedNote() { return center().generatedNote || ''; }
export function sections() { return center().sections || []; }
export function boundaries() { return center().boundaries || []; }
export function mainnetStatus() { return center().mainnetStatus || ''; }

/** releaseEvidenceSection returns the HEAD-aware release-evidence section. */
export function releaseEvidenceSection() {
  return sections().find((s) => s.id === 'release-evidence') || null;
}

/** linksToCommit reports whether the release-evidence section references the
 *  current commit — the trust center always links to evidence for HEAD. */
export function linksToCommit() {
  const c = commit();
  const sec = releaseEvidenceSection();
  if (!c || !sec) return false;
  const short = c.slice(0, 12);
  return (sec.detail + ' ' + sec.command).includes(short);
}
