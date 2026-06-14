// Nexus — Guided start page (adoption-02 + adoption-04).
//
// Route:
//   #/start    — "What do you want to do?" — five guided task cards.
//
// This is the guided-mode front door. It asks one question and routes a
// newcomer into a guided flow (#/guided/<task>) instead of the full
// canonical spine. Expert mode (the deep spine/evidence/policy surfaces) is
// always one toggle away in the header and is never hidden.
//
// Each card carries: a title, a one-sentence value, a time estimate, the
// required setup, a Start button, and a "learn what this proves" link.

// The five product tasks, in display order. `flow` is the guided route the
// Start button opens; `learn` points at the expert surface that shows what
// the task proves (so guided always has a door into expert).
const TASKS = [
  {
    id: 'escrow',
    title: 'Run a governed escrow',
    value: 'Submit a governed escrow and watch it become a verifiable proof.',
    time: '~5 min',
    setup: 'Local demo — no setup',
    flow: '#/guided/escrow',
    learn: '#/prove',
  },
  {
    id: 'verify',
    title: 'Verify a proof',
    value: 'Check a proof here in your browser, without trusting any node.',
    time: '~2 min',
    setup: 'A proof file, or use the bundled sample',
    flow: '#/guided/verify',
    learn: '#/prove',
  },
  {
    id: 'inspect',
    title: 'Watch execution replay',
    value: 'See what happened, who approved it, and what proof backs it.',
    time: '~3 min',
    setup: 'Local demo — no setup',
    flow: '#/guided/inspect',
    learn: '#/spine',
  },
  {
    id: 'readiness',
    title: 'Check production readiness',
    value: 'See whether a node can make public-production claims, and what is missing.',
    time: '~2 min',
    setup: 'A running node (the demo answers locally)',
    flow: '#/guided/readiness',
    learn: '#/operate',
  },
  {
    id: 'metamask',
    title: 'Sign with MetaMask',
    value: 'Use your existing wallet to sign a typed-data governed intent.',
    time: '~8 min',
    setup: 'MetaMask (SDK/API support + acceptance harness)',
    flow: '#/guided/metamask',
    learn: '#/compose',
  },
];

function buildCard(t) {
  const card = document.createElement('div');
  card.className = 'start-card';
  card.dataset.flow = t.id;

  const h = document.createElement('h3');
  h.className = 'start-card-title';
  h.textContent = t.title;
  card.appendChild(h);

  const value = document.createElement('p');
  value.className = 'start-card-value';
  value.textContent = t.value;
  card.appendChild(value);

  const meta = document.createElement('div');
  meta.className = 'start-card-meta';
  const time = document.createElement('span');
  time.className = 'start-card-time';
  time.textContent = t.time;
  const setup = document.createElement('span');
  setup.className = 'start-card-setup';
  setup.textContent = t.setup;
  meta.appendChild(time);
  meta.appendChild(setup);
  card.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'start-card-actions';
  const start = document.createElement('a');
  start.className = 'start-card-start';
  start.href = t.flow;
  start.dataset.start = t.id;
  start.textContent = 'Start →';
  start.setAttribute('aria-label', 'Start: ' + t.title);
  actions.appendChild(start);

  const learn = document.createElement('a');
  learn.className = 'start-card-learn';
  learn.href = t.learn;
  learn.textContent = 'Learn what this proves';
  actions.appendChild(learn);

  card.appendChild(actions);
  return card;
}

export const startView = {
  mount(root) {
    root.replaceChildren();

    const shell = document.createElement('div');
    shell.className = 'workspace start-canvas';
    root.appendChild(shell);

    const head = document.createElement('header');
    head.className = 'workspace-header';
    const title = document.createElement('h2');
    title.className = 'workspace-title';
    title.textContent = 'What do you want to do?';
    head.appendChild(title);
    const sub = document.createElement('p');
    sub.className = 'workspace-subtitle';
    sub.textContent = 'Pick a task. Each one walks you through it in plain language — switch to Expert in the header any time for the full spine.';
    head.appendChild(sub);

    // adoption-11 — a low-key door into the learning ladder for newcomers who
    // want the concepts before a task.
    const learnLink = document.createElement('a');
    learnLink.className = 'start-learn-link';
    learnLink.href = '#/learn';
    learnLink.textContent = 'New to Infrix? Learn the concepts →';
    head.appendChild(learnLink);

    shell.appendChild(head);

    const grid = document.createElement('section');
    grid.className = 'start-grid';
    grid.setAttribute('aria-label', 'Guided tasks');
    for (const t of TASKS) {
      grid.appendChild(buildCard(t));
    }
    shell.appendChild(grid);

    const foot = document.createElement('p');
    foot.className = 'start-foot';
    foot.textContent = 'Prefer the terminal? The golden path is one command: ' +
      'infrix new verifiable-app my-escrow "escrow that releases when two approvers sign" — ' +
      'then infrix verify .infrixapp/my-escrow/runs/run-1/proof.infrix.json. ' +
      'Run "infrix start" (or "infrix start --agent" for JSON) for the full plan.';
    shell.appendChild(foot);
  },

  // The start page has no sub-routes.
  onSubpathChange() {},
};
