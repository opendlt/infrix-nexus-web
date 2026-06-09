// Nexus — AssuranceBadge (nextux-03).
//
// THE canonical badge. It renders one assurance badge from the design-system
// registry, carrying its semantic color role as a glyph + text (never color
// alone), a screen-reader label, and the plain explanation as accessible help.
// It is honest by construction: callers render only the badges badgesFor(state)
// returns, and a badge can never claim more than its state allows.

import { elt, setAttrs } from '/lib/uxDom.js';
import { COLOR_ROLE_VARS, badgesFor } from '/lib/uxLabels.js';

/**
 * buildAssuranceBadge returns a badge element for one badge definition.
 * @param {object} badge a fixture assurance badge (id/short/plain/technical/colorRole/screenReader)
 * @param {{showPlain?:boolean}} opts
 */
export function buildAssuranceBadge(badge, opts = {}) {
  const role = badge.colorRole || 'info';
  const meta = COLOR_ROLE_VARS[role] || COLOR_ROLE_VARS.info;

  const el = elt('span', 'ux-badge ux-badge-' + role);
  setAttrs(el, {
    role: 'img',
    'data-badge': badge.id,
    'data-color-role': role,
    'aria-label': badge.screenReader || badge.short,
    title: badge.plain || badge.short,
    style: `--ux-role-fg:${meta.fg};--ux-role-soft:${meta.soft}`,
  });

  // Glyph carries status without relying on color (a11y: no color-only status).
  const glyph = elt('span', 'ux-badge-glyph', meta.glyph);
  setAttrs(glyph, { 'aria-hidden': 'true' });
  el.appendChild(glyph);
  el.appendChild(elt('span', 'ux-badge-text', badge.short));

  if (opts.showPlain && badge.plain) {
    el.appendChild(elt('span', 'ux-badge-plain', badge.plain));
  }
  return el;
}

/**
 * buildAssuranceBadgeRow renders every badge allowed for a state, in order.
 * @param {object} state an assurance state
 * @param {{showPlain?:boolean}} opts
 */
export function buildAssuranceBadgeRow(state, opts = {}) {
  const row = elt('div', 'ux-badge-row');
  setAttrs(row, { role: 'list', 'aria-label': 'Assurance' });
  const badges = badgesFor(state || {});
  for (const b of badges) {
    const item = buildAssuranceBadge(b, opts);
    item.setAttribute('role', 'listitem');
    row.appendChild(item);
  }
  if (badges.length === 0) {
    const none = elt('span', 'ux-badge-empty', 'No assurance claims for this state.');
    none.setAttribute('role', 'listitem');
    row.appendChild(none);
  }
  return row;
}

export function mountAssuranceBadgeRow(container, state, opts = {}) {
  const el = buildAssuranceBadgeRow(state, opts);
  if (container) container.replaceChildren(el);
  return el;
}
