// One-shot browser-verifier CLI for cross-language parity testing.
//
// Usage: node verify_one.mjs <portable-package.json>
// Prints "PASS" (exit 0) or "FAIL <checkName>" (exit 1); exit 2 on usage error.
//
// Lives under test/tools/ so it is NOT matched by the `node --test
// pkg/nexus/web/test/*.mjs` glob (it is a CLI, not a test). The Go parity test
// (pkg/evidence TestNexusVerifierParity) shells out to it.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';

if (typeof globalThis.crypto === 'undefined') globalThis.crypto = webcrypto;

const here = path.dirname(fileURLToPath(import.meta.url));
const libDir = path.join(here, '..', '..', 'lib'); // test/tools -> web/lib

const pkgPath = process.argv[2];
if (!pkgPath) {
  console.error('usage: verify_one.mjs <portable-package.json>');
  process.exit(2);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const cjs = fs.readFileSync(path.join(libDir, 'canonicalJson.js'), 'utf8');
const pv = fs
  .readFileSync(path.join(libDir, 'portableVerifier.js'), 'utf8')
  .replace("from '/lib/canonicalJson.js'", "from './canonicalJson.js'");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-verify-one-'));
let code = 1;
let line = 'FAIL unknown';
try {
  fs.writeFileSync(path.join(tmp, 'canonicalJson.js'), cjs);
  fs.writeFileSync(path.join(tmp, 'portableVerifier.js'), pv);
  const { verifyPortablePackage } = await import(pathToFileURL(path.resolve(tmp, 'portableVerifier.js')).href);
  const res = await verifyPortablePackage(pkg);
  if (res.passed) {
    code = 0;
    line = 'PASS';
  } else {
    const f = res.checks.find((c) => !c.passed);
    line = 'FAIL ' + (f ? f.name : 'unknown');
  }
} finally {
  // process.exit does NOT run finally, so clean up BEFORE exiting below.
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(line);
process.exit(code);
