// Nexus — severity model.
//
// Phase 1 canonical severity levels. Every risk signal, approval
// task, verification result, and pulse alarm classifies into ONE
// of these. Rendering picks the right icon + colour band so the
// user can scan the cockpit and see "what needs attention now"
// at a glance.

export const SEVERITY = {
  normal:       { rank: 0, color: 'normal',    icon: '·', label: 'Normal' },
  attention:    { rank: 1, color: 'warn',      icon: '⚠', label: 'Attention' },
  blocked:      { rank: 2, color: 'alert',     icon: '⊘', label: 'Blocked' },
  failed:       { rank: 3, color: 'alert',     icon: '✗', label: 'Failed' },
  unverifiable: { rank: 4, color: 'accent',    icon: '?', label: 'Unverifiable' },
};

const ORDER = ['normal', 'attention', 'blocked', 'failed', 'unverifiable'];

/** Render a severity badge — small pill with icon + label. */
export function severityBadge(sev) {
  const def = SEVERITY[sev] || SEVERITY.normal;
  const span = document.createElement('span');
  span.className = `sev-badge sev-${sev || 'normal'}`;
  const icon = document.createElement('span');
  icon.className = 'sev-icon';
  icon.textContent = def.icon;
  span.appendChild(icon);
  const lbl = document.createElement('span');
  lbl.className = 'sev-label';
  lbl.textContent = def.label;
  span.appendChild(lbl);
  return span;
}

/** Sort signals by severity (highest first), then by timestamp newest first. */
export function sortBySeverity(signals) {
  const arr = signals.slice();
  arr.sort((a, b) => {
    const ra = (SEVERITY[a.severity] || SEVERITY.normal).rank;
    const rb = (SEVERITY[b.severity] || SEVERITY.normal).rank;
    if (rb !== ra) return rb - ra;
    const ta = (a.timestamp || a.since || a.updated || '');
    const tb = (b.timestamp || b.since || b.updated || '');
    return String(tb).localeCompare(String(ta));
  });
  return arr;
}

export function severityRank(sev) {
  return (SEVERITY[sev] || SEVERITY.normal).rank;
}

export const SEVERITY_ORDER = ORDER;
