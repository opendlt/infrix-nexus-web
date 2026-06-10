// Nexus — Proof Quest Mode browser twin (nextux-11).
//
// Reads the quest progress trail + catalog + a sample progress receipt (the
// deterministic fixture, or a live companion-served context when present) and
// exposes the same honest, read-only view the CLI and agent see. Every badge is
// tied to a real verifier verdict or a clearly labeled local learning step —
// the browser indexes nothing and runs no command.

let _data = null;

/** setQuestData injects the data (used by the no-browser smoke test). */
export function setQuestData(obj) {
  _data = obj;
}

/** getQuestData returns the loaded data. */
export function getQuestData() {
  if (!_data) throw new Error('quests: data not loaded — call loadQuests() first');
  return _data;
}

/** loadQuests fetches the live quest context if a companion server exposes one,
 *  falling back to the deterministic fixture. */
export async function loadQuests(liveUrl = '/v1/companion/quests', fixtureUrl = '/testdata/quests.fixture.json') {
  try {
    const res = await fetch(liveUrl, { cache: 'no-cache' });
    if (res.ok) {
      _data = await res.json();
      _data._live = true;
      return _data;
    }
  } catch (_) {
    /* no live quest endpoint — fall back to the fixture */
  }
  const res = await fetch(fixtureUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error('quests: failed to load ' + fixtureUrl + ' (' + res.status + ')');
  _data = await res.json();
  _data._live = false;
  return _data;
}

export function isLive() { return !!getQuestData()._live; }
export function status() { return getQuestData().status || { quests: [], completed: 0, total: 0 }; }
export function trail() { return status().quests || []; }
export function catalog() { return getQuestData().catalog || []; }
export function receipt() { return getQuestData().receipt || null; }
export function nextQuestId() { return status().nextQuest || ''; }

/** counts summarizes the trail honestly. */
export function counts() {
  const t = trail();
  return { completed: status().completed || 0, total: status().total || t.length, locked: t.filter((q) => q.locked).length };
}

/** questById returns a trail entry. */
export function questById(id) {
  return trail().find((q) => q.id === id) || null;
}

/** missionStateIcon maps a mission to a status word (honest, never "verified"
 *  for a learning step). */
export function missionStateWord(m) {
  if (!m.completed) return 'not done yet';
  if (m.learning) return 'learned (local)';
  return m.proofLevel ? ('verified ' + m.proofLevel) : 'verified';
}

/** proofBadge returns an honest badge for the loaded receipt: never "Fully
 *  verified"/L4 for a local proof, and a labeled learning step is not a proof. */
export function proofBadge(rc = receipt()) {
  if (!rc) return { label: '—', tone: 'info', proof: false };
  if (rc.learning || !rc.proof) return { label: 'Learned (local)', tone: 'info', proof: false };
  if (!rc.proof.verified) return { label: 'Not verified', tone: 'negative', proof: true };
  const level = rc.proof.proofLevel || 'verified';
  if (rc.proof.l0Verified) return { label: level + ' — live L0 confirmed', tone: 'positive', proof: true };
  return { label: level + ' — locally verified', tone: 'positive', proof: true };
}

/** whyItMatters returns the encouraging "show me why this matters" copy. */
export function whyItMatters() {
  return 'Most platforms ask you to trust their node. Here you produced a real proof and ' +
    'verified it yourself — offline, trusting no node. That is the whole point of Infrix: ' +
    'every claim is checkable, and nothing here was faked.';
}
