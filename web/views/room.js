// Nexus — #/rooms and #/rooms/<room-id> Multiplayer Demo Rooms (nextux-14).
//
// A collaborative demo surface: the participants and their roles, the current
// step with a large friendly state label, the required approvals, the
// role-specific capability panel, the shared replay (bound to the event log),
// the proof receipt (assurance straight from the verifier), the chat/comments,
// and the trust boundary. Honest by construction: a local room never claims L4,
// the node is never trusted, the private payload is hidden from unauthorized
// roles, and the shared proof claim never exceeds the verifier's verdict.

import { elt, setAttrs } from '/lib/uxDom.js';
import {
  loadRoom, isLive, room, roomList, roles, replay, events, participants,
  requiredApprovals, stateLabel, canSeePrivatePayload, replayBoundToLog,
  proofIsHonest, whyItMatters,
} from '/lib/roomClient.js';

let rootEl = null;
let currentRoomId = null;

function launcher() {
  const wrap = elt('section', 'room-launcher');
  setAttrs(wrap, { 'aria-label': 'Open a demo room' });
  wrap.appendChild(elt('h2', 'room-subtitle', 'Demo rooms'));
  wrap.appendChild(elt('p', 'room-launcher-hint',
    'Open a room to take a role, approve, witness, review proof, and watch a shared replay together.'));
  const list = elt('ul', 'room-list');
  for (const r of roomList()) {
    const li = elt('li', 'room-list-item');
    const a = elt('a', 'room-list-link', r.title + ' — ' + r.stateLabel);
    setAttrs(a, { href: '#/rooms/' + encodeURIComponent(r.roomId), 'data-room': r.roomId });
    li.appendChild(a);
    li.appendChild(elt('span', 'room-list-meta', ' ' + r.scenarioId + ' · ' + r.mode));
    list.appendChild(li);
  }
  wrap.appendChild(list);
  return wrap;
}

function statePanel() {
  const r = room();
  const panel = elt('section', 'room-state');
  setAttrs(panel, { 'aria-label': 'Current state' });
  const label = elt('h2', 'room-state-label', stateLabel());
  setAttrs(label, { 'aria-live': 'polite' });
  panel.appendChild(label);
  panel.appendChild(elt('p', 'room-state-meta',
    r.scenarioId + ' · ' + r.mode + ' · ' + r.network + (isLive() ? ' · live' : ' · sample')));
  panel.appendChild(elt('p', 'room-promise', r.promise || ''));
  return panel;
}

function participantsPanel() {
  const panel = elt('section', 'room-participants');
  setAttrs(panel, { 'aria-label': 'Participants' });
  panel.appendChild(elt('h3', 'room-subtitle', 'Participants'));
  const ul = elt('ul', 'room-participant-list');
  for (const p of participants()) {
    const li = elt('li', 'room-participant');
    setAttrs(li, { 'data-role': p.role });
    li.appendChild(elt('span', 'room-participant-name', p.name));
    li.appendChild(elt('span', 'room-participant-role', p.roleLabel));
    if (p.isAgent) {
      const tag = elt('span', 'room-participant-agent', p.delegated ? 'agent · delegated' : 'agent');
      setAttrs(tag, { 'data-delegated': String(p.delegated) });
      li.appendChild(tag);
    }
    const approve = elt('span', 'room-participant-approve', p.canApprove ? 'can approve' : 'cannot approve');
    setAttrs(approve, { 'data-can-approve': String(p.canApprove) });
    li.appendChild(approve);
    ul.appendChild(li);
  }
  panel.appendChild(ul);
  return panel;
}

function approvalsPanel() {
  const panel = elt('section', 'room-approvals');
  setAttrs(panel, { 'aria-label': 'Required approvals' });
  panel.appendChild(elt('h3', 'room-subtitle', 'Required approvals'));
  const ul = elt('ul', 'room-approval-list');
  for (const ra of requiredApprovals()) {
    const li = elt('li', 'room-approval');
    setAttrs(li, { 'data-satisfied': String(!!ra.satisfied) });
    li.appendChild(elt('span', 'room-approval-mark', ra.satisfied ? '✔' : '○'));
    li.appendChild(elt('span', 'room-approval-label', ra.label));
    ul.appendChild(li);
  }
  panel.appendChild(ul);
  return panel;
}

function rolesPanel() {
  const panel = elt('section', 'room-roles');
  setAttrs(panel, { 'aria-label': 'Roles and capabilities' });
  panel.appendChild(elt('h3', 'room-subtitle', 'Roles'));
  const table = elt('table', 'room-role-table');
  const head = elt('tr', 'room-role-head');
  for (const h of ['Role', 'Approve', 'Comment', 'Sees private payload']) {
    head.appendChild(elt('th', null, h));
  }
  table.appendChild(head);
  for (const p of roles()) {
    const tr = elt('tr', 'room-role-row');
    setAttrs(tr, { 'data-role': p.role });
    tr.appendChild(elt('td', 'room-role-name', p.label));
    tr.appendChild(yesNo(p.canApprove));
    tr.appendChild(yesNo(p.canComment));
    tr.appendChild(yesNo((p.visibleData || []).includes('private_payload')));
    table.appendChild(tr);
  }
  panel.appendChild(table);
  return panel;
}

function yesNo(v) {
  const td = elt('td', 'room-role-cap', v ? 'yes' : 'no');
  setAttrs(td, { 'data-yes': String(!!v) });
  return td;
}

function replayPanel() {
  const rp = replay();
  const panel = elt('section', 'room-replay');
  setAttrs(panel, { 'aria-label': 'Shared replay' });
  panel.appendChild(elt('h3', 'room-subtitle', 'Shared replay (Cinema)'));
  if (!rp) {
    panel.appendChild(elt('p', null, 'No replay available.'));
    return panel;
  }
  const bound = replayBoundToLog();
  const badge = elt('span', 'room-replay-bound', bound ? 'bound to the event log' : 'not bound');
  setAttrs(badge, { 'data-bound': String(bound) });
  panel.appendChild(badge);
  panel.appendChild(elt('p', 'room-replay-binding mono', 'event log: ' + shortHash(rp.eventLogHash)));
  panel.appendChild(elt('p', 'room-replay-cinema mono', 'cinema: ' + shortHash(rp.cinemaBinding)));

  const ol = elt('ol', 'room-event-log');
  setAttrs(ol, { 'aria-label': 'Event log' });
  for (const e of events()) {
    const li = elt('li', 'room-event');
    setAttrs(li, { 'data-action': e.action });
    li.appendChild(elt('span', 'room-event-actor', e.actor));
    li.appendChild(elt('span', 'room-event-role', String(e.role)));
    li.appendChild(elt('span', 'room-event-action', e.action));
    ol.appendChild(li);
  }
  panel.appendChild(ol);
  return panel;
}

function proofPanel() {
  const r = room();
  const panel = elt('section', 'room-proof');
  setAttrs(panel, { 'aria-label': 'Proof receipt' });
  panel.appendChild(elt('h3', 'room-subtitle', 'Proof'));
  if (!r.proof) {
    panel.appendChild(elt('p', null, 'No proof yet.'));
    return panel;
  }
  const a = r.proof.assurance || {};
  const badge = elt('span', 'room-proof-badge',
    (a.proofLevel || '?') + '/' + (a.governanceLevel || '?') + (a.verified ? ' · verified' : ' · partial'));
  setAttrs(badge, { 'data-verified': String(!!a.verified), 'data-honest': String(proofIsHonest()) });
  panel.appendChild(badge);
  const dl = elt('dl', 'room-proof-grid');
  const row = (k, v) => { dl.appendChild(elt('dt', null, k)); dl.appendChild(elt('dd', 'mono', String(v))); };
  row('Proof level', a.proofLevel);
  row('Trusts node', a.trustsInfrixNode ? 'yes' : 'no — verified without trusting the node');
  row('Live L0', a.l0Verified ? 'yes' : 'no — not confirmed live');
  row('Replay', a.replayVerified ? 'matched' : 'not verified');
  panel.appendChild(dl);
  panel.appendChild(elt('p', 'room-proof-note',
    a.l0Verified ? 'Confirmed live on Accumulate L0.' : 'Verified locally; L4 is not claimed without a live L0 confirmation.'));
  return panel;
}

function trustPanel() {
  const r = room();
  const panel = elt('section', 'room-trust');
  setAttrs(panel, { 'aria-label': 'Trust boundary' });
  panel.appendChild(elt('h3', 'room-subtitle', 'Trust boundary'));
  panel.appendChild(elt('p', 'room-trust-body',
    'The producing node is never trusted — the proof is re-verified from its own bytes. The private ' +
    'payload (' + (r.privateScopes || []).join(', ') + ') is visible only to the roles the disclosure ' +
    'policy authorizes: ' + privateViewers().join(', ') + '.'));
  return panel;
}

function privateViewers() {
  return roles().filter((p) => (p.visibleData || []).includes('private_payload')).map((p) => p.label);
}

function chatPanel() {
  const panel = elt('section', 'room-chat');
  setAttrs(panel, { 'aria-label': 'Chat and comments' });
  panel.appendChild(elt('h3', 'room-subtitle', 'Chat'));
  const evs = events().filter((e) => e.action === 'room.comment');
  if (evs.length === 0) {
    panel.appendChild(elt('p', 'room-chat-empty', 'No comments yet.'));
    return panel;
  }
  const ul = elt('ul', 'room-chat-list');
  for (const e of evs) {
    const li = elt('li', 'room-chat-msg');
    li.appendChild(elt('span', 'room-chat-author', e.actor + ' (' + e.role + ')'));
    li.appendChild(elt('span', 'room-chat-body', e.detail || ''));
    ul.appendChild(li);
  }
  panel.appendChild(ul);
  return panel;
}

function whyPanel() {
  const panel = elt('details', 'room-why');
  panel.appendChild(elt('summary', 'room-why-summary', 'Show me why this matters'));
  panel.appendChild(elt('p', 'room-why-body', whyItMatters()));
  return panel;
}

function expertPanel() {
  const r = room();
  const panel = elt('details', 'room-expert');
  panel.appendChild(elt('summary', 'room-expert-summary', 'Expert details'));
  const dl = elt('dl', 'room-expert-grid');
  const row = (k, v) => { dl.appendChild(elt('dt', null, k)); dl.appendChild(elt('dd', 'mono', String(v))); };
  row('Room id', r.roomId);
  row('Private payload hidden from witness', String(!canSeePrivatePayload('witness')));
  row('Private payload visible to regulator', String(canSeePrivatePayload('regulator')));
  if (r.proof) row('Story', r.proof.storyRef);
  panel.appendChild(dl);
  return panel;
}

function renderRoom(body) {
  body.replaceChildren();
  body.appendChild(statePanel());
  const grid = elt('div', 'room-grid-layout');
  const left = elt('div', 'room-col');
  left.appendChild(participantsPanel());
  left.appendChild(approvalsPanel());
  left.appendChild(rolesPanel());
  const right = elt('div', 'room-col');
  right.appendChild(proofPanel());
  right.appendChild(replayPanel());
  right.appendChild(chatPanel());
  grid.appendChild(left);
  grid.appendChild(right);
  body.appendChild(grid);
  body.appendChild(trustPanel());
  body.appendChild(whyPanel());
  body.appendChild(expertPanel());
}

async function render() {
  if (!rootEl) return;
  rootEl.replaceChildren();
  const shell = elt('div', 'workspace room-view');
  const header = elt('header', 'workspace-header');
  header.appendChild(setAttrs(elt('h1', 'workspace-title', 'Demo room'), { id: 'room-title' }));
  header.appendChild(elt('p', 'workspace-subtitle',
    'Take a role and participate together: approve, witness, review proof, and watch a shared replay. The guards are real and the proof never exceeds the verifier.'));
  shell.appendChild(header);
  const body = elt('div', 'room-body');
  body.appendChild(elt('p', 'room-loading', 'Loading the room…'));
  shell.appendChild(body);
  rootEl.appendChild(shell);

  try {
    await loadRoom(currentRoomId);
    if (!currentRoomId) {
      body.replaceChildren();
      body.appendChild(launcher());
      return;
    }
    renderRoom(body);
  } catch (err) {
    body.replaceChildren();
    const msg = elt('div', 'room-error');
    msg.setAttribute('role', 'alert');
    msg.appendChild(elt('strong', null, 'Could not load the room.'));
    msg.appendChild(elt('p', null, String((err && err.message) || err)));
    body.appendChild(msg);
  }
}

function shortHash(h) {
  if (!h) return '(none)';
  const s = String(h).replace(/^sha256:/, '');
  return s.length > 12 ? s.slice(0, 12) : s;
}

export const roomsView = {
  async mount(root, subpath) {
    rootEl = root;
    currentRoomId = (subpath && subpath[0]) || null;
    await render();
  },
  async onSubpathChange(subpath) {
    const next = (subpath && subpath[0]) || null;
    if (next === currentRoomId) return;
    currentRoomId = next;
    await render();
  },
  unmount() {
    rootEl = null;
  },
};
