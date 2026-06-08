// Shared harness for the Nexus browser-verifier tests (Priority 03).
//
// The verifier modules use browser-absolute imports (`from '/lib/...'`).
// Node can't resolve those, so we copy them into a temp dir with rewritten
// imports and dynamic-import. loadVerifier() ALWAYS returns a cleanup() and
// removes the temp dir itself if setup fails — no .verify-tmp-* leaks.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { webcrypto, createHash } from 'node:crypto';

if (typeof globalThis.crypto === 'undefined') globalThis.crypto = webcrypto;

const here = path.dirname(fileURLToPath(import.meta.url));
const libDir = path.join(here, '..', 'lib');
export const testdataDir = path.join(here, '..', 'testdata');

/** Resolve the fixture path: PORTABLE_FIXTURE override, else the checked-in one. */
export function fixturePath() {
  return process.env.PORTABLE_FIXTURE || path.join(testdataDir, 'portable-fixture.valid.json');
}

export function manifestPath() {
  return path.join(testdataDir, 'portable-fixture.manifest.json');
}

/** Read + parse the fixture, with a helpful regen hint when it is missing. */
export function loadFixture() {
  const p = fixturePath();
  if (!fs.existsSync(p)) {
    throw new Error(
      `Nexus portable fixture not found at ${p}\n` +
        'Regenerate it with: go test ./pkg/evidence -run TestDumpNexusPortableFixture -update',
    );
  }
  const bytes = fs.readFileSync(p);
  return { bytes, text: bytes.toString('utf8'), pkg: JSON.parse(bytes.toString('utf8')), path: p };
}

/** Whether the manifest integrity check applies (only for the default fixture). */
export function usingDefaultFixture() {
  return !process.env.PORTABLE_FIXTURE;
}

/**
 * Load the browser verifier (+ canonical-JSON helpers) into a temp module dir.
 * Returns { verifyPortablePackage, canonicalJSON, coerce32, cleanup }. cleanup()
 * MUST be called in a finally; on setup failure the temp dir is removed before
 * throwing so no directory ever leaks.
 */
export async function loadVerifier() {
  const cjsSource = fs.readFileSync(path.join(libDir, 'canonicalJson.js'), 'utf8');
  const pvSource = fs
    .readFileSync(path.join(libDir, 'portableVerifier.js'), 'utf8')
    .replace("from '/lib/canonicalJson.js'", "from './canonicalJson.js'");
  // Temp module dir lives under the OS temp root (not the repo tree) so it
  // never leaks a .verify-tmp-* directory into source control, and so
  // concurrently-run test files (node --test forks a process per file) can
  // never delete each other's in-flight modules.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-verify-'));
  try {
    fs.writeFileSync(path.join(tmp, 'canonicalJson.js'), cjsSource);
    fs.writeFileSync(path.join(tmp, 'portableVerifier.js'), pvSource);
    const pv = await import(pathToFileURL(path.resolve(tmp, 'portableVerifier.js')).href);
    const cjs = await import(pathToFileURL(path.resolve(tmp, 'canonicalJson.js')).href);
    return {
      verifyPortablePackage: pv.verifyPortablePackage,
      canonicalJSON: cjs.canonicalJSON,
      coerce32: cjs.coerce32,
      cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
    };
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw err;
  }
}

export function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}
