// Nexus — coming-soon placeholder view.
//
// Used by every top-nav route that hasn't been built yet. Each module
// is a tiny factory so the placeholder card carries the route's name +
// the redesign-plan phase that owns it.

export function makeComingSoon(routeName, phase, blurb) {
  return {
    mount(root) {
      const html = `
        <div class="container">
          <div class="coming-soon-card">
            <h2>${escapeHTML(routeName)}</h2>
            <p>${escapeHTML(blurb)}</p>
            <div class="phase-tag">${escapeHTML(phase)}</div>
          </div>
        </div>
      `;
      root.innerHTML = html;
    },
  };
}

function escapeHTML(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}
