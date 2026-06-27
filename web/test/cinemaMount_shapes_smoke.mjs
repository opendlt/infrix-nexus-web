// RUNBOOK-05 Task 6 — the Nexus-embedded scene must emit the vocabulary shape
// per node kind, not a uniform grid of rectangles (F8).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(here, '_resolve_lib.mjs')).href);

// visualVocabulary is a classic script; importing it runs the IIFE which sets
// globalThis.InfrixCinema (with shapeForKind). cinemaMount.graphToScene is ESM.
await import('/cinema-core/visualVocabulary.js');
const vocab = globalThis.InfrixCinema;
const { graphToScene } = await import('/lib/cinemaMount.js');

test('visualVocabulary exports shapeForKind with the expected kind→shape map', () => {
  assert.equal(typeof vocab.shapeForKind, 'function');
  assert.equal(vocab.shapeForKind('approval_gate'), 'gate');
  assert.equal(vocab.shapeForKind('evidence'), 'document');
  assert.equal(vocab.shapeForKind('outcome'), 'star');
  assert.equal(vocab.shapeForKind('policy'), 'octagon');
  assert.equal(vocab.shapeForKind('intent'), 'arrow');
  assert.equal(vocab.shapeForKind('anchor'), 'diamond');
  assert.equal(vocab.shapeForKind('plan_step'), 'rectangle');
  assert.equal(vocab.shapeForKind('totally_unknown_kind'), 'circle'); // fallback
});

test('graphToScene emits the vocabulary shape per kind, not all-rectangles', () => {
  const g = {
    nodes: [
      { id: 'a', kind: 'approval_gate', status: 'completed', dependsOn: [] },
      { id: 'b', kind: 'evidence', status: 'completed', dependsOn: ['a'] },
      { id: 'c', status: 'running', dependsOn: ['b'] },   // no kind → plan_step → rectangle
    ],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
    outcome: { id: 'o', overallStatus: 'completed' },
  };
  const scene = graphToScene(g, vocab);
  const byId = Object.fromEntries(scene.nodes.map((n) => [n.id, n]));
  assert.equal(byId['a'].shape, 'gate');
  assert.equal(byId['b'].shape, 'document');
  assert.equal(byId['c'].shape, 'rectangle');
  assert.equal(scene.nodes.find((n) => n.kind === 'outcome').shape, 'star');

  // Not all the same shape (the F8 regression).
  const shapes = new Set(scene.nodes.map((n) => n.shape));
  assert.ok(shapes.size >= 3, 'scene uses multiple shapes');
});
