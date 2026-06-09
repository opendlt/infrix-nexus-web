// Nexus — Wallet & Identity Control Center browser twin (nextux-08).
//
// It reads the Go-generated identity status fixture and exposes the same honest
// view plus a plain-language signature explainer that mirrors
// pkg/identityux.ExplainSignature — so the browser can tell a user exactly what
// a queued signature will do before they sign. The browser never holds a private
// key and never shows a "connected" state the data does not back.

let _data = null;

/** setIdentityData injects the status (used by the no-browser smoke test). */
export function setIdentityData(obj) {
  _data = obj;
}

/** getIdentityData returns the loaded status. */
export function getIdentityData() {
  if (!_data) throw new Error('identity: data not loaded — call loadIdentity() first');
  return _data;
}

/** loadIdentity fetches the identity status fixture. */
export async function loadIdentity(url = '/testdata/identity.fixture.json') {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error('identity: failed to load ' + url + ' (' + res.status + ')');
  _data = await res.json();
  return _data;
}

export function wallet() { return getIdentityData().wallet || { connected: false }; }
export function accumulate() { return getIdentityData().accumulate || null; }
export function sessions() { return getIdentityData().sessions || []; }
export function permissions() { return getIdentityData().permissions || []; }
export function signatureQueue() { return getIdentityData().signatureQueue || []; }
export function history() { return getIdentityData().history || []; }
export function warnings() { return getIdentityData().warnings || []; }

/** isConnected reports an honest connected state: true ONLY when the data backs
 *  it with a signed proof (verifiedAt) or a live provider. */
export function isConnected(w) {
  const wal = w || wallet();
  return !!(wal.connected && (wal.verifiedAt || wal.liveProvider));
}

const VALUE_MOVING_GOALS = new Set([
  'SEND_TOKENS', 'ADD_CREDITS', 'CONVERT', 'SWAP', 'STAKE', 'BRIDGE',
  'BORROW', 'PROVIDE_LIQUIDITY', 'EARN_YIELD', 'COMPOUND',
]);

function rootIdentity(keyPageURL) {
  // acc://alice.acme/book/1 -> acc://alice.acme
  const m = /^(acc:\/\/[^/]+)/.exec(String(keyPageURL || ''));
  return m ? m[1] : String(keyPageURL || '');
}

function humanGoal(goal, custom) {
  const map = {
    SEND_TOKENS: 'Send tokens', ADD_CREDITS: 'Add credits', WRITE_DATA: 'Write data',
    CONTRACT_CALL: 'Call a contract', CONTRACT_DEPLOY: 'Deploy a contract',
    OBJECT_CREATE: 'Create a governed object', OBJECT_MUTATE: 'Change a governed object',
    SWAP: 'Swap assets',
  };
  const up = String(goal || '').toUpperCase();
  if (map[up]) return map[up];
  if (up === 'CUSTOM') return custom ? 'Custom: ' + custom : 'Custom operation';
  const label = String(goal || '').toLowerCase().replace(/_/g, ' ');
  return label ? label[0].toUpperCase() + label.slice(1) : 'Operation';
}

function expectedProof(network) {
  const n = String(network || '').toLowerCase();
  if (n === 'local' || n === '') return 'L3 offline proof (no L0 anchor)';
  if (n === 'mainnet') return 'L4 mainnet-anchored proof';
  return 'L4 proof anchored to ' + network;
}

/** explainSignature mirrors pkg/identityux.ExplainSignature. It fails closed
 *  (returns {error}) for a request it cannot explain — never a blank prompt. */
export function explainSignature(req) {
  const goal = String((req && req.goalType) || '').trim();
  if (!goal) return { error: 'cannot explain a signature with no goalType' };
  if (!String((req && req.signer) || '').trim()) return { error: 'cannot explain a signature with no signer key page' };
  const network = String((req && req.network) || '').trim();
  if (!network) return { error: 'cannot explain a signature with no network' };

  const source = req.sourceAssets || [];
  const target = req.targetAssets || [];
  const movesFunds = source.length > 0 || target.length > 0 || VALUE_MOVING_GOALS.has(goal.toUpperCase());
  const disclosesData = !!req.disclosesData || goal.toUpperCase() === 'WRITE_DATA';

  const irreversible = [];
  if (network.toLowerCase() !== 'local') irreversible.push('writes a real transaction to ' + network + ' (cannot be un-written)');
  if (movesFunds) irreversible.push('moves value — once anchored it cannot be reversed');
  if (irreversible.length === 0) irreversible.push('none — this produces an offline proof and writes no network state');

  const warns = [];
  if (network.toLowerCase() === 'mainnet') warns.push('this signs a MAINNET transaction — funds are real');
  if (req.agentInitiated) warns.push('an AI agent initiated this request — confirm you intended it');
  if (movesFunds && network.toLowerCase() !== 'local') warns.push('this moves funds/credits on a live network');

  return {
    action: (req.action && String(req.action).trim()) || humanGoal(goal, req.customType),
    network,
    identityTouched: rootIdentity(req.signer),
    requiredKeyPage: req.signer + (req.signerVersion ? ' (version ' + req.signerVersion + ')' : ''),
    fundsOrCreditsMove: movesFunds,
    dataDisclosed: disclosesData,
    agentInitiated: !!req.agentInitiated,
    expectedProof: expectedProof(network),
    irreversibleEffects: irreversible,
    warnings: warns,
  };
}

/** statusLabel returns a plain "You are connected as ..." style header. */
export function connectionLabel(w) {
  const wal = w || wallet();
  if (!isConnected(wal)) return 'No wallet connected';
  return 'You are connected as ' + (wal.address || 'unknown');
}
