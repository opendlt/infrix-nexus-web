// Cinema-Inbox-Time E2C5 — comment thread component.
//
// Mountable on any intent screen (approve dossier, spine narrative,
// execute cinema, prove). Renders TypeIntentNote rows for the intent
// in chronological order + a composer at the bottom that supports
// @-mentions (acc:// URL fragments are auto-detected on submit).
//
// API:
//   mountCommentThread(host, { intentId, pollMs = 0 }) → { destroy }
//
// Auto-polls nexus.noteList every pollMs while the host is in the DOM
// (0 = no polling — fetch once on mount + after each successful add).

import { rpcWithDisclosure, formatTime, shortHash } from '/lib/spineCommon.js';

const MENTION_RE = /(@acc:\/\/[A-Za-z0-9._\-/]+)/g;

export function mountCommentThread(host, { intentId, pollMs = 0 } = {}) {
  if (!host || !intentId) return { destroy() {} };
  host.replaceChildren();
  host.classList.add('comment-thread');

  const header = document.createElement('div');
  header.className = 'comment-thread-header';
  header.textContent = 'Discussion';
  host.appendChild(header);

  const list = document.createElement('ul');
  list.className = 'comment-thread-list';
  host.appendChild(list);

  const composer = document.createElement('div');
  composer.className = 'comment-thread-composer';
  host.appendChild(composer);

  const ta = document.createElement('textarea');
  ta.className = 'comment-thread-input';
  ta.rows = 2;
  ta.placeholder = 'Comment or @acc://… mention …';
  composer.appendChild(ta);

  const mentionsPreview = document.createElement('div');
  mentionsPreview.className = 'comment-thread-mentions';
  composer.appendChild(mentionsPreview);

  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'comment-thread-submit';
  submit.textContent = 'Post';
  composer.appendChild(submit);

  function previewMentions() {
    const ms = ta.value.match(MENTION_RE) || [];
    if (ms.length === 0) {
      mentionsPreview.textContent = '';
      return;
    }
    mentionsPreview.replaceChildren(
      ...['Will notify:', ...ms.map((m) => m.slice(1))].map((s) => {
        const span = document.createElement('span');
        span.className = 'comment-thread-mention-chip';
        span.textContent = s;
        return span;
      })
    );
  }
  ta.addEventListener('input', previewMentions);

  async function post() {
    const body = ta.value.trim();
    if (!body) return;
    submit.disabled = true;
    try {
      await rpcWithDisclosure('nexus.noteAdd', { intentId, body });
      ta.value = '';
      previewMentions();
      await refresh();
    } catch (e) {
      const err = document.createElement('div');
      err.className = 'comment-thread-error';
      err.textContent = 'Post failed: ' + (e && e.message ? e.message : e);
      composer.appendChild(err);
      setTimeout(() => err.remove(), 3000);
    } finally {
      submit.disabled = false;
    }
  }
  submit.addEventListener('click', post);
  ta.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      post();
      e.preventDefault();
    }
  });

  async function refresh() {
    try {
      const resp = await rpcWithDisclosure('nexus.noteList', { intentId });
      const notes = (resp && resp.notes) || [];
      list.replaceChildren();
      if (notes.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'comment-thread-empty';
        empty.textContent = 'No comments yet. Start the discussion.';
        list.appendChild(empty);
        return;
      }
      for (const n of notes) {
        list.appendChild(buildNoteRow(n));
      }
    } catch (e) {
      list.replaceChildren();
      const errEl = document.createElement('li');
      errEl.className = 'comment-thread-error';
      errEl.textContent = 'Could not load comments: ' + (e && e.message ? e.message : e);
      list.appendChild(errEl);
    }
  }

  let timer = null;
  if (pollMs > 0) {
    timer = setInterval(() => {
      if (host.isConnected && document.visibilityState === 'visible') refresh();
    }, pollMs);
  }

  refresh();

  return {
    destroy() {
      if (timer) clearInterval(timer);
      timer = null;
      host.replaceChildren();
      host.classList.remove('comment-thread');
    },
  };
}

function buildNoteRow(n) {
  const li = document.createElement('li');
  li.className = 'comment-thread-row';
  if (n.kind && n.kind !== 'comment') li.classList.add('is-' + n.kind);

  const head = document.createElement('div');
  head.className = 'comment-thread-row-head';
  const author = document.createElement('span');
  author.className = 'comment-thread-author mono';
  author.textContent = n.author || '?';
  head.appendChild(author);
  if (n.kind && n.kind !== 'comment') {
    const kind = document.createElement('span');
    kind.className = 'comment-thread-kind';
    kind.textContent = n.kind;
    head.appendChild(kind);
  }
  const time = document.createElement('time');
  time.className = 'comment-thread-time';
  time.textContent = formatTime(n.createdAt || '');
  head.appendChild(time);
  li.appendChild(head);

  const body = document.createElement('div');
  body.className = 'comment-thread-body';
  body.textContent = n.body || '';
  li.appendChild(body);

  if (Array.isArray(n.mentions) && n.mentions.length > 0) {
    const m = document.createElement('div');
    m.className = 'comment-thread-row-mentions';
    for (const u of n.mentions) {
      const chip = document.createElement('span');
      chip.className = 'comment-thread-mention-chip';
      chip.textContent = u;
      m.appendChild(chip);
    }
    li.appendChild(m);
  }

  if (n.relatedApprovalId) {
    const link = document.createElement('a');
    link.className = 'comment-thread-row-link';
    link.href = '#/approve/' + encodeURIComponent(n.relatedApprovalId);
    link.textContent = 'bound to approval ' + shortHash(n.relatedApprovalId);
    li.appendChild(link);
  }

  return li;
}
