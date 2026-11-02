// Nexus — the offline verification of an exported evidence file, as every view that verifies one runs it: the portable package's checks (portableVerifier.js, the
// byte-exact mirror of the Go verifier) followed by the state_root_accumulator check of the sibling stateRootProof document the node attached beside the package
// (stateRootAccumulator.js). One function, so the Verify view, the guided flow and the Prove view cannot disagree about what "verified" included.

import { verifyPortablePackage } from '/lib/portableVerifier.js';
import { appendStateRootCheck } from '/lib/stateRootAccumulator.js';

/**
 * @param {object} file the parsed export file: the portable package, bare or under "bundle", and the stateRootProof document beside it when one was attached
 * @param {object|null} [reader] the L0 anchor-entry reader of the state root check; null in the browser today (a proven document is then checked but unconfirmed)
 * @returns {Promise<{passed: boolean, checks: Array<object>}>}
 */
export async function verifyExportedFile(file, reader = null) {
  return appendStateRootCheck(await verifyPortablePackage(file), file, reader);
}
