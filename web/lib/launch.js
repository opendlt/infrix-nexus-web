// Nexus — Public Launch Page data + honest helpers (plan-12).
//
// Reads a live launch context if one is served, falling back to the
// Go-generated fixture (built from pkg/launch.BuildPage, so the browser can
// never drift from the honest, claim-linted Go content). The launch page mirrors
// the same rails every surface upholds: assurance comes from the verifier
// (source === 'verifykit'), the node is never trusted, a local run never reaches
// L4, and nothing targets mainnet.

let _data = null;

/** setLaunchData injects the data (used by the no-browser smoke test). */
export function setLaunchData(obj) {
  _data = obj;
}

/** getLaunchData returns the loaded data. */
export function getLaunchData() {
  if (!_data) throw new Error('launch: data not loaded — call loadLaunch() first');
  return _data;
}

/** loadLaunch fetches a live launch context if served, falling back to the fixture. */
export async function loadLaunch(liveUrl = '/v1/launch/context', fixtureUrl = '/testdata/launch.fixture.json') {
  try {
    const res = await fetch(liveUrl, { cache: 'no-cache' });
    if (res.ok) {
      _data = await res.json();
      _data._live = true;
      return _data;
    }
  } catch (_) {
    /* no live launch endpoint — fall back to the fixture */
  }
  const res = await fetch(fixtureUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error('launch: failed to load ' + fixtureUrl + ' (' + res.status + ')');
  _data = await res.json();
  _data._live = false;
  return _data;
}

export function isLive() { return !!getLaunchData()._live; }
export function page() { return getLaunchData().page || {}; }
export function hero() { return page().hero || {}; }
export function sections() { return page().sections || []; }
export function claimBoundary() { return page().claimBoundary || {}; }
export function boundaries() { return page().boundaries || []; }
export function receiptPreview() { return hero().receiptPreview || null; }

/** receiptIsHonest reports whether the previewed receipt respects the rails: its
 *  assurance comes from the verifier and never trusts the node, and a local
 *  receipt never claims L0/L4. Mirrors the Go/SDK guard. */
export function receiptIsHonest() {
  const r = receiptPreview();
  if (!r) return true;
  if (r.source !== 'verifykit' || r.nodeTrusted !== false) return false;
  if (r.network === 'local' && (r.l0Verified || String(r.assuranceLevel).toUpperCase().includes('L4'))) return false;
  return true;
}
