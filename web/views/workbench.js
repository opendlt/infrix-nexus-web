// Nexus — #/workbench Intent Copilot Workbench (nextux-06).
//
// "What do you want to prove or do?" — shows how a plain-language request becomes
// a grounded, typed plan: ranked candidate cards (confidence + why), the
// selection, the safety envelope, missing inputs, and an approval note. It also
// shows a hard-refusal example with its nearest safe alternative. It renders a
// real Go-generated sample plan; the browser NEVER runs — run flows through the
// approval-gated CLI / agent action.

import { elt, setAttrs } from '/lib/uxDom.js';
import {
  loadWorkbench, askCase, refusalCase, askPlan, refusalPlan,
  missingInputs, verifyPlanHonesty, kindBadge, ROLE_VARS,
} from '/lib/workbench.js';

function kindChip(kind) {
  const b = kindBadge(kind);
  const chip = elt('span', 'wb-kind wb-kind-' + b.role);
  setAttrs(chip, { 'data-kind': kind, 'aria-label': 'Kind: ' + b.label, style: '--role-fg:' + ROLE_VARS[b.role] });
  const g = elt('span', 'wb-kind-glyph', b.glyph);
  setAttrs(g, { 'aria-hidden': 'true' });
  chip.appendChild(g);
  chip.appendChild(elt('span', 'wb-kind-label', b.label));
  return chip;
}

function candidateCard(c, selected) {
  const card = elt('article', 'wb-candidate');
  setAttrs(card, {
    'data-kind': c.kind, 'data-id': c.id,
    'data-selected': String(!!selected),
    'aria-label': 'Candidate: ' + c.id,
  });
  const head = elt('div', 'wb-candidate-head');
  head.appendChild(kindChip(c.kind));
  head.appendChild(elt('span', 'wb-candidate-id', c.id));
  const conf = elt('span', 'wb-candidate-conf', Math.round((c.confidence || 0) * 100) + '%');
  setAttrs(conf, { 'aria-label': 'Confidence ' + Math.round((c.confidence || 0) * 100) + ' percent' });
  head.appendChild(conf);
  if (selected) head.appendChild(elt('span', 'wb-selected-badge', 'selected'));
  card.appendChild(head);
  card.appendChild(elt('p', 'wb-candidate-title', c.title));
  card.appendChild(elt('p', 'wb-candidate-why', c.why));
  if (c.missingInputs && c.missingInputs.length) {
    card.appendChild(elt('p', 'wb-candidate-missing', 'Needs: ' + c.missingInputs.join(', ')));
  }
  return card;
}

function safetyPanel(plan) {
  const s = plan.safety || {};
  const panel = elt('section', 'wb-safety');
  setAttrs(panel, { 'aria-label': 'Plan safety envelope' });
  panel.appendChild(elt('h3', 'wb-subtitle', 'Safety'));
  const dl = elt('dl', 'wb-safety-grid');
  const row = (k, v) => { dl.appendChild(elt('dt', null, k)); dl.appendChild(elt('dd', 'mono', String(v))); };
  row('Network', plan.network);
  row('Dry-run required', s.requiresDryRun);
  row('Approval required', s.requiresApproval);
  row('Network writes', s.networkWrites);
  row('Mainnet write', s.mainnetWrite);
  panel.appendChild(dl);
  return panel;
}

function refusalPanel(rc) {
  const plan = rc.plan;
  const panel = elt('section', 'wb-refusal');
  setAttrs(panel, { 'aria-label': 'Hard-refusal example' });
  panel.appendChild(elt('h2', 'wb-section-title', 'Hard refusal (fails closed)'));
  panel.appendChild(elt('p', 'wb-refusal-request', '“' + rc.request + '”'));
  const ul = elt('ul', 'wb-refusal-list');
  for (const r of plan.refusals || []) {
    const li = elt('li', 'wb-refusal-item');
    setAttrs(li, { 'data-code': r.code });
    li.appendChild(elt('span', 'wb-refusal-reason', r.reason));
    li.appendChild(elt('p', 'wb-refusal-alt', 'Nearest safe alternative: ' + r.safeAlternative));
    ul.appendChild(li);
  }
  panel.appendChild(ul);
  return panel;
}

function populate(root) {
  const ask = askCase();
  const plan = askPlan();
  const wrap = elt('div', 'workbench-view-body');

  // The ask.
  const askSec = elt('section', 'wb-ask');
  askSec.appendChild(elt('h2', 'wb-section-title', 'What do you want to prove or do?'));
  const field = elt('p', 'wb-request');
  setAttrs(field, { 'aria-label': 'Sample request' });
  field.textContent = '“' + ask.request + '”';
  askSec.appendChild(field);
  askSec.appendChild(elt('p', 'wb-note',
    'Infrix grounds your words in real capabilities (tasks, scenarios, actions) — it never invents one, never runs a model’s output directly, and never writes mainnet by default.'));
  wrap.appendChild(askSec);

  // Candidates.
  const candSec = elt('section', 'wb-candidates');
  candSec.appendChild(elt('h2', 'wb-section-title', 'Grounded candidates'));
  for (const c of plan.candidates || []) {
    const selected = plan.selected && c.kind === plan.selected.kind && c.id === plan.selected.id;
    candSec.appendChild(candidateCard(c, selected));
  }
  wrap.appendChild(candSec);

  // Selected + safety.
  if (plan.selected) {
    const selSec = elt('section', 'wb-selected');
    selSec.appendChild(elt('h2', 'wb-section-title', 'Selected'));
    selSec.appendChild(elt('p', 'wb-selected-line',
      `${plan.selected.id} — ${plan.selected.title} (${plan.selected.kind})`));
    const miss = missingInputs(plan);
    if (miss.length) {
      selSec.appendChild(elt('p', 'wb-selected-missing', 'Provide before running: ' + miss.join(', ')));
    }
    selSec.appendChild(safetyPanel(plan));
    wrap.appendChild(selSec);
  }

  // Approval / run note (browser never runs).
  const run = elt('section', 'wb-run');
  run.appendChild(elt('h2', 'wb-section-title', 'Dry-run, approve, run (in your terminal)'));
  run.appendChild(elt('p', 'wb-run-note',
    'Running mutates state and needs a plan-hash-bound approval. The browser never runs — do it yourself:'));
  run.appendChild(elt('code', 'wb-run-cmd', 'infrix workbench dry-run plan.infrixplan.json'));
  run.appendChild(elt('code', 'wb-run-cmd', 'infrix workbench run plan.infrixplan.json --approve'));
  wrap.appendChild(run);

  // Refusal example.
  wrap.appendChild(refusalPanel(refusalCase()));

  // Honesty check (mirrors the engine invariants).
  const issues = verifyPlanHonesty(plan).concat(verifyPlanHonesty(refusalPlan()));
  const honest = elt('p', 'wb-honesty');
  setAttrs(honest, { 'data-ok': String(issues.length === 0), role: 'status' });
  honest.textContent = issues.length === 0
    ? '✔ Both plans satisfy the workbench safety invariants (never mainnet, refusals select nothing, every refusal has a safe alternative, no invented selection).'
    : '✘ Invariant violations: ' + issues.join('; ');
  wrap.appendChild(honest);

  root.appendChild(wrap);
}

export const workbenchView = {
  async mount(root) {
    root.replaceChildren();
    const shell = elt('div', 'workspace workbench-view');
    const header = elt('header', 'workspace-header');
    header.appendChild(setAttrs(elt('h1', 'workspace-title', 'Intent Copilot'), { id: 'workbench-title' }));
    header.appendChild(elt('p', 'workspace-subtitle', 'Describe an outcome; get a grounded, inspectable, runnable plan — candidates, safety, and an honest refusal when needed.'));
    shell.appendChild(header);
    const body = elt('div', 'workbench-body');
    body.appendChild(elt('p', 'workbench-loading', 'Loading the workbench sample…'));
    shell.appendChild(body);
    root.appendChild(shell);

    try {
      await loadWorkbench();
      body.replaceChildren();
      populate(body);
    } catch (err) {
      body.replaceChildren();
      const msg = elt('div', 'workbench-error');
      msg.setAttribute('role', 'alert');
      msg.appendChild(elt('strong', null, 'Could not load the workbench sample.'));
      msg.appendChild(elt('p', null, String((err && err.message) || err)));
      body.appendChild(msg);
    }
  },
};
