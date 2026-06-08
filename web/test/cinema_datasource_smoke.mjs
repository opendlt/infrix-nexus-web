// Priority 05 — Cinema data sources + mode capabilities.
//
// The four adapters are the ONLY way the core obtains scene data, so the same
// renderer/controls/details code drives every surface. This verifies each
// adapter honors the CinemaDataSource contract and is disclosure-aware, and
// that the four mount modes expose the intended capability set (embed is
// read-only; proof/nexus/full carry controls).

import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../cinema-core/visualVocabulary.js');
require('../cinema-core/disclosureView.js');
require('../cinema-core/dataSources.js');
require('../cinema-core/app.js');
const C = globalThis.InfrixCinema;

// ---- Embed adapter: pre-scoped static scene, read-only ----
{
  const ds = new C.EmbedCinemaDataSource({ scene: { nodes: [{ id: 'a', position: { x: 0, y: 0 } }], edges: [] } });
  const g = await ds.getScene();
  assert.equal((g.nodes || []).length, 1, 'embed yields its scene');
  const caps = ds.capabilities();
  assert.equal(caps.controls, false, 'embed has no controls');
  assert.equal(caps.disclosureAware, true, 'embed is disclosure-aware');
  console.log('✓ EmbedCinemaDataSource: static scene, read-only, disclosure-aware');
}

// Embed adapter redacts a private node it is handed (last-line guarantee).
{
  const ds = new C.EmbedCinemaDataSource({ scene: { nodes: [
    { id: 's', label: 'secret', visibility: 'private', position: { x: 0, y: 0 }, size: 80, balance: 5 },
  ], edges: [] } });
  const g = await ds.getScene();
  assert.equal(g.nodes[0].label, C.DISCLOSURE.LABEL_PRIVATE, 'embed redacts a private node it receives');
  assert.equal(g.nodes[0].balance, undefined, 'embed strips a private balance');
  console.log('✓ EmbedCinemaDataSource redacts private content it is handed');
}

// ---- Proof adapter: node-independent bundle + assurance + replay frames ----
{
  const proof = {
    scene: { nodes: [{ id: 'i', kind: 'intent', position: { x: 0, y: 0 } }], edges: [] },
    frames: [
      { block: 1, scene: { nodes: [{ id: 'i', position: { x: 0, y: 0 } }], edges: [] } },
      { block: 5, scene: { nodes: [{ id: 'i', position: { x: 0, y: 0 } }, { id: 'o', position: { x: 1, y: 0 } }], edges: [] } },
    ],
    assurance: { id: 'l0', label: 'L0-anchored' },
    details: { i: { note: 'the intent' } },
  };
  const ds = new C.ProofCinemaDataSource({ proof });
  assert.equal((await ds.getScene()).nodes.length, 1, 'proof yields its scene');
  assert.equal((await ds.getStateAt(5)).nodes.length, 2, 'proof getStateAt picks the frame at/<= pos');
  assert.equal((await ds.getStateAt(1)).nodes.length, 1, 'proof getStateAt at block 1');
  assert.equal((await ds.getDetails({ id: 'i' })).note, 'the intent', 'proof getDetails enriches by id');
  assert.equal(ds.assurance().id, 'l0', 'proof reports its assurance');
  assert.equal(ds.capabilities().live, false, 'proof is not live');
  assert.equal(ds.capabilities().replay, true, 'proof with frames supports replay');
  const snap = await ds.exportSnapshot();
  assert.ok(snap.graph, 'proof exportSnapshot yields a graph');
  console.log('✓ ProofCinemaDataSource: bundle scene, replay frames, details, assurance, export');
}

// ---- Nexus adapter: RPC projection, disclosure-filtered ----
{
  let called = null;
  const rpc = async (method, params) => { called = { method, params }; return { scene: { nodes: [
    { id: 'p', label: 'pub', position: { x: 0, y: 0 } },
    { id: 's', label: 'sec', visibility: 'private', position: { x: 1, y: 0 }, balance: 9 },
  ], edges: [] } }; };
  const ds = new C.NexusCinemaDataSource({ rpc, method: 'cinema.scene', params: { intentId: 'int-1' } });
  const g = await ds.getScene();
  assert.equal(called.method, 'cinema.scene', 'nexus adapter calls the projection method');
  assert.equal(called.params.intentId, 'int-1', 'nexus adapter passes params');
  const sec = g.nodes.find((n) => n.id === 's');
  assert.equal(sec.label, C.DISCLOSURE.LABEL_PRIVATE, 'nexus adapter disclosure-filters the projection');
  assert.equal(ds.capabilities().live, true, 'nexus adapter is live (polls)');
  console.log('✓ NexusCinemaDataSource: RPC projection, params, disclosure-filtered, live');
}

// ---- mode capabilities ----
{
  const M = C.MODES;
  assert.equal(typeof C.mountCinema, 'function', 'mountCinema is exported');
  assert.deepEqual(Object.keys(M).sort(), ['cinema.embed', 'cinema.full', 'cinema.nexus', 'cinema.proof'].sort(), 'four canonical modes');
  assert.equal(M['cinema.embed'].readOnly, true, 'embed is read-only');
  assert.equal(M['cinema.embed'].controls, false, 'embed has no controls');
  assert.equal(M['cinema.full'].connect, true, 'full has the connect dialog');
  assert.equal(M['cinema.proof'].proof, true, 'proof carries the proof rail');
  assert.equal(M['cinema.nexus'].sharedHeader, true, 'nexus shares the Nexus header');
  for (const m of Object.keys(M)) assert.equal(M[m].disclosureAware, true, `${m} is disclosure-aware`);
  console.log('✓ four mount modes expose the intended capability set');
}

console.log('\n✓ All Cinema data-source + mode checks passed.');
