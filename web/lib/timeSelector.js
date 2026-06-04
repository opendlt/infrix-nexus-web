// Cinema-Inbox-Time E3C5 — header time-selector + non-live banner.
//
// The user-visible side of the at-coordinate. Sits in the header next
// to the disclosure chip. Two pieces:
//
//   mountTimeSelector(host) — small dropdown control: Live / Block / Time
//                              with an input field for the chosen kind
//                              and an "Apply" button.
//   mountTimeBanner()       — a fixed banner pinned below the header
//                              that warns the user when reads are
//                              anchored to the past + offers a one-click
//                              "Back to live" button.
//
// Both subscribe to lib/timeContext.js onAtChange so they stay in
// sync regardless of how the coordinate was changed (header, URL
// edit, browser back/forward).

import { getAt, setAt, onAtChange, isAtLive } from '/lib/timeContext.js';

// =================================================================
// Header dropdown
// =================================================================
export function mountTimeSelector(host) {
  if (!host) return { destroy() {} };
  host.replaceChildren();
  host.classList.add('time-selector');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'time-selector-button';
  button.title = 'Time-travel cursor — view the spine as it stood at a past block or timestamp';
  host.appendChild(button);

  const panel = document.createElement('div');
  panel.className = 'time-selector-panel';
  panel.hidden = true;
  host.appendChild(panel);

  // Kind picker
  const kindRow = document.createElement('div');
  kindRow.className = 'time-selector-row';
  for (const k of ['live', 'block', 'time']) {
    const r = document.createElement('label');
    r.className = 'time-selector-kind';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'time-selector-kind';
    input.value = k;
    if (k === currentKind()) input.checked = true;
    input.addEventListener('change', () => {
      // Switching kinds re-renders the input row.
      renderInputRow(k);
    });
    const span = document.createElement('span');
    span.textContent = k;
    r.appendChild(input);
    r.appendChild(span);
    kindRow.appendChild(r);
  }
  panel.appendChild(kindRow);

  // Input row + Apply button
  const inputRow = document.createElement('div');
  inputRow.className = 'time-selector-input-row';
  panel.appendChild(inputRow);
  const applyRow = document.createElement('div');
  applyRow.className = 'time-selector-apply-row';
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.className = 'time-selector-apply';
  apply.textContent = 'Apply';
  apply.addEventListener('click', applyClicked);
  applyRow.appendChild(apply);
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'time-selector-reset';
  reset.textContent = 'Live';
  reset.addEventListener('click', () => {
    setAt(null);
    panel.hidden = true;
  });
  applyRow.appendChild(reset);
  panel.appendChild(applyRow);

  renderInputRow(currentKind());

  button.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
  });

  // Outside-click closes
  function onDocClick(e) {
    if (!panel.hidden && !host.contains(e.target)) {
      panel.hidden = true;
    }
  }
  document.addEventListener('click', onDocClick);

  // Subscribe to at-coordinate changes so the button label stays in sync.
  const unsub = onAtChange(() => paintButton());
  paintButton();

  function applyClicked() {
    const kindInput = panel.querySelector('input[name="time-selector-kind"]:checked');
    const kind = kindInput ? kindInput.value : 'live';
    if (kind === 'live') {
      setAt(null);
      panel.hidden = true;
      return;
    }
    const valEl = panel.querySelector('.time-selector-input');
    if (!valEl) return;
    const value = valEl.value.trim();
    if (kind === 'block') {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) {
        valEl.classList.add('is-error');
        return;
      }
      setAt({ block: n });
    } else if (kind === 'time') {
      // Accept ISO-8601 (browser native datetime-local emits without TZ,
      // so we paint it into UTC).
      const d = new Date(value);
      if (isNaN(d.getTime())) {
        valEl.classList.add('is-error');
        return;
      }
      setAt({ time: d.toISOString() });
    }
    panel.hidden = true;
  }

  function renderInputRow(kind) {
    inputRow.replaceChildren();
    if (kind === 'live') {
      const note = document.createElement('p');
      note.className = 'time-selector-note';
      note.textContent = 'Reads are live; the explorer follows the spine as it advances.';
      inputRow.appendChild(note);
      return;
    }
    const lbl = document.createElement('label');
    lbl.className = 'time-selector-label';
    lbl.textContent = kind === 'block' ? 'Block height' : 'Timestamp (ISO-8601)';
    inputRow.appendChild(lbl);
    const input = document.createElement('input');
    input.className = 'time-selector-input';
    if (kind === 'block') {
      input.type = 'number';
      input.placeholder = 'e.g. 1234';
      const at = getAt();
      if (at && at.block) input.value = String(at.block);
    } else {
      input.type = 'datetime-local';
      const at = getAt();
      if (at && at.time) input.value = at.time.slice(0, 16);
    }
    inputRow.appendChild(input);
  }

  function paintButton() {
    const at = getAt();
    if (!at || isAtLive()) {
      button.textContent = '⌚ Live';
      button.classList.remove('is-past');
    } else if (at.block) {
      button.textContent = '⌚ block ' + at.block;
      button.classList.add('is-past');
    } else if (at.version) {
      button.textContent = '⌚ v' + at.version;
      button.classList.add('is-past');
    } else if (at.time) {
      button.textContent = '⌚ ' + at.time.slice(0, 16).replace('T', ' ');
      button.classList.add('is-past');
    }
  }

  return {
    destroy() {
      try { unsub(); } catch (_) {}
      document.removeEventListener('click', onDocClick);
      host.replaceChildren();
      host.classList.remove('time-selector');
    },
  };
}

function currentKind() {
  const a = getAt();
  if (!a) return 'live';
  if (a.block) return 'block';
  if (a.time) return 'time';
  if (a.version) return 'block'; // version is power-user; default kind picker to block
  return 'live';
}

// =================================================================
// Non-live banner
// =================================================================
export function mountTimeBanner() {
  if (document.getElementById('timeTravelBanner')) return { destroy() {} };
  const banner = document.createElement('div');
  banner.id = 'timeTravelBanner';
  banner.className = 'time-travel-banner';
  banner.hidden = true;
  banner.setAttribute('role', 'status');
  document.body.appendChild(banner);

  const label = document.createElement('span');
  label.className = 'time-travel-banner-label';
  banner.appendChild(label);

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'time-travel-banner-back';
  back.textContent = 'Back to live';
  back.addEventListener('click', () => setAt(null));
  banner.appendChild(back);

  const unsub = onAtChange(paint);
  paint();

  function paint() {
    const at = getAt();
    if (!at || isAtLive()) {
      banner.hidden = true;
      banner.classList.remove('is-on');
      label.textContent = '';
      return;
    }
    banner.hidden = false;
    banner.classList.add('is-on');
    if (at.block) {
      label.textContent = `Viewing the spine as it stood at block ${at.block}.`;
    } else if (at.version) {
      label.textContent = `Viewing version ${at.version}.`;
    } else if (at.time) {
      label.textContent = `Viewing the spine as of ${at.time}.`;
    } else {
      label.textContent = 'Viewing a past snapshot.';
    }
  }

  return {
    destroy() {
      try { unsub(); } catch (_) {}
      banner.remove();
    },
  };
}
