// Nexus — Prompt-to-Proof App Studio data + honest helpers (nextux-16).
//
// Reads a live app workspace context if one is served, falling back to the
// hand-authored fixture (a local run is not byte-deterministic, so the fixture
// is authored, never snapshotted). The browser mirrors the same honesty rails
// the CLI/SDK/agent uphold: assurance always comes from the verifier
// (source === 'verifykit'), the node is never trusted, a local run never reaches
// L4, and nothing targets mainnet.

let _data = null;

/** setAppData injects the data (used by the no-browser smoke test). */
export function setAppData(obj) {
  _data = obj;
}

/** getAppData returns the loaded data. */
export function getAppData() {
  if (!_data) throw new Error('app: data not loaded — call loadApp() first');
  return _data;
}

/** loadApp fetches a live app context if served, falling back to the fixture. */
export async function loadApp(liveUrl = '/v1/app/context', fixtureUrl = '/testdata/app.fixture.json') {
  try {
    const res = await fetch(liveUrl, { cache: 'no-cache' });
    if (res.ok) {
      _data = await res.json();
      _data._live = true;
      return _data;
    }
  } catch (_) {
    /* no live app endpoint — fall back to the fixture */
  }
  const res = await fetch(fixtureUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error('app: failed to load ' + fixtureUrl + ' (' + res.status + ')');
  _data = await res.json();
  _data._live = false;
  return _data;
}

export function isLive() { return !!getAppData()._live; }
export function prompt() { return getAppData().prompt || ''; }
export function flowTitle() { return getAppData().flowTitle || ''; }
export function nodes() { return getAppData().nodes || []; }
export function artifacts() { return getAppData().artifacts || []; }
export function latestRun() { return getAppData().run || null; }
export function assurance() { return getAppData().assurance || null; }
export function nextActions() { return getAppData().nextActions || []; }
export function shareLink() { return getAppData().shareLink || ''; }
export function pattern() {
  const d = getAppData();
  return d.pattern ? { id: d.pattern, title: d.patternTitle || d.pattern } : null;
}

/** assuranceIsHonest reports whether the displayed assurance respects the rails:
 *  it comes from the verifier and never trusts the node. Mirrors the Go/SDK guard
 *  so the browser never renders a verdict the verifier did not produce. */
export function assuranceIsHonest() {
  const a = assurance();
  if (!a) return true;
  return a.source === 'verifykit' && a.nodeTrusted === false;
}

/** localRunIsHonest reports whether a local run keeps its honest ceiling: it
 *  never claims L0 confirmation and never reaches L4. */
export function localRunIsHonest() {
  const r = latestRun();
  if (!r || r.network !== 'local') return true;
  return !r.l0Verified && String(r.proofLevel).toUpperCase() !== 'L4';
}

/** assuranceLabel returns the honest one-line label for the current run. */
export function assuranceLabel() {
  const a = assurance();
  if (!a) return 'Not run yet — run the app to produce a proof.';
  if (a.l0Verified) {
    return 'Fully verified — L0-confirmed on Kermit (' + a.proofLevel + '/' + a.governanceLevel + '). The node is never trusted.';
  }
  if (a.verified) {
    return 'Locally verified (' + a.proofLevel + '/' + a.governanceLevel + '). Live L0 not checked; the node is never trusted.';
  }
  return 'Not verified — the verifier did not confirm this run.';
}

/** deferred returns the requirements the latest run honestly did not verify. */
export function deferred() {
  const r = latestRun();
  return (r && r.deferred) || [];
}

/** whyItMatters returns the encouraging "what this is" copy. */
export function whyItMatters() {
  return 'Describe a verifiable app in plain language and Infrix builds the whole thing — the workflow, ' +
    'the policy, the SDK, and a real proof you can replay and verify without trusting the node. The prompt ' +
    'interpreter is grounded: it refuses rather than invent a capability. Assurance always comes from the ' +
    'verifier, local proof caps at L3 (L4 needs a live Kermit run), and nothing ever targets mainnet.';
}
