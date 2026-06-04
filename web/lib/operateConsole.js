// Nexus — operate console (slide-in panel).
//
// Operate is "behind the scenes". It doesn't compete for primary
// real estate. Tap the small console button in the telemetry rail
// (or press the `o` shortcut after `g`) to slide a console up from
// the bottom of the viewport. Three sub-tabs: Network / Verify /
// Subsystems. Click outside or press Esc to close.

import { networkView } from '/views/network.js';
import { verifyView } from '/views/verify.js';
import { subsystemsView } from '/views/subsystems.js';

let host = null;
let openPanel = null;

const TABS = [
  { id: 'network',    label: 'Network',    sub: 'anchor mode · plugin admission · trust drift', view: networkView },
  { id: 'verify',     label: 'Verify',     sub: 'portable + L0 cross-check', view: verifyView },
  { id: 'subsystems', label: 'Subsystems', sub: 'peer execution families', view: subsystemsView },
];

export function openOperateConsole(initialTab = 'network') {
  if (openPanel) {
    closeOperateConsole();
    return;
  }
  if (!host) {
    host = document.createElement('div');
    host.className = 'op-console-host';
    document.body.appendChild(host);
  }
  // Backdrop
  const back = document.createElement('div');
  back.className = 'op-console-backdrop';
  back.addEventListener('click', closeOperateConsole);
  host.appendChild(back);

  // Panel
  const panel = document.createElement('section');
  panel.className = 'op-console';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Operate console');

  // Header: brand + tabs + close
  const head = document.createElement('div');
  head.className = 'op-console-head';
  const brand = document.createElement('div');
  brand.className = 'op-console-brand';
  brand.innerHTML = '<span class="op-icon">⚙</span><span>Operate console</span>';
  head.appendChild(brand);
  const tabBar = document.createElement('div');
  tabBar.className = 'op-tabs';
  let activeTab = initialTab;
  const tabButtons = {};
  for (const t of TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'op-tab';
    if (t.id === activeTab) btn.classList.add('active');
    btn.innerHTML = `<span class="op-tab-label">${t.label}</span><span class="op-tab-sub">${t.sub}</span>`;
    btn.addEventListener('click', () => activate(t.id));
    tabBar.appendChild(btn);
    tabButtons[t.id] = btn;
  }
  head.appendChild(tabBar);
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'op-close';
  closeBtn.setAttribute('aria-label', 'Close console');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', closeOperateConsole);
  head.appendChild(closeBtn);
  panel.appendChild(head);

  // Body
  const body = document.createElement('div');
  body.className = 'op-console-body';
  panel.appendChild(body);

  function activate(tabId) {
    activeTab = tabId;
    for (const id of Object.keys(tabButtons)) tabButtons[id].classList.toggle('active', id === tabId);
    body.replaceChildren();
    const t = TABS.find((x) => x.id === tabId);
    if (t && t.view && typeof t.view.mount === 'function') t.view.mount(body, []);
  }
  activate(activeTab);

  host.appendChild(panel);
  // Animate in
  requestAnimationFrame(() => {
    back.classList.add('open');
    panel.classList.add('open');
  });

  openPanel = { back, panel };

  // Esc close
  document.addEventListener('keydown', escHandler);
}

function escHandler(ev) {
  if (ev.key === 'Escape' && openPanel) closeOperateConsole();
}

export function closeOperateConsole() {
  if (!openPanel) return;
  openPanel.back.classList.remove('open');
  openPanel.panel.classList.remove('open');
  setTimeout(() => {
    if (host) host.replaceChildren();
    openPanel = null;
  }, 280);
  document.removeEventListener('keydown', escHandler);
}
