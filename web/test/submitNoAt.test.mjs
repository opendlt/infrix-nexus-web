// infrix-core item 2c part 28aa: a governed submission never carries the explorer's view-time at-coordinate. The node decodes governed.submit,
// intent.submit and nexus.previewDossier under one strict contract that refuses a member it does not name; reads keep the cursor.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(here, '_resolve_lib.mjs')).href);

const sent = [];
globalThis.window = globalThis.window || { location: { origin: 'http://nexus.test', href: 'http://nexus.test/', hash: '', search: '' }, history: { replaceState() {}, pushState() {} }, addEventListener() {} };
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {} };
globalThis.fetch = async (_url, init) => {
  sent.push(JSON.parse(init.body));
  return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result: {} }) };
};

const { rpcWithDisclosure } = await import('/lib/spineCommon.js');
const { setAt } = await import('/lib/timeContext.js');

test('a governed submission carries no at-coordinate while the explorer is time-travelled; a read keeps it', async () => {
  setAt({ block: 3 });
  for (const method of ['governed.submit', 'intent.submit', 'nexus.previewDossier']) {
    sent.length = 0;
    await rpcWithDisclosure(method, { goalType: 'ROLE_ASSIGN', customParams: {} });
    assert.equal(sent.length, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(sent[0].params, 'at'), false, `${method} carried the view-time at-coordinate`);
    assert.equal(sent[0].params.goalType, 'ROLE_ASSIGN');
  }
  sent.length = 0;
  await rpcWithDisclosure('intent.get', { id: 'intent-1' });
  assert.ok(sent[0].params.at, 'a read lost the at-coordinate');
});
