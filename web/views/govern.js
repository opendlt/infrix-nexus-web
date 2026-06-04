// Nexus — Govern Atlas view.
//
// NEXUS-REIMAGINED-2026-05-10 Phase 6 — Govern Atlas.
//
// Routes:
//   #/govern                       — atlas index (Actors tab)
//   #/govern/<kind>                — kind-filtered list
//   #/govern/<kind>/<nodeId>       — drilldown drawer for a single node
//
// The atlas is the spec's "graph explorer for actors / roles /
// capabilities / policies / approvals / trust / plugins" — every
// node row clicks through to the drawer, which renders the spec-
// defined deep paths (role derivation, capability delegation, policy
// decision trace, trust drift impact, plugin descriptor + lifecycle).

import { rpcWithDisclosure, errorStateNode } from '/lib/spineCommon.js';
import { renderGovernAtlas, renderGovernNode } from '/lib/governAtlas.js';

const KIND_TO_NODE_KIND = {
  actors:        'actor',
  roles:         'role',
  capabilities:  'capability',
  policies:      'policy',
  approvals:     'approval',
  trustProfiles: 'trust',
  plugins:       'plugin',
};

let rootEl = null;
let bodyEl = null;
let atlasEl = null;
let drawerEl = null;
let currentKind = null;
let currentNodeId = null;

export const governView = {
  async mount(root, subpath) {
    rootEl = root;
    rootEl.replaceChildren();
    const shell = document.createElement('div');
    shell.className = 'workspace govern-canvas';
    rootEl.appendChild(shell);

    const head = document.createElement('header');
    head.className = 'workspace-header';
    const title = document.createElement('h2');
    title.className = 'workspace-title';
    title.textContent = 'Authority & permissions';
    head.appendChild(title);
    const sub = document.createElement('p');
    sub.className = 'workspace-subtitle';
    sub.textContent = 'Who can do what — actors, roles, capabilities, policies, trust profiles, and plugins.';
    head.appendChild(sub);
    shell.appendChild(head);

    const main = document.createElement('section');
    main.className = 'govern-main';
    shell.appendChild(main);

    bodyEl = document.createElement('div');
    bodyEl.className = 'govern-body';
    bodyEl.id = 'governBody';
    main.appendChild(bodyEl);

    atlasEl = document.createElement('div');
    atlasEl.className = 'govern-atlas-host';
    bodyEl.appendChild(atlasEl);

    drawerEl = document.createElement('div');
    drawerEl.className = 'govern-drawer-host';
    bodyEl.appendChild(drawerEl);

    currentKind = (subpath && subpath[0]) || 'actors';
    currentNodeId = (subpath && subpath[1]) || null;
    await refresh();
  },

  async onSubpathChange(subpath) {
    currentKind = (subpath && subpath[0]) || 'actors';
    currentNodeId = (subpath && subpath[1]) || null;
    await refresh();
  },
};

async function refresh() {
  if (!atlasEl) return;
  // Atlas
  try {
    const atlas = await rpcWithDisclosure('nexus.governAtlas', { limit: 500 });
    atlasEl.replaceChildren(renderGovernAtlas(atlas, {
      activeKind: currentKind,
      onNodeOpen: (kind, id) => {
        const flat = ({
          actor: 'actors', role: 'roles', capability: 'capabilities',
          policy: 'policies', approval: 'approvals',
          trust: 'trustProfiles', plugin: 'plugins',
        })[kind] || kind;
        window.location.hash = `#/govern/${encodeURIComponent(flat)}/${encodeURIComponent(id)}`;
      },
    }));
  } catch (err) {
    atlasEl.replaceChildren(errorStateNode(err));
  }

  // Drawer
  if (currentNodeId) {
    const nodeKind = KIND_TO_NODE_KIND[currentKind] || currentKind;
    drawerEl.replaceChildren(loadingNode('Loading drawer…'));
    drawerEl.classList.add('open');
    try {
      const node = await rpcWithDisclosure('nexus.governNode', { kind: nodeKind, id: currentNodeId });
      drawerEl.replaceChildren(renderGovernNode(node));
      const close = document.createElement('a');
      close.className = 'govern-drawer-close';
      close.href = '#/govern/' + encodeURIComponent(currentKind);
      close.textContent = '× Close drawer';
      drawerEl.prepend(close);
    } catch (err) {
      drawerEl.replaceChildren(errorStateNode(err));
    }
  } else {
    drawerEl.classList.remove('open');
    drawerEl.replaceChildren();
  }
}

function loadingNode(text) {
  const p = document.createElement('p');
  p.className = 'govern-loading';
  p.textContent = text;
  return p;
}
