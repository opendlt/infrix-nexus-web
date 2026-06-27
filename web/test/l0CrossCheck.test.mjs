// RUNBOOK-07 SP8 — direct L0 cross-check. Stubs fetch to drive the branches.
// Passes an explicit endpoint (opts.endpoint) so the test never needs the
// Infrix rpc path.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(here, '_resolve_lib.mjs')).href);

const { crossCheckL0, cliEquivalent } = await import('/lib/l0CrossCheck.js');

const ANCHOR = { status: 'anchored', recordId: 'r1', txHash: '0xdeadbeef', blockHeight: 4242 };
const ENDPOINT = 'https://mainnet.accumulatenetwork.io/v3';

function withFetch(impl, fn) {
  const prev = globalThis.fetch;
  globalThis.fetch = impl;
  return Promise.resolve(fn()).finally(() => { globalThis.fetch = prev; });
}

test('a matching tx at the expected block → ok + l0Verified + network + command', async () => {
  await withFetch(
    async () => ({ ok: true, json: async () => ({ result: { blockHeight: 4242 } }) }),
    async () => {
      const r = await crossCheckL0(ANCHOR, { endpoint: ENDPOINT });
      assert.equal(r.ok, true);
      assert.equal(r.l0Verified, true);
      assert.equal(r.network, 'mainnet');
      assert.match(r.command, /tx get 0xdeadbeef/);
    },
  );
});

test('a tx at the WRONG block → not verified', async () => {
  await withFetch(
    async () => ({ ok: true, json: async () => ({ result: { blockHeight: 9999 } }) }),
    async () => {
      const r = await crossCheckL0(ANCHOR, { endpoint: ENDPOINT });
      assert.equal(r.ok, false);
      assert.equal(r.l0Verified, false);
      assert.match(r.reason, /expected block/);
    },
  );
});

test('a thrown fetch (CORS) → fails closed with a CORS reason', async () => {
  await withFetch(
    async () => { throw new Error('blocked by CORS'); },
    async () => {
      const r = await crossCheckL0(ANCHOR, { endpoint: ENDPOINT });
      assert.equal(r.l0Verified, false);
      assert.match(r.reason, /CORS|unreachable/i);
    },
  );
});

test('a missing tx in the L0 response → not found', async () => {
  await withFetch(
    async () => ({ ok: true, json: async () => ({ result: null }) }),
    async () => {
      const r = await crossCheckL0(ANCHOR, { endpoint: ENDPOINT });
      assert.equal(r.l0Verified, false);
      assert.match(r.reason, /not found/);
    },
  );
});

test('an anchor with no tx/block is rejected before any fetch', async () => {
  let called = false;
  await withFetch(async () => { called = true; return { ok: true, json: async () => ({}) }; }, async () => {
    const r = await crossCheckL0({ status: 'pending' }, { endpoint: ENDPOINT });
    assert.equal(r.l0Verified, false);
    assert.equal(called, false, 'no network call when there is nothing to check');
  });
});

test('cliEquivalent records a reproducible command', () => {
  assert.match(cliEquivalent(ANCHOR, ENDPOINT), /accumulate -s https:\/\/mainnet.*tx get 0xdeadbeef/);
});
