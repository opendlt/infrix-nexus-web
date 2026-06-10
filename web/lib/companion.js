// Nexus — Zero-Context Local Companion browser twin (nextux-10).
//
// It reads the companion context (the live /v1/companion/context when a
// companion server is running, otherwise the deterministic fixture) and exposes
// the same honest, read-only view the CLI + agent see: the workspace + git
// state, the recent artifacts (safe metadata only), and the next-best-action
// suggestions. The browser never indexes anything and never runs a command.

let _data = null;

/** setCompanionData injects the context (used by the no-browser smoke test). */
export function setCompanionData(obj) {
  _data = obj;
}

/** getCompanionData returns the loaded context. */
export function getCompanionData() {
  if (!_data) throw new Error('companion: data not loaded — call loadCompanion() first');
  return _data;
}

/** loadCompanion fetches the live companion context, falling back to the
 *  deterministic fixture when no companion server is running. */
export async function loadCompanion(liveUrl = '/v1/companion/context', fixtureUrl = '/testdata/companion.fixture.json') {
  try {
    const res = await fetch(liveUrl, { cache: 'no-cache' });
    if (res.ok) {
      _data = await res.json();
      _data._live = true;
      return _data;
    }
  } catch (_) {
    /* no companion server — fall back to the fixture */
  }
  const res = await fetch(fixtureUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error('companion: failed to load ' + fixtureUrl + ' (' + res.status + ')');
  _data = await res.json();
  _data._live = false;
  return _data;
}

export function workspace() { return getCompanionData().workspace || ''; }
export function branch() { return getCompanionData().branch || ''; }
export function dirty() { return !!getCompanionData().dirty; }
export function isLive() { return !!getCompanionData()._live; }
export function artifacts() { return getCompanionData().recentArtifacts || []; }
export function suggestions() { return getCompanionData().suggestions || []; }
export function allowedActions() { return getCompanionData().allowedActions || []; }

/** statusWords maps a verification status to friendly language. */
export function statusWords(status) {
  switch (status) {
    case 'verified': return 'verified';
    case 'failed': return 'failed verification';
    case 'n/a': return '—';
    default: return 'not verified yet';
  }
}

/** verifiedCount / unverifiedCount summarize the index honestly. */
export function counts() {
  let verified = 0, unverified = 0, failed = 0;
  for (const a of artifacts()) {
    if (a.verificationStatus === 'verified') verified++;
    else if (a.verificationStatus === 'failed') failed++;
    else if (a.verificationStatus !== 'n/a') unverified++;
  }
  return { verified, unverified, failed, total: artifacts().length };
}

/** resumeLine returns the friendly "You were working on…" line. */
export function resumeLine() {
  const arts = artifacts();
  if (!arts.length) return 'No recent Infrix artifacts in this workspace yet.';
  const latest = arts[0];
  return 'You were working on ' + latest.path + ' (' + statusWords(latest.verificationStatus) + ').';
}
