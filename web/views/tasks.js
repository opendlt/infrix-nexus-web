// Nexus — #/tasks Task Template Marketplace gallery (nextux-04).
//
// Answers "what can I accomplish?" before "what is Infrix?": a gallery of
// signed task templates with trust badges, required authority, outputs, and the
// exact run command. It loads the same Go-generated catalog the CLI + SDK use,
// so the trust shown is the registry's verified verdict — never asserted by a
// template.

import { elt, setAttrs } from '/lib/uxDom.js';
import {
  loadTaskCatalog, listTemplates, templatesByCategory, categories,
  trustBadge, TRUST_ROLE_VARS, isTrusted,
} from '/lib/taskRegistry.js';

function trustChip(trust) {
  const b = trustBadge(trust);
  const chip = elt('span', 'task-trust task-trust-' + b.role);
  setAttrs(chip, { 'data-trust': trust, 'aria-label': 'Trust: ' + b.label, style: '--trust-fg:' + (TRUST_ROLE_VARS[b.role] || 'var(--info)') });
  const g = elt('span', 'task-trust-glyph', b.glyph);
  setAttrs(g, { 'aria-hidden': 'true' });
  chip.appendChild(g);
  chip.appendChild(elt('span', 'task-trust-label', b.label));
  return chip;
}

function taskCard(t) {
  const card = elt('article', 'task-card');
  setAttrs(card, { 'data-task': t.id, 'data-category': t.category, 'aria-label': 'Task: ' + t.title });

  const head = elt('div', 'task-card-head');
  head.appendChild(elt('h3', 'task-card-title', t.title));
  head.appendChild(trustChip(t.trust));
  card.appendChild(head);

  card.appendChild(elt('p', 'task-card-summary', t.summary));

  const meta = elt('dl', 'task-card-meta');
  const row = (label, value) => {
    meta.appendChild(elt('dt', 'task-meta-label', label));
    meta.appendChild(elt('dd', 'task-meta-value', value));
  };
  row('Id', t.id);
  row('Networks', (t.networks || []).join(', '));
  if (t.outputs && t.outputs.length) row('Proves', t.outputs.join(', '));
  row('Steps', (t.actions || []).map((a) => a.uses).join(' → '));
  card.appendChild(meta);

  const cmd = elt('code', 'task-card-run', 'infrix tasks run ' + t.id);
  setAttrs(cmd, { 'data-run-command': t.id });
  card.appendChild(cmd);

  if (!isTrusted(t.trust)) {
    card.appendChild(elt('p', 'task-card-warn', 'Not a trusted source — runs only with an explicit allow flag.'));
  }
  return card;
}

function renderGrid(container, list) {
  container.replaceChildren();
  if (list.length === 0) {
    container.appendChild(elt('p', 'task-empty', 'No tasks match.'));
    return;
  }
  for (const t of list) container.appendChild(taskCard(t));
}

function populate(root) {
  const wrap = elt('div', 'tasks-gallery');

  const intro = elt('p', 'tasks-intro', 'Choose a task that matches your job. Every template is signed; every run produces a real, independently-verifiable proof — assurance comes from execution, never from the template.');
  wrap.appendChild(intro);

  // Category filter (radiogroup of buttons).
  const filter = elt('div', 'tasks-filter');
  setAttrs(filter, { role: 'radiogroup', 'aria-label': 'Filter tasks by category' });
  const grid = elt('div', 'tasks-grid');

  let active = 'all';
  const cats = categories();
  for (const c of cats) {
    const btn = elt('button', 'tasks-filter-btn');
    setAttrs(btn, { type: 'button', role: 'radio', 'aria-checked': c === active ? 'true' : 'false', 'data-category': c });
    btn.textContent = c === 'all' ? 'All' : c;
    btn.addEventListener('click', () => {
      active = c;
      for (const sib of filter.children) sib.setAttribute('aria-checked', sib === btn ? 'true' : 'false');
      renderGrid(grid, templatesByCategory(active));
    });
    filter.appendChild(btn);
  }
  wrap.appendChild(filter);
  wrap.appendChild(grid);
  renderGrid(grid, listTemplates());
  root.appendChild(wrap);
}

export const tasksView = {
  async mount(root) {
    root.replaceChildren();
    const shell = elt('div', 'workspace tasks-view');
    const header = elt('header', 'workspace-header');
    header.appendChild(setAttrs(elt('h1', 'workspace-title', 'Task marketplace'), { id: 'tasks-title' }));
    header.appendChild(elt('p', 'workspace-subtitle', 'Signed, ready-to-run Infrix tasks — start from a goal, not from primitives.'));
    shell.appendChild(header);
    const body = elt('div', 'tasks-body');
    body.appendChild(elt('p', 'tasks-loading', 'Loading the task marketplace…'));
    shell.appendChild(body);
    root.appendChild(shell);

    try {
      await loadTaskCatalog();
      body.replaceChildren();
      populate(body);
    } catch (err) {
      body.replaceChildren();
      const msg = elt('div', 'tasks-error');
      msg.setAttribute('role', 'alert');
      msg.appendChild(elt('strong', null, 'Could not load the task marketplace.'));
      msg.appendChild(elt('p', null, String((err && err.message) || err)));
      body.appendChild(msg);
    }
  },
};
