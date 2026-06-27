// RUNBOOK-07 SP6 — consequence panel (pure consequenceFromDossier + riskBadge).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(here, '_resolve_lib.mjs')).href);

const { consequenceFromDossier, riskBadge } = await import('/lib/consequencePanel.js');

test('SEND_TOKENS on mainnet → high + irreversible', () => {
  const { explanation, badge } = consequenceFromDossier({
    goalType: 'SEND_TOKENS',
    signerKeyPage: 'acc://alice/book/1',
    network: 'mainnet',
    plan: { sourceAssets: ['acc://alice/tokens'], targetAssets: ['acc://bob/tokens'] },
  });
  assert.equal(explanation.fundsOrCreditsMove, true);
  assert.equal(badge.level, 'high');
  assert.ok(explanation.irreversibleEffects.some((e) => /moves value/i.test(e)));
});

test('WRITE_DATA local → medium + dataDisclosed', () => {
  const { explanation, badge } = consequenceFromDossier({
    goalType: 'WRITE_DATA',
    signerKeyPage: 'acc://alice/book/1',
    network: 'local',
    plan: {},
  });
  assert.equal(explanation.dataDisclosed, true);
  assert.equal(badge.level, 'medium');
});

test('read-only local → low (offline proof, no network state)', () => {
  const { explanation, badge } = consequenceFromDossier({
    goalType: 'VERIFY_PROOF',
    signerKeyPage: 'acc://alice/book/1',
    network: 'local',
    plan: {},
  });
  assert.equal(explanation.fundsOrCreditsMove, false);
  assert.equal(badge.level, 'low');
  assert.ok(explanation.irreversibleEffects.some((e) => /none/i.test(e)));
});

test('missing signer → fail-closed unknown (never a blank panel)', () => {
  const { explanation, badge } = consequenceFromDossier({ goalType: 'SEND_TOKENS', network: 'local', plan: {} });
  assert.ok(explanation.error, 'explainSignature fails closed');
  assert.equal(badge.level, 'unknown');
  assert.match(badge.text, /cannot preview/);
});

test('an agent-initiated request surfaces the agent warning', () => {
  const { explanation } = consequenceFromDossier({
    goalType: 'SEND_TOKENS', signerKeyPage: 'acc://a/book/1', network: 'mainnet',
    plan: { sourceAssets: ['x'] },
  }, { agentInitiated: true });
  assert.ok(explanation.warnings.some((w) => /agent/i.test(w)));
});

test('riskBadge classifies a pre-computed explanation', () => {
  assert.equal(riskBadge({ error: 'x' }).level, 'unknown');
  assert.equal(riskBadge({ fundsOrCreditsMove: false, dataDisclosed: false, warnings: [] }).level, 'low');
  assert.equal(riskBadge({ fundsOrCreditsMove: true, network: 'local', warnings: [] }).level, 'medium');
  assert.equal(riskBadge({ fundsOrCreditsMove: true, network: 'mainnet', warnings: ['this signs a MAINNET transaction — funds are real'] }).level, 'high');
});
