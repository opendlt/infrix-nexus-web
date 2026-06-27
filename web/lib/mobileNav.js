// RUNBOOK-06 Task 6 — phone-only navigation disclosure.
//
// Above the 480px breakpoint the header workspaces show inline and the
// hamburger is [hidden] (CSS keeps the toggle display:none). At ≤480px the
// CSS shows the toggle and collapses the nav into a closed dropdown; this
// module makes the toggle real:
//   - clears the [hidden] attribute so the button is reachable,
//   - flips aria-expanded + the nav's .is-open class on click,
//   - closes on Escape, on outside-click, and after any workspace link is
//     chosen (so the route change doesn't leave a dangling open sheet),
//   - returns focus to the toggle when closed via the keyboard.
//
// It is intentionally CSS-driven: the module never measures the viewport, so
// the single source of truth for "are we collapsed?" stays in the media query.

export function initMobileNav({
  toggle = document.getElementById('navToggle'),
  nav = document.getElementById('headerWorkspaces'),
} = {}) {
  if (!toggle || !nav) return () => {};

  // The button ships [hidden] so it never flashes before JS; reveal it now that
  // the behavior is wired. The CSS still gates actual visibility to ≤480px.
  toggle.hidden = false;

  let open = false;

  function setOpen(next, { restoreFocus = false } = {}) {
    open = next;
    toggle.setAttribute('aria-expanded', next ? 'true' : 'false');
    nav.classList.toggle('is-open', next);
    if (!next && restoreFocus) {
      try { toggle.focus(); } catch (e) { /* focus is best-effort */ }
    }
  }

  function onToggleClick(e) {
    e.preventDefault();
    setOpen(!open);
  }

  function onDocKeydown(e) {
    if (e.key === 'Escape' && open) {
      setOpen(false, { restoreFocus: true });
    }
  }

  function onDocPointerDown(e) {
    if (!open) return;
    const t = e.target;
    if (nav.contains(t) || toggle.contains(t)) return;   // click inside → keep open
    setOpen(false);
  }

  // Choosing a destination should dismiss the sheet. Capture so it runs even if
  // the link's own handler stops propagation; we only care that a link was hit.
  function onNavClick(e) {
    if (!open) return;
    const link = e.target && e.target.closest ? e.target.closest('a, .workspace-link') : null;
    if (link && nav.contains(link)) setOpen(false);
  }

  toggle.addEventListener('click', onToggleClick);
  document.addEventListener('keydown', onDocKeydown);
  document.addEventListener('pointerdown', onDocPointerDown, true);
  nav.addEventListener('click', onNavClick);

  return function destroy() {
    toggle.removeEventListener('click', onToggleClick);
    document.removeEventListener('keydown', onDocKeydown);
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    nav.removeEventListener('click', onNavClick);
    setOpen(false);
  };
}
