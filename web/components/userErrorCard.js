// Nexus — user error card component (adoption-08).
//
// THE shared error panel. Any Nexus view that catches a translated failure
// mounts this card: it shows the title, why-it-matters impact, and the concrete
// fixes (with their commands), and links to the docs page. Safe-to-run fixes
// are marked so a user knows which command is harmless to try. The stable code
// and any redacted support data live inside an expandable <details> so the card
// stays calm by default. A raw stack trace is never shown.

import { normalizeUserError, parseUserError } from '/lib/userError.js';

function elt(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = String(text);
  return n;
}

/**
 * mountUserError builds the error card into container and returns the card
 * element. Pass { expanded: true } to open the details by default.
 */
export function mountUserError(container, errObj, opts = {}) {
  const card = buildUserErrorCard(errObj, opts);
  if (container) container.replaceChildren(card);
  return card;
}

/** buildUserErrorCard returns the error card element (no mounting). */
export function buildUserErrorCard(errObj, opts = {}) {
  // Accept a v4 envelope ({code,message,details}), a bare UserError payload, or
  // an Error carrying `.userError` — parseUserError unwraps all three.
  const src = errObj && errObj.userError ? errObj.userError : errObj;
  const u = parseUserError(src) || normalizeUserError(src) || normalizeUserError({ code: 'UNKNOWN' });

  const card = elt('div', 'user-error user-error-' + (u.retryable ? 'retryable' : 'fatal'));
  card.dataset.code = u.code;
  card.setAttribute('role', 'alert');
  card.setAttribute('aria-label', 'Error: ' + u.title);

  card.appendChild(elt('div', 'user-error-title', u.title));
  if (u.message) card.appendChild(elt('div', 'user-error-message', u.message));
  if (u.impact) {
    const imp = elt('div', 'user-error-impact');
    imp.appendChild(elt('span', 'user-error-impact-label', 'Why it matters: '));
    imp.appendChild(elt('span', 'user-error-impact-text', u.impact));
    card.appendChild(imp);
  }

  if (u.fixes.length) {
    const fixes = elt('div', 'user-error-fixes');
    fixes.appendChild(elt('div', 'user-error-fixes-label', 'Try:'));
    const ul = elt('ul', 'user-error-fix-list');
    for (const f of u.fixes) {
      const li = elt('li', 'user-error-fix');
      li.dataset.safe = f.safeToRun ? 'yes' : 'no';
      li.appendChild(elt('span', 'user-error-fix-label', f.label));
      if (f.command) {
        const code = elt('code', 'user-error-fix-command', f.command);
        if (f.safeToRun) code.dataset.safeToRun = 'yes';
        li.appendChild(code);
      }
      if (f.safeToRun) li.appendChild(elt('span', 'user-error-fix-safe', 'safe to run'));
      ul.appendChild(li);
    }
    fixes.appendChild(ul);
    card.appendChild(fixes);
  }

  if (u.retryable) {
    card.appendChild(elt('div', 'user-error-retryable', 'This is often transient — retrying may succeed.'));
  }

  if (u.docs) {
    const docs = elt('a', 'user-error-docs');
    docs.setAttribute('href', u.docs);
    docs.textContent = 'Read more: ' + u.docs;
    card.appendChild(docs);
  }

  // Code + redacted support data live behind a disclosure so the card is calm.
  const details = elt('details', 'user-error-details');
  if (opts.expanded) details.setAttribute('open', 'open');
  details.appendChild(elt('summary', null, 'Details'));
  const dl = elt('dl', 'user-error-fields');
  dl.appendChild(elt('dt', null, 'Code'));
  dl.appendChild(elt('dd', 'user-error-code', u.code));
  if (u.cause) {
    dl.appendChild(elt('dt', null, 'Cause'));
    dl.appendChild(elt('dd', null, u.cause));
  }
  for (const [k, v] of Object.entries(u.supportData)) {
    dl.appendChild(elt('dt', null, k));
    dl.appendChild(elt('dd', null, String(v)));
  }
  details.appendChild(dl);
  card.appendChild(details);

  return card;
}
