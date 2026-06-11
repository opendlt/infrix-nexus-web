// Nexus — #/app Prompt-to-Proof App Studio (nextux-16): the single golden front
// door. Describe a verifiable app in plain language and Infrix builds it, runs
// it, proves it, replays it, and ships the SDK + widget. This surface shows that
// flow honestly: what Infrix will build from the prompt, the workflow it grounds
// to, the generated artifacts, the verifier's verdict (never the app's), and the
// honest next steps. Local proof caps at L3; L4 needs a live Kermit run; nothing
// targets mainnet; the node is never trusted.

import { elt, setAttrs } from '/lib/uxDom.js';
import {
  loadApp, isLive, prompt, flowTitle, nodes, artifacts, latestRun, assurance,
  nextActions, shareLink, pattern, assuranceLabel, deferred, whyItMatters,
} from '/lib/app.js';

function sourceBanner() {
  const wrap = elt('section', 'app-banner');
  setAttrs(wrap, { role: 'note' });
  wrap.appendChild(elt('strong', 'app-banner-tag', 'Describe it. Infrix proves it.'));
  wrap.appendChild(elt('span', 'app-banner-text',
    ' — one prompt becomes a governed workflow, a real proof, a replay, and a shippable SDK + widget. Assurance always comes from the verifier; the node is never trusted.'));
  const src = elt('p', 'app-source');
  setAttrs(src, { 'data-live': String(isLive()) });
  src.textContent = isLive()
    ? 'Live app workspace connected.'
    : 'Showing a worked example (run `infrix new verifiable-app <name> "<prompt>"` on your own).';
  wrap.appendChild(src);
  return wrap;
}

function promptPanel() {
  const panel = elt('section', 'app-prompt');
  setAttrs(panel, { 'aria-label': 'The prompt' });
  panel.appendChild(elt('h3', 'app-subtitle', 'You describe'));
  const q = elt('blockquote', 'app-prompt-text');
  q.textContent = prompt();
  panel.appendChild(q);
  const p = pattern();
  if (p) {
    const tag = elt('p', 'app-pattern');
    tag.appendChild(elt('span', 'app-pattern-label', 'Familiar pattern: '));
    tag.appendChild(elt('span', 'app-pattern-id', p.id + ' (' + p.title + ')'));
    panel.appendChild(tag);
  }
  return panel;
}

function workflowPanel() {
  const panel = elt('section', 'app-workflow');
  setAttrs(panel, { 'aria-label': 'What Infrix builds' });
  panel.appendChild(elt('h3', 'app-subtitle', 'Infrix builds — ' + flowTitle()));
  const ol = elt('ol', 'app-step-list');
  for (const n of nodes()) {
    const li = elt('li', 'app-step');
    setAttrs(li, { 'data-kind': n.kind });
    li.appendChild(elt('span', 'app-step-kind', n.kind));
    li.appendChild(elt('span', 'app-step-label', n.label));
    ol.appendChild(li);
  }
  panel.appendChild(ol);
  return panel;
}

function assurancePanel() {
  const panel = elt('section', 'app-assurance');
  setAttrs(panel, { 'aria-label': 'Assurance' });
  panel.appendChild(elt('h3', 'app-subtitle', 'The proof (from the verifier)'));
  const a = assurance();
  const label = elt('p', 'app-assurance-label');
  setAttrs(label, { 'data-verified': String(!!(a && a.verified)), 'data-l0': String(!!(a && a.l0Verified)) });
  label.textContent = assuranceLabel();
  panel.appendChild(label);

  if (a) {
    const badges = elt('ul', 'app-badges');
    const add = (text, ok) => {
      const li = elt('li', 'app-badge');
      setAttrs(li, { 'data-ok': String(ok) });
      li.textContent = text;
      badges.appendChild(li);
    };
    add(a.proofLevel + ' / ' + a.governanceLevel, a.verified);
    add(a.verified ? 'verified' : 'not verified', a.verified);
    add(a.l0Verified ? 'L0 confirmed' : 'L0 not checked (local)', a.l0Verified);
    add('node never trusted', !a.nodeTrusted);
    panel.appendChild(badges);
  }

  const def = deferred();
  if (def.length) {
    const box = elt('div', 'app-deferred');
    setAttrs(box, { role: 'note', 'aria-label': 'Deferred to Kermit' });
    box.appendChild(elt('strong', 'app-deferred-tag', 'Honestly deferred to Kermit:'));
    const ul = elt('ul', 'app-deferred-list');
    for (const d of def) ul.appendChild(elt('li', null, d));
    box.appendChild(ul);
    panel.appendChild(box);
  }
  return panel;
}

function artifactsPanel() {
  const panel = elt('section', 'app-artifacts');
  setAttrs(panel, { 'aria-label': 'Generated artifacts' });
  panel.appendChild(elt('h3', 'app-subtitle', 'Infrix ships'));
  const ul = elt('ul', 'app-artifact-list');
  for (const art of artifacts()) {
    const li = elt('li', 'app-artifact');
    setAttrs(li, { 'data-format': art.format, 'data-mainnet-disabled': String(!!art.mainnetDisabled) });
    li.appendChild(elt('span', 'app-artifact-format', art.format));
    li.appendChild(elt('span', 'app-artifact-file', art.filename));
    ul.appendChild(li);
  }
  panel.appendChild(ul);
  const link = shareLink();
  if (link) {
    const share = elt('p', 'app-share');
    share.appendChild(elt('span', 'app-share-label', 'Shareable proof bundle: '));
    share.appendChild(elt('code', 'app-share-link', link));
    share.appendChild(elt('span', 'app-share-note', ' — anyone can replay + verify it offline, no node, no trust.'));
    panel.appendChild(share);
  }
  return panel;
}

function nextPanel() {
  const panel = elt('section', 'app-next');
  setAttrs(panel, { 'aria-label': 'Next steps' });
  panel.appendChild(elt('h3', 'app-subtitle', 'Continue'));
  const ul = elt('ul', 'app-next-list');
  for (const na of nextActions()) {
    const li = elt('li', 'app-next-item');
    li.appendChild(elt('code', 'app-next-command', na.command));
    li.appendChild(elt('span', 'app-next-why', ' — ' + na.why));
    ul.appendChild(li);
  }
  panel.appendChild(ul);
  return panel;
}

function whyPanel() {
  const panel = elt('section', 'app-why');
  setAttrs(panel, { 'aria-label': 'Why this matters' });
  panel.appendChild(elt('h3', 'app-subtitle', 'Why this is different'));
  panel.appendChild(elt('p', 'app-why-text', whyItMatters()));
  return panel;
}

function populate(body) {
  body.appendChild(sourceBanner());
  const grid = elt('div', 'app-grid-layout');
  const left = elt('div', 'app-col');
  left.appendChild(promptPanel());
  left.appendChild(workflowPanel());
  grid.appendChild(left);
  const right = elt('div', 'app-col');
  right.appendChild(assurancePanel());
  right.appendChild(artifactsPanel());
  if (latestRun()) right.appendChild(nextPanel());
  grid.appendChild(right);
  body.appendChild(grid);
  body.appendChild(whyPanel());
}

export const appView = {
  async mount(root) {
    root.replaceChildren();
    const shell = elt('div', 'workspace app-view');
    const header = elt('header', 'workspace-header');
    header.appendChild(setAttrs(elt('h1', 'workspace-title', 'Prompt to Proof'), { id: 'app-title' }));
    header.appendChild(elt('p', 'workspace-subtitle',
      'Describe a verifiable app in plain language. Infrix grounds it, builds the workflow + SDK, runs it for a real proof, and lets anyone verify it without trusting the node.'));
    shell.appendChild(header);
    const body = elt('div', 'app-body');
    body.appendChild(elt('p', 'app-loading', 'Loading the studio…'));
    shell.appendChild(body);
    root.appendChild(shell);

    try {
      await loadApp();
      body.replaceChildren();
      populate(body);
    } catch (err) {
      body.replaceChildren();
      const msg = elt('div', 'app-error');
      msg.setAttribute('role', 'alert');
      msg.appendChild(elt('strong', null, 'Could not load the studio.'));
      msg.appendChild(elt('p', null, String((err && err.message) || err)));
      body.appendChild(msg);
    }
  },
};
