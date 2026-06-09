// Nexus — #/autopilot Autopilot remediation (nextux-05).
//
// Shows the current posture, the blocking findings, the suggested fixes (auto-
// safe vs operator/external/guided), the dry-run diff, and the remediation
// receipt — with progressive disclosure (plain by default; expand for the
// technical source, config diff, and proof/posture impact). It renders a real
// Go-generated sample plan + dry-run receipt; the browser never applies — apply
// flows through the approval-gated CLI / agent action.

import { elt, setAttrs } from '/lib/uxDom.js';
import {
  loadRemediation, plan, receipt, findings, blockingCount,
  autoSafeFix, manualActions, fixBadge, ROLE_VARS,
} from '/lib/remediation.js';

function severityChip(sev) {
  const role = sev === 'blocking' ? 'negative' : 'caution';
  const chip = elt('span', 'ap-sev ap-sev-' + role, sev);
  setAttrs(chip, { 'data-severity': sev, 'aria-label': 'Severity: ' + sev, style: '--role-fg:' + ROLE_VARS[role] });
  return chip;
}

function fixChip(kind) {
  const b = fixBadge(kind);
  const chip = elt('span', 'ap-fix ap-fix-' + b.role);
  setAttrs(chip, { 'data-kind': kind, 'aria-label': 'Fix: ' + b.label, style: '--role-fg:' + ROLE_VARS[b.role] });
  const g = elt('span', 'ap-fix-glyph', b.glyph);
  setAttrs(g, { 'aria-hidden': 'true' });
  chip.appendChild(g);
  chip.appendChild(elt('span', 'ap-fix-label', b.label));
  return chip;
}

function findingCard(f) {
  const card = elt('article', 'ap-finding');
  setAttrs(card, { 'data-finding': f.id, 'data-severity': f.severity, 'aria-label': 'Finding: ' + f.plain });
  const head = elt('div', 'ap-finding-head');
  head.appendChild(severityChip(f.severity));
  head.appendChild(elt('span', 'ap-finding-plain', f.plain));
  card.appendChild(head);

  // Fix chips (Layer 1: which kinds of fix exist).
  const fixes = elt('div', 'ap-fixes');
  for (const fx of f.fixes || []) fixes.appendChild(fixChip(fx.kind));
  card.appendChild(fixes);

  // Layer 3: technical source + impact + fix detail behind a disclosure.
  const details = elt('details', 'ap-finding-details');
  details.appendChild(elt('summary', 'ap-finding-summary', 'Why + how to fix'));
  details.appendChild(elt('p', 'ap-finding-impact', f.impact));
  const tech = elt('p', 'ap-finding-technical', f.technical);
  details.appendChild(tech);
  const ul = elt('ul', 'ap-fix-list');
  for (const fx of f.fixes || []) {
    const li = elt('li', 'ap-fix-item');
    li.appendChild(elt('span', 'ap-fix-summary', fx.summary));
    if (fx.kind === 'auto_safe') {
      li.appendChild(elt('span', 'ap-fix-note', ' — auto-safe after approval (risk: ' + fx.risk + ')'));
    } else if (fx.command) {
      const code = elt('code', 'ap-fix-command', fx.command);
      li.appendChild(code);
    }
    ul.appendChild(li);
  }
  details.appendChild(ul);
  card.appendChild(details);
  return card;
}

function receiptPanel(rec) {
  const panel = elt('section', 'ap-receipt');
  setAttrs(panel, { 'aria-label': 'Dry-run remediation receipt' });
  panel.appendChild(elt('h2', 'ap-section-title', 'Dry-run: what an approved apply would do'));
  panel.appendChild(elt('p', 'ap-receipt-summary',
    `Would apply ${rec.appliedFixes.length} safe fix(es); ${rec.skippedFixes.length} skipped. Verification would pass: ${rec.verification.passed}.`));

  const diff = elt('ul', 'ap-diff');
  for (const a of rec.appliedFixes) {
    const li = elt('li', 'ap-diff-row');
    li.appendChild(elt('code', 'ap-diff-path', a.path.join('.')));
    li.appendChild(elt('span', 'ap-diff-change', ` ${a.oldValue || '∅'} → ${a.newValue}`));
    diff.appendChild(li);
  }
  panel.appendChild(diff);

  if (rec.remainingManual && rec.remainingManual.length) {
    panel.appendChild(elt('h3', 'ap-subtitle', 'Remaining manual actions'));
    const ul = elt('ul', 'ap-manual');
    for (const m of rec.remainingManual) ul.appendChild(elt('li', 'ap-manual-item', m));
    panel.appendChild(ul);
  }

  const hashes = elt('dl', 'ap-hashes');
  const row = (k, v) => { hashes.appendChild(elt('dt', null, k)); hashes.appendChild(elt('dd', 'mono', v)); };
  row('Before', rec.beforeStateHash);
  row('After', rec.afterStateHash);
  row('Verify', rec.verifierCommand);
  panel.appendChild(hashes);
  return panel;
}

function populate(root) {
  const p = plan();
  const rec = receipt();
  const wrap = elt('div', 'autopilot-view-body');

  // Posture.
  const posture = elt('section', 'ap-posture');
  posture.appendChild(elt('h2', 'ap-section-title', 'Current posture'));
  posture.appendChild(elt('p', 'ap-posture-line',
    `${blockingCount()} blocking issue(s) keep ${p.profile} from being claimed (${findings().length} finding(s) total). Autopilot proposes safe fixes — it never demotes the profile or weakens a gate to turn red into green.`));
  wrap.appendChild(posture);

  // Findings.
  const sec = elt('section', 'ap-findings');
  sec.appendChild(elt('h2', 'ap-section-title', 'Findings + suggested fixes'));
  for (const f of findings()) sec.appendChild(findingCard(f));
  wrap.appendChild(sec);

  // Dry-run receipt.
  if (rec) wrap.appendChild(receiptPanel(rec));

  // Approval note.
  const approve = elt('section', 'ap-approval');
  approve.appendChild(elt('h2', 'ap-section-title', 'Apply (approval required)'));
  approve.appendChild(elt('p', 'ap-approval-note',
    'Applying mutates config and requires an explicit, plan-hash-bound approval. The browser never applies — run it yourself:'));
  approve.appendChild(elt('code', 'ap-approval-cmd', 'infrix autopilot apply repair.json --approve'));
  const manual = manualActions();
  if (manual.length) {
    approve.appendChild(elt('p', 'ap-approval-manual', `${manual.length} action(s) cannot be auto-fixed and need an operator/external system.`));
  }
  wrap.appendChild(approve);

  root.appendChild(wrap);
}

export const autopilotView = {
  async mount(root) {
    root.replaceChildren();
    const shell = elt('div', 'workspace autopilot-view');
    const header = elt('header', 'workspace-header');
    header.appendChild(setAttrs(elt('h1', 'workspace-title', 'Autopilot'), { id: 'autopilot-title' }));
    header.appendChild(elt('p', 'workspace-subtitle', 'Diagnose, propose safe fixes, and remediate — with approval, diffs, and a receipt. Never demotes a claim.'));
    shell.appendChild(header);
    const body = elt('div', 'autopilot-body');
    body.appendChild(elt('p', 'autopilot-loading', 'Loading the autopilot sample…'));
    shell.appendChild(body);
    root.appendChild(shell);

    try {
      await loadRemediation();
      body.replaceChildren();
      populate(body);
    } catch (err) {
      body.replaceChildren();
      const msg = elt('div', 'autopilot-error');
      msg.setAttribute('role', 'alert');
      msg.appendChild(elt('strong', null, 'Could not load the autopilot sample.'));
      msg.appendChild(elt('p', null, String((err && err.message) || err)));
      body.appendChild(msg);
    }
  },
};
