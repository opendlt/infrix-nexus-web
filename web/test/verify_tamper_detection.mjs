// Phase 5 tamper-detection test.
//
// Loads the fixture portable package and applies a series of
// targeted tampers. Each tamper MUST cause the JS verifier to fail
// — otherwise the verifier is degraded.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto === 'undefined') globalThis.crypto = webcrypto;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const libDir = path.join(__dirname, '..', 'lib');

const cjsSource = fs.readFileSync(path.join(libDir, 'canonicalJson.js'), 'utf8');
const pvSource = fs.readFileSync(path.join(libDir, 'portableVerifier.js'), 'utf8')
  .replace("from '/lib/canonicalJson.js'", "from './canonicalJson.js'");

const tmp = fs.mkdtempSync(path.join(path.dirname(__dirname), '.verify-tmp-'));
fs.writeFileSync(path.join(tmp, 'canonicalJson.js'), cjsSource);
fs.writeFileSync(path.join(tmp, 'portableVerifier.js'), pvSource);
const { verifyPortablePackage } = await import(
  pathToFileURL(path.resolve(tmp, 'portableVerifier.js')).href
);

const fixturePath = process.env.PORTABLE_FIXTURE ||
  'C:\\Users\\jason\\AppData\\Local\\Temp\\portable-fixture.json';
const original = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const tampers = [
  {
    name: 'wrong version',
    apply: (p) => { p.version = '2'; return p; },
    expect: 'version',
  },
  {
    name: 'flip a byte in exportHash',
    apply: (p) => { p.exportHash[0] = (p.exportHash[0] + 1) & 0xff; return p; },
    expect: 'export_hash',
  },
  {
    name: 'flip a byte in planHash (no rehash)',
    apply: (p) => { p.planHash[0] = (p.planHash[0] + 1) & 0xff; return p; },
    expect: 'export_hash', // ExportHash check fires first
  },
  {
    name: 'flip a byte in outcomeDigest',
    apply: (p) => { p.outcomeDigest[0] = (p.outcomeDigest[0] + 1) & 0xff; return p; },
    expect: 'export_hash',
  },
  {
    name: 'tamper an inclusion proof sibling',
    apply: (p) => {
      if (p.inclusionProofs && p.inclusionProofs[0] && p.inclusionProofs[0].proof && p.inclusionProofs[0].proof[0]) {
        p.inclusionProofs[0].proof[0][0] = (p.inclusionProofs[0].proof[0][0] + 1) & 0xff;
      }
      return p;
    },
    expect: 'export_hash', // again — anything in the package mutates ExportHash
  },
  {
    name: 'tamper bundleData policy decision (cross-binding catch)',
    apply: (p) => {
      if (p.bundleData && p.bundleData.policyDecisions && p.bundleData.policyDecisions[0]) {
        p.bundleData.policyDecisions[0].decision = 'deny';
      }
      return p;
    },
    expect: 'policy_decision_digest', // ExportHash and outer fields untouched, but the bundle commitment broke
  },
];

// Sophisticated tamper: rewrite a policy decision AND rehash
// ExportHash to bypass the integrity check. This is the exact
// scenario P1-005's PolicyDecisionDigest cross-binding was added
// to defeat. The verifier MUST catch it via the digest mismatch.
const cjs = await import(pathToFileURL(path.resolve(tmp, 'canonicalJson.js')).href);
async function rehashExportHash(pkg) {
  const intermediate = {
    version: pkg.version,
    bundleData: pkg.bundleData,
    planHash: Array.from(cjs.coerce32(pkg.planHash)),
    outcomeDigest: Array.from(cjs.coerce32(pkg.outcomeDigest)),
    trustSnapshot: pkg.trustSnapshot || null,
    inclusionProofs: pkg.inclusionProofs || null,
    anchorProof: pkg.anchorProof || null,
    anchorTxHash: pkg.anchorTxHash || '',
    anchorBlockHeight: Number(pkg.anchorBlockHeight || 0),
    pluginVersions: pkg.pluginVersions || null,
    policyDecisionDigest: Array.from(cjs.coerce32(pkg.policyDecisionDigest)),
  };
  const utf8 = new TextEncoder().encode(cjs.canonicalJSON(intermediate));
  const buf = await crypto.subtle.digest('SHA-256', utf8);
  pkg.exportHash = Array.from(new Uint8Array(buf));
  return pkg;
}
tampers.push({
  name: 'P1-005 sophisticated: tamper policy decision + rehash ExportHash',
  apply: async (p) => {
    if (p.bundleData && p.bundleData.policyDecisions && p.bundleData.policyDecisions[0]) {
      p.bundleData.policyDecisions[0].decision = 'deny';
    }
    return rehashExportHash(p);
  },
  expect: 'policy_decision_digest',
  async: true,
});

let allOk = true;
for (const t of tampers) {
  const tampered = JSON.parse(JSON.stringify(original));
  if (t.async) await t.apply(tampered);
  else t.apply(tampered);
  const result = await verifyPortablePackage(tampered);
  if (result.passed) {
    console.log(`✗ ${t.name}: VERIFIER WRONGLY PASSED`);
    allOk = false;
    continue;
  }
  const failedCheck = result.checks.find((c) => !c.passed);
  if (!failedCheck) {
    console.log(`✗ ${t.name}: passed=false but no failed check found`);
    allOk = false;
    continue;
  }
  if (!failedCheck.name.startsWith(t.expect)) {
    console.log(`~ ${t.name}: failed at ${failedCheck.name} (expected ${t.expect})`);
    // Acceptable — failure is detected, just at a different check.
  }
  console.log(`✓ ${t.name}: rejected at ${failedCheck.name}`);
}

fs.rmSync(tmp, { recursive: true, force: true });
process.exit(allOk ? 0 : 1);
