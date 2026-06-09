// Nexus — PersonaSwitcher (nextux-03).
//
// Lets a user choose a presentation persona (builder/operator/auditor/agent/
// expert). It changes which labels lead, glossary density, and next actions —
// presentation ONLY. It must never change verification, security, or proof
// logic, so the switcher emits a persona id and nothing else; the surface
// re-renders its display from the same data.

import { elt, setAttrs } from '/lib/uxDom.js';
import { personas } from '/lib/uxLabels.js';

/**
 * buildPersonaSwitcher renders a radio-group of personas.
 * @param {{active?:string, onChange?:(persona:string)=>void}} opts
 */
export function buildPersonaSwitcher(opts = {}) {
  const list = personas();
  const active = opts.active || (list[0] && list[0].persona) || 'builder';

  const group = elt('div', 'ux-persona-switcher');
  setAttrs(group, { role: 'radiogroup', 'aria-label': 'Presentation persona' });

  for (const p of list) {
    const btn = elt('button', 'ux-persona-option');
    const selected = p.persona === active;
    setAttrs(btn, {
      type: 'button',
      role: 'radio',
      'aria-checked': selected ? 'true' : 'false',
      'data-persona': p.persona,
      title: p.tagline,
    });
    btn.appendChild(elt('span', 'ux-persona-title', p.title));
    btn.appendChild(elt('span', 'ux-persona-tagline', p.tagline));
    btn.addEventListener('click', () => {
      for (const sib of group.children) sib.setAttribute('aria-checked', sib === btn ? 'true' : 'false');
      if (typeof opts.onChange === 'function') opts.onChange(p.persona);
    });
    group.appendChild(btn);
  }
  return group;
}

export function mountPersonaSwitcher(container, opts = {}) {
  const el = buildPersonaSwitcher(opts);
  if (container) container.replaceChildren(el);
  return el;
}
