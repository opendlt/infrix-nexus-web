// Nexus — #/compare Migration & Comparison Lab (nextux-15).
//
// An honest, sourced comparison surface: a pattern picker, the trust / UX /
// proof comparisons, a cost estimate that never invents numbers, a migration
// plan, and the claims — each one tagged with its source+date (for another
// chain) or its backing capability (for Infrix). The why/expert disclosures
// round it out. Honest by construction: every external claim is sourced and
// Infrix is never labeled "better" without a measured basis.

import { elt, setAttrs } from '/lib/uxDom.js';
import {
  loadCompare, isLive, patterns, report, capabilities,
  isExternalClaim, reportIsHonest, whyItMatters,
} from '/marketing/lib/compare.js';

function sourceBanner() {
  const wrap = elt('section', 'compare-banner');
  setAttrs(wrap, { role: 'note' });
  wrap.appendChild(elt('strong', 'compare-banner-tag', 'Honest & sourced'));
  wrap.appendChild(elt('span', 'compare-banner-text',
    ' — every claim about another chain carries a source and date or is marked an assumption, costs never invent numbers, and Infrix is never called "better" without a measured basis.'));
  const src = elt('p', 'compare-source');
  setAttrs(src, { 'data-live': String(isLive()) });
  src.textContent = isLive() ? 'Live compare context connected.' : 'Showing a worked report (run `infrix compare <pattern>` on your own).';
  wrap.appendChild(src);
  return wrap;
}

function pickerPanel() {
  const panel = elt('section', 'compare-picker');
  setAttrs(panel, { 'aria-label': 'Pattern catalog' });
  panel.appendChild(elt('h3', 'compare-subtitle', 'Patterns'));
  const ul = elt('ul', 'compare-pattern-list');
  for (const p of patterns()) {
    const li = elt('li', 'compare-pattern');
    setAttrs(li, { 'data-pattern': p.id });
    li.appendChild(elt('span', 'compare-pattern-id', p.id));
    li.appendChild(elt('span', 'compare-pattern-arrow', ' → '));
    li.appendChild(elt('span', 'compare-pattern-equiv', p.infrixEquivalent));
    ul.appendChild(li);
  }
  panel.appendChild(ul);
  return panel;
}

function comparisonTable(title, cls, rows) {
  const panel = elt('section', cls);
  setAttrs(panel, { 'aria-label': title });
  panel.appendChild(elt('h3', 'compare-subtitle', title));
  const table = elt('table', 'compare-table');
  const head = elt('tr', 'compare-table-head');
  for (const h of ['Aspect', 'Source', 'Infrix']) head.appendChild(elt('th', null, h));
  table.appendChild(head);
  for (const r of rows || []) {
    const tr = elt('tr', 'compare-row');
    tr.appendChild(elt('td', 'compare-aspect', r.aspect));
    tr.appendChild(elt('td', 'compare-src', r.source));
    tr.appendChild(elt('td', 'compare-inf', r.infrix));
    table.appendChild(tr);
  }
  panel.appendChild(table);
  return panel;
}

function costPanel(costs) {
  const panel = elt('section', 'compare-cost');
  setAttrs(panel, { 'aria-label': 'Cost and latency' });
  panel.appendChild(elt('h3', 'compare-subtitle', 'Cost & latency'));
  for (const c of costs || []) {
    const card = elt('div', 'compare-cost-card');
    const head = elt('div', 'compare-cost-head');
    head.appendChild(elt('span', 'compare-cost-label', c.label));
    const basis = elt('span', 'compare-cost-basis', 'basis: ' + c.basis);
    setAttrs(basis, { 'data-basis': c.basis });
    head.appendChild(basis);
    card.appendChild(head);
    card.appendChild(elt('p', 'compare-cost-line', 'Source: ' + c.source));
    card.appendChild(elt('p', 'compare-cost-line', 'Infrix: ' + c.infrix));
    if (c.disclaimer) card.appendChild(elt('p', 'compare-cost-disclaimer', c.disclaimer));
    panel.appendChild(card);
  }
  return panel;
}

function migrationPanel(steps) {
  const panel = elt('section', 'compare-migration');
  setAttrs(panel, { 'aria-label': 'Migration plan' });
  panel.appendChild(elt('h3', 'compare-subtitle', 'Migration plan'));
  const ol = elt('ol', 'compare-migration-list');
  for (const s of steps || []) {
    const li = elt('li', 'compare-migration-step');
    li.appendChild(elt('span', 'compare-migration-title', s.title));
    li.appendChild(elt('span', 'compare-migration-detail', ' — ' + s.detail));
    if (s.infrixAction) {
      const a = elt('span', 'compare-migration-action', s.infrixAction);
      setAttrs(a, { 'data-action': s.infrixAction });
      li.appendChild(a);
    }
    ol.appendChild(li);
  }
  panel.appendChild(ol);
  return panel;
}

function claimsPanel(claims) {
  const panel = elt('section', 'compare-claims');
  setAttrs(panel, { 'aria-label': 'Claims' });
  panel.appendChild(elt('h3', 'compare-subtitle', 'Claims (each sourced or backed)'));
  const ul = elt('ul', 'compare-claim-list');
  for (const c of claims || []) {
    const li = elt('li', 'compare-claim');
    const ext = isExternalClaim(c);
    setAttrs(li, { 'data-external': String(ext) });
    let tag;
    if (ext) {
      const assumption = c.source && c.source.assumption;
      const date = (c.source && c.source.date) ? (' ' + c.source.date) : '';
      tag = elt('span', 'compare-claim-tag', '[' + c.about + ', ' + (assumption ? 'assumption' : 'source') + date + ']');
      setAttrs(tag, { 'data-sourced': String(!!(c.source && (c.source.assumption || c.source.date))) });
    } else {
      tag = elt('span', 'compare-claim-tag', '[Infrix · ' + c.backedBy + ']');
      setAttrs(tag, { 'data-backed': String(!!c.backedBy) });
    }
    li.appendChild(tag);
    li.appendChild(elt('span', 'compare-claim-text', ' ' + c.text));
    ul.appendChild(li);
  }
  panel.appendChild(ul);
  return panel;
}

function whyPanel() {
  const panel = elt('details', 'compare-why');
  panel.appendChild(elt('summary', 'compare-why-summary', 'Show me why this matters'));
  panel.appendChild(elt('p', 'compare-why-body', whyItMatters()));
  return panel;
}

function expertPanel(r) {
  const panel = elt('details', 'compare-expert');
  panel.appendChild(elt('summary', 'compare-expert-summary', 'Expert details'));
  const dl = elt('dl', 'compare-expert-grid');
  const row = (k, v) => { dl.appendChild(elt('dt', null, k)); dl.appendChild(elt('dd', 'mono', String(v))); };
  row('Pattern', r.pattern);
  row('Infrix equivalent', r.infrixEquivalent);
  row('Report is honest (browser check)', String(reportIsHonest()));
  row('Recognized capabilities', capabilities().join(', '));
  panel.appendChild(dl);
  const body = elt('div', 'compare-expert-body');
  body.appendChild(elt('h4', 'compare-subtitle', 'Infrix trust model'));
  const ul = elt('ul', 'compare-trust-model');
  for (const t of r.infrixTrustModel || []) ul.appendChild(elt('li', null, t));
  body.appendChild(ul);
  panel.appendChild(body);
  return panel;
}

function populate(body) {
  const r = report();
  body.appendChild(sourceBanner());
  const header = elt('div', 'compare-report-header');
  header.appendChild(elt('h2', 'compare-report-title', r.title + '  (' + r.source + ' → Infrix ' + r.infrixEquivalent + ')'));
  header.appendChild(elt('p', 'compare-report-impl', r.commonImplementation));
  body.appendChild(header);

  const grid = elt('div', 'compare-grid-layout');
  grid.appendChild(pickerPanel());
  const main = elt('div', 'compare-main');
  main.appendChild(comparisonTable('Trust model', 'compare-trust', r.trustComparison));
  main.appendChild(comparisonTable('UX flow', 'compare-ux', r.uxComparison));
  main.appendChild(comparisonTable('Proof / verification', 'compare-proof', r.proofComparison));
  main.appendChild(costPanel(r.costComparison));
  main.appendChild(migrationPanel(r.migrationPlan));
  main.appendChild(claimsPanel(r.claims));
  grid.appendChild(main);
  body.appendChild(grid);

  body.appendChild(whyPanel());
  body.appendChild(expertPanel(r));
}

export const compareView = {
  async mount(root) {
    root.replaceChildren();
    const shell = elt('div', 'workspace compare-view');
    const header = elt('header', 'workspace-header');
    header.appendChild(setAttrs(elt('h1', 'workspace-title', 'Migration & Comparison'), { id: 'compare-title' }));
    header.appendChild(elt('p', 'workspace-subtitle',
      'Map a familiar blockchain or Web2 pattern onto Infrix: an honest, sourced comparison of trust, UX, proof, and cost, plus a migration plan that scaffolds runnable artifacts.'));
    shell.appendChild(header);
    const body = elt('div', 'compare-body');
    body.appendChild(elt('p', 'compare-loading', 'Loading the lab…'));
    shell.appendChild(body);
    root.appendChild(shell);

    try {
      await loadCompare();
      body.replaceChildren();
      populate(body);
    } catch (err) {
      body.replaceChildren();
      const msg = elt('div', 'compare-error');
      msg.setAttribute('role', 'alert');
      msg.appendChild(elt('strong', null, 'Could not load the lab.'));
      msg.appendChild(elt('p', null, String((err && err.message) || err)));
      body.appendChild(msg);
    }
  },
};
