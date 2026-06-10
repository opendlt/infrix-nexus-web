// Nexus — Visual Workflow Studio data + honest helpers (nextux-12).
//
// Reads the Go-generated studio fixture (flow + validation + simulation +
// palette + exports) and exposes the same honest, read-only view the CLI, SDK,
// and agent see. A simulation is NEVER a live proof: the browser indexes
// nothing, runs no command, and never previews L4 for a local flow.

let _data = null;

/** setStudioData injects the data (used by the no-browser smoke test). */
export function setStudioData(obj) {
  _data = obj;
}

/** getStudioData returns the loaded data. */
export function getStudioData() {
  if (!_data) throw new Error('studio: data not loaded — call loadStudio() first');
  return _data;
}

/** loadStudio fetches a live studio context if one is served, falling back to
 *  the deterministic fixture. */
export async function loadStudio(liveUrl = '/v1/studio/context', fixtureUrl = '/testdata/studio.fixture.json') {
  try {
    const res = await fetch(liveUrl, { cache: 'no-cache' });
    if (res.ok) {
      _data = await res.json();
      _data._live = true;
      return _data;
    }
  } catch (_) {
    /* no live studio endpoint — fall back to the fixture */
  }
  const res = await fetch(fixtureUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error('studio: failed to load ' + fixtureUrl + ' (' + res.status + ')');
  _data = await res.json();
  _data._live = false;
  return _data;
}

export function isLive() { return !!getStudioData()._live; }
export function flow() { return getStudioData().flow || { actors: [], nodes: [], edges: [] }; }
export function validation() { return getStudioData().validation || { valid: false, errors: [], warnings: [] }; }
export function simulation() { return getStudioData().simulation || null; }
export function exportsMap() { return getStudioData().exports || {}; }
export function nodes() { return flow().nodes || []; }
export function edges() { return flow().edges || []; }

/** nodeById returns a flow node. */
export function nodeById(id) {
  return nodes().find((n) => n.id === id) || null;
}

/** orderedNodeIds returns the simulation's path (topological order), or
 *  declaration order as a fallback. */
export function orderedNodeIds() {
  const sim = simulation();
  if (sim && Array.isArray(sim.pathTaken) && sim.pathTaken.length) return sim.pathTaken;
  return nodes().map((n) => n.id);
}

/** assuranceBadge returns an honest badge for the simulation: never an L4 /
 *  "fully verified" badge for a simulated preview, and it always says the node
 *  is not trusted. */
export function assuranceBadge() {
  const sim = simulation();
  if (!sim || sim.proofLevelCap === 'none') return { label: 'No proof step', tone: 'info' };
  return { label: sim.proofLevelCap + ' cap — simulated (node not trusted)', tone: 'info' };
}

/** isHonest reports whether the loaded simulation respects the studio rules. */
export function isHonest() {
  const sim = simulation();
  if (!sim) return true;
  if (!sim.simulated) return false;
  if (sim.nodeTrusted) return false;
  if (sim.proofLevelCap === 'L4' && sim.network !== 'kermit') return false;
  return true;
}

/** generatedSdkIsSafe checks the exported SDK snippet dry-runs + approves before
 *  it runs and carries no bypass markers. */
export function generatedSdkIsSafe() {
  const ex = exportsMap()['sdk-ts'];
  if (!ex || !ex.artifact) return false;
  const code = ex.artifact;
  if (!code.includes('client.dryRun(') || !code.includes('client.approve(') || !code.includes('client.run(')) return false;
  if (code.indexOf('client.run(') < code.indexOf('client.dryRun(')) return false;
  for (const bad of ['skipApproval', 'skipDryRun', 'bypass', 'force: true']) {
    if (code.includes(bad)) return false;
  }
  return true;
}

/** whyItMatters returns the encouraging "why this matters" copy. */
export function whyItMatters() {
  return 'You composed a governed workflow visually — and every step compiles to an existing ' +
    'verified primitive (a scenario, a task, an agent plan). Nothing here bypasses the gated ' +
    'execution paths, the simulation is a preview rather than a live proof, and the node is ' +
    'never trusted. That is the point of Infrix: the process is honest end to end.';
}
