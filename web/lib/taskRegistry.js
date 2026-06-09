// Nexus — Task Template Marketplace registry (nextux-04).
//
// Loads the Go-generated task catalog (testdata/tasks.fixture.json) — the same
// signed, trust-evaluated templates the CLI + SDK use — and exposes list/search
// plus trust-badge metadata. A Go drift test keeps this fixture byte-identical
// to pkg/tasks. The trust badge is decided by the registry's signature check,
// never asserted by a template; status is conveyed by glyph + text, not color.

let _catalog = null;

export function setTaskCatalog(obj) {
  _catalog = obj || null;
  return _catalog;
}

export function getTaskCatalog() {
  if (!_catalog) throw new Error('taskRegistry: catalog not loaded — call loadTaskCatalog() first');
  return _catalog;
}

export async function loadTaskCatalog(url = '/testdata/tasks.fixture.json') {
  if (_catalog) return _catalog;
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`taskRegistry: failed to load catalog (${res.status})`);
  return setTaskCatalog(await res.json());
}

export function listTemplates() {
  return (getTaskCatalog().templates || []).slice();
}

export function searchTemplates(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return listTemplates();
  return listTemplates().filter((t) =>
    `${t.id} ${t.title} ${t.summary} ${t.category}`.toLowerCase().includes(q),
  );
}

export function templatesByCategory(category) {
  if (!category || category === 'all') return listTemplates();
  return listTemplates().filter((t) => t.category === category);
}

export function categories() {
  const set = new Set(listTemplates().map((t) => t.category));
  return ['all', ...Array.from(set).sort()];
}

export function getTemplate(id) {
  return listTemplates().find((t) => t.id === id) || null;
}

export function isTrusted(trust) {
  return trust === 'official_verified' || trust === 'publisher_verified';
}

// TRUST_BADGE maps a trust state to a label + glyph + semantic color role. The
// glyph carries meaning without color (a11y: no color-only status).
export const TRUST_BADGE = Object.freeze({
  official_verified: { label: 'Official verified', glyph: '✔', role: 'positive' },
  publisher_verified: { label: 'Publisher verified', glyph: '✔', role: 'positive' },
  local_unsigned: { label: 'Local unsigned', glyph: '▲', role: 'caution' },
  remote_unsigned: { label: 'Remote unsigned', glyph: '▲', role: 'caution' },
  tampered: { label: 'Tampered', glyph: '✘', role: 'negative' },
  revoked: { label: 'Revoked', glyph: '✘', role: 'negative' },
  unknown: { label: 'Unknown', glyph: '•', role: 'info' },
});

export function trustBadge(trust) {
  return TRUST_BADGE[trust] || TRUST_BADGE.unknown;
}

export const TRUST_ROLE_VARS = Object.freeze({
  positive: 'var(--ok)',
  caution: 'var(--warn)',
  negative: 'var(--alert)',
  info: 'var(--info)',
});
