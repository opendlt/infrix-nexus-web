// RUNBOOK-07 SP1 — board scrubber core (headless, stubbed timeContext).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(here, '_resolve_lib.mjs')).href);

const { createScrubberCore, mountBoardScrubber } = await import('/lib/boardScrubber.js');

function stubCtx() {
  const calls = [];
  return {
    calls,
    setAt: (at) => calls.push(at),
    getAt: () => null,
    isAtLive: () => true,
    onAtChange: () => () => {},
  };
}

test('seeking mid-range freezes via setAt({block})', () => {
  const ctx = stubCtx();
  const core = createScrubberCore({ min: 1, max: 100, ctx });
  core.seek(50);
  assert.deepEqual(ctx.calls[ctx.calls.length - 1], { block: 50 });
  assert.equal(core.getBlock(), 50);
  assert.equal(core.state().live, false);
});

test('seeking to (or past) the head snaps to live via setAt(null)', () => {
  const ctx = stubCtx();
  const core = createScrubberCore({ min: 1, max: 100, ctx });
  core.seek(100);
  assert.equal(ctx.calls[ctx.calls.length - 1], null);
  assert.equal(core.state().live, true);
  core.seek(999);                                 // clamped to max → still live
  assert.equal(ctx.calls[ctx.calls.length - 1], null);
  assert.equal(core.getBlock(), 100);
});

test('seeks clamp to [min,max]', () => {
  const ctx = stubCtx();
  const core = createScrubberCore({ min: 10, max: 20, ctx });
  core.seek(0);
  assert.equal(core.getBlock(), 10);
});

test('tick advances exactly one block and stops at max', () => {
  const ctx = stubCtx();
  const core = createScrubberCore({ min: 1, max: 4, ctx });
  core.seek(1);
  assert.equal(core.tick(), 2);
  assert.equal(core.tick(), 3);
  assert.equal(core.tick(), 4);                   // reaches head
  // At head, further ticks do not advance (and re-assert live).
  assert.equal(core.tick(), 4);
  assert.equal(core.state().live, true);
});

test('play uses an injected scheduler and steps one block per tick', () => {
  const ctx = stubCtx();
  const core = createScrubberCore({ min: 1, max: 3, ctx });
  core.seek(1);
  let fire = null;
  core.play((fn) => { fire = fn; return 1; });     // capture the tick fn instead of a real timer
  assert.equal(core.isPlaying(), true);
  fire(); assert.equal(core.getBlock(), 2);
  fire(); assert.equal(core.getBlock(), 3);
  fire();                                          // at head → stops
  assert.equal(core.isPlaying(), false);
});

test('syncFromAt reflects an external cursor into the playhead', () => {
  const ctx = stubCtx();
  const core = createScrubberCore({ min: 1, max: 100, ctx });
  core.syncFromAt({ block: 42 });
  assert.equal(core.getBlock(), 42);
  core.syncFromAt(null);                           // live
  assert.equal(core.getBlock(), 100);
});

test('mountBoardScrubber(null,…) returns a headless controller wired to onAtChange', () => {
  const ctx = stubCtx();
  let handler = null;
  ctx.onAtChange = (fn) => { handler = fn; return () => {}; };
  const { element, core } = mountBoardScrubber(null, { getRange: () => ({ min: 1, max: 50 }), ctx });
  assert.equal(element, null, 'headless: no DOM');
  handler({ block: 25 });
  assert.equal(core.getBlock(), 25, 'external at change moves the headless playhead');
});
