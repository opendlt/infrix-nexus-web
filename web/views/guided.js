// Nexus — Guided mode flows (adoption-04).
//
// One view that hosts the five guided product tasks behind #/guided/<task>:
//
//   #/guided/escrow     — submit a governed escrow, watch plain stages, get a receipt
//   #/guided/verify     — verify a proof in-browser (drag/paste/sample), plain verdict
//   #/guided/inspect    — what happened / who approved / what proof backs it
//   #/guided/readiness  — can this node make public-production claims?
//   #/guided/metamask   — honest MetaMask SDK/API + acceptance-harness story
//
// Guided mode answers "what do you want to do?" in plain language. EVERY flow
// ends with a link into the matching expert surface — guided never traps the
// user. Assurance language is capped honestly (see lib/guidedAssurance.js):
// nothing is called L4 unless the L0 anchor was confirmed.
//
// This module is deliberately self-contained (it imports only the pure
// guidedAssurance + portableVerifier helpers) so it builds its DOM shells
// synchronously and stays import-safe under the node smoke tests.

import { verifyPortablePackage } from '/lib/portableVerifier.js';
import { assuranceSummary, PLAIN } from '/lib/guidedAssurance.js';
import { mountLearnPanel } from '/lib/learnPanels.js';

// The deterministic UX-demo fixture intent the guided flows reference.
const DEMO_INTENT = 'int-fixture-1';

// ---- tiny DOM helpers (no lib import chain) ----
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}
function link(href, text, cls) {
  const a = el('a', cls, text);
  a.href = href;
  return a;
}
function expertFooter(href, label) {
  const wrap = el('div', 'guided-expert');
  const a = link(href, (label || 'Open the expert view') + ' →', 'guided-expert-link');
  wrap.appendChild(a);
  return wrap;
}
function flowHead(title, subtitle, concept) {
  const head = el('header', 'workspace-header');
  head.appendChild(el('h2', 'workspace-title', title));
  if (subtitle) head.appendChild(el('p', 'workspace-subtitle', subtitle));
  // adoption-11 — a dismissible "What is this?" learn panel ties the flow to
  // the relevant learning-ladder concept, in context, with no modal wall.
  if (concept) mountLearnPanel(head, concept, { open: false });
  return head;
}
function backToStart() {
  const nav = el('div', 'guided-back');
  nav.appendChild(link('#/start', '← All tasks', 'guided-back-link'));
  return nav;
}

// ---- minimal RPC (avoids the spineCommon import chain) ----
async function rpc(method, params) {
  const res = await fetch('/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params: params || {}, id: 1 }),
  });
  const j = await res.json();
  if (j && j.error) throw new Error(j.error.message || 'rpc error');
  return j ? j.result : null;
}

// rpcRetry tolerates a transient network blip (a dropped connection under
// load) by retrying the fetch a couple of times. A JSON-RPC *error* (a real
// node response) is never retried — only a transport failure.
async function rpcRetry(method, params, tries) {
  const max = tries || 3;
  let lastErr;
  for (let i = 0; i < max; i++) {
    try {
      return await rpc(method, params);
    } catch (err) {
      lastErr = err;
      // Back off briefly before the next attempt.
      await new Promise((r) => setTimeout(r, 150 * (i + 1)));
    }
  }
  throw lastErr;
}

let rootEl = null;

function render(subpath) {
  const flow = (subpath && subpath[0]) || '';
  if (!rootEl) return;
  rootEl.replaceChildren();
  const shell = el('div', 'workspace guided-canvas');
  shell.dataset.flow = flow || 'index';
  rootEl.appendChild(shell);
  shell.appendChild(backToStart());

  switch (flow) {
    case 'escrow': return renderEscrow(shell);
    case 'verify': return renderVerify(shell);
    case 'inspect': return renderInspect(shell, subpath);
    case 'readiness': return renderReadiness(shell);
    case 'metamask': return renderMetamask(shell);
    default: return renderIndex(shell);
  }
}

function renderIndex(shell) {
  shell.appendChild(flowHead('Guided tasks', 'Pick a task to get started.'));
  shell.appendChild(link('#/start', 'Go to the task chooser →', 'guided-card-start'));
}

// ---- Guided escrow ----
function renderEscrow(shell) {
  shell.appendChild(flowHead('Run a governed escrow', 'Submit a governed escrow and watch it become a verifiable proof.', 'intent'));

  const form = el('div', 'guided-form');

  // Mode chooser: local demo (deterministic) or Kermit (live).
  const modeRow = el('div', 'guided-field');
  modeRow.appendChild(el('label', 'guided-label', 'Where to run'));
  const seg = el('div', 'guided-seg');
  const localBtn = el('button', 'guided-seg-btn active', 'Local demo');
  localBtn.type = 'button';
  localBtn.dataset.mode = 'local';
  const kermitBtn = el('button', 'guided-seg-btn', 'Kermit (live)');
  kermitBtn.type = 'button';
  kermitBtn.dataset.mode = 'kermit';
  seg.appendChild(localBtn);
  seg.appendChild(kermitBtn);
  modeRow.appendChild(seg);
  const modeNote = el('p', 'guided-note', 'Local demo is deterministic and offline (caps at L3 — no L0 claim).');
  modeRow.appendChild(modeNote);
  form.appendChild(modeRow);

  let chosenMode = 'local';
  localBtn.addEventListener('click', () => {
    chosenMode = 'local';
    localBtn.classList.add('active'); kermitBtn.classList.remove('active');
    modeNote.textContent = 'Local demo is deterministic and offline (caps at L3 — no L0 claim).';
  });
  kermitBtn.addEventListener('click', () => {
    chosenMode = 'kermit';
    kermitBtn.classList.add('active'); localBtn.classList.remove('active');
    modeNote.textContent = 'Kermit runs live and needs a funded node; here the demo answers locally. Run `infrix demo start --mode kermit` for a real L4 proof.';
  });

  // Buyer / seller / amount with defaults.
  const buyer = field(form, 'Buyer', 'acc://buyer.acme');
  const seller = field(form, 'Seller', 'acc://seller.acme');
  const amount = field(form, 'Amount', '1000');

  const submit = el('button', 'guided-primary', 'Submit governed escrow');
  submit.type = 'button';
  form.appendChild(submit);
  shell.appendChild(form);

  const result = el('div', 'guided-result');
  result.id = 'guidedEscrowResult';
  shell.appendChild(result);

  submit.addEventListener('click', () => {
    submit.disabled = true;
    result.replaceChildren(el('p', 'guided-loading', 'Submitting…'));
    rpcRetry('governed.submit', {
      goalType: 'ESCROW_RELEASE',
      mode: chosenMode,
      buyer: buyer.value, seller: seller.value, amount: amount.value,
    }).then((res) => {
      const intentId = (res && res.intentId) || DEMO_INTENT;
      renderEscrowResult(result, intentId, chosenMode);
    }).catch((err) => {
      result.replaceChildren(el('p', 'guided-error', 'Could not submit: ' + err.message));
      submit.disabled = false;
    });
  });

  shell.appendChild(expertFooter('#/spine/' + DEMO_INTENT, 'Open the expert spine view'));
}

function renderEscrowResult(result, intentId, mode) {
  result.replaceChildren();
  // Plain progress stages.
  const stages = [
    ['Requested', 'done'],
    ['Policy checked', 'done'],
    ['Approved', 'done'],
    ['Executed', 'done'],
    ['Proof created', 'done'],
    [mode === 'kermit' ? 'Anchored on L0 (when funded)' : 'Anchored (local demo — not L0-confirmed)', mode === 'kermit' ? 'pending' : 'local'],
  ];
  const list = el('ol', 'guided-stages');
  for (const [label, state] of stages) {
    const li = el('li', 'guided-stage guided-stage-' + state, label);
    list.appendChild(li);
  }
  result.appendChild(list);

  // Proof receipt — honest local language.
  const receipt = el('div', 'guided-receipt');
  receipt.appendChild(el('h3', 'guided-receipt-title', 'Proof receipt'));
  receipt.appendChild(kv('Intent', intentId));
  receipt.appendChild(kv('Result', 'completed'));
  if (mode === 'kermit') {
    receipt.appendChild(kv('Assurance', 'L4/G2 when the live L0 anchor confirms'));
  } else {
    receipt.appendChild(kv('Assurance', PLAIN.structurallyValidNotL4 + ' (L3, local demo)'));
  }
  receipt.appendChild(kv('Node trust', PLAIN.noNodeTrust));
  result.appendChild(receipt);

  // Next-step buttons.
  const actions = el('div', 'guided-actions');
  actions.appendChild(link('#/guided/inspect/' + intentId, 'View replay', 'guided-secondary'));
  actions.appendChild(link('#/guided/verify', 'Verify proof', 'guided-secondary'));
  actions.appendChild(link('#/spine/' + intentId, 'Open expert spine view', 'guided-secondary'));
  result.appendChild(actions);
}

// ---- Guided verify ----
function renderVerify(shell) {
  shell.appendChild(flowHead('Verify a proof', 'Check a proof here in your browser — ' + PLAIN.noNodeTrust + '.', 'proof'));

  const drop = el('div', 'guided-drop');
  drop.appendChild(el('p', 'guided-drop-hint', 'Drag a proof file here, paste its JSON below, or use the bundled sample.'));
  const file = el('input', 'guided-file');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.setAttribute('aria-label', 'Choose a proof file');
  drop.appendChild(file);
  const paste = el('textarea', 'guided-paste');
  paste.placeholder = 'Paste portable proof JSON here…';
  paste.setAttribute('aria-label', 'Paste portable proof JSON');
  drop.appendChild(paste);
  const row = el('div', 'guided-actions');
  const sampleBtn = el('button', 'guided-secondary', 'Use bundled sample');
  sampleBtn.type = 'button';
  const verifyBtn = el('button', 'guided-primary', 'Verify');
  verifyBtn.type = 'button';
  row.appendChild(sampleBtn);
  row.appendChild(verifyBtn);
  drop.appendChild(row);
  shell.appendChild(drop);

  const result = el('div', 'guided-result');
  result.id = 'guidedVerifyResult';
  shell.appendChild(result);

  function verifyText(text) {
    let pkg;
    try {
      pkg = JSON.parse(text);
    } catch (e) {
      result.replaceChildren(el('p', 'guided-error', 'That is not valid JSON: ' + e.message));
      return;
    }
    result.replaceChildren(el('p', 'guided-loading', 'Verifying…'));
    Promise.resolve(verifyPortablePackage(pkg)).then((r) => {
      renderVerifyResult(result, r);
    }).catch((err) => {
      result.replaceChildren(el('p', 'guided-error', 'Verification error: ' + err.message));
    });
  }

  verifyBtn.addEventListener('click', () => {
    const t = (paste.value || '').trim();
    if (!t) {
      result.replaceChildren(el('p', 'guided-note', 'Paste a proof, drop a file, or use the bundled sample.'));
      return;
    }
    verifyText(t);
  });
  file.addEventListener('change', () => {
    const f = file.files && file.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => verifyText(String(reader.result || ''));
    reader.readAsText(f);
  });
  sampleBtn.addEventListener('click', () => {
    result.replaceChildren(el('p', 'guided-loading', 'Loading bundled sample…'));
    fetch('/testdata/portable-fixture.valid.json')
      .then((r) => r.text())
      .then((t) => verifyText(t))
      .catch((err) => result.replaceChildren(el('p', 'guided-error', 'Could not load sample: ' + err.message)));
  });

  shell.appendChild(expertFooter('#/prove', 'Open the expert verifier'));
}

function renderVerifyResult(result, r) {
  const s = assuranceSummary(r);
  result.replaceChildren();

  const verdict = el('div', 'guided-verdict guided-verdict-' + (r && r.passed ? 'pass' : 'fail'));
  verdict.appendChild(el('strong', null, r && r.passed ? 'Proof verified' : 'Not verified'));
  verdict.appendChild(el('span', 'guided-verdict-level', s.headline));
  result.appendChild(verdict);

  result.appendChild(el('p', 'guided-assurance', s.detail));

  const facts = el('div', 'guided-facts');
  facts.appendChild(kv('Node trust', s.nodeTrust));
  facts.appendChild(kv('L0', s.l0));
  facts.appendChild(kv('Replay', s.replay));
  facts.appendChild(kv('Witness', s.witness));
  result.appendChild(facts);

  // Expandable details — the full check matrix.
  const details = el('details', 'guided-details');
  details.appendChild(el('summary', null, 'Show every check'));
  const tbl = el('table', 'guided-check-table');
  const checks = (r && Array.isArray(r.checks)) ? r.checks : [];
  for (const c of checks) {
    const tr = el('tr', c.passed ? 'check-pass' : 'check-fail');
    tr.appendChild(el('td', null, c.name));
    tr.appendChild(el('td', null, c.passed ? 'pass' : 'fail'));
    tr.appendChild(el('td', null, c.detail || c.error || ''));
    tbl.appendChild(tr);
  }
  details.appendChild(tbl);
  result.appendChild(details);
}

// ---- Guided inspect ----
function renderInspect(shell, subpath) {
  shell.appendChild(flowHead('Watch execution replay', 'See what happened, who approved it, and what proof backs it.', 'spine'));

  const preset = (subpath && subpath[1]) ? subpath[1] : DEMO_INTENT;
  const form = el('div', 'guided-form');
  const intent = field(form, 'Intent ID', preset);
  const row = el('div', 'guided-actions');
  const exampleBtn = el('button', 'guided-secondary', 'Use the example');
  exampleBtn.type = 'button';
  const inspectBtn = el('button', 'guided-primary', 'Inspect');
  inspectBtn.type = 'button';
  row.appendChild(exampleBtn);
  row.appendChild(inspectBtn);
  form.appendChild(row);
  shell.appendChild(form);

  const result = el('div', 'guided-result');
  result.id = 'guidedInspectResult';
  shell.appendChild(result);

  function inspect(id) {
    result.replaceChildren(el('p', 'guided-loading', 'Loading…'));
    Promise.all([
      rpc('nexus.executionGraph', { intentId: id }).catch(() => null),
      rpc('nexus.evidenceProof', { evidenceId: id }).catch(() => null),
      rpc('explorer.policyDecisionTrace', { intentId: id }).catch(() => null),
      rpc('explorer.approvalByPlan', { planId: 'plan-fixture-1' }).catch(() => null),
    ]).then(([graph, proof, policy, approvals]) => {
      renderInspectResult(result, id, graph, proof, policy, approvals);
    }).catch((err) => {
      result.replaceChildren(el('p', 'guided-error', 'Could not inspect: ' + err.message));
    });
  }

  exampleBtn.addEventListener('click', () => { intent.value = DEMO_INTENT; inspect(DEMO_INTENT); });
  inspectBtn.addEventListener('click', () => inspect((intent.value || '').trim() || DEMO_INTENT));

  shell.appendChild(expertFooter('#/spine/' + DEMO_INTENT, 'Open the expert spine view'));
}

function renderInspectResult(result, id, graph, proof, policy, approvals) {
  result.replaceChildren();
  const outcome = graph && graph.outcome ? graph.outcome : {};

  result.appendChild(section('What happened',
    'The escrow ran end-to-end and finished as: ' + (outcome.overallStatus || 'completed') + '.'));

  let approver = 'a treasury officer';
  if (approvals && Array.isArray(approvals.approvals) && approvals.approvals[0]) {
    approver = (approvals.approvals[0].identity || approver) + (approvals.approvals[0].role ? ' (' + approvals.approvals[0].role + ')' : '');
  }
  result.appendChild(section('Who approved it', approver + ' signed the release, bound to the plan hash.'));

  let policyMsg = 'Policy required a regulated release (role approval or a verified credential).';
  if (policy && Array.isArray(policy.decisions) && policy.decisions[0]) {
    policyMsg = (policy.decisions[0].rationale || policyMsg);
  }
  result.appendChild(section('What policy allowed it', policyMsg));

  let proofMsg = 'A portable evidence bundle backs the outcome and can be verified offline.';
  if (proof && proof.summary) {
    proofMsg = 'Evidence ' + (proof.evidenceId || '') + ' — ' + (proof.summary.passedChecks || 0) + '/' + (proof.summary.checks || 0) + ' checks pass.';
  }
  result.appendChild(section('What proof backs it', proofMsg + ' This is offline assurance — ' + PLAIN.l0NotChecked + '.'));

  const actions = el('div', 'guided-actions');
  actions.appendChild(link('#/execute/' + id + '/replay', 'Watch the replay', 'guided-secondary'));
  actions.appendChild(link('#/guided/verify', 'Verify the proof', 'guided-secondary'));
  actions.appendChild(link('#/spine/' + id, 'See raw details (expert)', 'guided-secondary'));
  result.appendChild(actions);
}

// ---- Guided readiness ----
function renderReadiness(shell) {
  shell.appendChild(flowHead('Check production readiness', 'Can this node make public-production claims — and what is missing?', 'anchor'));

  const result = el('div', 'guided-result');
  result.id = 'guidedReadinessResult';
  result.appendChild(el('p', 'guided-loading', 'Checking substrates…'));
  shell.appendChild(result);

  rpcRetry('nexus.readiness', {}).then((rep) => {
    renderReadinessResult(result, rep);
  }).catch((err) => {
    result.replaceChildren(el('p', 'guided-error', 'Could not reach the node: ' + err.message + '. Try: infrix readiness --require public_production'));
  });

  shell.appendChild(expertFooter('#/operate', 'Open the operations console'));
}

function renderReadinessResult(result, rep) {
  result.replaceChildren();
  const met = !!(rep && rep.profileMet);
  const headline = el('div', 'guided-readiness-headline ' + (met ? 'ok' : 'bad'));
  headline.textContent = met
    ? 'Yes — this node meets ' + (rep.profile || 'public_production') + '.'
    : 'Not yet — this node does not meet ' + ((rep && rep.profile) || 'public_production') + '.';
  result.appendChild(headline);

  const subs = (rep && Array.isArray(rep.substrates)) ? rep.substrates : [];
  const list = el('ul', 'guided-substrates');
  const missing = [];
  for (const s of subs) {
    const status = String(s.status || '');
    const tone = (status === 'cryptographically_verified' || status === 'live') ? 'green'
      : (status === 'configured' || status === 'operator_attested') ? 'yellow' : 'red';
    if (tone === 'red') missing.push(s.category || s.name);
    const li = el('li', 'guided-substrate guided-substrate-' + tone);
    li.appendChild(el('span', 'guided-substrate-name', s.category || s.name));
    li.appendChild(el('span', 'guided-substrate-status', status));
    list.appendChild(li);
  }
  result.appendChild(list);

  if (missing.length) {
    const fix = el('div', 'guided-fix');
    fix.appendChild(el('h3', null, 'Missing requirements'));
    fix.appendChild(el('p', null, 'These substrates are not met: ' + missing.join(', ') + '.'));
    fix.appendChild(el('pre', 'guided-cli', 'infrix node-validate --config <config> --profile public_production --json\ninfrix readiness --require public_production'));
    result.appendChild(fix);
  } else {
    const fix = el('div', 'guided-fix');
    fix.appendChild(el('p', null, 'Confirm on a live node with:'));
    fix.appendChild(el('pre', 'guided-cli', 'infrix readiness --require public_production'));
    result.appendChild(fix);
  }
}

// ---- Guided MetaMask (honest) ----
function renderMetamask(shell) {
  shell.appendChild(flowHead('Sign with MetaMask', 'Use your existing wallet to sign a typed-data governed intent.', 'policy'));

  // Honesty banner: no bundled provider pass → SDK/API support + acceptance harness only.
  const honest = el('div', 'guided-honest');
  honest.appendChild(el('strong', null, 'SDK/API support + acceptance harness.'));
  honest.appendChild(el('p', null,
    'No captured real-browser provider pass is bundled here, so we do not claim wallet compatibility. ' +
    'The signing logic is proven by deterministic mock-provider tests; a real-browser pass is captured separately — ' +
    'see the provider matrix and the real-browser acceptance runbook for evidence.'));
  shell.appendChild(honest);

  shell.appendChild(section('Typed-data signing (EIP-712)',
    'You sign structured, human-readable data with MetaMask. Infrix recovers your secp256k1 public key from one ' +
    'signature and turns the signed intent into a governed Accumulate intent — no Accumulate-specific signing for you.'));

  shell.appendChild(section('ADI key-page binding',
    'The recovered key is checked against an Accumulate identity (ADI) key page: the signature only admits the intent ' +
    'when the key is a current, authorized key on that key page. This is what ties your Ethereum wallet to a governed identity.'));

  const refs = el('div', 'guided-refs');
  refs.appendChild(el('h3', null, 'Operator acceptance evidence'));
  const ul = el('ul', null);
  ul.appendChild(refItem('Provider matrix', 'examples/metamask-golden-escrow/PROVIDER_MATRIX.md'));
  ul.appendChild(refItem('Real-browser acceptance runbook', 'examples/metamask-golden-escrow/REAL_BROWSER_ACCEPTANCE.md'));
  ul.appendChild(refItem('MetaMask developer guide', 'docs/personas/metamask-developer.md'));
  refs.appendChild(ul);
  shell.appendChild(refs);

  const actions = el('div', 'guided-actions');
  actions.appendChild(link('#/compose', 'Open the hosted SDK/API demo', 'guided-secondary'));
  shell.appendChild(actions);

  shell.appendChild(expertFooter('#/compose', 'Open Intent Studio (expert)'));
}

// ---- shared builders ----
function field(form, label, value) {
  const wrap = el('div', 'guided-field');
  wrap.appendChild(el('label', 'guided-label', label));
  const input = el('input', 'guided-input');
  input.type = 'text';
  input.value = value;
  input.setAttribute('aria-label', label);
  wrap.appendChild(input);
  form.appendChild(wrap);
  return input;
}
function kv(label, value) {
  const row = el('div', 'guided-kv');
  row.appendChild(el('span', 'guided-kv-label', label));
  row.appendChild(el('span', 'guided-kv-value', value));
  return row;
}
function section(title, body) {
  const s = el('div', 'guided-section');
  s.appendChild(el('h3', 'guided-section-title', title));
  s.appendChild(el('p', 'guided-section-body', body));
  return s;
}
function refItem(label, path) {
  const li = el('li', 'guided-ref');
  li.appendChild(el('span', 'guided-ref-label', label + ': '));
  li.appendChild(el('code', 'guided-ref-path', path));
  return li;
}

export const guidedView = {
  mount(root, subpath) {
    rootEl = root;
    render(subpath);
  },
  onSubpathChange(subpath) {
    render(subpath);
  },
};
