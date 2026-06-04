// Phase 5 cross-language byte-exact verifier test.
//
// Loads the fixture portable-package emitted by
// pkg/evidence/dump_portable_fixture_test.go and runs the JS verifier
// implementation. The JS implementation MUST produce passed=true on a
// fixture the Go-side VerifyPortablePackage already accepted.
//
// Run with:
//   node pkg/devnet/explorer/test/verify_portable_fixture.mjs
//
// Exit code 0 = JS verifier passed; non-zero = JS verifier failed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';

// Polyfill globalThis.crypto for browser-style SubtleCrypto
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = webcrypto;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The verifier modules are written for browser-style absolute imports
// (`import { … } from '/lib/canonicalJson.js'`). Node.js doesn't
// resolve those by default; we read+rewrite the source on the fly so
// this test can run without a bundler.
const libDir = path.join(__dirname, '..', 'lib');

const cjsSource = fs.readFileSync(path.join(libDir, 'canonicalJson.js'), 'utf8');
const cjsRewritten = cjsSource;  // canonicalJson.js has no internal /lib/ imports

const pvSource = fs.readFileSync(path.join(libDir, 'portableVerifier.js'), 'utf8');
const pvRewritten = pvSource.replace(
  "from '/lib/canonicalJson.js'",
  `from './canonicalJson.js'`
);

// Write to a tmp dir + dynamic-import.
const tmp = fs.mkdtempSync(path.join(path.dirname(__dirname), '.verify-tmp-'));
fs.writeFileSync(path.join(tmp, 'canonicalJson.js'), cjsRewritten);
fs.writeFileSync(path.join(tmp, 'portableVerifier.js'), pvRewritten);

const { verifyPortablePackage } = await import(
  pathToFileURL(path.resolve(tmp, 'portableVerifier.js')).href
);

const fixturePath = process.env.PORTABLE_FIXTURE ||
  'C:\\Users\\jason\\AppData\\Local\\Temp\\portable-fixture.json';
const text = fs.readFileSync(fixturePath, 'utf8');
const pkg = JSON.parse(text);

const result = await verifyPortablePackage(pkg);

console.log(`verifier result: passed=${result.passed}, ${result.checks.filter(c=>c.passed).length}/${result.checks.length}`);
for (const c of result.checks) {
  const mark = c.passed ? '✓' : '✗';
  const detail = c.detail ? `  ${c.detail}` : '';
  const err = c.error ? `  ERROR: ${c.error}` : '';
  console.log(`  ${mark} ${c.name}${detail}${err}`);
}

// Clean up tmp dir
fs.rmSync(tmp, { recursive: true, force: true });

if (!result.passed) {
  process.exit(1);
}
process.exit(0);
