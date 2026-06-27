// RUNBOOK-06 Task 6 — the phone-only nav disclosure (hamburger). Drives
// initMobileNav against a DOM shim and asserts: the toggle is un-hidden and
// wired, aria-expanded + .is-open track the open state, Escape closes and
// restores focus to the toggle, an outside pointerdown closes it, choosing a
// link closes it, and destroy() unbinds.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(here, '_resolve_lib.mjs')).href);

let focusedEl = null;

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.hidden = false;
    this._attrs = {};
    this._listeners = new Map();
    this.classList = {
      _set: new Set(),
      add: (c) => this.classList._set.add(c),
      remove: (c) => this.classList._set.delete(c),
      contains: (c) => this.classList._set.has(c),
      toggle: (c, force) => {
        const on = force === undefined ? !this.classList._set.has(c) : !!force;
        if (on) this.classList._set.add(c); else this.classList._set.delete(c);
        return on;
      },
    };
  }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return this._attrs[k]; }
  addEventListener(t, fn) { if (!this._listeners.has(t)) this._listeners.set(t, []); this._listeners.get(t).push(fn); }
  removeEventListener(t, fn) { const a = this._listeners.get(t) || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  fire(t, ev) { for (const fn of (this._listeners.get(t) || []).slice()) fn(ev || { preventDefault() {} }); }
  focus() { focusedEl = this; }
  contains(node) { if (node === this) return true; for (const c of this.children) if (c.contains && c.contains(node)) return true; return false; }
  closest(sel) {
    // Only 'a, .workspace-link' is used; match by tag or class up the parent chain.
    let el = this;
    while (el) {
      const isA = el.tagName === 'A';
      const isWL = el.classList && el.classList.contains('workspace-link');
      if (isA || isWL) return el;
      el = el.parentNode;
    }
    return null;
  }
}

function buildDom() {
  focusedEl = null;
  const docListeners = new Map();
  const toggle = new El('button');
  toggle.hidden = true;
  toggle.setAttribute('aria-expanded', 'false');
  const nav = new El('nav');
  const link = new El('a');
  nav.appendChild(link);

  globalThis.document = {
    getElementById: (id) => (id === 'navToggle' ? toggle : id === 'headerWorkspaces' ? nav : null),
    addEventListener: (t, fn, capture) => { const k = t + (capture ? ':cap' : ''); if (!docListeners.has(k)) docListeners.set(k, []); docListeners.get(k).push(fn); },
    removeEventListener: (t, fn, capture) => { const k = t + (capture ? ':cap' : ''); const a = docListeners.get(k) || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
    _fire: (t, ev, capture) => { const k = t + (capture ? ':cap' : ''); for (const fn of (docListeners.get(k) || []).slice()) fn(ev); },
  };
  return { toggle, nav, link };
}

const { initMobileNav } = await import('/lib/mobileNav.js');

test('initMobileNav un-hides and wires the toggle', () => {
  const { toggle, nav } = buildDom();
  const destroy = initMobileNav({ toggle, nav });
  assert.equal(toggle.hidden, false, 'the [hidden] attribute is cleared so the button is reachable');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false', 'starts collapsed');
  destroy();
});

test('clicking the toggle opens and closes (aria-expanded + .is-open)', () => {
  const { toggle, nav } = buildDom();
  const destroy = initMobileNav({ toggle, nav });
  toggle.fire('click', { preventDefault() {} });
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(nav.classList.contains('is-open'), true);
  toggle.fire('click', { preventDefault() {} });
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(nav.classList.contains('is-open'), false);
  destroy();
});

test('Escape closes the open menu and restores focus to the toggle', () => {
  const { toggle, nav } = buildDom();
  const destroy = initMobileNav({ toggle, nav });
  toggle.fire('click', { preventDefault() {} });
  focusedEl = null;
  globalThis.document._fire('keydown', { key: 'Escape' });
  assert.equal(nav.classList.contains('is-open'), false, 'Escape closes');
  assert.equal(focusedEl, toggle, 'focus returns to the toggle');
  destroy();
});

test('an outside pointerdown closes the menu; inside keeps it open', () => {
  const { toggle, nav } = buildDom();
  const destroy = initMobileNav({ toggle, nav });
  toggle.fire('click', { preventDefault() {} });
  // Inside (the nav itself) — stays open.
  globalThis.document._fire('pointerdown', { target: nav }, true);
  assert.equal(nav.classList.contains('is-open'), true);
  // Outside (a detached element) — closes.
  globalThis.document._fire('pointerdown', { target: new El('div') }, true);
  assert.equal(nav.classList.contains('is-open'), false);
  destroy();
});

test('choosing a workspace link dismisses the sheet', () => {
  const { toggle, nav, link } = buildDom();
  const destroy = initMobileNav({ toggle, nav });
  toggle.fire('click', { preventDefault() {} });
  nav.fire('click', { target: link });
  assert.equal(nav.classList.contains('is-open'), false, 'navigating closes the menu');
  destroy();
});

test('destroy() unbinds and closes', () => {
  const { toggle, nav } = buildDom();
  const destroy = initMobileNav({ toggle, nav });
  toggle.fire('click', { preventDefault() {} });
  destroy();
  assert.equal(nav.classList.contains('is-open'), false);
  // After destroy a further toggle click is a no-op (listener removed).
  toggle.fire('click', { preventDefault() {} });
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

test('missing elements degrade gracefully', () => {
  buildDom();
  const destroy = initMobileNav({ toggle: null, nav: null });
  assert.equal(typeof destroy, 'function', 'returns a no-op destroy when wiring is absent');
  destroy();
});
