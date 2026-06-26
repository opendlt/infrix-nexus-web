// RUNBOOK-01 — Information-Architecture consolidation smoke.
//
// Filesystem + source assertions that the SPA collapsed to six nav doors with
// no orphaned/duplicate surfaces and no URL-only capabilities. Complements the
// Go fence (ia_consolidation_nav_fence_test.go); this side checks the things
// that are easier to express against the file tree.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const read = (rel) => fs.readFileSync(path.join(webRoot, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(webRoot, rel));

test('the 17 orphan legacy view files are deleted', () => {
  const orphans = [
    'anchors', 'approvals', 'capabilities', 'comingSoon', 'evidence',
    'inspect', 'intents', 'live', 'operate', 'outcomes', 'plans',
    'plugins', 'policies', 'readiness', 'roles', 'spineFlow', 'trust',
  ];
  for (const v of orphans) {
    assert.equal(exists(`views/${v}.js`), false, `views/${v}.js must be deleted`);
  }
});

test('the orphaned spine-copy libs are deleted', () => {
  for (const m of ['spineHero', 'spineStrip', 'liveEvents']) {
    assert.equal(exists(`lib/${m}.js`), false, `lib/${m}.js must be deleted`);
  }
});

test('the six fixture "fake builder" views + their private libs are deleted', () => {
  const views = ['app', 'workbench', 'autopilot', 'studio', 'room', 'companion'];
  for (const v of views) {
    assert.equal(exists(`views/${v}.js`), false, `views/${v}.js must be deleted`);
  }
  for (const m of ['app', 'workbench', 'remediation', 'studioGraph', 'studioPalette', 'roomClient', 'companion']) {
    assert.equal(exists(`lib/${m}.js`), false, `lib/${m}.js must be deleted`);
  }
});

test('cinemaMount.js is KEPT (live via execute.js dynamic import)', () => {
  assert.equal(exists('lib/cinemaMount.js'), true, 'lib/cinemaMount.js must survive');
  assert.match(read('views/execute.js'), /import\(['"]\/lib\/cinemaMount\.js['"]\)/);
});

test('network/verify/subsystems views are KEPT (live Operate-console tabs)', () => {
  for (const v of ['network', 'verify', 'subsystems']) {
    assert.equal(exists(`views/${v}.js`), true, `views/${v}.js must survive`);
  }
  const oc = read('lib/operateConsole.js');
  assert.match(oc, /\/views\/network\.js/);
  assert.match(oc, /\/views\/verify\.js/);
  assert.match(oc, /\/views\/subsystems\.js/);
});

test('the marketing surfaces relocated to web/marketing/', () => {
  for (const v of ['trust_center', 'compare', 'wallet_lab', 'launch', 'design']) {
    assert.equal(exists(`views/${v}.js`), false, `views/${v}.js must move out of the router tree`);
    assert.equal(exists(`marketing/views/${v}.js`), true, `marketing/views/${v}.js must exist`);
  }
  for (const m of ['trustCenter', 'compare', 'walletLab', 'launch']) {
    assert.equal(exists(`marketing/lib/${m}.js`), true, `marketing/lib/${m}.js must exist`);
  }
});

test('merged-away routes survive as deep-link-preserving redirect stubs', () => {
  const app = read('app.js');
  const stubs = [
    "autopilot: makeRedirect(() => '#/compose')",
    "workbench: makeRedirect(() => '#/compose')",
    "studio: makeRedirect(() => '#/compose')",
    "companion: makeRedirect(() => '#/start')",
    "rooms: makeRedirect(() => '#/start')",
    "app: makeRedirect(() => '#/start')",
    "'trust-center': makeRedirect(() => '#/govern')",
    "'wallet-lab': makeRedirect(() => '#/identity')",
  ];
  for (const s of stubs) {
    assert.ok(app.includes(s), `app.js must keep redirect stub: ${s}`);
  }
  // proof-inbox redirects into the inbox proofs lane (id preserved).
  assert.match(app, /'proof-inbox': makeRedirect\(\(s\) =>[^\n]*#\/inbox\/proofs/);
});

test('the inbox gained the proofs lane and proof-inbox folds into it', () => {
  const inbox = read('views/inbox.js');
  assert.match(inbox, /key: 'proofs'/, 'inbox must declare the proofs lane');
  assert.match(inbox, /renderProofQueue/, 'inbox must render the shared proof queue');
  const collab = read('views/inbox_collab.js');
  assert.match(collab, /export async function renderProofQueue/, 'inbox_collab must export the shared renderer');
});

test('the command palette carries the six doors + the folded-out long tail', () => {
  const pal = read('lib/commandPalette.js');
  for (const qj of [
    'qj.start', 'qj.compose', 'qj.prove', 'qj.cockpit', 'qj.govern', 'qj.inbox',
    'qj.operate', 'qj.agent', 'qj.scenarios', 'qj.learn', 'qj.quests', 'qj.tutor',
    'qj.approvals', 'qj.tasks', 'qj.identity',
  ]) {
    assert.ok(pal.includes(qj), `QUICK_JUMPS must include ${qj}`);
  }
});

test('the previously URL-only verifyBatch is reachable from the Verify surface', () => {
  assert.match(read('views/prove.js'), /#\/verifyBatch/, 'prove.js must link to the batch verifier');
});

test('index.html declares exactly six workspace doors', () => {
  const html = read('index.html');
  const count = (html.match(/class="workspace-link"/g) || []).length;
  assert.equal(count, 6, 'exactly six nav doors');
  for (const ws of ['operate', 'agent', 'scenarios']) {
    assert.ok(!html.includes(`data-workspace="${ws}"`), `${ws} must not be a nav door`);
  }
});

test('the newcomer default landing is #/start, not the deleted #/app', () => {
  const app = read('app.js');
  assert.match(app, /mode === 'expert' \? '#\/spine' : '#\/start'/);
  assert.ok(!app.includes("window.location.hash = '#/app'"), 'the #/app default landing must be gone');
});
