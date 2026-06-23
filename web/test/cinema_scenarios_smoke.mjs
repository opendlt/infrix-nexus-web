// Priority 05 — Cinema scenario gallery + export/share.
//
// Loads every examples/cinema-scenarios/*.json through the SAME core code each
// surface uses (applyDisclosure + capAssurance) and asserts the scenario's
// expected node/edge counts, redactions, present/absent labels, and capped
// assurance. Also covers the export/share provenance envelope + SVG export.
// This is the gallery acceptance gate: the fixtures render the product, not a
// mock.
//
// The scenario gallery (examples/cinema-scenarios) lives in the Infrix monorepo,
// not in this extracted module. When it is absent (this module built/tested
// standalone, e.g. in its own repo), the gallery checks SKIP — the cinema-core
// export/render code is still exercised by the other web/test suites. When the
// monorepo consumes this module (or runs it in-tree), the gallery is present and
// the checks run in full.

import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
require('../cinema-core/visualVocabulary.js');
require('../cinema-core/disclosureView.js');
require('../cinema-core/proofPanel.js');
require('../cinema-core/exportPanel.js');
const C = globalThis.InfrixCinema;

const here = path.dirname(fileURLToPath(import.meta.url));
const galleryDir = path.join(here, '..', '..', '..', '..', 'examples', 'cinema-scenarios');

function labels(graph) { return (graph.nodes || []).map((n) => n.label || ''); }

if (!existsSync(galleryDir)) {
  console.log(`# SKIP cinema-scenarios gallery: ${galleryDir} not present (extracted-module mode; the scenario gallery lives in the Infrix monorepo)`);
} else {
  const files = (await readdir(galleryDir)).filter((f) => f.endsWith('.json')).sort();
  assert.ok(files.length >= 7, `expected at least 7 scenarios, found ${files.length}`);

  for (const file of files) {
    const sc = JSON.parse(await readFile(path.join(galleryDir, file), 'utf8'));
    // The gallery's `expected` block is the ANONYMOUS view (no grants — grants
    // belong to an authenticated viewer, exercised separately below).
    const ctx = sc.disclosureContext || {};
    const out = C.applyDisclosure(sc.scene, ctx);
    const exp = sc.expected;

    assert.equal(out.nodes.length, exp.nodes, `${sc.id}: node count`);
    assert.equal(out.edges.length, exp.edges, `${sc.id}: edge count`);
    const redacted = out.nodes.filter((n) => n.redacted).length;
    assert.equal(redacted, exp.redactedNodes, `${sc.id}: redacted node count`);

    const ls = labels(out);
    for (const want of exp.labels || []) {
      assert.ok(ls.some((l) => l.includes(want)), `${sc.id}: expected a node labeled containing "${want}"; got ${JSON.stringify(ls)}`);
    }
    for (const absent of exp.absentLabels || []) {
      assert.ok(!ls.some((l) => l.includes(absent)), `${sc.id}: label "${absent}" must be redacted but appeared`);
    }

    const assurance = C.capAssurance('overall', sc.proof || {});
    assert.equal(assurance.id, exp.assurance, `${sc.id}: assurance level`);
    console.log(`✓ ${sc.id}: ${out.nodes.length}n/${out.edges.length}e, ${redacted} redacted, assurance=${assurance.id}`);
  }

  // ---- disclosure-grant: granted viewer sees what anonymous cannot ----
  {
    const sc = JSON.parse(await readFile(path.join(galleryDir, 'disclosure-grant.json'), 'utf8'));
    const ctx = Object.assign({}, sc.disclosureContextGranted, { grants: new Set(sc.grants) });
    const out = C.applyDisclosure(sc.scene, ctx);
    const redacted = out.nodes.filter((n) => n.redacted).length;
    assert.equal(redacted, sc.expectedGranted.redactedNodes, 'granted viewer: no redactions');
    assert.ok(labels(out).some((l) => l.includes('whale-balance-9.9M')), 'granted viewer sees the disclosed value');
    console.log('✓ disclosure-grant: granted auditor sees the value anonymous viewers cannot');
  }

  // ---- export / share provenance envelope + SVG ----
  {
    const sc = JSON.parse(await readFile(path.join(galleryDir, 'golden-escrow.json'), 'utf8'));
    const fakeRenderer = { sceneGraph: sc.scene, canvas: null };
    const fakeDS = { assurance: () => ({ id: 'l0', label: 'L0-anchored' }), capabilities: () => ({}), exportSnapshot: async () => ({ graph: sc.scene, meta: {} }), proof: sc.proof };
    const exp = new C.CinemaExport({ renderer: fakeRenderer, dataSource: fakeDS, mode: 'cinema.proof', commit: 'testsha', disclosureContext: {} });

    const prov = exp.provenance(sc.scene);
    assert.equal(prov.product, 'Infrix Cinema', 'provenance names the product');
    assert.equal(prov.nonCommitting, true, 'provenance declares Cinema non-committing');
    assert.equal(prov.sourceMode, 'cinema.proof', 'provenance records the source mode');
    assert.equal(prov.verification.id, 'l0', 'provenance records the verification/assurance level');
    assert.equal(prov.disclosure.totalNodes, sc.scene.nodes.length, 'provenance counts total nodes');
    assert.equal(prov.disclosure.redactedNodes, 0, 'provenance counts redacted nodes');
    assert.equal(prov.commit, 'testsha', 'provenance records the build commit');
    assert.ok(prov.timestamp && prov.timestamp.includes('T'), 'provenance records an ISO timestamp');
    console.log('✓ export provenance: self-describing (non-committing, mode, assurance, disclosure, commit, timestamp)');

    const svg = C.sceneToSVG(sc.scene);
    assert.ok(svg.startsWith('<svg'), 'SVG export starts with <svg');
    assert.ok(svg.includes('<circle'), 'SVG export draws nodes');
    assert.ok(svg.includes('open escrow') || svg.includes('L0 #7'), 'SVG export includes node labels');
    console.log('✓ SVG export renders nodes + labels');
  }

  console.log('\n✓ All Cinema scenario-gallery + export checks passed.');
}
