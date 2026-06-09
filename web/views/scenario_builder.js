// Nexus — Scenario Builder + shareable proof stories (nextux-02).
//
// Route: #/scenarios — the front door asks "what do you want to prove?", lets a
// user pick a template, previews the honest assurance, runs the scenario
// through a connected agent server (which produces a REAL proof), and verifies a
// shared proof story entirely in the browser.

import {
  TEMPLATE_SUMMARIES, ENTRY_CHOICES, templateById, assurancePreview,
} from '/lib/scenarioBuilder.js';
import { verifyShareBundle } from '/lib/proofStory.js';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = String(text);
  return n;
}

const AGENT_KEY = 'nexus.scenario.agentEndpoint';
function savedAgent() {
  try { return localStorage.getItem(AGENT_KEY) || 'http://localhost:8765'; } catch (_) { return 'http://localhost:8765'; }
}
function saveAgent(v) { try { localStorage.setItem(AGENT_KEY, v); } catch (_) { /* ignore */ } }

export const scenarioBuilderView = {
  mount(root) {
    root.replaceChildren();
    const wrap = el('div', 'workspace scenario-view');

    wrap.appendChild(el('h1', 'scenario-view-title', 'Scenario Builder'));
    wrap.appendChild(el('p', 'scenario-view-intro',
      'Build a realistic Infrix scenario, run it to produce a real proof, and share a story anyone can verify. ' +
      'Start with what you want to prove — not which subsystem to configure.'));

    // --- entry choices ("what do you want to prove?") ---
    wrap.appendChild(el('h2', 'scenario-section-title', 'What do you want to prove?'));
    const choices = el('div', 'scenario-entry-choices');
    let selectedTemplateId = null;

    const detail = el('div', 'scenario-detail');
    detail.appendChild(el('div', 'scenario-detail-empty', 'Pick a goal or a template to begin.'));

    ENTRY_CHOICES.forEach((c) => {
      const b = el('button', 'scenario-entry-choice', c.label);
      b.type = 'button';
      b.addEventListener('click', () => selectTemplate(c.templateId));
      choices.appendChild(b);
    });
    wrap.appendChild(choices);

    // --- template picker ---
    wrap.appendChild(el('h2', 'scenario-section-title', 'Or pick a template'));
    const grid = el('div', 'scenario-template-grid');
    TEMPLATE_SUMMARIES.forEach((t) => {
      const card = el('button', 'scenario-template-card');
      card.type = 'button';
      card.appendChild(el('span', 'scenario-template-title', t.title));
      card.appendChild(el('span', 'scenario-template-promise', t.promise));
      const support = el('span', 'scenario-template-support',
        `local: ${t.localSupport ? 'yes' : 'kermit only'} · kermit: ${t.kermitSupport ? 'yes' : 'no'}`);
      card.appendChild(support);
      card.addEventListener('click', () => selectTemplate(t.id));
      grid.appendChild(card);
    });
    wrap.appendChild(grid);

    wrap.appendChild(detail);

    // --- verify a shared proof story (server-free, in-browser) ---
    wrap.appendChild(el('h2', 'scenario-section-title', 'Verify a shared proof story'));
    wrap.appendChild(el('p', 'scenario-verify-intro',
      'Paste a shared .infrixstory bundle to verify it here in your browser — checksums, Cinema binding, and that it never overclaims (no L4 without L0).'));
    const verifyInput = el('textarea', 'scenario-verify-input');
    verifyInput.setAttribute('aria-label', 'Paste a proof story share bundle');
    verifyInput.setAttribute('rows', '6');
    verifyInput.setAttribute('spellcheck', 'false');
    verifyInput.setAttribute('placeholder', '{ "version": 1, "story": { ... }, "files": { ... } }');
    wrap.appendChild(verifyInput);
    const verifyBtn = el('button', 'scenario-btn scenario-verify-btn', 'Verify story');
    verifyBtn.type = 'button';
    wrap.appendChild(verifyBtn);
    const verifyResult = el('div', 'scenario-verify-result');
    wrap.appendChild(verifyResult);

    root.appendChild(wrap);

    function selectTemplate(id) {
      selectedTemplateId = id;
      const t = templateById(id);
      detail.replaceChildren();
      if (!t) {
        detail.appendChild(el('div', 'scenario-detail-empty', 'Unknown template.'));
        return;
      }
      detail.appendChild(el('h3', 'scenario-detail-title', t.title));
      detail.appendChild(el('p', 'scenario-detail-promise', t.promise));

      // assurance preview + mode toggle
      const modeRow = el('div', 'scenario-mode-row');
      const modeSel = el('select', 'scenario-mode-select');
      modeSel.setAttribute('aria-label', 'Run mode');
      ['local', 'kermit'].forEach((m) => {
        const o = el('option', null, m);
        o.value = m;
        modeSel.appendChild(o);
      });
      const preview = el('div', 'scenario-assurance-preview', assurancePreview(id, 'local'));
      modeSel.addEventListener('change', () => { preview.textContent = assurancePreview(id, modeSel.value); });
      modeRow.appendChild(el('span', 'scenario-mode-label', 'Run on:'));
      modeRow.appendChild(modeSel);
      detail.appendChild(modeRow);
      detail.appendChild(preview);

      // run section (uses a connected agent server)
      const runSection = el('div', 'scenario-run-section');
      const epInput = el('input', 'scenario-agent-input');
      epInput.type = 'text';
      epInput.value = savedAgent();
      epInput.setAttribute('aria-label', 'Agent server endpoint');
      const runBtn = el('button', 'scenario-btn scenario-run-btn', 'Run scenario');
      runBtn.type = 'button';
      runSection.appendChild(el('span', 'scenario-run-label', 'Agent server:'));
      runSection.appendChild(epInput);
      runSection.appendChild(runBtn);
      detail.appendChild(runSection);

      const runResult = el('div', 'scenario-run-result');
      detail.appendChild(runResult);

      runBtn.addEventListener('click', async () => {
        saveAgent(epInput.value.trim());
        runResult.replaceChildren(el('div', 'scenario-loading', 'running scenario (dry-run → approve → run)…'));
        try {
          const story = await runViaAgent(epInput.value.trim(), id, modeSel.value);
          renderRunStory(runResult, story);
        } catch (err) {
          runResult.replaceChildren(el('div', 'scenario-run-error',
            'Could not reach the agent server (' + epInput.value.trim() + '). Start it with `infrix agent serve`, or run via the CLI: `infrix scenario run`. ' + String(err)));
        }
      });
    }

    verifyBtn.addEventListener('click', async () => {
      verifyResult.replaceChildren(el('div', 'scenario-loading', 'verifying…'));
      let bundle;
      try {
        bundle = JSON.parse(verifyInput.value);
      } catch (e) {
        verifyResult.replaceChildren(el('div', 'scenario-run-error', 'Not valid JSON: ' + e.message));
        return;
      }
      try {
        const res = await verifyShareBundle(bundle);
        renderVerify(verifyResult, bundle, res);
      } catch (e) {
        verifyResult.replaceChildren(el('div', 'scenario-run-error', 'Verification error: ' + String(e)));
      }
    });
  },
};

// runViaAgent drives dry-run → approve → run against the agent server.
async function runViaAgent(endpoint, templateId, mode) {
  const base = endpoint.replace(/\/+$/, '');
  const post = async (path, body) => {
    const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return r.json();
  };
  const input = { template: templateId, mode };
  await post('/agent/dry-run', { action: 'scenario.run', input });
  const ap = await post('/agent/approve', { action: 'scenario.run', input });
  const approval = ap && ap.approval ? ap.approval : null;
  const run = await post('/agent/run', { action: 'scenario.run', input, approval });
  return run;
}

function renderRunStory(host, resp) {
  host.replaceChildren();
  const card = el('div', 'scenario-result-card ' + (resp.ok ? 'scenario-ok' : 'scenario-fail'));
  card.appendChild(el('div', 'scenario-result-summary', resp.summary || (resp.ok ? 'done' : 'failed')));
  if (resp.assurance) {
    card.appendChild(el('div', 'scenario-assurance',
      `assurance: ${resp.assurance.proofLevel}/${resp.assurance.governanceLevel} · ${resp.assurance.trustsInfrixNode ? 'node-trusted' : 'independently verified'}`));
  }
  (resp.artifacts || []).forEach((a) => {
    if (a.command) card.appendChild(el('code', 'scenario-artifact-cmd', a.command));
  });
  (resp.errors || []).forEach((e) => card.appendChild(el('div', 'scenario-run-error', (e.code || 'ERROR') + ': ' + (e.message || ''))));
  host.appendChild(card);
}

function decodeFile(bundle, logical) {
  const name = bundle.story && bundle.story.artifacts && bundle.story.artifacts[logical];
  if (!name || !bundle.files || bundle.files[name] == null) return null;
  try {
    const bin = typeof atob === 'function' ? atob(bundle.files[name]) : Buffer.from(bundle.files[name], 'base64').toString('binary');
    return bin;
  } catch (_) { return null; }
}

function renderVerify(host, bundle, res) {
  host.replaceChildren();
  const story = bundle.story || {};
  const a = story.assurance || {};
  const card = el('div', 'scenario-result-card ' + (res.ok ? 'scenario-ok' : 'scenario-fail'));

  card.appendChild(el('div', 'scenario-result-summary',
    res.ok ? 'Story VERIFIED — ' + (story.title || story.storyId) : 'Story FAILED verification'));
  card.appendChild(el('div', 'scenario-assurance',
    `assurance: ${a.proofLevel || '—'}/${a.governanceLevel || '—'} · verified: ${a.verified} · ${a.trustsInfrixNode ? 'node-trusted' : 'independently verified'}`));

  // receipt appears
  const receiptText = decodeFile(bundle, 'receipt');
  if (receiptText) {
    try {
      const rc = JSON.parse(receiptText);
      card.appendChild(el('div', 'scenario-receipt', 'receipt: ' + (rc.status || '') + ' — ' + (rc.summary || '')));
    } catch (_) { /* ignore */ }
  }

  // cinema replay (nonblank): show labels + capsule presence
  const cinemaText = decodeFile(bundle, 'cinemaReplay');
  if (cinemaText) {
    try {
      const cin = JSON.parse(cinemaText);
      const labels = cin.labels ? Object.values(cin.labels).join(' → ') : '';
      const replayBox = el('div', 'scenario-cinema');
      replayBox.appendChild(el('div', 'scenario-cinema-title', 'Cinema replay'));
      replayBox.appendChild(el('div', 'scenario-cinema-steps', labels || 'replay capsule present'));
      replayBox.appendChild(el('div', 'scenario-cinema-capsule', cin.capsule ? 'deterministic replay capsule bound to the proof' : ''));
      card.appendChild(replayBox);
    } catch (_) { /* ignore */ }
  }

  const checks = el('details', 'scenario-checks');
  checks.appendChild(el('summary', 'scenario-checks-summary', 'Verification checks (' + res.checks.length + ')'));
  const list = el('ul', 'scenario-checks-list');
  res.checks.forEach((c) => {
    const li = el('li', 'scenario-check ' + (c.ok ? 'scenario-check-ok' : 'scenario-check-fail'));
    li.textContent = (c.ok ? '✓ ' : '✗ ') + c.name + (c.detail ? ' — ' + c.detail : '');
    list.appendChild(li);
  });
  checks.appendChild(list);
  card.appendChild(checks);

  host.appendChild(card);
}
