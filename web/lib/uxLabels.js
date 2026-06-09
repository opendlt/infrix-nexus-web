// Nexus — Progressive Disclosure design system data + gate (nextux-03).
//
// The browser twin of pkg/uxcopy. It carries NO wording of its own: it loads
// the Go-generated fixture (testdata/uxcopy.fixture.json) — the single source
// of truth for every label, assurance badge, error card, glossary term, next
// action, and persona — and re-implements the SAME data-driven assurance gate
// the Go package uses. A badge can appear in the browser only when its
// allowedConditions all hold and none of its disallowedConditions hold, exactly
// as on the CLI. A Go drift test keeps this fixture byte-identical to source.

let _fixture = null;

/** setUxFixture installs the fixture object (used by tests + the loader). */
export function setUxFixture(obj) {
  _fixture = obj || null;
  return _fixture;
}

/** getUxFixture returns the installed fixture or throws if not loaded yet. */
export function getUxFixture() {
  if (!_fixture) throw new Error('uxLabels: fixture not loaded — call loadUxFixture() or setUxFixture() first');
  return _fixture;
}

/**
 * loadUxFixture fetches and installs the Go-generated fixture. Default path is
 * the embedded, server-served testdata copy. Cached after the first load.
 */
export async function loadUxFixture(url = '/testdata/uxcopy.fixture.json') {
  if (_fixture) return _fixture;
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`uxLabels: failed to load fixture (${res.status})`);
  return setUxFixture(await res.json());
}

// --- the assurance gate (mirror of uxcopy.AssuranceBadge.Allowed) ---------

/** conditionHolds evaluates a "field=value" token against an assurance state. */
export function conditionHolds(state, token) {
  const parts = String(token || '').trim().split('=');
  if (parts.length !== 2) return false;
  const field = parts[0].trim();
  const val = parts[1].trim();
  if (field === 'verificationMode') {
    return val === 'local_only' && !state.l0Verified;
  }
  if (val !== 'true' && val !== 'false') return false;
  if (!(field in BOOLEAN_FIELDS)) return false;
  return !!state[field] === (val === 'true');
}

// The boolean fields the gate understands (must match uxcopy.AssuranceState).
const BOOLEAN_FIELDS = Object.freeze({
  verified: 1, cryptographicallyVerified: 1, l0Verified: 1, replayVerified: 1,
  nodeTrusted: 1, witnessQuorumMet: 1, distinctOperatorsMet: 1, operatorAttested: 1,
  disclosureProofVerified: 1, releaseEvidenceVerified: 1,
});

/** badgeAllowed reports whether one badge may be shown for a state. */
export function badgeAllowed(badge, state) {
  const reqs = badge.allowedConditions || [];
  const never = badge.disallowedConditions || [];
  for (const t of reqs) if (!conditionHolds(state, t)) return false;
  for (const t of never) if (conditionHolds(state, t)) return false;
  return true;
}

/** badgesFor returns the badges ALLOWED for a state, in fixture (canonical) order. */
export function badgesFor(state) {
  return allBadges().filter((b) => badgeAllowed(b, state));
}

// --- registry accessors (read from the loaded fixture) --------------------

export function allBadges() {
  return getUxFixture().assuranceBadges || [];
}
export function badgeById(id) {
  return allBadges().find((b) => b.id === id) || null;
}
export function allLabels() {
  return getUxFixture().labels || [];
}
export function labelsByCategory(cat) {
  return allLabels().filter((l) => l.category === cat);
}
export function glossary() {
  return getUxFixture().glossary || [];
}
export function glossaryLookup(term) {
  return glossary().find((t) => t.term === term) || null;
}
export function errorCards() {
  return getUxFixture().errors || [];
}
export function errorCardByCode(code) {
  return errorCards().find((c) => c.code === code) || null;
}
export function personas() {
  return getUxFixture().personas || [];
}
export function personaProfile(persona) {
  const list = personas();
  return list.find((p) => p.persona === persona) || list[0] || null;
}

/** nextActionsFor returns the persona's next actions, lead actions first. */
export function nextActionsFor(persona) {
  const all = getUxFixture().nextActions || [];
  const prof = personaProfile(persona);
  const relevant = (a) => (a.personas || []).includes(persona);
  const byId = new Map(all.map((a) => [a.id, a]));
  const seen = new Set();
  const out = [];
  for (const id of (prof && prof.leadActions) || []) {
    const a = byId.get(id);
    if (a && relevant(a) && !seen.has(id)) {
      out.push(a);
      seen.add(id);
    }
  }
  for (const a of all) {
    if (!seen.has(a.id) && relevant(a)) out.push(a);
  }
  return out;
}

// colorRoleVar maps a semantic color role to the theme CSS variable pair the
// components use. Components also carry a glyph + text, so status is never
// conveyed by color alone.
export const COLOR_ROLE_VARS = Object.freeze({
  positive: { fg: 'var(--ok)', soft: 'var(--ok-soft)', glyph: '✔' },
  info: { fg: 'var(--info)', soft: 'var(--info-soft)', glyph: '•' },
  caution: { fg: 'var(--warn)', soft: 'var(--warn-soft)', glyph: '▲' },
  negative: { fg: 'var(--alert)', soft: 'var(--alert-soft)', glyph: '✘' },
});
