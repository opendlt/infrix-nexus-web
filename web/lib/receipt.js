// Nexus — Shareable Proof Receipt data + honest helpers (plan-12).
//
// Reads a live receipt context if one is served, falling back to the
// Go-generated fixture (built from pkg/launch.ExampleReceipt). The receipt is
// the shareable artifact: a page better than a block-explorer page because it
// states, in plain language, what was and was not verified, the command to
// verify it independently, the L0 anchor + witness status, the Cinema replay,
// the download bundle, and the embed widget. Assurance always comes from the
// verifier; the node is never trusted.

let _data = null;

/** setReceiptData injects the data (used by the no-browser smoke test). */
export function setReceiptData(obj) {
  _data = obj;
}

/** getReceiptData returns the loaded data. */
export function getReceiptData() {
  if (!_data) throw new Error('receipt: data not loaded — call loadReceipt() first');
  return _data;
}

/** loadReceipt fetches a live context if served, falling back to the fixture. */
export async function loadReceipt(liveUrl = '/v1/receipt/context', fixtureUrl = '/testdata/receipt.fixture.json') {
  try {
    const res = await fetch(liveUrl, { cache: 'no-cache' });
    if (res.ok) {
      _data = await res.json();
      _data._live = true;
      return _data;
    }
  } catch (_) {
    /* no live receipt endpoint — fall back to the fixture */
  }
  const res = await fetch(fixtureUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error('receipt: failed to load ' + fixtureUrl + ' (' + res.status + ')');
  _data = await res.json();
  _data._live = false;
  return _data;
}

export function isLive() { return !!getReceiptData()._live; }
export function receipt() { return getReceiptData().receipt || {}; }

/** receiptIsHonest mirrors the Go/SDK guard: assurance from the verifier, node
 *  never trusted, and a local receipt never claims L0/L4. */
export function receiptIsHonest() {
  const r = receipt();
  if (r.source !== 'verifykit' || r.nodeTrusted !== false) return false;
  if (r.network === 'local' && (r.l0Verified || String(r.assuranceLevel).toUpperCase().includes('L4'))) return false;
  return true;
}
