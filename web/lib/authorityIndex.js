// RUNBOOK-07 SP5 — reverse authority index ("who can touch this?").
//
// Pure aggregation (no DOM, no RPC). The Atlas answers the FORWARD question
// (node → what it can do). SP5 builds the REVERSE index (target → every actor,
// role, capability, and policy that can act on it), risk-ranked.
//
// Build once per atlas load; query many times. Each query returns rows sorted
// highest-risk first. Redacted entries are surfaced as `hidden` rows, never
// dropped — dropping would UNDERSTATE who can act on a target, a governance-
// safety lie.

const EMPTY = Object.freeze({ capabilities: [], policies: [], roles: [], actors: [] });

// Canonicalize a target id (account / object url) so the index keys agree.
export function normalize(target) {
  if (!target) return '';
  return String(target).trim().toLowerCase().replace(/\/+$/, '');
}

/**
 * buildAuthorityIndex(atlas, nodesByKind) → Map<targetKey, bucket>
 * `nodesByKind` is the per-kind arrays (capabilities/policies/roles/...); when
 * omitted it falls back to atlas[kind].
 */
export function buildAuthorityIndex(atlas, nodesByKind) {
  atlas = atlas || {};
  const k = nodesByKind || atlas;
  const index = new Map();

  const add = (target, bucket, entry) => {
    const key = normalize(target);
    if (!key) return;
    const e = index.get(key) || { capabilities: [], policies: [], roles: [], actors: [] };
    e[bucket].push(entry);
    index.set(key, e);
  };

  for (const c of (k.capabilities || [])) {
    add(c.object, 'capabilities', {
      id: c.id || c.ID, capability: c.capability, grantee: c.grantee,
      expiryState: c.expiryState || expiryStateOf(c), hidden: isHidden(c),
    });
  }
  for (const p of (k.policies || [])) {
    add(p.targetId, 'policies', { id: p.id || p.ID, type: p.policyType, state: p.state, hidden: isHidden(p) });
    for (const aff of (p.affected || [])) {
      add(aff.id || aff, 'policies', { id: p.id || p.ID, via: 'affected', type: p.policyType, state: p.state, hidden: isHidden(p) });
    }
  }
  for (const r of (k.roles || [])) {
    add(r.scopeTarget, 'roles', {
      id: r.id || r.ID, role: r.role, holders: (r.holders || []).length, hidden: isHidden(r),
    });
  }

  // Resolve actors reachable via the bucketed capabilities (grantees) + role holders.
  const actorsList = atlas.actors || [];
  for (const [key, e] of index) {
    e.actors = resolveActors(e, k.roles || [], actorsList);
    index.set(key, e);
  }
  return index;
}

function resolveActors(bucket, roles, actorsList) {
  const seen = new Map();
  const push = (id, why) => { if (id && !seen.has(id)) seen.set(id, { id, why }); };
  for (const c of bucket.capabilities) push(c.grantee, 'capability grantee');
  for (const rr of bucket.roles) {
    const role = roles.find((x) => (x.id || x.ID) === rr.id);
    for (const h of ((role && role.holders) || [])) push(h.id || h.identity || h, 'role holder');
  }
  return [...seen.values()];
}

/**
 * queryWhoCanTouch(index, target) → { rows[], target, empty }
 * rows are risk-ranked (descending).
 */
export function queryWhoCanTouch(index, target) {
  const e = index.get(normalize(target)) || EMPTY;
  const rows = flatten(e);
  return { target, rows: rankByRisk(rows), empty: rows.length === 0 };
}

// Flatten the bucket into uniform rows tagged with the kind + a `why`.
function flatten(e) {
  const rows = [];
  for (const c of e.capabilities) rows.push({ kind: 'capability', id: c.id, label: c.capability || c.id, why: `capability granted to ${c.grantee || '?'}`, expiryState: c.expiryState, hidden: c.hidden });
  for (const p of e.policies) rows.push({ kind: 'policy', id: p.id, label: p.type || p.id, why: p.via === 'affected' ? 'policy affects this target' : 'policy scoped to this target', state: p.state, policyType: p.type, hidden: p.hidden });
  for (const r of e.roles) rows.push({ kind: 'role', id: r.id, label: r.role || r.id, why: `role scoped here (${r.holders} holder${r.holders === 1 ? '' : 's'})`, holders: r.holders, hidden: r.hidden });
  for (const a of e.actors) rows.push({ kind: 'actor', id: a.id, label: a.id, why: a.why, hidden: false });
  return rows;
}

// rankByRisk — descending risk. Policies that can deny/halt are highest; active
// broad capabilities next; roles with holders; expiring/expired capabilities
// lowest (they self-neutralize). Hidden rows sink slightly but are never dropped.
export function rankByRisk(rows) {
  return rows
    .map((r) => ({ r, score: riskScore(r) }))
    .sort((a, b) => b.score - a.score)
    .map((w) => ({ ...w.r, riskScore: w.score }));
}

function riskScore(r) {
  let s = 0;
  if (r.kind === 'policy') {
    s = 90;
    if (/deny|halt|block|freeze/i.test(String(r.policyType || ''))) s = 100;
    if (r.state && r.state !== 'active' && r.state !== 'enforced') s -= 30;
  } else if (r.kind === 'capability') {
    s = 70;
    if (r.expiryState === 'expires_soon') s = 40;
    if (r.expiryState === 'expired') s = 10;
  } else if (r.kind === 'role') {
    s = 50 + Math.min(20, (r.holders || 0));
  } else if (r.kind === 'actor') {
    s = 30;
  }
  if (r.hidden) s -= 5;                          // sink redacted rows a touch, keep them visible
  return s;
}

// Map a risk row to a severity-vocabulary key for the badge.
export function rowSeverity(r) {
  const s = r.riskScore != null ? r.riskScore : riskScore(r);
  if (s >= 90) return 'blocked';
  if (s >= 60) return 'attention';
  if (s >= 30) return 'normal';
  return 'normal';
}

function expiryStateOf(c) {
  if (c.expiresAtBlock == null || c.currentBlock == null) return 'active';
  const left = Number(c.expiresAtBlock) - Number(c.currentBlock);
  if (left <= 0) return 'expired';
  if (left <= 100) return 'expires_soon';
  return 'active';
}

function isHidden(n) {
  const st = n && (n.status || n.state);
  return st === 'hidden' || st === 'redacted' || n === null;
}
