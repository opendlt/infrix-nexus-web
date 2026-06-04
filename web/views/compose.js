// Nexus — Intent Studio.
//
// NEXUS-REIMAGINED-2026-05-10 Phase 2 — first-class pre-execution
// experience. The Intent Studio is the canonical home for composing,
// previewing, and submitting governed intents.
//
// Routes:
//   #/compose                 — open Intent Studio with the last-used goal type
//   #/compose/<GOAL_TYPE>     — open Intent Studio pre-selected to that goal
//   #/compose/<GOAL_TYPE>/raw — open Intent Studio in raw-JSON mode
//
// Layout:
//   ┌────────────────────────────────────────────────────────────────┐
//   │  Spine strip (always visible)                                   │
//   ├────────────────┬────────────────────────────────────────────────┤
//   │ Goal sidebar   │  Composer header (selected goal, tabs)         │
//   │ ─ Value        │  ┌──────────────────────────────────────────┐  │
//   │ ─ Governance   │  │ Guided form  |  Raw JSON                 │  │
//   │ ─ Contracts    │  ├──────────────────────────────────────────┤  │
//   │ ─ Objects      │  │  <fields rendered from server template>  │  │
//   │ ─ Operations   │  │  - or -                                  │  │
//   │ ─ Trust        │  │  <full JSON textarea>                    │  │
//   │                │  └──────────────────────────────────────────┘  │
//   │                │  [ Preview plan ]  [ Reset form ]               │
//   │                │                                                 │
//   │                │  Dossier output (renders below after preview)   │
//   └────────────────┴────────────────────────────────────────────────┘

import { rpcWithDisclosure, errorStateNode } from '/lib/spineCommon.js';
import { renderDossier } from '/lib/dossier.js';

let rootEl = null;
let templates = [];
let selectedGoalType = null;
let mode = 'guided'; // 'guided' | 'raw'
let lastDossier = null;
let draftClientId = null;     // stable id used by nexus.draftCreate to upsert
let draftRestoreSeed = null;  // customParams from a restored draft (subpath /draft/<id>)
let draftAutosaveTimer = null;
let draftStatusEl = null;
const DRAFT_AUTOSAVE_MS = 30000;

const STORAGE_KEY = 'nexus.compose.lastGoalType';
const CLIENT_ID_STORAGE_PREFIX = 'nexus.compose.draftClientId.';

export const composeView = {
  async mount(root, subpath) {
    rootEl = root;
    rootEl.replaceChildren();

    const shell = document.createElement('div');
    shell.className = 'workspace compose-canvas';
    rootEl.appendChild(shell);

    const head = document.createElement('header');
    head.className = 'workspace-header';
    const title = document.createElement('h2');
    title.className = 'workspace-title';
    title.textContent = 'Studio';
    head.appendChild(title);
    const sub = document.createElement('p');
    sub.className = 'workspace-subtitle';
    sub.textContent = 'Compose a new action. Pick a type, fill in the details, preview the plan, then submit.';
    head.appendChild(sub);
    shell.appendChild(head);

    const layout = document.createElement('div');
    layout.className = 'compose-layout';
    shell.appendChild(layout);

    // Sidebar placeholder (filled after templates load)
    const sidebar = document.createElement('aside');
    sidebar.className = 'compose-sidebar';
    sidebar.id = 'composeSidebar';
    layout.appendChild(sidebar);

    // Main composer panel
    const main = document.createElement('section');
    main.className = 'compose-main';
    main.id = 'composeMain';
    layout.appendChild(main);

    // Initial loading state
    sidebar.appendChild(textNode('Loading actions…', 'compose-sidebar-loading'));

    try {
      const r = await rpcWithDisclosure('nexus.goalTemplates', {});
      templates = (r && r.templates) || [];
    } catch (err) {
      sidebar.replaceChildren();
      sidebar.appendChild(errorStateNode(err));
      return;
    }
    if (templates.length === 0) {
      sidebar.replaceChildren();
      sidebar.appendChild(textNode('No actions configured on this devnet.', 'compose-sidebar-empty'));
      return;
    }

    const stored = (typeof localStorage !== 'undefined') ? localStorage.getItem(STORAGE_KEY) : null;
    const wantedGoalType = (subpath && subpath[0]) || stored || templates[0].goalType;
    const wantedMode = (subpath && subpath[1] === 'raw') ? 'raw' : 'guided';
    selectedGoalType = templates.find((t) => t.goalType === wantedGoalType) ? wantedGoalType : templates[0].goalType;
    mode = wantedMode;

    await prepareDraftContext(subpath);
    renderSidebar(sidebar);
    renderMain(main);
  },

  async onSubpathChange(subpath) {
    const wantedGoal = (subpath && subpath[0]) || templates[0]?.goalType;
    const wantedMode = (subpath && subpath[1] === 'raw') ? 'raw' : 'guided';
    if (wantedGoal && templates.find((t) => t.goalType === wantedGoal)) selectedGoalType = wantedGoal;
    mode = wantedMode;
    await prepareDraftContext(subpath);
    const sidebar = document.getElementById('composeSidebar');
    const main = document.getElementById('composeMain');
    if (sidebar) renderSidebar(sidebar);
    if (main) renderMain(main);
  },

  unmount() {
    stopDraftAutosave();
  },
};

// =================================================================
// Draft autosave — Cinema-Inbox-Time E2C5
// =================================================================
async function prepareDraftContext(subpath) {
  draftRestoreSeed = null;
  // #/compose/<goalType>/draft/<id> — restore a saved draft.
  if (subpath && subpath[1] === 'draft' && subpath[2]) {
    const draftId = subpath[2];
    try {
      const r = await rpcWithDisclosure('nexus.draftList', { limit: 200 });
      const drafts = (r && r.drafts) || [];
      const hit = drafts.find((d) => d.id === draftId);
      if (hit) {
        if (hit.goalType && templates.find((t) => t.goalType === hit.goalType)) {
          selectedGoalType = hit.goalType;
        }
        draftClientId = hit.clientId || `compose-${selectedGoalType}-${Math.random().toString(36).slice(2)}`;
        draftRestoreSeed = hit.customParams || {};
      }
    } catch (_) { /* fall through to fresh draft */ }
  }
  if (!draftClientId) {
    const key = CLIENT_ID_STORAGE_PREFIX + selectedGoalType;
    let id = null;
    try { id = localStorage.getItem(key); } catch (_) {}
    if (!id) {
      id = `compose-${selectedGoalType}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
      try { localStorage.setItem(key, id); } catch (_) {}
    }
    draftClientId = id;
  }
}

function startDraftAutosave(getCustomParams) {
  stopDraftAutosave();
  if (typeof getCustomParams !== 'function') return;
  draftAutosaveTimer = setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    let cp;
    try { cp = getCustomParams(); } catch (_) { return; }
    if (!cp) return;
    if (typeof cp === 'object' && Object.keys(cp).length === 0) return;
    try {
      const r = await rpcWithDisclosure('nexus.draftCreate', {
        clientId: draftClientId,
        goalType: selectedGoalType,
        customParams: cp,
      });
      markDraftSaved(r && r.id);
    } catch (e) {
      markDraftError(e);
    }
  }, DRAFT_AUTOSAVE_MS);
}

function stopDraftAutosave() {
  if (draftAutosaveTimer) clearInterval(draftAutosaveTimer);
  draftAutosaveTimer = null;
}

function markDraftSaved(id) {
  if (!draftStatusEl) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  draftStatusEl.classList.remove('is-err');
  draftStatusEl.classList.add('is-ok');
  draftStatusEl.textContent = `Draft saved at ${hh}:${mm}:${ss}` + (id ? ` (${id.slice(0, 18)}…)` : '');
}

function markDraftError(err) {
  if (!draftStatusEl) return;
  draftStatusEl.classList.remove('is-ok');
  draftStatusEl.classList.add('is-err');
  draftStatusEl.textContent = 'Autosave failed: ' + (err && err.message ? err.message : 'unknown');
}

// =================================================================
// Sidebar — categorized goal-type list
// =================================================================
function renderSidebar(sidebar) {
  sidebar.replaceChildren();
  const head = document.createElement('h3');
  head.className = 'compose-sidebar-head';
  head.textContent = 'Pick an action';
  sidebar.appendChild(head);

  const byCategory = new Map();
  for (const t of templates) {
    if (!byCategory.has(t.category)) byCategory.set(t.category, []);
    byCategory.get(t.category).push(t);
  }
  const orderedCategories = ['Value', 'Governance', 'Contracts', 'Objects', 'Operations', 'Trust'];
  const seen = new Set();
  const renderCategory = (cat) => {
    const items = byCategory.get(cat);
    if (!items || items.length === 0) return;
    seen.add(cat);
    const h = document.createElement('div');
    h.className = 'compose-sidebar-category';
    h.textContent = cat;
    sidebar.appendChild(h);
    for (const t of items) {
      const a = document.createElement('a');
      a.className = 'compose-sidebar-item';
      a.textContent = t.displayName;
      a.title = t.description;
      a.href = `#/compose/${encodeURIComponent(t.goalType)}`;
      if (t.goalType === selectedGoalType) a.classList.add('active');
      sidebar.appendChild(a);
    }
  };
  for (const cat of orderedCategories) renderCategory(cat);
  for (const [cat] of byCategory) if (!seen.has(cat)) renderCategory(cat);
}

// =================================================================
// Main — header + form + preview output
// =================================================================
function renderMain(main) {
  main.replaceChildren();
  const tmpl = templates.find((t) => t.goalType === selectedGoalType);
  if (!tmpl) {
    main.appendChild(textNode('Select a goal type from the sidebar.', 'compose-main-empty'));
    return;
  }

  // Header
  const header = document.createElement('header');
  header.className = 'compose-header';
  const title = document.createElement('h2');
  title.className = 'compose-title';
  title.textContent = tmpl.displayName;
  header.appendChild(title);
  // Hidden technical name visible on hover for developers who want
  // the canonical IntentGoalType identifier.
  title.title = `Technical name: ${tmpl.goalType}`;
  const cat = document.createElement('span');
  cat.className = 'compose-category-pill';
  cat.dataset.cat = tmpl.category;
  cat.textContent = tmpl.category;
  header.appendChild(cat);
  const desc = document.createElement('p');
  desc.className = 'compose-description';
  desc.textContent = tmpl.description;
  header.appendChild(desc);
  main.appendChild(header);

  // Tabs — Guided / Raw
  const tabs = document.createElement('div');
  tabs.className = 'compose-tabs';
  const guidedTab = tabButton('Form', 'guided');
  const rawTab = tabButton('Raw JSON', 'raw');
  tabs.appendChild(guidedTab);
  tabs.appendChild(rawTab);
  main.appendChild(tabs);

  // Form region
  const formWrap = document.createElement('div');
  formWrap.className = 'compose-form-wrap';
  formWrap.id = 'composeFormWrap';
  main.appendChild(formWrap);

  // Buttons + draft autosave status
  const btnRow = document.createElement('div');
  btnRow.className = 'compose-buttons';
  const previewBtn = document.createElement('button');
  previewBtn.type = 'button';
  previewBtn.className = 'verify-btn compose-preview-btn';
  previewBtn.textContent = 'Preview';
  btnRow.appendChild(previewBtn);
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'verify-btn compose-reset-btn';
  resetBtn.textContent = 'Reset';
  btnRow.appendChild(resetBtn);
  const saveDraftBtn = document.createElement('button');
  saveDraftBtn.type = 'button';
  saveDraftBtn.className = 'verify-btn compose-save-draft-btn';
  saveDraftBtn.textContent = 'Save draft now';
  btnRow.appendChild(saveDraftBtn);
  draftStatusEl = document.createElement('span');
  draftStatusEl.className = 'compose-draft-status';
  draftStatusEl.textContent = 'Autosaving every 30s as you type.';
  btnRow.appendChild(draftStatusEl);
  main.appendChild(btnRow);

  // Output region (renders dossier or error)
  const out = document.createElement('div');
  out.className = 'compose-out';
  out.id = 'composeOut';
  main.appendChild(out);

  // Persist last-used selection
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, tmpl.goalType);

  // Build form according to current mode. If we landed on this view
  // via #/compose/<goal>/draft/<id>, draftRestoreSeed holds the saved
  // customParams; merge it into the operator seed so the form pre-fills.
  if (draftRestoreSeed) {
    try {
      const merged = { goalType: tmpl.goalType, customParams: draftRestoreSeed };
      localStorage.setItem('nexus.compose.operatorSeed', JSON.stringify(merged));
    } catch (_) { /* localStorage unavailable */ }
  }
  let getCustomParams; // closure to read params on Preview click
  let resetForm;       // closure to reset
  if (mode === 'guided') {
    guidedTab.classList.add('active');
    const built = buildGuidedForm(tmpl, formWrap);
    getCustomParams = built.getValue;
    resetForm = built.reset;
  } else {
    rawTab.classList.add('active');
    const built = buildRawForm(tmpl, formWrap);
    getCustomParams = built.getValue;
    resetForm = built.reset;
  }

  // Wire autosave + the manual save button now that we have a reader.
  startDraftAutosave(getCustomParams);
  saveDraftBtn.addEventListener('click', async () => {
    let cp;
    try { cp = getCustomParams(); } catch (e) { markDraftError(e); return; }
    try {
      const r = await rpcWithDisclosure('nexus.draftCreate', {
        clientId: draftClientId,
        goalType: selectedGoalType,
        customParams: cp,
      });
      markDraftSaved(r && r.id);
    } catch (e) {
      markDraftError(e);
    }
  });

  previewBtn.addEventListener('click', async () => {
    out.replaceChildren(textNode('Building preview…', 'compose-out-loading'));
    let cp;
    try { cp = getCustomParams(); }
    catch (err) { out.replaceChildren(errorStateNode(err)); return; }
    try {
      const dossier = await rpcWithDisclosure('nexus.previewDossier', {
        goalType: tmpl.goalType,
        customParams: cp,
      });
      lastDossier = { goalType: tmpl.goalType, customParams: cp, response: dossier };
      out.replaceChildren(renderDossier(dossier, {
        onSubmit: () => submitDossier(out),
      }));
    } catch (err) {
      out.replaceChildren(errorStateNode(err));
    }
  });
  resetBtn.addEventListener('click', () => {
    if (typeof resetForm === 'function') resetForm();
    out.replaceChildren();
    lastDossier = null;
  });
}

function tabButton(label, m) {
  const a = document.createElement('a');
  a.className = 'compose-tab';
  a.textContent = label;
  a.href = `#/compose/${encodeURIComponent(selectedGoalType)}${m === 'raw' ? '/raw' : ''}`;
  return a;
}

// =================================================================
// Guided form builder
// =================================================================
function buildGuidedForm(tmpl, container) {
  container.replaceChildren();
  const form = document.createElement('div');
  form.className = 'compose-guided-form';
  container.appendChild(form);

  // NEXUS-REIMAGINED Phase 7 — operator-template seed.
  // When the user navigated here from the Operate console (an action
  // card click), a JSON seed is parked in localStorage. If its
  // goalType matches the current template, we pre-fill the form
  // fields and surface a banner explaining the source. The seed is
  // consumed (cleared) on read so a refresh doesn't accidentally
  // re-apply it after the user has edited the form.
  let seed = null;
  try {
    const raw = localStorage.getItem('nexus.compose.operatorSeed');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.goalType === tmpl.goalType) {
        seed = parsed;
        // Banner before the form
        const banner = document.createElement('div');
        banner.className = 'compose-seed-banner';
        banner.innerHTML = `<strong>Pre-filled from a Console template${parsed.templateId ? ` <span class="mono">${parsed.templateId}</span>` : ''}.</strong> Review carefully before submitting — even operator actions go through preview + approval + execution.`;
        container.insertBefore(banner, form);
      }
      // Always consume the seed so a refresh after submission
      // doesn't re-apply it.
      localStorage.removeItem('nexus.compose.operatorSeed');
    }
  } catch (e) { /* localStorage unavailable */ }

  const fieldRefs = [];
  for (const f of (tmpl.fields || [])) {
    const wrap = document.createElement('div');
    wrap.className = 'compose-field';
    if (f.required) wrap.classList.add('required');
    const label = document.createElement('label');
    label.className = 'compose-field-label';
    label.textContent = f.label || f.name;
    if (f.required) {
      const star = document.createElement('span');
      star.className = 'compose-field-required';
      star.textContent = ' *';
      label.appendChild(star);
    }
    wrap.appendChild(label);
    let input;
    switch (f.type) {
      case 'enum': {
        input = document.createElement('select');
        input.className = 'compose-field-input';
        if (!f.required) {
          const blank = document.createElement('option');
          blank.value = '';
          blank.textContent = '— none —';
          input.appendChild(blank);
        }
        for (const v of (f.enumValues || [])) {
          const o = document.createElement('option');
          o.value = v;
          o.textContent = v;
          if (f.default === v) o.selected = true;
          input.appendChild(o);
        }
        break;
      }
      case 'boolean': {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'compose-field-checkbox';
        if (f.default) input.checked = true;
        break;
      }
      case 'number': {
        input = document.createElement('input');
        input.type = 'number';
        input.className = 'compose-field-input';
        if (f.placeholder) input.placeholder = f.placeholder;
        if (f.default !== undefined && f.default !== null) input.value = String(f.default);
        break;
      }
      case 'text':
      case 'json': {
        input = document.createElement('textarea');
        input.className = 'compose-field-textarea';
        input.spellcheck = false;
        if (f.placeholder) input.placeholder = f.placeholder;
        if (f.type === 'json' && f.default !== undefined && f.default !== null) {
          input.value = JSON.stringify(f.default, null, 2);
        }
        break;
      }
      default: {
        input = document.createElement('input');
        input.type = 'text';
        input.className = 'compose-field-input';
        if (f.placeholder) input.placeholder = f.placeholder;
        if (f.default !== undefined && f.default !== null) input.value = String(f.default);
      }
    }
    input.dataset.field = f.name;
    // Apply operator-template seed if present.
    if (seed && seed.customParams && f.name in seed.customParams) {
      const sv = seed.customParams[f.name];
      try {
        if (input.tagName === 'TEXTAREA') {
          input.value = (typeof sv === 'string') ? sv : JSON.stringify(sv, null, 2);
        } else if (input.type === 'checkbox') {
          input.checked = !!sv;
        } else if (input.tagName === 'SELECT') {
          input.value = String(sv);
        } else {
          input.value = String(sv);
        }
      } catch (e) { /* ignore seed coercion failures */ }
    }
    wrap.appendChild(input);
    if (f.hint) {
      const hint = document.createElement('p');
      hint.className = 'compose-field-hint';
      hint.textContent = f.hint;
      wrap.appendChild(hint);
    }
    const errRow = document.createElement('p');
    errRow.className = 'compose-field-error';
    errRow.hidden = true;
    wrap.appendChild(errRow);
    form.appendChild(wrap);
    fieldRefs.push({ field: f, input, errRow });
  }

  function getValue() {
    let firstError = null;
    const out = {};
    for (const { field, input, errRow } of fieldRefs) {
      errRow.hidden = true;
      let raw;
      if (input.tagName === 'TEXTAREA') raw = input.value;
      else if (input.type === 'checkbox') raw = input.checked;
      else if (input.type === 'number') raw = input.value;
      else raw = input.value;

      const trim = (typeof raw === 'string') ? raw.trim() : raw;
      if (field.required && (trim === '' || trim === null || trim === undefined)) {
        errRow.textContent = `${field.label} is required.`;
        errRow.hidden = false;
        if (!firstError) firstError = new Error(`Missing required field: ${field.label}`);
        continue;
      }
      // Skip empty optional fields entirely so customParams stays compact.
      if (!field.required && (trim === '' || trim === null || trim === undefined)) continue;

      switch (field.type) {
        case 'json': {
          try { out[field.name] = JSON.parse(trim); }
          catch (e) {
            errRow.textContent = `JSON parse error: ${e.message}`;
            errRow.hidden = false;
            if (!firstError) firstError = new Error(`Invalid JSON for ${field.label}: ${e.message}`);
          }
          break;
        }
        case 'number': {
          const n = Number(trim);
          if (Number.isNaN(n)) {
            errRow.textContent = `${field.label} must be a number.`;
            errRow.hidden = false;
            if (!firstError) firstError = new Error(`${field.label} is not a number`);
          } else out[field.name] = n;
          break;
        }
        case 'boolean': {
          out[field.name] = !!trim;
          break;
        }
        default:
          out[field.name] = trim;
      }
    }
    if (firstError) throw firstError;
    return out;
  }
  function reset() {
    for (const { field, input } of fieldRefs) {
      if (input.tagName === 'TEXTAREA') {
        input.value = (field.type === 'json' && field.default) ? JSON.stringify(field.default, null, 2) : '';
      } else if (input.type === 'checkbox') {
        input.checked = !!field.default;
      } else {
        input.value = (field.default !== undefined && field.default !== null) ? String(field.default) : '';
      }
    }
  }
  return { getValue, reset };
}

// =================================================================
// Raw JSON form builder
// =================================================================
function buildRawForm(tmpl, container) {
  container.replaceChildren();
  const wrap = document.createElement('div');
  wrap.className = 'compose-raw-form';
  container.appendChild(wrap);

  // NEXUS-REIMAGINED Phase 7 — operator-template seed for raw mode.
  let seed = null;
  try {
    const raw = localStorage.getItem('nexus.compose.operatorSeed');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.goalType === tmpl.goalType) {
        seed = parsed;
        const banner = document.createElement('div');
        banner.className = 'compose-seed-banner';
        banner.innerHTML = `<strong>Pre-filled from a Console template${parsed.templateId ? ` <span class="mono">${parsed.templateId}</span>` : ''}.</strong> Review carefully before submitting.`;
        container.insertBefore(banner, wrap);
      }
      localStorage.removeItem('nexus.compose.operatorSeed');
    }
  } catch (e) { /* localStorage unavailable */ }

  const lbl = document.createElement('label');
  lbl.className = 'compose-field-label';
  lbl.textContent = 'customParams (JSON)';
  wrap.appendChild(lbl);

  const ta = document.createElement('textarea');
  ta.className = 'compose-raw-textarea';
  ta.spellcheck = false;
  ta.value = JSON.stringify(
    seed ? (seed.customParams || {}) : (tmpl.example || {}),
    null, 2,
  );
  wrap.appendChild(ta);

  const hint = document.createElement('p');
  hint.className = 'compose-field-hint';
  hint.textContent = `Edit the JSON directly. Schema fields: ${(tmpl.fields || []).map((f) => f.name).join(', ')}.`;
  wrap.appendChild(hint);

  const errRow = document.createElement('p');
  errRow.className = 'compose-field-error';
  errRow.hidden = true;
  wrap.appendChild(errRow);

  function getValue() {
    errRow.hidden = true;
    let parsed;
    try { parsed = JSON.parse(ta.value || '{}'); }
    catch (e) {
      errRow.textContent = `JSON parse error: ${e.message}`;
      errRow.hidden = false;
      throw new Error(`Invalid JSON: ${e.message}`);
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      errRow.textContent = 'customParams must be a JSON object.';
      errRow.hidden = false;
      throw new Error('customParams must be a JSON object');
    }
    // Required-field validation against template.
    const missing = [];
    for (const f of (tmpl.fields || [])) {
      if (f.required && (parsed[f.name] === undefined || parsed[f.name] === null || parsed[f.name] === '')) {
        missing.push(f.name);
      }
    }
    if (missing.length > 0) {
      errRow.textContent = `Missing required field${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`;
      errRow.hidden = false;
      throw new Error(`Missing required: ${missing.join(', ')}`);
    }
    return parsed;
  }
  function reset() { ta.value = JSON.stringify(tmpl.example || {}, null, 2); }
  return { getValue, reset };
}

// =================================================================
// Submit handoff — runs governed.submit (no preview) using the same
// goalType + customParams the dossier was built from.
// =================================================================
async function submitDossier(out) {
  if (!lastDossier) return;
  const banner = document.createElement('div');
  banner.className = 'verify-summary verify-warn compose-out-loading';
  banner.textContent = 'Submitting plan…';
  out.replaceChildren(banner);
  try {
    const result = await rpcWithDisclosure('governed.submit', {
      goalType: lastDossier.goalType,
      customParams: lastDossier.customParams,
    });
    const ok = document.createElement('div');
    ok.className = 'verify-summary verify-pass';
    const intentID = result && result.Intent && result.Intent.ID;
    ok.textContent = intentID ? `✓ Submitted as ${intentID} — opening narrative…` : '✓ Submitted.';
    out.replaceChildren(ok);
    if (intentID) {
      setTimeout(() => { window.location.hash = '#/spine/' + encodeURIComponent(intentID); }, 600);
    }
  } catch (err) {
    out.replaceChildren(errorStateNode(err));
  }
}

// =================================================================
// Helpers
// =================================================================
function textNode(text, cls) {
  const p = document.createElement('p');
  if (cls) p.className = cls;
  p.textContent = text;
  return p;
}
