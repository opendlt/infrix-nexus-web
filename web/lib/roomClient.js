// Nexus — Multiplayer Demo Room client + honest helpers (nextux-14).
//
// Reads the Go-generated room fixture (a room summary, the role policies, the
// shared replay, and the event log) and exposes the same honest, read-only view
// the CLI, SDK, and agent see. The browser never asserts a proof: the room's
// assurance is exactly the verifier's verdict, and the role guards (a viewer
// never approves, an undelegated agent never approves, a private payload is
// hidden from unauthorized roles) are mirrored here for the UX.

let _data = null;

/** setRoomData injects the data (used by the no-browser smoke test). */
export function setRoomData(obj) {
  _data = obj;
}

/** getRoomData returns the loaded data. */
export function getRoomData() {
  if (!_data) throw new Error('rooms: data not loaded — call loadRoom() first');
  return _data;
}

/** loadRoom fetches a live room context for a room id if served, falling back to
 *  the deterministic fixture. */
export async function loadRoom(roomId, liveUrl, fixtureUrl = '/testdata/room.fixture.json') {
  const live = liveUrl || ('/v1/rooms/' + encodeURIComponent(roomId || ''));
  try {
    const res = await fetch(live, { cache: 'no-cache' });
    if (res.ok) {
      _data = await res.json();
      _data._live = true;
      return _data;
    }
  } catch (_) {
    /* no live room endpoint — fall back to the fixture */
  }
  const res = await fetch(fixtureUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error('rooms: failed to load ' + fixtureUrl + ' (' + res.status + ')');
  _data = await res.json();
  _data._live = false;
  return _data;
}

export function isLive() { return !!getRoomData()._live; }
export function room() { return getRoomData().room || null; }
export function roomList() { return getRoomData().rooms || []; }
export function roles() { return getRoomData().roles || []; }
export function replay() { return getRoomData().replay || null; }
export function events() {
  const rp = replay();
  return (rp && rp.events) || [];
}
export function participants() {
  const r = room();
  return (r && r.participants) || [];
}
export function requiredApprovals() {
  const r = room();
  return (r && r.requiredApprovals) || [];
}
export function stateLabel() {
  const r = room();
  return (r && r.stateLabel) || '';
}

/** roleByName returns a role policy by its role key. */
export function roleByName(name) {
  return roles().find((p) => p.role === name) || null;
}

/** canSeePrivatePayload reports whether a role may see the private payload — the
 *  data only the scenario's disclosure policy authorizes. */
export function canSeePrivatePayload(roleName) {
  const p = roleByName(roleName);
  return !!(p && (p.visibleData || []).includes('private_payload'));
}

/** replayBoundToLog reports whether the shared replay binds to the event-log
 *  head (the last event's hash). This is the browser echo of the Go binding. */
export function replayBoundToLog() {
  const rp = replay();
  const evs = events();
  if (!rp || evs.length === 0) return false;
  return rp.eventLogHash === evs[evs.length - 1].hash && rp.eventCount === evs.length;
}

/** proofIsHonest reports whether the room's reported proof respects the honesty
 *  rails: a local room never claims L4, never claims live L0, and never trusts
 *  the node. */
export function proofIsHonest() {
  const r = room();
  if (!r || !r.proof) return true;
  const a = r.proof.assurance || {};
  if (/l4/i.test(a.proofLevel || '')) return false;
  if (a.l0Verified) return false;
  if (a.trustsInfrixNode) return false;
  return true;
}

/** whyItMatters returns the encouraging "why this matters" copy. */
export function whyItMatters() {
  return 'A demo room lets people and AI agents take roles and participate together — and the ' +
    'guards are real, not theatre: no one can act outside their role, a viewer can never approve, ' +
    'an AI agent can never approve without an explicit delegated signing session, the private ' +
    'payload is never shown to an unauthorized role, no room is ever on mainnet by default, and ' +
    'the shared proof claim never exceeds what the verifier actually confirmed.';
}
