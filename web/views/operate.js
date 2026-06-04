// Nexus — OPERATE mode.
//
// The cockpit's instruments. Network status (anchor mode, L0 endpoint,
// block height, plugin admission, trust drift, workflow health),
// the operator-trust-free Verify suite (portable-package drop-in
// verifier + Accumulate L0 cross-checker), and the Subsystems hub
// (peer execution families that operate alongside the canonical
// spine: Settlement / Bridge / Arbitration / Adaptive / Disclosure /
// Confidential / Verifier / Pending / Ghost / Replay / Temporal).
//
// All three live under one mode because they're about the *runtime
// hosting the spine* rather than any particular spine flow.

import { networkView } from '/views/network.js';
import { verifyView } from '/views/verify.js';
import { subsystemsView } from '/views/subsystems.js';

const TABS = [
  { id: 'network',    label: 'Network',    sub: 'anchor mode · plugin admission · trust drift' },
  { id: 'verify',     label: 'Verify',     sub: 'portable-package + L0 cross-check' },
  { id: 'subsystems', label: 'Subsystems', sub: 'peer execution families' },
];

let rootEl = null;
let activeTab = 'network';
let subSubpath = [];

export const operateView = {
  mount(root, subpath) {
    rootEl = root;
    parseSubpath(subpath);
    render();
  },
  onSubpathChange(subpath) {
    parseSubpath(subpath);
    render();
  },
};

function parseSubpath(subpath) {
  if (!Array.isArray(subpath) || subpath.length === 0) {
    activeTab = 'network';
    subSubpath = [];
    return;
  }
  // Accept #/operate/verify-l0 as an alias for verify with a sub-route
  if (subpath[0] === 'verify-l0') {
    activeTab = 'verify';
    subSubpath = ['_l0'];
    return;
  }
  const found = TABS.find((t) => t.id === subpath[0]);
  activeTab = found ? subpath[0] : 'network';
  subSubpath = subpath.slice(1);
}

function render() {
  if (!rootEl) return;
  rootEl.replaceChildren();

  // Tab bar
  const bar = document.createElement('div');
  bar.className = 'operate-tabs';
  for (const t of TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'operate-tab';
    if (t.id === activeTab) btn.classList.add('active');
    btn.addEventListener('click', () => {
      window.location.hash = '#/operate/' + t.id;
    });
    const label = document.createElement('div');
    label.className = 'operate-tab-label';
    label.textContent = t.label;
    btn.appendChild(label);
    const sub = document.createElement('div');
    sub.className = 'operate-tab-sub';
    sub.textContent = t.sub;
    btn.appendChild(sub);
    bar.appendChild(btn);
  }
  rootEl.appendChild(bar);

  // Active tab body
  const body = document.createElement('div');
  body.className = 'operate-body';
  rootEl.appendChild(body);

  switch (activeTab) {
    case 'network':    networkView.mount(body, subSubpath); break;
    case 'verify':     verifyView.mount(body, subSubpath); break;
    case 'subsystems': subsystemsView.mount(body, subSubpath); break;
  }
}
