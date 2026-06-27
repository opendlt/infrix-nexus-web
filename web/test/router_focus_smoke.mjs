// RUNBOOK-06 Task 8 (WCAG 2.4.3 Focus Order) — a user-initiated route change
// moves focus into the new view (its first heading); browser back/forward and
// the initial load do NOT steal focus. This builds a tiny DOM shim, drives the
// real createRouter, and asserts where focus lands (and doesn't).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

// ---- minimal DOM ----
let focusedEl = null;

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.hidden = false;
    this.tabIndex = 0;
    this._attrs = {};
    this._listeners = new Map();
    this.classList = {
      _set: new Set(),
      add: (c) => this.classList._set.add(c),
      remove: (c) => this.classList._set.delete(c),
      contains: (c) => this.classList._set.has(c),
    };
  }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  setAttribute(k, v) { this._attrs[k] = String(v); if (k === 'tabindex') this.tabIndex = Number(v); }
  getAttribute(k) { return this._attrs[k]; }
  hasAttribute(k) { return k in this._attrs || (k === 'tabindex'); }
  addEventListener(t, fn) { if (!this._listeners.has(t)) this._listeners.set(t, []); this._listeners.get(t).push(fn); }
  fire(t, ev) { for (const fn of (this._listeners.get(t) || [])) fn(ev || { preventDefault() {} }); }
  focus() { focusedEl = this; }
  querySelector(sel) {
    // Supports a comma list of simple selectors: tag, .class, [attr].
    const parts = sel.split(',').map((s) => s.trim());
    const match = (el) => parts.some((p) => {
      if (p.startsWith('.')) return el.classList.contains(p.slice(1));
      if (p.startsWith('[')) { const a = p.slice(1, -1).split('=')[0]; return el.hasAttribute(a); }
      return el.tagName === p.toUpperCase();
    });
    const walk = (el) => {
      for (const c of el.children) { if (match(c)) return c; const r = walk(c); if (r) return r; }
      return null;
    };
    return walk(this);
  }
}

function makeAnchor(route) {
  const a = new El('a');
  a.dataset.route = route;
  return a;
}

// ---- harness ----
async function setup() {
  focusedEl = null;
  globalThis.requestAnimationFrame = (fn) => { fn(); return 1; };   // run focus deferral synchronously
  const winListeners = new Map();
  globalThis.window = {
    location: { hash: '' },
    history: { pushState(_s, _t, url) { if (url) globalThis.window.location.hash = url.replace(/^#?/, '#').replace('##', '#'); } },
    addEventListener: (t, fn) => { if (!winListeners.has(t)) winListeners.set(t, []); winListeners.get(t).push(fn); },
    _fire: (t, ev) => { for (const fn of (winListeners.get(t) || [])) fn(ev || {}); },
  };
  globalThis.document = { createElement: (tag) => new El(tag) };

  const container = new El('div');
  const navStart = makeAnchor('start');
  const navBuild = makeAnchor('build');
  const navLinks = [navStart, navBuild];

  // Each view's mount appends an <h2> so moveFocusToView has a heading target.
  const mounts = {};
  const routes = {};
  for (const id of ['start', 'build']) {
    routes[id] = {
      mount(frame) {
        mounts[id] = (mounts[id] || 0) + 1;
        const h = new El('h2');
        h.classList.add('view-title');
        frame.appendChild(h);
      },
    };
  }

  const { createRouter } = await import('/lib/router.js');
  const router = createRouter({ routes, defaultRoute: 'start', container, navLinks });
  return { router, container, navStart, navBuild, mounts, win: globalThis.window };
}

import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(here, '_resolve_lib.mjs')).href);

test('view-frames are programmatically focusable (tabindex -1)', async () => {
  const { container } = await setup();
  for (const frame of container.children) assert.equal(frame.tabIndex, -1, 'each frame has tabindex=-1');
});

test('initial load does NOT move focus', async () => {
  await setup();
  assert.equal(focusedEl, null, 'no focus jump on first paint');
});

test('a nav click moves focus to the new view heading', async () => {
  const { navBuild, container } = await setup();
  focusedEl = null;
  navBuild.fire('click', { preventDefault() {} });
  assert.ok(focusedEl, 'focus moved');
  assert.equal(focusedEl.tagName, 'H2', 'focus landed on the view heading');
  // The focused heading is inside the build frame.
  const buildFrame = container.children.find((f) => f.dataset.route === 'build');
  assert.ok(buildFrame.children.includes(focusedEl));
});

test('navigateTo() moves focus; popstate/hashchange do not', async () => {
  const { router, win } = await setup();

  focusedEl = null;
  router.navigateTo('build');
  assert.ok(focusedEl, 'navigateTo is a deliberate navigation → focus moves');

  // Browser back/forward: change hash then fire popstate. Focus must NOT move.
  focusedEl = null;
  win.location.hash = '#/start';
  win._fire('popstate', {});
  assert.equal(focusedEl, null, 'popstate must not steal focus');

  // hashchange (view-driven hash write): also must not move focus.
  focusedEl = null;
  win.location.hash = '#/build';
  win._fire('hashchange', {});
  assert.equal(focusedEl, null, 'hashchange must not steal focus');
});
