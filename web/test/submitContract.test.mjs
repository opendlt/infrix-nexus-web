// infrix-core item 2c part 28ac row 4: every governed submission the explorer makes sends exactly its contract.
//
// The node decodes governed.submit, intent.submit and nexus.previewDossier under one strict contract (core.SubmitGovernedRequest) that
// refuses a member it does not name; the guided escrow is the SETTLEMENT goal with one escrow leg. Each flow's body is driven through
// the real module over a mocked fetch and compared with exactly what its door takes; a source fence holds every submit call site to the one
// builder, so a flow cannot grow a member the node never reads.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
register(pathToFileURL(path.join(here, '_resolve_lib.mjs')).href);

const sent = [];
let answer = {};
globalThis.window = globalThis.window || { location: { origin: 'http://nexus.test', href: 'http://nexus.test/', hash: '', search: '' }, history: { replaceState() {}, pushState() {} }, addEventListener() {} };
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {} };
globalThis.fetch = async (_url, init) => {
  sent.push(JSON.parse(init.body));
  return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result: answer }) };
};

// a DOM just rich enough for the guided view: nodes, classes, values and click listeners
class FakeNode {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.className = ''; this.textContent = ''; this.value = ''; this.disabled = false; this.listeners = {}; this.classList = { add() {}, remove() {}, contains() { return false; }, toggle() {} }; }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren(...k) { this.children = k; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  collect(cls, out = []) { if (String(this.className).split(/\s+/).includes(cls)) out.push(this); for (const c of this.children) if (c.collect) c.collect(cls, out); return out; }
  allText() { return [this.textContent, ...this.children.map((c) => (c.allText ? c.allText() : ''))].join(' '); }
}
globalThis.document = globalThis.document || { createElement: (t) => new FakeNode(t) };

const { rpcWithDisclosure, DISCLOSURE } = await import('/lib/spineCommon.js');
const { governedSubmitParams, escrowSettlementParams, GOVERNED_SUBMIT_MEMBERS, planHashHex, submittedIntentId, submittedPlanHash } = await import('/lib/submitContract.js');
const { guidedView } = await import('/views/guided.js');

const tick = () => new Promise((r) => setTimeout(r, 20));

test('compose and the cockpit rail send exactly the governed-submit contract on preview and submit', async () => {
  for (const method of ['nexus.previewDossier', 'governed.submit']) {
    sent.length = 0;
    await rpcWithDisclosure(method, governedSubmitParams('ROLE_ASSIGN', { roleName: 'r', holderIdentity: 'acc://h.acme' }));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].method, method);
    assert.deepEqual(sent[0].params, {
      actor: DISCLOSURE.actor, purpose: DISCLOSURE.purpose, workflowInstance: DISCLOSURE.workflowInstance,
      goalType: 'ROLE_ASSIGN', customParams: { roleName: 'r', holderIdentity: 'acc://h.acme' },
    });
    for (const k of Object.keys(sent[0].params)) assert.ok(GOVERNED_SUBMIT_MEMBERS.includes(k), `${method} sent ${k}, which the contract does not name`);
  }
  assert.throws(() => governedSubmitParams('', {}), /goalType/);
  assert.throws(() => governedSubmitParams('ROLE_ASSIGN', [1]), /customParams must be a JSON object/);
  assert.throws(() => governedSubmitParams('ROLE_ASSIGN', null), /customParams must be a JSON object/);
});

test('the answer is read as the node writes it: intent.id, and plan.planHash as 32 bytes compared in hex', () => {
  const bytes = Array.from({ length: 32 }, (_, i) => i);
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  assert.equal(submittedIntentId({ intent: { id: 'intent-acc://a.acme-1' } }), 'intent-acc://a.acme-1');
  assert.equal(submittedIntentId({ Intent: { ID: 'x' } }), '', 'the node never writes Intent.ID');
  assert.equal(submittedPlanHash({ plan: { planHash: bytes } }), hex);
  assert.equal(planHashHex(hex.toUpperCase()), hex);
  assert.equal(planHashHex([1, 2, 3]), '');
  assert.equal(planHashHex('zz'), '');
});

test('the guided escrow submits the SETTLEMENT goal with one escrow leg as exactly the governed-submit contract, and never sends the UI mode', async () => {
  const root = new FakeNode('div');
  guidedView.mount(root, ['escrow']);
  const inputs = root.collect('guided-input');
  assert.equal(inputs.length, 5, 'buyer, seller, amount, asset and arbiter');
  const [buyer, seller, amount, asset, arbiter] = inputs;
  buyer.value = 'acc://buyer.acme'; seller.value = 'acc://seller.acme'; amount.value = '1000'; asset.value = 'ACME'; arbiter.value = 'acc://arbiter.acme';
  const submit = root.collect('guided-primary')[0];

  sent.length = 0;
  answer = { intent: { id: 'intent-acc://test.acme-7' }, awaitingApproval: true };
  for (const fn of submit.listeners.click) fn();
  await tick();
  assert.equal(sent.length, 1, 'one request, never retried');
  assert.equal(sent[0].method, 'governed.submit');
  assert.deepEqual(sent[0].params, {
    actor: 'acc://test.acme', purpose: 'operational', workflowInstance: 'nexus-guided', goalType: 'SETTLEMENT',
    customParams: { method: 'escrow', legs: [{ kind: 'escrow', fromVault: 'acc://buyer.acme', toVault: 'acc://seller.acme', assetType: 'ACME', amount: 1000, domain: 'local', finalityRequirement: 'external_contingent', depositor: 'acc://buyer.acme', beneficiary: 'acc://seller.acme', arbiter: 'acc://arbiter.acme' }] },
  });
  for (const k of Object.keys(sent[0].params)) assert.ok(GOVERNED_SUBMIT_MEMBERS.includes(k), `governed.submit sent ${k}, which the contract does not name`);
  const text = root.allText();
  assert.match(text, /intent-acc:\/\/test\.acme-7/);
  assert.match(text, /Awaiting approval/, 'a parked escrow is shown awaiting its approval');
  assert.doesNotMatch(text, /int-fixture-1/, 'the fixture intent is never shown as the submission');

  // a refusal is the node's answer: shown, and not sent again
  sent.length = 0;
  globalThis.fetch = async (_url, init) => {
    sent.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'refused' } }) };
  };
  submit.disabled = false;
  for (const fn of submit.listeners.click) fn();
  await tick(); await tick();
  assert.equal(sent.length, 1, 'a node refusal was retried');

  // what the node would refuse is refused before anything is sent
  sent.length = 0;
  amount.value = '10.5';
  for (const fn of submit.listeners.click) fn();
  await tick();
  assert.equal(sent.length, 0);
  assert.match(root.allText(), /amount must be a positive whole number/);
  assert.throws(() => escrowSettlementParams({ buyer: '', seller: 's', amount: '1', asset: 'ACME', arbiter: 'acc://a.acme' }), /buyer is required/);
  assert.throws(() => escrowSettlementParams({ buyer: 'b', seller: 's', amount: '1', asset: 'ACME', arbiter: '' }), /arbiter is required/);
});

// The source fence: every governed submission in the explorer goes through governedSubmitParams, and no flow submits the old goal.
test('every governed submit call site builds its body with governedSubmitParams', () => {
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'test' && e.name !== 'node_modules') walk(p); } else if (p.endsWith('.js')) files.push(p); } };
  walk(webRoot);
  const call = /rpc(?:WithDisclosure|Retry)?\(\s*'(governed\.submit|intent\.submit|nexus\.previewDossier)'\s*,\s*([^)]*)/g;
  let sites = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /'ESCROW_RELEASE'/, `${path.relative(webRoot, f)} submits ESCROW_RELEASE, a goal type the node does not have`);
    let m;
    while ((m = call.exec(src)) !== null) {
      sites++;
      const arg = m[2].trim();
      const built = arg.startsWith('governedSubmitParams(') || arg === 'previewedParams' || (arg === 'body' && /body = \{ \.\.\.guidedDisclosure\(\), \.\.\.governedSubmitParams\(/.test(src));
      assert.ok(built, `${path.relative(webRoot, f)}: ${m[1]} is sent ${arg.slice(0, 60)}, not a governedSubmitParams body`);
    }
  }
  assert.ok(sites >= 5, `found ${sites} governed submit call sites, want the compose and cockpit preview and submit and the guided escrow`);
});
