// Nexus — #/companion Zero-Context Local Companion (nextux-10).
//
// A calm workspace dashboard: where you left off, the recent artifacts (with an
// honest "not verified yet" status), the next best actions, the agent context,
// and the local privacy controls. Everything is read-only — the browser indexes
// nothing and runs no command.

import { elt, setAttrs } from '/lib/uxDom.js';
import {
  loadCompanion, workspace, branch, dirty, isLive, artifacts, suggestions,
  allowedActions, statusWords, resumeLine, counts,
} from '/lib/companion.js';

function workspaceCard() {
  const card = elt('section', 'companion-workspace-card');
  setAttrs(card, { 'aria-label': 'Workspace status' });
  card.appendChild(elt('h3', 'companion-subtitle', 'Where you left off'));
  card.appendChild(elt('p', 'companion-resume', resumeLine()));
  const dl = elt('dl', 'companion-grid');
  const row = (k, v) => { dl.appendChild(elt('dt', null, k)); dl.appendChild(elt('dd', 'mono', String(v))); };
  row('Workspace', workspace() || '—');
  row('Branch', branch() ? branch() + (dirty() ? ' (uncommitted changes)' : '') : '(not a git repo)');
  const c = counts();
  row('Indexed', c.total + ' artifact(s) — ' + c.verified + ' verified, ' + c.unverified + ' not verified yet');
  card.appendChild(dl);
  const src = elt('p', 'companion-source');
  setAttrs(src, { 'data-live': String(isLive()) });
  src.textContent = isLive() ? 'Live companion server connected.' : 'Showing a sample workspace (start `infrix companion` for your own).';
  card.appendChild(src);
  return card;
}

function artifactsPanel() {
  const panel = elt('section', 'companion-artifacts');
  setAttrs(panel, { 'aria-label': 'Recent artifacts' });
  panel.appendChild(elt('h3', 'companion-subtitle', 'Recent artifacts'));
  const list = artifacts();
  if (!list.length) {
    panel.appendChild(elt('p', 'companion-empty', 'No Infrix artifacts found yet.'));
    return panel;
  }
  for (const a of list) {
    const row = elt('article', 'companion-artifact');
    setAttrs(row, { 'data-kind': a.kind, 'data-status': a.verificationStatus });
    const head = elt('div', 'companion-artifact-head');
    head.appendChild(elt('span', 'companion-artifact-path mono', a.path));
    const badge = elt('span', 'companion-artifact-status');
    setAttrs(badge, { 'data-status': a.verificationStatus });
    badge.textContent = statusWords(a.verificationStatus);
    head.appendChild(badge);
    row.appendChild(head);
    const meta = [];
    meta.push(a.kind);
    if (a.declaredProofLevel) meta.push('declared ' + a.declaredProofLevel);
    if (a.verificationStatus === 'unverified') meta.push('This proof has not been verified yet.');
    if (a.commit) meta.push('belongs to commit ' + a.commit.slice(0, 12));
    row.appendChild(elt('p', 'companion-artifact-meta', meta.join(' · ')));
    panel.appendChild(row);
  }
  return panel;
}

function suggestionsPanel() {
  const panel = elt('section', 'companion-suggestions');
  setAttrs(panel, { 'aria-label': 'Next actions' });
  panel.appendChild(elt('h3', 'companion-subtitle', 'Next best actions'));
  const list = suggestions();
  if (!list.length) {
    panel.appendChild(elt('p', 'companion-empty', 'No suggestions right now — you are all caught up.'));
    return panel;
  }
  for (const s of list) {
    const card = elt('article', 'companion-suggestion');
    setAttrs(card, { 'data-risk': s.riskLevel, 'data-approval': String(!!s.needsApproval) });
    card.appendChild(elt('p', 'companion-suggestion-title', s.title));
    card.appendChild(elt('p', 'companion-suggestion-reason', s.reason));
    const cmd = elt('code', 'companion-suggestion-cmd mono', s.command);
    setAttrs(cmd, { 'aria-label': 'Command: ' + s.command });
    card.appendChild(cmd);
    const safety = elt('p', 'companion-suggestion-safety');
    safety.textContent = s.needsApproval
      ? 'This action writes and needs your approval before it runs.'
      : 'This action will only read local files.';
    card.appendChild(safety);
    panel.appendChild(card);
  }
  return panel;
}

function servicesPanel() {
  const panel = elt('section', 'companion-services');
  setAttrs(panel, { 'aria-label': 'Running services' });
  panel.appendChild(elt('h3', 'companion-subtitle', 'Running services'));
  const ul = elt('ul', 'companion-service-list');
  const item = (name, on, hint) => {
    const li = elt('li', 'companion-service');
    setAttrs(li, { 'data-on': String(on) });
    li.appendChild(elt('span', 'companion-service-name', name));
    li.appendChild(elt('span', 'companion-service-state', on ? 'running' : hint));
    return li;
  };
  ul.appendChild(item('Companion', isLive(), 'sample mode'));
  ul.appendChild(item('Agent server', false, 'not detected — `infrix agent serve`'));
  panel.appendChild(ul);
  return panel;
}

function agentContextPanel() {
  const panel = elt('section', 'companion-agent-context');
  setAttrs(panel, { 'aria-label': 'Agent context' });
  panel.appendChild(elt('h3', 'companion-subtitle', 'Agent context'));
  panel.appendChild(elt('p', 'companion-hint',
    'Agents read this workspace through /v1/companion/context — safe metadata only, never file contents or secrets. They may take only these read-only actions:'));
  const ul = elt('ul', 'companion-allowed-list');
  for (const a of allowedActions()) {
    const li = elt('li', 'companion-allowed mono');
    li.textContent = a;
    ul.appendChild(li);
  }
  panel.appendChild(ul);
  return panel;
}

function privacyPanel() {
  const panel = elt('section', 'companion-privacy');
  setAttrs(panel, { 'aria-label': 'Local privacy controls' });
  panel.appendChild(elt('h3', 'companion-subtitle', 'Local privacy'));
  panel.appendChild(elt('p', 'companion-hint',
    'The companion never indexes key material, seeds, PEM files, or .env files, never uploads anything, and never runs a command.'));
  const ul = elt('ul', 'companion-privacy-list');
  for (const cmd of ['infrix companion privacy', 'infrix companion ignore <path>', 'infrix companion clear-index']) {
    const li = elt('li', 'companion-privacy-cmd mono', cmd);
    ul.appendChild(li);
  }
  panel.appendChild(ul);
  return panel;
}

function populate(body) {
  const grid = elt('div', 'companion-grid-layout');
  grid.appendChild(workspaceCard());
  grid.appendChild(servicesPanel());
  body.appendChild(grid);
  body.appendChild(suggestionsPanel());
  body.appendChild(artifactsPanel());
  body.appendChild(agentContextPanel());
  body.appendChild(privacyPanel());
}

export const companionView = {
  async mount(root) {
    root.replaceChildren();
    const shell = elt('div', 'workspace companion-view');
    const header = elt('header', 'workspace-header');
    header.appendChild(setAttrs(elt('h1', 'workspace-title', 'Companion'), { id: 'companion-title' }));
    header.appendChild(elt('p', 'workspace-subtitle',
      'Your local workstation: where you left off, what to do next, and a safe context for agents — read-only, private, no node.'));
    shell.appendChild(header);
    const body = elt('div', 'companion-body');
    body.appendChild(elt('p', 'companion-loading', 'Loading your workspace…'));
    shell.appendChild(body);
    root.appendChild(shell);

    try {
      await loadCompanion();
      body.replaceChildren();
      populate(body);
    } catch (err) {
      body.replaceChildren();
      const msg = elt('div', 'companion-error');
      msg.setAttribute('role', 'alert');
      msg.appendChild(elt('strong', null, 'Could not load the companion.'));
      msg.appendChild(elt('p', null, String((err && err.message) || err)));
      body.appendChild(msg);
    }
  },
};
