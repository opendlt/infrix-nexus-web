// nextux-08 — Wallet & Identity Control Center smoke test (no browser).
//
// Proves the browser twin (lib/identity.js) reads the Go-generated status
// fixture, reports an honest connected state, and explains a queued signature in
// plain language exactly as pkg/identityux.ExplainSignature does.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');

const id = await import(pathToFileURL(path.join(webRoot, 'lib', 'identity.js')).href);
const fixture = JSON.parse(fs.readFileSync(path.join(webRoot, 'testdata', 'identity.fixture.json'), 'utf8'));
id.setIdentityData(fixture);

test('the status fixture loads with wallet, sessions, and permissions', () => {
  assert.ok(id.wallet().connected, 'fixture wallet is connected');
  assert.ok(id.sessions().length >= 2, 'two sample sessions');
  assert.ok(id.permissions().length >= 2, 'permissions derived');
  assert.ok(id.signatureQueue().length >= 1, 'a pending signature');
});

test('connected state is honest (backed by a signed proof)', () => {
  assert.equal(id.isConnected(id.wallet()), true);
  // A bare address with no verifiedAt / liveProvider is NOT connected.
  assert.equal(id.isConnected({ connected: true, address: '0xabc' }), false);
});

test('a queued signature is explained with network and authority', () => {
  const ex = id.explainSignature(id.signatureQueue()[0]);
  assert.ok(!ex.error, 'request must be explainable');
  assert.equal(ex.network, 'Kermit');
  assert.equal(ex.identityTouched, 'acc://alice.acme');
  assert.ok(ex.requiredKeyPage.includes('acc://alice.acme/book/1'));
  assert.equal(ex.fundsOrCreditsMove, true);
  assert.ok(ex.agentInitiated, 'agent-initiated request is surfaced');
  assert.ok(ex.warnings.some((w) => /live network|agent/i.test(w)), 'has a safety warning');
});

test('explain fails closed on an unexplainable request', () => {
  assert.ok(id.explainSignature({ signer: 'acc://a.acme/book/1', network: 'Kermit' }).error, 'no goal');
  assert.ok(id.explainSignature({ goalType: 'SEND_TOKENS', network: 'Kermit' }).error, 'no signer');
  assert.ok(id.explainSignature({ goalType: 'SEND_TOKENS', signer: 'acc://a.acme/book/1' }).error, 'no network');
});

test('a mainnet signature is warned', () => {
  const ex = id.explainSignature({ goalType: 'SEND_TOKENS', signer: 'acc://a.acme/book/1', network: 'mainnet' });
  assert.ok(ex.warnings.some((w) => /MAINNET/i.test(w)), 'mainnet must warn');
});
