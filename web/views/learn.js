// Nexus — Learning ladder view (adoption-11).
//
// Route: #/learn — the in-app learning ladder. It teaches the six concepts in
// the order a user meets them (intent → policy → outcome → proof → anchor →
// spine), each as a collapsible "learn as you go" panel. No modal walls; panels
// are dismissible and remembered. It is the front door for "I'm new — explain
// Infrix" and links to the deeper docs/learn pages.

import { CONCEPTS, LADDER, buildLearnPanel, resetDismissed, learnDocURL } from '/lib/learnPanels.js';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = String(text);
  return n;
}

export const learnView = {
  mount(root) {
    root.replaceChildren();
    // Wrap in `.workspace` like every other view so the shared route-render
    // gate (which locates `.workspace, main, #app`) finds the view's content.
    const wrap = el('div', 'workspace learn-view');

    const h = el('h1', 'learn-view-title', 'Learn Infrix');
    wrap.appendChild(h);
    wrap.appendChild(el('p', 'learn-view-intro',
      'Six ideas, in the order you meet them. Open each to learn what it means; you can dismiss any you already know.'));

    // Fastest-start CTA — see a result before reading the theory.
    const cta = el('div', 'learn-view-cta');
    cta.appendChild(el('span', 'learn-view-cta-text', 'Fastest start: run a full governed flow, then read the rungs.'));
    const startLink = el('a', 'learn-view-cta-link');
    startLink.setAttribute('href', '#/guided/escrow');
    startLink.textContent = 'Run a governed escrow →';
    cta.appendChild(startLink);
    wrap.appendChild(cta);

    // The ladder of learn panels.
    const ladder = el('ol', 'learn-view-ladder');
    LADDER.forEach((key, i) => {
      const li = el('li', 'learn-view-rung');
      li.appendChild(el('span', 'learn-view-rung-num', String(i + 1)));
      const panel = buildLearnPanel(key, { open: i === 0 }); // first rung open by default
      panel.dataset.rung = String(i + 1);
      li.appendChild(panel);
      ladder.appendChild(li);
    });
    wrap.appendChild(ladder);

    // Footer: deep docs + a reset for the "don't show again" state.
    const footer = el('div', 'learn-view-footer');
    const docs = el('a', 'learn-view-docs-link');
    docs.setAttribute('href', learnDocURL('docs/learn/00-start.md'));
    docs.setAttribute('target', '_blank');
    docs.setAttribute('rel', 'noopener');
    docs.textContent = 'Full lessons, glossary, and exercises in docs/learn';
    footer.appendChild(docs);

    const reset = el('button', 'learn-view-reset', 'Show all panels again');
    reset.type = 'button';
    reset.addEventListener('click', () => { resetDismissed(); this.mount(root); });
    footer.appendChild(reset);
    wrap.appendChild(footer);

    root.appendChild(wrap);
  },
};

// Keep a reference to CONCEPTS so bundlers/tree-shakers don't drop the import in
// some toolchains, and to document that this view renders every concept.
export const LEARN_CONCEPT_KEYS = Object.keys(CONCEPTS);
