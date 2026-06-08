// Nexus — Start page (adoption-02 persona entry points).
//
// Route:
//   #/start    — "What are you trying to do?" four-card chooser
//
// The start page asks one question and routes the user to one curated guided
// flow, instead of exposing the whole platform on day one. It uses the SAME
// four persona names as the `infrix start` CLI and the docs/personas/* guides
// so a user never has to wonder which guide matches which screen.
//
// Deliberately plain language: the start page does not show internal
// vocabulary — just the four things a newcomer might want to do.

// The four curated paths. `flow` is the in-app guided route each card opens;
// `action` is the matching first step from the CLI / SDK so the surfaces line
// up. Kept in display order.
const PATHS = [
  {
    id: 'dapp',
    title: 'Build an app',
    blurb: 'Build quickly, call a few SDK methods, and watch a governed flow produce a proof.',
    action: 'npx create-infrix-app my-escrow --template golden-escrow',
    flow: '#/spine',
    cta: 'Watch a governed flow',
  },
  {
    id: 'operator',
    title: 'Operate a node',
    blurb: 'Check whether a node is production-ready and see every dependency in one dashboard.',
    action: 'infrix node-validate --config <config> --profile public_production --json',
    flow: '#/operate',
    cta: 'Open the operations console',
  },
  {
    id: 'auditor',
    title: 'Verify a proof',
    blurb: 'Check a proof without trusting the node that produced it. Drop a bundle and verify.',
    action: 'infrix verify <bundle> --l0 <endpoint>',
    flow: '#/prove',
    cta: 'Open the proof verifier',
  },
  {
    id: 'metamask',
    title: 'Use MetaMask',
    blurb: 'Keep your wallet. Sign typed data and submit a governed intent with the SDK.',
    action: 'const app = withMetaMask(client); await app.metamask.submitIntent(...)',
    flow: '#/compose',
    cta: 'Compose an intent',
  },
];

function buildCard(p) {
  const card = document.createElement('a');
  card.className = 'start-card';
  card.href = p.flow;
  card.dataset.path = p.id;
  card.setAttribute('aria-label', p.title + ' — ' + p.cta);

  const h = document.createElement('h3');
  h.className = 'start-card-title';
  h.textContent = p.title;
  card.appendChild(h);

  const blurb = document.createElement('p');
  blurb.className = 'start-card-blurb';
  blurb.textContent = p.blurb;
  card.appendChild(blurb);

  const code = document.createElement('code');
  code.className = 'start-card-action';
  code.textContent = p.action;
  card.appendChild(code);

  const cta = document.createElement('span');
  cta.className = 'start-card-cta';
  cta.textContent = p.cta + ' →';
  card.appendChild(cta);

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
    title.textContent = 'What are you trying to do?';
    head.appendChild(title);
    const sub = document.createElement('p');
    sub.className = 'workspace-subtitle';
    sub.textContent = 'Pick a path. Each one shows a single first step and where to go next.';
    head.appendChild(sub);
    shell.appendChild(head);

    const grid = document.createElement('section');
    grid.className = 'start-grid';
    grid.setAttribute('aria-label', 'Choose your path');
    for (const p of PATHS) {
      grid.appendChild(buildCard(p));
    }
    shell.appendChild(grid);

    const foot = document.createElement('p');
    foot.className = 'start-foot';
    foot.textContent = 'Prefer the terminal? Run "infrix start" for the same four paths.';
    shell.appendChild(foot);
  },

  // The start page has no sub-routes; re-showing it is a no-op.
  onSubpathChange() {},
};
