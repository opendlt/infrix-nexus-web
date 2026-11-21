// Nexus — the bodies of every governed submission the explorer makes (infrix-core item 2c part 28ac row 4).
//
// The node decodes governed.submit, intent.submit and nexus.previewDossier under ONE strict contract (core.SubmitGovernedRequest, item 2c
// part 28aa): a member it does not name is refused by name, and every member it names reaches the intent. Before that contract the doors
// dropped what they did not read, so a flow could send members nobody read and still "work". Measured 2026-11-20:
//
//   - the guided escrow flow submitted governed.submit with goalType ESCROW_RELEASE and mode, buyer, seller and amount at the top level.
//     ESCROW_RELEASE is not a goal type the node has (infrix-sdk-js goal-vocabulary.json, the node's ValidGoalTypes), it named no actor, and
//     mode is the explorer's own UI choice: the flow never worked as built. An escrow is the SETTLEMENT goal (its declared parameter is legs)
//     with method escrow and one escrow leg — the goal POST /v4/escrows compiles an escrow to (rest escrowLegSpec) — submitted through
//     governed.submit, which both roots serve on /rpc (escrow.create is served on production's /rpc only: reported to main);
//   - the compose flow sent expectedPlanHash, which the contract does not name (the node re-plans from goalType and customParams; the
//     client compares the plan hash it reviewed with the one the node answers, verify-after);
//   - compose and the cockpit rail read the answer as result.Intent.ID and result.Plan, which the node never writes (it answers
//     intent.id and plan.planHash, the plan hash as 32 bytes), so a submission never navigated and the plan-hash check compared a byte
//     array with a hex string.
//
// Every body is built here, and web/test/submitContract.test.mjs pins each flow's body to exactly its contract.

/** The members of the governed-submit contract (infrix-core core.SubmitGovernedRequest): the only members a governed submission may carry. */
export const GOVERNED_SUBMIT_MEMBERS = Object.freeze([
  'goalType', 'sourceAssets', 'targetAssets', 'targetState', 'via', 'customType', 'customParams', 'priority',
  'constraints', 'preferences', 'rawInput', 'expiresAt', 'metadata',
  'actor', 'authority', 'userAddress', 'purpose', 'workflowInstance',
  'autoApprove', 'maxGas', 'deadline', 'code', 'preview',
  'signature', 'signerPublicKey', 'keyPageRef', 'signatureAlgorithm', 'signerVersion', 'signatureTimestamp',
]);

/** The goal members of a governed submission the explorer composes: the goal type and its parameters (the disclosure context is merged by
 * rpcWithDisclosure). Throws for what the node would refuse, before anything is sent. */
export function governedSubmitParams(goalType, customParams) {
  if (typeof goalType !== 'string' || goalType.trim() === '') {
    throw new Error('a governed submission names its goalType');
  }
  if (customParams === null || typeof customParams !== 'object' || Array.isArray(customParams)) {
    throw new Error('customParams must be a JSON object: the goal\'s declared parameters, under their declared keys');
  }
  return { goalType, customParams };
}

/** The SETTLEMENT goal parameters of the guided escrow: the buyer deposits `amount` of `asset` for the seller, as one escrow leg in the
 * shape the node's own escrow door builds (infrix-core rest escrowLegSpec: kind escrow, the buyer's and seller's vaults, the asset type, the
 * amount, domain local, finality external_contingent, depositor, beneficiary and the arbiter an escrow leg requires). Throws, naming the field, for
 * what the node would refuse (an empty party, arbiter or asset, an amount that is not a positive whole number). */
export function escrowSettlementParams(fields) {
  const f = fields || {};
  const need = (name, v) => {
    const s = typeof v === 'string' ? v.trim() : '';
    if (s === '') throw new Error(`${name} is required`);
    return s;
  };
  const amountText = String(f.amount === undefined ? '' : f.amount).trim();
  if (!/^[1-9][0-9]*$/.test(amountText) || !Number.isSafeInteger(Number(amountText))) {
    throw new Error('amount must be a positive whole number of base units');
  }
  const depositor = need('buyer', f.buyer);
  const beneficiary = need('seller', f.seller);
  const assetType = need('asset', f.asset);
  const arbiter = need('arbiter', f.arbiter);
  return {
    method: 'escrow',
    legs: [{
      kind: 'escrow', fromVault: depositor, toVault: beneficiary, assetType, amount: Number(amountText),
      domain: 'local', finalityRequirement: 'external_contingent', depositor, beneficiary, arbiter,
    }],
  };
}

/** The id of the intent a governed submission admitted, as the node answers it (IntentResult.intent.id), or '' when it names none. */
export function submittedIntentId(result) {
  const id = result && result.intent && result.intent.id;
  return typeof id === 'string' ? id : '';
}

/** A plan hash as lowercase hex: the node writes a submitted plan's hash as 32 bytes (a JSON array of numbers) and the preview dossier
 * writes it as hex, so both are read into one form before they are compared. Anything else answers ''. */
export function planHashHex(v) {
  if (typeof v === 'string') return /^[0-9a-fA-F]{64}$/.test(v) ? v.toLowerCase() : '';
  if (Array.isArray(v) && v.length === 32 && v.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) {
    return v.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return '';
}

/** The plan hash a governed submission's answer carries (IntentResult.plan.planHash), as hex, or ''. */
export function submittedPlanHash(result) {
  return planHashHex(result && result.plan && result.plan.planHash);
}
