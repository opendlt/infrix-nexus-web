// nextux-04 — Task Template Marketplace gallery smoke test (no browser).
//
// Proves the browser registry twin (lib/taskRegistry.js) reads the Go-generated
// catalog fixture and exposes the same signed, trusted templates the CLI + SDK
// use — with honest trust badges (no positive chip for an untrusted source).

import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');

const reg = await import(pathToFileURL(path.join(webRoot, 'lib', 'taskRegistry.js')).href);

const fixture = JSON.parse(fs.readFileSync(path.join(webRoot, 'testdata', 'tasks.fixture.json'), 'utf8'));
reg.setTaskCatalog(fixture);

{
  const all = reg.listTemplates();
  assert.ok(all.length >= 12, `expected >=12 templates, got ${all.length}`);
  for (const t of all) {
    assert.equal(t.trust, 'official_verified', `${t.id} should be official_verified`);
    assert.ok(reg.isTrusted(t.trust), `${t.id} should be trusted`);
    assert.ok(Array.isArray(t.actions) && t.actions.length > 0, `${t.id} has no actions`);
  }
  console.log('✓ catalog has >=12 official, fully-trusted templates');
}

{
  const hits = reg.searchTemplates('escrow');
  assert.ok(hits.some((t) => t.id === 'infrix/regulated-escrow'), 'search escrow finds regulated-escrow');
  assert.equal(reg.getTemplate('infrix/regulated-escrow').trust, 'official_verified');
  console.log('✓ search + get work');
}

{
  const cats = reg.categories();
  assert.equal(cats[0], 'all', 'categories lead with "all"');
  assert.ok(cats.includes('payments') && cats.includes('release'), 'expected known categories');
  const release = reg.templatesByCategory('release');
  assert.ok(release.length > 0 && release.every((t) => t.category === 'release'), 'category filter is exact');
  console.log('✓ categories + category filter');
}

{
  // Honest trust badges: positive only for verified sources.
  assert.equal(reg.trustBadge('official_verified').role, 'positive');
  assert.equal(reg.trustBadge('tampered').role, 'negative');
  assert.equal(reg.trustBadge('local_unsigned').role, 'caution');
  assert.equal(reg.isTrusted('tampered'), false);
  assert.equal(reg.isTrusted('local_unsigned'), false);
  console.log('✓ trust badges are honest (no positive chip for untrusted)');
}

console.log('\n✓ All task-gallery checks passed.');
