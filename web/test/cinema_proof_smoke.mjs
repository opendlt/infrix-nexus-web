// Priority 05 — Cinema proof mode (assurance ladder).
//
// Proof mode turns a portable bundle into an inspectable story and labels each
// claim with how strongly it is backed (offline / replay / L0 / witness). The
// cardinal rule: NEVER imply a higher assurance than the bundle actually
// carries — in particular, nothing rises to L0 ("anchored") without an anchor,
// and nothing reaches witness without witnesses. capAssurance enforces this.

import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../cinema-core/visualVocabulary.js');
require('../cinema-core/proofPanel.js');
const C = globalThis.InfrixCinema;
const { capAssurance, ASSURANCE_ORDER } = C;

const rank = (id) => ASSURANCE_ORDER.indexOf(id);

// Offline-only bundle: structural consistency, nothing checked against a network.
{
  const a = capAssurance('overall', { intent: {}, outcome: {} });
  assert.equal(a.id, 'offline', 'no replay/anchor/witness -> offline');
  console.log('✓ offline-only bundle -> offline');
}

// Replay present, no anchor: caps at replay, never l0.
{
  const a = capAssurance('overall', { replay: { ok: true } });
  assert.equal(a.id, 'replay', 'replay present -> replay');
  assert.ok(rank(a.id) < rank('l0'), 'replay never implies L0 without an anchor');
  console.log('✓ replay without anchor -> replay (never L0)');
}

// Anchor present: rises to l0.
{
  const a = capAssurance('overall', { replay: { ok: true }, anchor: { block: 7 } });
  assert.equal(a.id, 'l0', 'anchor present -> l0');
  console.log('✓ anchor present -> l0');
}

// Witness present WITHOUT anchor must not jump to witness — witness requires the
// anchor beneath it (the ladder is monotone).
{
  const a = capAssurance('overall', { witness: [{ sig: 'x' }] });
  assert.ok(rank(a.id) < rank('witness'), 'witness without anchor cannot reach witness level');
  console.log('✓ witness without anchor cannot reach witness level');
}

// Full stack: anchor + witness -> witness.
{
  const a = capAssurance('overall', { replay: {}, anchor: { block: 7 }, witness: [{ sig: 'x' }, { sig: 'y' }] });
  assert.equal(a.id, 'witness', 'anchor + witness -> witness');
  console.log('✓ anchor + witness -> witness');
}

// Per-stage capping: the anchor stage of a bundle WITHOUT an anchor is offline,
// even if other parts of the bundle are strong.
{
  const proof = { replay: {}, intent: {}, outcome: {} };
  const stage = capAssurance('anchor', proof);
  assert.equal(stage.id, 'offline', 'anchor stage without an anchor is offline (no false L0)');
  console.log('✓ anchor stage without an anchor -> offline (no false L0 claim)');
}

// Per-stage capping: witness stage with an anchor but no witnesses is l0, not witness.
{
  const proof = { anchor: { block: 7 } };
  const stage = capAssurance('witness', proof);
  assert.equal(stage.id, 'l0', 'witness stage with anchor-but-no-witness caps at l0');
  console.log('✓ witness stage without witnesses caps at l0 (no false witness claim)');
}

console.log('\n✓ All Cinema proof-mode assurance checks passed.');
