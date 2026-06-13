// Nexus — copy-to-clipboard command block (plan-12 delight polish).
//
// Renders a <code> command next to an accessible Copy button. Copying is
// best-effort (clipboard access can be denied); the button never throws and
// announces success to assistive tech via aria-live. The button carries visible
// text AND an aria-label, and is styled for contrast in styles.css (.copy-btn),
// so the UX-gate axe checks pass.

import { elt, setAttrs } from '/lib/uxDom.js';

/**
 * copyCommand builds an accessible copyable command block.
 * @param {string} command - the shell command text.
 * @param {string} [label] - accessible label suffix (e.g. "the build command").
 * @returns {HTMLElement}
 */
export function copyCommand(command, label) {
  const wrap = elt('div', 'copy-command');
  const code = elt('code', 'copy-command-text', command);
  setAttrs(code, { 'data-command': command });
  wrap.appendChild(code);

  const btn = elt('button', 'copy-btn', 'Copy');
  setAttrs(btn, { type: 'button', 'aria-label': 'Copy ' + (label || ('the command: ' + command)) });
  const live = elt('span', 'sr-only');
  setAttrs(live, { 'aria-live': 'polite', role: 'status' });

  btn.addEventListener('click', async () => {
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(command);
        ok = true;
      }
    } catch (_) {
      ok = false;
    }
    btn.textContent = ok ? 'Copied' : 'Copy';
    live.textContent = ok ? 'Command copied to clipboard.' : 'Copy not available; select the command to copy it.';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
  });

  wrap.appendChild(btn);
  wrap.appendChild(live);
  return wrap;
}
