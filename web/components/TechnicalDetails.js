// Nexus — TechnicalDetails (nextux-03).
//
// Layer 3 of the design system: the expert detail (proof level, hashes, tx ids,
// registry keys) lives behind a keyboard-focusable <details>, collapsed by
// default so first-level UX stays calm. Never hover-only; the summary toggles
// on click AND keyboard (native <details> behavior).

import { elt, setAttrs } from '/lib/uxDom.js';

/**
 * buildTechnicalDetails returns a <details> element listing label/value pairs.
 * @param {Array<{label:string,value:string}>} rows
 * @param {{open?:boolean, summary?:string}} opts
 */
export function buildTechnicalDetails(rows, opts = {}) {
  const details = elt('details', 'ux-technical');
  if (opts.open) details.setAttribute('open', 'open');
  const summary = elt('summary', 'ux-technical-summary', opts.summary || 'Technical detail');
  details.appendChild(summary);

  const dl = elt('dl', 'ux-technical-fields');
  for (const r of rows || []) {
    const dt = elt('dt', 'ux-technical-label', r.label);
    const dd = elt('dd', 'ux-technical-value', r.value);
    setAttrs(dd, { 'data-key': r.label });
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
  details.appendChild(dl);
  return details;
}

export function mountTechnicalDetails(container, rows, opts = {}) {
  const el = buildTechnicalDetails(rows, opts);
  if (container) container.replaceChildren(el);
  return el;
}
