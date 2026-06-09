// Nexus — ErrorResolutionCard (nextux-03).
//
// THE design-system error card. From an ErrorCard view-model (the browser twin
// of uxcopy.ErrorCard) it shows: plain meaning, impact on assurance, numbered
// fixes (with safe-to-run flags + commands), retry guidance, a docs link, and —
// collapsed to Layer 3 — the stable error code + cause. Calm by default, never
// a raw stack trace.

import { elt, setAttrs } from '/lib/uxDom.js';
import { errorCardByCode } from '/lib/uxLabels.js';
import { buildTechnicalDetails } from '/components/TechnicalDetails.js';

/**
 * buildErrorResolutionCard renders an error card. Pass a card object directly,
 * or a { code } to look one up in the registry.
 * @param {object} card an ErrorCard, or { code }
 * @param {{expanded?:boolean}} opts
 */
export function buildErrorResolutionCard(card, opts = {}) {
  const c =
    card && card.plainMeaning != null
      ? card
      : errorCardByCode((card && card.code) || 'UNKNOWN') || { code: 'UNKNOWN', title: 'Something went wrong', plainMeaning: '', fixes: [] };

  const el = elt('div', 'ux-error-card');
  setAttrs(el, { role: 'alert', 'data-code': c.code, 'aria-label': 'Error: ' + (c.title || c.code) });

  el.appendChild(elt('div', 'ux-error-title', c.title || c.code));

  if (c.plainMeaning) {
    const m = elt('div', 'ux-error-meaning');
    m.appendChild(elt('span', 'ux-error-label', 'What this means'));
    m.appendChild(elt('p', 'ux-error-text', c.plainMeaning));
    el.appendChild(m);
  }

  if (c.assuranceImpact) {
    const imp = elt('div', 'ux-error-impact');
    imp.appendChild(elt('span', 'ux-error-label', 'Impact on assurance'));
    imp.appendChild(elt('p', 'ux-error-text', c.assuranceImpact));
    el.appendChild(imp);
  }

  if (c.fixes && c.fixes.length) {
    const fixes = elt('div', 'ux-error-fixes');
    fixes.appendChild(elt('span', 'ux-error-label', 'How to fix'));
    const ol = elt('ol', 'ux-error-fix-list');
    for (const f of c.fixes) {
      const li = elt('li', 'ux-error-fix');
      setAttrs(li, { 'data-safe': f.safeToRun ? 'yes' : 'no' });
      li.appendChild(elt('span', 'ux-error-fix-label', f.label));
      if (f.command) {
        const code = elt('code', 'ux-error-fix-command', f.command);
        if (f.safeToRun) code.setAttribute('data-safe-to-run', 'yes');
        li.appendChild(code);
      }
      if (f.safeToRun) li.appendChild(elt('span', 'ux-error-fix-safe', 'safe to run'));
      ol.appendChild(li);
    }
    fixes.appendChild(ol);
    el.appendChild(fixes);
  }

  if (c.retryGuidance) {
    el.appendChild(elt('div', 'ux-error-retry', c.retryGuidance));
  }

  if (c.docs) {
    const a = elt('a', 'ux-error-docs', 'Read more: ' + c.docs);
    setAttrs(a, { href: c.docs });
    el.appendChild(a);
  }

  // Layer 3 — stable code + cause, collapsed.
  const tech = buildTechnicalDetails(
    [{ label: 'error_code', value: c.code }].concat(
      c.technical && c.technical.includes('cause:')
        ? [{ label: 'cause', value: c.technical.split('cause:')[1].trim() }]
        : [],
    ),
    { open: !!opts.expanded, summary: 'Technical details' },
  );
  el.appendChild(tech);

  return el;
}

export function mountErrorResolutionCard(container, card, opts = {}) {
  const el = buildErrorResolutionCard(card, opts);
  if (container) container.replaceChildren(el);
  return el;
}
