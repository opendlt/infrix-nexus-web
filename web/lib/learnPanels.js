// Nexus — "learn as you go" panels (adoption-11).
//
// Tiny, in-context explanations that teach the learning-ladder concepts where a
// user meets them — never a modal wall. Each panel is a collapsible "What is
// this?" with a plain-language definition and a link into docs/learn. A user
// can dismiss a panel; the dismissed state is remembered (localStorage in the
// browser, an in-memory fallback elsewhere) so it does not nag.

const DISMISS_KEY = 'nexus:learn:dismissed';

function storage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch {
    /* access can throw in sandboxed frames */
  }
  if (!globalThis.__learnMemStore) {
    const m = {};
    globalThis.__learnMemStore = {
      getItem: (k) => (k in m ? m[k] : null),
      setItem: (k, v) => { m[k] = String(v); },
    };
  }
  return globalThis.__learnMemStore;
}

function readDismissed() {
  try {
    return JSON.parse(storage().getItem(DISMISS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeDismissed(map) {
  try {
    storage().setItem(DISMISS_KEY, JSON.stringify(map));
  } catch {
    /* best-effort */
  }
}

/** isDismissed reports whether a concept panel was dismissed. */
export function isDismissed(conceptKey) {
  return !!readDismissed()[conceptKey];
}

/** dismiss / undismiss a concept panel (persisted). */
export function setDismissed(conceptKey, dismissed) {
  const map = readDismissed();
  if (dismissed) map[conceptKey] = 1;
  else delete map[conceptKey];
  writeDismissed(map);
}

/** resetDismissed clears all dismissed state (used by tests + a "show all" UI). */
export function resetDismissed() {
  writeDismissed({});
}

// CONCEPTS — the six ladder rungs, each with a plain one-liner and a docs link.
// The plain text is the same vocabulary docs/learn uses (no jargon).
export const CONCEPTS = Object.freeze({
  intent: {
    term: 'Intent',
    plain: 'The action you want, stated before execution. It is recorded first, so everything that follows ties back to it.',
    doc: 'docs/learn/01-intent.md',
  },
  policy: {
    term: 'Policy',
    plain: 'The decision about whether the requested action is allowed, and why. A denial is recorded with its reason, just like an approval.',
    doc: 'docs/learn/02-policy.md',
  },
  outcome: {
    term: 'Outcome',
    plain: 'What actually happened — the result, hash-linked to the intent so it cannot be quietly swapped.',
    doc: 'docs/learn/03-outcome.md',
  },
  proof: {
    term: 'Proof',
    plain: 'A portable package that lets someone else verify the result without trusting this node — checkable offline.',
    doc: 'docs/learn/04-proof.md',
  },
  anchor: {
    term: 'Anchor',
    plain: 'A commitment of the evidence to Accumulate L0 so it is durable outside Infrix. Confirming it lifts a proof to L4.',
    doc: 'docs/learn/05-anchor.md',
  },
  spine: {
    term: 'Spine',
    plain: 'The full path from request to proof: Intent → Policy → Outcome → Proof → Anchor, hash-linked into one tamper-evident record.',
    doc: 'docs/learn/06-spine.md',
  },
});

/** The ladder order (for the #/learn view). */
export const LADDER = ['intent', 'policy', 'outcome', 'proof', 'anchor', 'spine'];

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = String(text);
  return n;
}

/**
 * buildLearnPanel returns a collapsible "What is this?" panel for a concept.
 * Pass { open: true } to expand by default. Returns null for an unknown concept.
 */
export function buildLearnPanel(conceptKey, opts = {}) {
  const c = CONCEPTS[conceptKey];
  if (!c) return null;

  const panel = el('details', 'learn-panel');
  panel.dataset.concept = conceptKey;
  if (opts.open) panel.setAttribute('open', 'open');

  panel.appendChild(el('summary', 'learn-panel-summary', 'What is this? — ' + c.term));

  const body = el('div', 'learn-panel-body');
  body.appendChild(el('p', 'learn-panel-plain', c.plain));

  const link = el('a', 'learn-panel-link');
  link.setAttribute('href', c.doc);
  link.textContent = 'Read more in ' + c.doc;
  body.appendChild(link);

  const dismiss = el('button', 'learn-panel-dismiss', "Don’t show this again");
  dismiss.type = 'button';
  dismiss.addEventListener('click', () => {
    setDismissed(conceptKey, true);
    panel.dataset.dismissed = 'yes';
    panel.replaceChildren(); // collapse to nothing without depending on .remove()
  });
  body.appendChild(dismiss);

  panel.appendChild(body);
  return panel;
}

/**
 * mountLearnPanel appends a concept panel to container unless it was dismissed
 * (pass { force: true } to show regardless). Returns the panel or null.
 */
export function mountLearnPanel(container, conceptKey, opts = {}) {
  if (!opts.force && isDismissed(conceptKey)) return null;
  const panel = buildLearnPanel(conceptKey, opts);
  if (panel && container) container.appendChild(panel);
  return panel;
}
