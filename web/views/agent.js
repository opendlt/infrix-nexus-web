// Nexus — Agent Mode (nextux-01).
//
// Route: #/agent — a human-facing window into what an AI agent can do through
// the Agent Action Protocol, and a place to see and approve what it will do.
// It talks to `infrix agent serve` (a separate local endpoint), lists the
// available actions, dry-runs them, shows the required approval, runs them, and
// renders the proof receipt + structured failures.
//
// It deliberately does NOT show raw canonical spine details by default — those
// live behind an expandable "details" section for power users.

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = String(text);
  return n;
}

const ENDPOINT_KEY = 'nexus.agent.endpoint';
function savedEndpoint() {
  try { return localStorage.getItem(ENDPOINT_KEY) || 'http://localhost:8765'; } catch (_) { return 'http://localhost:8765'; }
}
function saveEndpoint(v) {
  try { localStorage.setItem(ENDPOINT_KEY, v); } catch (_) { /* ignore */ }
}

// Minimal in-browser client for the Agent Action Protocol HTTP API.
function makeClient(endpoint) {
  const base = String(endpoint || '').replace(/\/+$/, '');
  const req = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  };
  return {
    endpoint: base,
    health: () => req('GET', '/agent/health'),
    listActions: async () => (await req('GET', '/agent/actions')).actions || [],
    dryRun: (action, input) => req('POST', '/agent/dry-run', { action, input }),
    approve: (action, input) => req('POST', '/agent/approve', { action, input }),
    run: (action, input, approval) => req('POST', '/agent/run', { action, input, approval: approval || null }),
  };
}

function riskBadge(risk) {
  const b = el('span', 'agent-risk agent-risk-' + (risk || 'read_only').replace(/_/g, '-'), risk);
  return b;
}

export const agentView = {
  mount(root) {
    root.replaceChildren();
    // Shared route-render gate locates `.workspace` — every view wraps in it.
    const wrap = el('div', 'workspace agent-view');

    wrap.appendChild(el('h1', 'agent-view-title', 'Agent Mode'));
    wrap.appendChild(el('p', 'agent-view-intro',
      'What an AI agent can do through Infrix — and a place to see and approve what it will do. ' +
      'Connect to a running "infrix agent serve" endpoint.'));

    // --- connection bar ---
    const bar = el('div', 'agent-conn');
    const epInput = el('input', 'agent-conn-input');
    epInput.type = 'text';
    epInput.value = savedEndpoint();
    epInput.setAttribute('aria-label', 'Agent server endpoint');
    epInput.setAttribute('spellcheck', 'false');
    const connectBtn = el('button', 'agent-conn-btn', 'Connect');
    connectBtn.type = 'button';
    const connStatus = el('span', 'agent-conn-status', 'not connected');
    bar.append(epInput, connectBtn, connStatus);
    wrap.appendChild(bar);

    // --- layout: actions list (left) + detail (right) ---
    const layout = el('div', 'agent-layout');
    const actionsPane = el('div', 'agent-actions');
    actionsPane.appendChild(el('div', 'agent-pane-title', 'Available actions'));
    const actionsList = el('ul', 'agent-actions-list');
    actionsPane.appendChild(actionsList);

    const detail = el('div', 'agent-detail');
    detail.appendChild(el('div', 'agent-detail-empty', 'Connect, then choose an action.'));

    layout.append(actionsPane, detail);
    wrap.appendChild(layout);

    root.appendChild(wrap);

    let client = null;
    let manifests = [];

    const setStatus = (text, ok) => {
      connStatus.textContent = text;
      connStatus.classList.toggle('agent-conn-ok', !!ok);
      connStatus.classList.toggle('agent-conn-err', ok === false);
    };

    const connect = async () => {
      const ep = epInput.value.trim();
      saveEndpoint(ep);
      client = makeClient(ep);
      setStatus('connecting…');
      try {
        const h = await client.health();
        manifests = await client.listActions();
        setStatus(`connected · ${manifests.length} actions`, true);
        renderActions();
      } catch (err) {
        setStatus('cannot reach ' + ep + ' (is `infrix agent serve` running?)', false);
        actionsList.replaceChildren();
      }
    };

    const renderActions = () => {
      actionsList.replaceChildren();
      manifests.forEach((m) => {
        const li = el('li', 'agent-action-item');
        const btn = el('button', 'agent-action-btn');
        btn.type = 'button';
        btn.append(el('span', 'agent-action-id', m.id), riskBadge(m.riskLevel));
        if (m.mutatesState) btn.appendChild(el('span', 'agent-action-flag', 'mutates'));
        btn.addEventListener('click', () => selectAction(m));
        li.appendChild(btn);
        actionsList.appendChild(li);
      });
    };

    const selectAction = (m) => {
      detail.replaceChildren();
      detail.appendChild(el('h2', 'agent-detail-title', m.title));
      detail.appendChild(el('p', 'agent-detail-desc', m.description));

      const meta = el('div', 'agent-detail-meta');
      meta.append(riskBadge(m.riskLevel));
      if (m.requiresApproval) meta.appendChild(el('span', 'agent-detail-tag', 'requires approval'));
      if (m.networkWrites) meta.appendChild(el('span', 'agent-detail-tag', 'network write'));
      detail.appendChild(meta);

      // input editor
      detail.appendChild(el('label', 'agent-input-label', 'Input (JSON)'));
      const input = el('textarea', 'agent-input');
      input.value = exampleInput(m);
      input.setAttribute('aria-label', 'Action input JSON');
      input.setAttribute('rows', '6');
      detail.appendChild(input);

      const actions = el('div', 'agent-detail-actions');
      const dryBtn = el('button', 'agent-btn agent-btn-dry', 'Dry-run');
      const runBtn = el('button', 'agent-btn agent-btn-run', 'Approve & Run');
      const copyBtn = el('button', 'agent-btn agent-btn-copy', 'Copy agent JSON');
      dryBtn.type = runBtn.type = copyBtn.type = 'button';
      actions.append(dryBtn, runBtn, copyBtn);
      detail.appendChild(actions);

      const result = el('div', 'agent-result');
      detail.appendChild(result);

      const parseInput = () => {
        try { return { ok: true, value: JSON.parse(input.value || '{}') }; }
        catch (e) { return { ok: false, error: 'Input is not valid JSON: ' + e.message }; }
      };

      copyBtn.addEventListener('click', () => {
        const payload = JSON.stringify({ action: m.id, input: safeParse(input.value) }, null, 2);
        if (navigator.clipboard) navigator.clipboard.writeText(payload).catch(() => {});
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy agent JSON'; }, 1200);
      });

      dryBtn.addEventListener('click', async () => {
        const p = parseInput();
        if (!p.ok) { renderResult(result, { ok: false, errors: [{ code: 'AGENT_INPUT_INVALID', message: p.error }] }); return; }
        if (!client) { renderResult(result, { ok: false, errors: [{ code: 'NOT_CONNECTED', message: 'Connect first.' }] }); return; }
        result.replaceChildren(el('div', 'agent-loading', 'dry-running…'));
        try { renderResult(result, await client.dryRun(m.id, p.value)); }
        catch (err) { renderResult(result, { ok: false, errors: [{ code: 'TRANSPORT', message: String(err) }] }); }
      });

      runBtn.addEventListener('click', async () => {
        const p = parseInput();
        if (!p.ok) { renderResult(result, { ok: false, errors: [{ code: 'AGENT_INPUT_INVALID', message: p.error }] }); return; }
        if (!client) { renderResult(result, { ok: false, errors: [{ code: 'NOT_CONNECTED', message: 'Connect first.' }] }); return; }
        result.replaceChildren(el('div', 'agent-loading', m.mutatesState ? 'approving + running…' : 'running…'));
        try {
          let approval = null;
          if (m.mutatesState && m.requiresApproval) {
            const ar = await client.approve(m.id, p.value);
            approval = ar && ar.approval ? ar.approval : null;
          }
          renderResult(result, await client.run(m.id, p.value, approval));
        } catch (err) {
          renderResult(result, { ok: false, errors: [{ code: 'TRANSPORT', message: String(err) }] });
        }
      });
    };

    connectBtn.addEventListener('click', connect);
    epInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(); });
  },
};

// renderResult paints the structured response: assurance, summary, approval,
// artifacts, warnings, errors — and tucks the raw envelope behind a details
// disclosure for power users.
function renderResult(host, resp) {
  host.replaceChildren();
  const card = el('div', 'agent-result-card ' + (resp.ok ? 'agent-result-ok' : 'agent-result-fail'));

  card.appendChild(el('div', 'agent-result-summary', resp.summary || (resp.ok ? 'ok' : 'failed')));

  if (resp.assurance) {
    const a = resp.assurance;
    const line = el('div', 'agent-assurance');
    line.appendChild(el('span', 'agent-assurance-level', `${a.proofLevel || '—'}/${a.governanceLevel || '—'}`));
    line.appendChild(el('span', 'agent-assurance-trust',
      a.trustsInfrixNode ? 'trusts node' : 'independently verified (no node trust)'));
    card.appendChild(line);
  }

  if (resp.dryRun) {
    const dr = resp.dryRun;
    const box = el('div', 'agent-dryrun');
    box.appendChild(el('div', 'agent-dryrun-row', 'network: ' + (dr.networkTarget || '—')));
    box.appendChild(el('div', 'agent-dryrun-row', 'expected proof: ' + (dr.expectedProofLevel || '—')));
    if (dr.irreversibleEffects && dr.irreversibleEffects.length) {
      box.appendChild(el('div', 'agent-dryrun-warn', 'irreversible: ' + dr.irreversibleEffects.join(', ')));
    }
    if (dr.walletPromptExpected) box.appendChild(el('div', 'agent-dryrun-row', 'a wallet prompt will appear for a human'));
    card.appendChild(box);
  }

  if (resp.approvalRequest) {
    const ar = resp.approvalRequest;
    const box = el('div', 'agent-approval');
    box.appendChild(el('div', 'agent-approval-title', 'Approval required'));
    box.appendChild(el('div', 'agent-approval-hash', 'input hash: ' + ar.inputHash));
    box.appendChild(el('div', 'agent-approval-note', ar.reason || 'A human must approve this exact input before it runs.'));
    card.appendChild(box);
  }

  (resp.artifacts || []).forEach((art) => {
    const row = el('div', 'agent-artifact');
    row.appendChild(el('span', 'agent-artifact-type', art.type));
    if (art.url) {
      const a = el('a', 'agent-artifact-link', art.url);
      a.setAttribute('href', art.url);
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
      row.appendChild(a);
    } else if (art.path) {
      row.appendChild(el('span', 'agent-artifact-path', art.path));
    }
    if (art.command) {
      const code = el('code', 'agent-artifact-cmd', art.command);
      row.appendChild(code);
    }
    card.appendChild(row);
  });

  (resp.warnings || []).forEach((w) => card.appendChild(el('div', 'agent-warning', '⚠ ' + w)));

  (resp.errors || []).forEach((e) => {
    const er = el('div', 'agent-error');
    er.appendChild(el('span', 'agent-error-code', e.code || 'ERROR'));
    er.appendChild(el('span', 'agent-error-msg', e.message || e.title || ''));
    const fix = (e.fixes || []).find((f) => f.command);
    if (fix) er.appendChild(el('code', 'agent-error-fix', fix.command));
    card.appendChild(er);
  });

  // Power-user raw envelope.
  const det = el('details', 'agent-raw');
  det.appendChild(el('summary', 'agent-raw-summary', 'Raw response (canonical detail)'));
  const pre = el('pre', 'agent-raw-pre');
  pre.textContent = JSON.stringify(resp, null, 2);
  det.appendChild(pre);
  card.appendChild(det);

  host.appendChild(card);
}

function safeParse(s) {
  try { return JSON.parse(s || '{}'); } catch (_) { return {}; }
}

// exampleInput seeds the editor with a minimal object covering the action's
// required inputs, so a user has a starting point.
function exampleInput(m) {
  const obj = {};
  (m.requiredInputs || []).forEach((k) => {
    obj[k] = guessExample(m, k);
  });
  if (Object.keys(obj).length === 0 && m.optionalInputs && m.optionalInputs.length) {
    obj[m.optionalInputs[0]] = guessExample(m, m.optionalInputs[0]);
  }
  return JSON.stringify(obj, null, 2);
}

function guessExample(m, key) {
  const schema = m.inputSchema && m.inputSchema.properties && m.inputSchema.properties[key];
  if (schema) {
    if (schema.type === 'object') return {};
    if (schema.type === 'boolean') return false;
    if (schema.type === 'integer' || schema.type === 'number') return 0;
    if (schema.enum && schema.enum.length) return schema.enum[0];
  }
  if (key === 'bundle' || key === 'receipt') return {};
  if (key === 'mode') return 'local';
  return '';
}
