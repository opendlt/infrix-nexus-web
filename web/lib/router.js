// Nexus — minimal SPA router.
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 0: pushState + popstate +
// click-intercept on .nav-link anchors. Each route maps to a view
// module's mount() function. Routes get their own <div class="view-frame">
// container; the router toggles [hidden] on every frame so views
// can keep state across navigation.
//
// Phase 2 extension: sub-path support. A hash like `#/intents/i-abc123`
// activates the `intents` view with subpath `['i-abc123']`. Sub-path
// changes within the same top-level route call the view's optional
// onSubpathChange handler instead of re-mounting, so list/detail
// transitions keep DOM state. The list view typically renders a
// detail screen when subpath is non-empty and a list otherwise.

/**
 * @typedef {Object} ViewModule
 * @property {(root: HTMLElement, subpath?: string[]) => void} mount
 *   Called when the route activates. Subpath is the path segments
 *   after the route id (e.g. ['i-abc123'] for `#/intents/i-abc123`).
 * @property {(subpath: string[]) => void} [onSubpathChange]
 *   Called when the hash sub-path changes within the same route
 *   without re-mounting. Receives the new subpath.
 * @property {() => void} [unmount]
 *   Called when route deactivates (currently unused; reserved).
 */

/**
 * @param {Object} config
 * @param {Object<string, ViewModule>} config.routes — route id → module
 * @param {string} config.defaultRoute               — fallback route id
 * @param {HTMLElement} config.container             — element holding view-frames
 * @param {NodeListOf<HTMLElement>} config.navLinks  — top-nav anchors with data-route
 */
export function createRouter(config) {
  const { routes, defaultRoute, container, navLinks } = config;
  const frames = new Map();
  let activeRoute = null;
  let activeSubpath = [];

  // Build one view-frame per route; mount is lazy.
  for (const [routeId] of Object.entries(routes)) {
    const frame = document.createElement('div');
    frame.className = 'view-frame';
    frame.dataset.route = routeId;
    frame.hidden = true;
    // RUNBOOK-06 Task 8 (WCAG 2.4.3 Focus Order) — make the frame programmatically
    // focusable so a deliberate navigation can move focus into the new view.
    frame.tabIndex = -1;
    container.appendChild(frame);
    frames.set(routeId, { frame, mounted: false });
  }

  // RUNBOOK-06 Task 8 — on a user-initiated route change, move focus into the
  // newly shown view (its first heading, else the frame) so keyboard and screen-
  // reader users land in the new content instead of staying on the old control.
  // Deferred to the next frame so the view has mounted/painted first. NOT called
  // for popstate / hashchange / initial load (focus should not jump on those).
  function moveFocusToView(frame) {
    const focusFirst = () => {
      if (!frame || frame.hidden) return;
      const heading = frame.querySelector('h1, h2, [role="heading"], .view-title');
      const target = heading || frame;
      if (heading && !heading.hasAttribute('tabindex')) heading.tabIndex = -1;
      try { target.focus({ preventScroll: false }); } catch (e) { /* focus is best-effort */ }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focusFirst);
    else focusFirst();
  }

  function activate(routeId, subpath, opts) {
    const moveFocus = !!(opts && opts.moveFocus);
    if (!routes[routeId]) routeId = defaultRoute;
    const sp = Array.isArray(subpath) ? subpath : [];
    const sameRoute = activeRoute === routeId;
    const sameSubpath = sameRoute && arraysEqual(activeSubpath, sp);
    if (sameRoute && sameSubpath) return;

    // Hide all, deactivate prior nav.
    for (const { frame } of frames.values()) frame.hidden = true;
    for (const a of navLinks) a.classList.remove('active');

    const entry = frames.get(routeId);
    entry.frame.hidden = false;
    if (!entry.mounted) {
      try {
        routes[routeId].mount(entry.frame, sp);
      } catch (err) {
        console.error('view mount failed for route', routeId, err);
      }
      entry.mounted = true;
    } else if (sameRoute && !sameSubpath) {
      // Sub-path drift within the same view: prefer onSubpathChange so
      // list views don't lose DOM state when transitioning to detail.
      const handler = routes[routeId].onSubpathChange;
      if (typeof handler === 'function') {
        try { handler(sp); } catch (err) { console.error('onSubpathChange failed', routeId, err); }
      }
    } else if (!sameRoute) {
      // New route, already-mounted view — fire onSubpathChange so the
      // view knows it's being re-shown with a possibly different
      // subpath (e.g. user navigated away then back to a deep link).
      const handler = routes[routeId].onSubpathChange;
      if (typeof handler === 'function') {
        try { handler(sp); } catch (err) { console.error('onSubpathChange failed', routeId, err); }
      }
    }
    for (const a of navLinks) {
      if (a.dataset.route === routeId) a.classList.add('active');
    }
    activeRoute = routeId;
    activeSubpath = sp;
    if (moveFocus) moveFocusToView(entry.frame);
  }

  function parseHash() {
    const h = window.location.hash.replace(/^#\/?/, '');
    if (!h) return { route: defaultRoute, subpath: [] };
    const segments = h.split('/').filter((s) => s.length > 0);
    if (segments.length === 0) return { route: defaultRoute, subpath: [] };
    return { route: segments[0], subpath: segments.slice(1) };
  }

  // Click handler — intercept nav anchors. Top-nav clicks reset to
  // the route root (no subpath); deep-link buttons inside views call
  // navigateTo() directly to push a sub-path.
  for (const a of navLinks) {
    a.addEventListener('click', (e) => {
      const route = a.dataset.route;
      if (!route) return;
      if (a.classList.contains('coming-soon-disabled')) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      const newHash = '#/' + route;
      if (window.location.hash !== newHash) {
        window.history.pushState({ route }, '', newHash);
      }
      // RUNBOOK-06 Task 8 — a click is a deliberate navigation → move focus.
      activate(route, [], { moveFocus: true });
    });
  }

  // Browser back/forward.
  window.addEventListener('popstate', () => {
    const { route, subpath } = parseHash();
    activate(route, subpath);
  });

  // Phase 2: deep-link buttons inside views can navigate to a sub-path
  // by dispatching window.location.hash = '#/intents/<id>'. Listen
  // to hashchange so router-driven and view-driven nav agree on the
  // current state.
  window.addEventListener('hashchange', () => {
    const { route, subpath } = parseHash();
    activate(route, subpath);
  });

  // Initial activation.
  const initial = parseHash();
  activate(initial.route, initial.subpath);

  return {
    activate,
    current: () => ({ route: activeRoute, subpath: activeSubpath.slice() }),
    /**
     * Programmatic deep-link. Pushes a new history entry and activates
     * the matching route + subpath. Used by view-internal buttons.
     */
    navigateTo: (route, ...subpath) => {
      const segs = subpath.filter((s) => s !== undefined && s !== null && s !== '').map(String);
      const newHash = '#/' + [route, ...segs].join('/');
      if (window.location.hash !== newHash) {
        window.history.pushState({ route, subpath: segs }, '', newHash);
      }
      // RUNBOOK-06 Task 8 — programmatic deep-link is deliberate → move focus.
      activate(route, segs, { moveFocus: true });
    },
  };
}

function arraysEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
