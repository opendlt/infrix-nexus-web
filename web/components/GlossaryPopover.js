// Nexus — GlossaryPopover (nextux-03).
//
// Demystifies one jargon term inline. The plain (first-use) wording leads; the
// term + full definition live in a popover that opens on click AND keyboard
// focus (never hover-only — critical info is reachable without a pointer). The
// underlying button is fully keyboard operable with a visible focus state.

import { elt, setAttrs } from '/lib/uxDom.js';
import { glossaryLookup } from '/lib/uxLabels.js';

let _idSeq = 0;

/**
 * buildGlossaryTerm renders a glossary term as an accessible disclosure. The
 * visible text is the plain first-use replacement; activating it reveals the
 * canonical term + plain + technical definitions.
 * @param {string} term the glossary term key (e.g. "Accumulate L0")
 * @param {{lead?:string, term?:object}} opts
 */
export function buildGlossaryTerm(termKey, opts = {}) {
  const def = opts.term || glossaryLookup(termKey) || {
    term: termKey, plain: termKey, technical: '', firstUseReplacement: termKey,
  };
  const wrap = elt('span', 'ux-glossary');
  const popId = 'ux-gloss-' + ++_idSeq;

  const btn = elt('button', 'ux-glossary-term');
  setAttrs(btn, {
    type: 'button',
    'aria-expanded': 'false',
    'aria-controls': popId,
    'data-term': def.term,
    title: def.plain,
  });
  btn.appendChild(elt('span', 'ux-glossary-lead', opts.lead || def.firstUseReplacement || def.term));
  btn.appendChild(elt('span', 'ux-glossary-hint', ' ⓘ'));

  const pop = elt('span', 'ux-glossary-popover');
  setAttrs(pop, { id: popId, role: 'tooltip', hidden: 'hidden' });
  pop.appendChild(elt('strong', 'ux-glossary-name', def.term));
  pop.appendChild(elt('span', 'ux-glossary-plain', def.plain));
  if (def.technical) pop.appendChild(elt('span', 'ux-glossary-technical', def.technical));
  if (def.docs) {
    const a = elt('a', 'ux-glossary-docs', 'Docs');
    setAttrs(a, { href: def.docs });
    pop.appendChild(a);
  }

  const toggle = (open) => {
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) pop.removeAttribute('hidden');
    else pop.setAttribute('hidden', 'hidden');
  };
  btn.addEventListener('click', () => toggle(btn.getAttribute('aria-expanded') !== 'true'));
  // Keyboard focus reveals it too (not hover-only); blur hides it.
  btn.addEventListener('focus', () => toggle(true));
  btn.addEventListener('blur', () => toggle(false));

  wrap.appendChild(btn);
  wrap.appendChild(pop);
  return wrap;
}

export function mountGlossaryTerm(container, termKey, opts = {}) {
  const el = buildGlossaryTerm(termKey, opts);
  if (container) container.replaceChildren(el);
  return el;
}
