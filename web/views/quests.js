// Nexus — #/quests Proof Quest Mode (nextux-11).
//
// A high-quality interactive lab, not a marketing page: the progress trail, the
// mission list, an honest proof-receipt panel, a Cinema panel, a clear next
// action, a "show me why this matters" note, and expert details collapsed by
// default. Encouraging, direct, no lore. Every badge is tied to a real verifier
// verdict or a clearly labeled local learning step.

import { elt, setAttrs } from '/lib/uxDom.js';
import {
  loadQuests, isLive, trail, receipt, nextQuestId, counts, questById,
  missionStateWord, proofBadge, whyItMatters,
} from '/lib/quests.js';

function progressHeader() {
  const c = counts();
  const wrap = elt('section', 'quest-progress');
  setAttrs(wrap, { 'aria-label': 'Quest progress' });
  wrap.appendChild(elt('h2', 'quest-progress-title', `${c.completed} of ${c.total} quests complete`));
  const bar = elt('div', 'quest-progress-bar');
  setAttrs(bar, {
    role: 'progressbar', 'aria-label': `Quests complete: ${c.completed} of ${c.total}`,
    'aria-valuemin': '0', 'aria-valuemax': String(c.total), 'aria-valuenow': String(c.completed),
  });
  const fill = elt('div', 'quest-progress-fill');
  const pct = c.total ? Math.round((c.completed / c.total) * 100) : 0;
  fill.style.width = pct + '%';
  bar.appendChild(fill);
  wrap.appendChild(bar);
  const src = elt('p', 'quest-source');
  setAttrs(src, { 'data-live': String(isLive()) });
  src.textContent = isLive()
    ? 'Live quest progress connected.'
    : 'Showing a sample trail (run `infrix quest start first-proof` for your own).';
  wrap.appendChild(src);
  return wrap;
}

function trailPanel() {
  const panel = elt('section', 'quest-trail');
  setAttrs(panel, { 'aria-label': 'Mission list and progress trail' });
  panel.appendChild(elt('h3', 'quest-subtitle', 'Your missions'));
  for (const q of trail()) {
    panel.appendChild(questCard(q));
  }
  return panel;
}

function questCard(q) {
  const card = elt('article', 'quest-card');
  let state = 'available';
  if (q.completed) state = 'completed';
  else if (q.locked) state = 'locked';
  else if (q.started) state = 'started';
  setAttrs(card, { 'data-quest': q.id, 'data-state': state });

  const head = elt('header', 'quest-card-head');
  const mark = elt('span', 'quest-card-mark');
  mark.textContent = q.completed ? '●' : q.locked ? '🔒' : '○';
  setAttrs(mark, { 'aria-hidden': 'true' });
  head.appendChild(mark);
  head.appendChild(elt('h4', 'quest-card-title', q.title));
  const time = elt('span', 'quest-card-time', q.estimatedTime || '');
  head.appendChild(time);
  card.appendChild(head);

  card.appendChild(elt('p', 'quest-card-promise', q.promise));
  const meta = elt('p', 'quest-card-meta');
  meta.textContent = 'For ' + (q.persona || 'everyone');
  card.appendChild(meta);

  if (q.locked && q.lockReason) {
    const lock = elt('p', 'quest-card-lock');
    setAttrs(lock, { 'data-locked': 'true' });
    lock.textContent = q.lockReason;
    card.appendChild(lock);
  }

  const ml = elt('ul', 'quest-mission-list');
  for (const m of q.missions || []) {
    const li = elt('li', 'quest-mission');
    setAttrs(li, { 'data-completed': String(!!m.completed), 'data-learning': String(!!m.learning) });
    const dot = elt('span', 'quest-mission-dot', m.completed ? '✔' : '·');
    setAttrs(dot, { 'aria-hidden': 'true' });
    li.appendChild(dot);
    li.appendChild(elt('span', 'quest-mission-title', m.title));
    li.appendChild(elt('span', 'quest-mission-state', missionStateWord(m)));
    ml.appendChild(li);
  }
  card.appendChild(ml);
  return card;
}

function receiptPanel() {
  const rc = receipt();
  const panel = elt('section', 'quest-receipt');
  setAttrs(panel, { 'aria-label': 'Proof receipt' });
  panel.appendChild(elt('h3', 'quest-subtitle', 'Your progress receipt'));
  if (!rc) {
    panel.appendChild(elt('p', 'quest-receipt-empty', 'Complete a mission to earn your first progress receipt.'));
    return panel;
  }
  const badge = proofBadge(rc);
  const badgeEl = elt('span', 'quest-badge', badge.label);
  setAttrs(badgeEl, { 'data-tone': badge.tone, 'data-proof': String(badge.proof) });
  panel.appendChild(badgeEl);

  const dl = elt('dl', 'quest-receipt-grid');
  const row = (k, v) => { dl.appendChild(elt('dt', null, k)); dl.appendChild(elt('dd', 'mono', String(v))); };
  row('Quest', rc.questId);
  row('Mission', rc.missionId);
  row('Mode', rc.mode);
  if (rc.proof) {
    row('Verified', rc.proof.verified ? 'yes' : 'no');
    row('Proof level', rc.proof.proofLevel || '—');
    row('Trusts node', rc.proof.trustsNode ? 'yes' : 'no — verified without trusting the node');
    row('Live L0', rc.proof.l0Verified ? 'confirmed' : 'not checked (local)');
  } else {
    row('Type', 'local learning step (no proof claimed)');
  }
  panel.appendChild(dl);

  const honesty = elt('p', 'quest-receipt-honesty');
  honesty.textContent = rc.proof && !rc.proof.l0Verified
    ? 'This is an honest L3: cryptographically verified, no live L0 anchor. L4 is never claimed without a live L0 confirmation.'
    : 'This is a labeled local learning step — a real action, not a cryptographic proof.';
  if (rc.proof && rc.proof.l0Verified) honesty.textContent = 'Confirmed against a live L0 anchor.';
  panel.appendChild(honesty);
  return panel;
}

function cinemaPanel() {
  const rc = receipt();
  const panel = elt('section', 'quest-cinema');
  setAttrs(panel, { 'aria-label': 'Cinema replay' });
  panel.appendChild(elt('h3', 'quest-subtitle', 'Watch it in Cinema'));
  const replayed = !!(rc && rc.proof && rc.proof.replayVerified);
  const p = elt('p', 'quest-cinema-state');
  setAttrs(p, { 'data-replayed': String(replayed) });
  p.textContent = replayed
    ? 'The recorded run was independently reproduced via its replay capsule.'
    : 'Run the cinema-replay quest to reproduce your run and scrub the timeline.';
  panel.appendChild(p);
  const link = elt('a', 'quest-cinema-link', 'Open the proof viewer');
  setAttrs(link, { href: '#/prove' });
  panel.appendChild(link);
  return panel;
}

function nextActionPanel() {
  const panel = elt('section', 'quest-next');
  setAttrs(panel, { 'aria-label': 'Next action' });
  const next = nextQuestId();
  if (!next) {
    panel.appendChild(elt('p', 'quest-next-done', '🎉 Every quest is complete.'));
    return panel;
  }
  const q = questById(next);
  panel.appendChild(elt('h3', 'quest-subtitle', 'Your next quest'));
  panel.appendChild(elt('p', 'quest-next-title', q ? q.title : next));
  const btn = elt('button', 'quest-next-btn', 'Start: ' + (q ? q.title : next));
  setAttrs(btn, { type: 'button', 'data-next': next });
  const cmd = elt('p', 'quest-next-cmd mono', 'infrix quest start ' + next);
  btn.addEventListener('click', () => { cmd.setAttribute('data-revealed', 'true'); });
  panel.appendChild(btn);
  panel.appendChild(cmd);
  return panel;
}

function whyPanel() {
  const panel = elt('details', 'quest-why');
  const summary = elt('summary', 'quest-why-summary', 'Show me why this matters');
  panel.appendChild(summary);
  panel.appendChild(elt('p', 'quest-why-body', whyItMatters()));
  return panel;
}

function expertPanel() {
  const rc = receipt();
  const panel = elt('details', 'quest-expert');
  panel.appendChild(elt('summary', 'quest-expert-summary', 'Expert details'));
  const body = elt('div', 'quest-expert-body');
  if (rc) {
    const dl = elt('dl', 'quest-expert-grid');
    const row = (k, v) => { dl.appendChild(elt('dt', null, k)); dl.appendChild(elt('dd', 'mono', String(v))); };
    row('Receipt hash', rc.receiptHash || '—');
    row('Schema version', rc.version);
    for (const a of rc.artifacts || []) {
      row(a.kind, a.path + '  (' + a.hash + ')');
    }
    body.appendChild(dl);
  } else {
    body.appendChild(elt('p', null, 'Run a quest to see the receipt hash and artifact bindings.'));
  }
  panel.appendChild(body);
  return panel;
}

function populate(body) {
  body.appendChild(progressHeader());
  const grid = elt('div', 'quest-grid-layout');
  grid.appendChild(trailPanel());
  const side = elt('div', 'quest-side');
  side.appendChild(receiptPanel());
  side.appendChild(cinemaPanel());
  side.appendChild(nextActionPanel());
  grid.appendChild(side);
  body.appendChild(grid);
  body.appendChild(whyPanel());
  body.appendChild(expertPanel());
}

export const questsView = {
  async mount(root) {
    root.replaceChildren();
    const shell = elt('div', 'workspace quests-view');
    const header = elt('header', 'workspace-header');
    header.appendChild(setAttrs(elt('h1', 'workspace-title', 'Quests'), { id: 'quests-title' }));
    header.appendChild(elt('p', 'workspace-subtitle',
      'Learn Infrix by doing: short missions that produce a real proof and verify it — no node trust, no fake badges, never mainnet.'));
    shell.appendChild(header);
    const body = elt('div', 'quests-body');
    body.appendChild(elt('p', 'quests-loading', 'Loading your quests…'));
    shell.appendChild(body);
    root.appendChild(shell);

    try {
      await loadQuests();
      body.replaceChildren();
      populate(body);
    } catch (err) {
      body.replaceChildren();
      const msg = elt('div', 'quests-error');
      msg.setAttribute('role', 'alert');
      msg.appendChild(elt('strong', null, 'Could not load the quests.'));
      msg.appendChild(elt('p', null, String((err && err.message) || err)));
      body.appendChild(msg);
    }
  },
};
