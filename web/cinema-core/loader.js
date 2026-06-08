/**
 * Infrix Cinema — ES-module loader.
 *
 * The core itself ships as classic scripts (so it also works over file:// for
 * the standalone viewer). Hosts that live in an ES-module world — the Nexus
 * SPA — import THIS module, which injects the core scripts + stylesheets in
 * dependency order and returns the resolved window.InfrixCinema namespace.
 * This keeps exactly one renderer/vocabulary/disclosure implementation while
 * letting module hosts `await loadCinemaCore()` and call mountCinema.
 */
const SCRIPTS = [
  'visualVocabulary.js',
  'disclosureView.js',
  'renderer.js',
  'dataSources.js',
  'detailsPanel.js',
  'controls.js',
  'timelineAdapter.js',
  'legend.js',
  'exportPanel.js',
  'proofPanel.js',
  'narrativeTemplates.js',
  'narrativePanel.js',
  'narrativeSync.js',
  'app.js',
];
const STYLES = ['cinemaTokens.css', 'styles.css'];

let loadingPromise = null;

function injectScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-cinema-core="${src}"]`);
    if (existing) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.async = false; // preserve order
    s.dataset.cinemaCore = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('cinema-core: failed to load ' + src));
    document.head.appendChild(s);
  });
}

function injectStyle(href) {
  if (document.querySelector(`link[data-cinema-core="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  l.dataset.cinemaCore = href;
  document.head.appendChild(l);
}

/**
 * loadCinemaCore injects the core (idempotent) and resolves to InfrixCinema.
 * @param {string} base path the core is served from (default '/cinema-core').
 */
export function loadCinemaCore(base = '/cinema-core') {
  if (typeof window !== 'undefined' && window.InfrixCinema && window.InfrixCinema.mountCinema) {
    return Promise.resolve(window.InfrixCinema);
  }
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    STYLES.forEach((s) => injectStyle(`${base}/${s}`));
    for (const s of SCRIPTS) {
      // eslint-disable-next-line no-await-in-loop
      await injectScript(`${base}/${s}`);
    }
    if (!window.InfrixCinema || !window.InfrixCinema.mountCinema) {
      throw new Error('cinema-core loaded but window.InfrixCinema.mountCinema is missing');
    }
    return window.InfrixCinema;
  })();
  return loadingPromise;
}

/** Convenience: load then mount in one call. */
export async function mountCinema(options) {
  const ns = await loadCinemaCore(options && options.base);
  return ns.mountCinema(options);
}
