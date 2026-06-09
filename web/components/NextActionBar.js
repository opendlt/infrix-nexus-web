// Nexus — NextActionBar (nextux-03).
//
// The design system's fourth question — "What can I do next?" — as a row of
// buttons/links. The actions come from the registry, ordered for the active
// persona (presentation only). A command-bearing action exposes a copyable
// command; an in-UI action invokes its onAction callback.

import { elt, setAttrs } from '/lib/uxDom.js';
import { nextActionsFor } from '/lib/uxLabels.js';

/**
 * buildNextActionBar renders the next actions for a persona.
 * @param {string} persona one of builder/operator/auditor/agent/expert
 * @param {{onAction?:(action:object)=>void, actions?:Array}} opts
 */
export function buildNextActionBar(persona, opts = {}) {
  const actions = opts.actions || nextActionsFor(persona);
  const bar = elt('nav', 'ux-next-bar');
  setAttrs(bar, { 'aria-label': 'Next actions' });

  for (const a of actions) {
    const btn = elt('button', 'ux-next-action');
    setAttrs(btn, { type: 'button', 'data-action': a.id, title: a.plain });
    btn.appendChild(elt('span', 'ux-next-action-label', a.label));
    if (a.command) {
      const cmd = elt('code', 'ux-next-action-command', a.command);
      setAttrs(cmd, { 'data-command': a.command });
      btn.appendChild(cmd);
    }
    btn.appendChild(elt('span', 'ux-next-action-plain', a.plain));
    btn.addEventListener('click', () => {
      if (typeof opts.onAction === 'function') opts.onAction(a);
      else if (a.command && navigator.clipboard) navigator.clipboard.writeText(a.command).catch(() => {});
    });
    bar.appendChild(btn);
  }
  if (actions.length === 0) {
    bar.appendChild(elt('span', 'ux-next-empty', 'No suggested actions.'));
  }
  return bar;
}

export function mountNextActionBar(container, persona, opts = {}) {
  const el = buildNextActionBar(persona, opts);
  if (container) container.replaceChildren(el);
  return el;
}
