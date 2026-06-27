// Cinema-Inbox-Time E2C5 — rationale modal.
//
// A small dialog component used on every governed.approve / governed.reject
// invocation. The backend enforces rationale >= 10 chars (MinRationaleChars
// in pkg/devnet/rpc_nexus_notes_handoff.go); the modal mirrors that gate
// in the UI with a live character count + disabled submit until the floor
// is reached.
//
// API:
//   openRationaleModal({ verb, intentId, defaultValue? }) → Promise<string|null>
// Resolves to the rationale on Submit, or null on Cancel.
//
// Spec: Cinema-Inbox-Time-plan.md Effort 2 §E2C5.

export const MIN_RATIONALE_CHARS = 10;

// RUNBOOK-04 Task 1 — a small generic input modal so the inbox never falls back
// to window.prompt (assignee URLs, handoff/reply notes). Reuses the rationale
// modal styling for visual consistency.
//
// API:
//   openInputModal({ title, label, placeholder?, value?, multiline?, required? })
//     → Promise<string|null>   (resolves to the trimmed value, or null on cancel)
export function openInputModal({
  title = 'Enter a value', label = '', placeholder = '', value = '',
  multiline = false, required = true, confirmText = 'Confirm',
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'rationale-modal-overlay';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cancel(); });

    const modal = document.createElement('div');
    modal.className = 'rationale-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    overlay.appendChild(modal);

    const h = document.createElement('h3');
    h.className = 'rationale-modal-title';
    h.textContent = title;
    modal.appendChild(h);

    if (label) {
      const sub = document.createElement('p');
      sub.className = 'rationale-modal-sub';
      sub.textContent = label;
      modal.appendChild(sub);
    }

    const input = document.createElement(multiline ? 'textarea' : 'input');
    input.className = 'rationale-modal-textarea';
    if (multiline) input.rows = 4; else input.type = 'text';
    input.placeholder = placeholder;
    input.value = value || '';
    modal.appendChild(input);

    const buttons = document.createElement('div');
    buttons.className = 'rationale-modal-buttons';
    modal.appendChild(buttons);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'rationale-modal-btn rationale-modal-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => cancel());
    buttons.appendChild(cancelBtn);

    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'rationale-modal-btn rationale-modal-submit';
    submitBtn.textContent = confirmText;
    submitBtn.addEventListener('click', () => submit());
    buttons.appendChild(submitBtn);

    function refresh() {
      const empty = required && input.value.trim().length === 0;
      submitBtn.disabled = empty;
      submitBtn.classList.toggle('is-disabled', empty);
    }
    input.addEventListener('input', refresh);
    refresh();

    function cleanup() { document.removeEventListener('keydown', onKey); overlay.remove(); }
    function cancel() { cleanup(); resolve(null); }
    function submit() {
      const v = input.value.trim();
      if (required && v.length === 0) return;
      cleanup();
      resolve(v);
    }
    function onKey(e) {
      if (e.key === 'Escape') { cancel(); e.preventDefault(); }
      else if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) { submit(); e.preventDefault(); }
    }
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    setTimeout(() => input.focus(), 0);
  });
}

export function openRationaleModal({ verb = 'sign', intentId = '', defaultValue = '' } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'rationale-modal-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cancel();
    });

    const modal = document.createElement('div');
    modal.className = 'rationale-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    overlay.appendChild(modal);

    const title = document.createElement('h3');
    title.className = 'rationale-modal-title';
    title.textContent = verb === 'reject' ? 'Rationale required to reject' : 'Rationale required to sign';
    modal.appendChild(title);

    const sub = document.createElement('p');
    sub.className = 'rationale-modal-sub';
    sub.textContent =
      verb === 'reject'
        ? 'Why are you rejecting this intent? This rationale becomes part of the audit trail and is bound to the rejection note.'
        : 'Why are you approving this intent? This rationale becomes part of the audit trail and is bound to the signature.';
    modal.appendChild(sub);

    if (intentId) {
      const meta = document.createElement('p');
      meta.className = 'rationale-modal-meta mono';
      meta.textContent = 'intent: ' + intentId;
      modal.appendChild(meta);
    }

    const ta = document.createElement('textarea');
    ta.className = 'rationale-modal-textarea';
    ta.rows = 6;
    ta.placeholder = `Minimum ${MIN_RATIONALE_CHARS} characters.`;
    ta.value = defaultValue || '';
    modal.appendChild(ta);

    const counter = document.createElement('div');
    counter.className = 'rationale-modal-counter';
    modal.appendChild(counter);

    const buttons = document.createElement('div');
    buttons.className = 'rationale-modal-buttons';
    modal.appendChild(buttons);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'rationale-modal-btn rationale-modal-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => cancel());
    buttons.appendChild(cancelBtn);

    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'rationale-modal-btn rationale-modal-submit';
    submitBtn.textContent = verb === 'reject' ? 'Confirm reject' : 'Confirm sign';
    submitBtn.addEventListener('click', () => submit());
    buttons.appendChild(submitBtn);

    function refresh() {
      const n = ta.value.length;
      counter.textContent = `${n} / ${MIN_RATIONALE_CHARS} chars`;
      counter.classList.toggle('is-short', n < MIN_RATIONALE_CHARS);
      submitBtn.disabled = n < MIN_RATIONALE_CHARS;
      submitBtn.classList.toggle('is-disabled', submitBtn.disabled);
    }
    ta.addEventListener('input', refresh);
    refresh();

    function cleanup() {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
    }
    function cancel() {
      cleanup();
      resolve(null);
    }
    function submit() {
      if (ta.value.length < MIN_RATIONALE_CHARS) return;
      const value = ta.value;
      cleanup();
      resolve(value);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        cancel();
        e.preventDefault();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        submit();
        e.preventDefault();
      }
    }
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    setTimeout(() => ta.focus(), 0);
  });
}
