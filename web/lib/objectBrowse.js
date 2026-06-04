// Nexus — typed-object browse helper.
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 4: every Subsystem sub-view
// renders a typed-object list and per-object detail pulled from the
// canonical browseList / browseGet shape (`{ items, total, offset,
// limit }` for list, full ManagedObject for detail). This module
// centralises the rendering so each sub-view is just a few lines of
// configuration: the RPC method names, the columns to project, and
// any per-detail extras.
//
// Usage:
//   buildObjectBrowse({
//     listMethod: 'explorer.bridgeProofList',
//     detailMethod: 'explorer.bridgeProofGet',
//     title: 'Bridge proofs',
//     subtitle: 'Cross-chain proof envelopes …',
//     columns: [
//       { label: 'ID', shape: 'id', width: 22 },
//       { label: 'Source chain', field: 'SourceChain' },
//       …
//     ],
//   })

import {
  rpcWithDisclosure,
  shortHash,
  formatTime,
  hashChip,
  jsonBlock,
  emptyState,
  kvRow,
  card,
  statusPill,
  loadingNode,
  errorNode,
  deeplinkButton,
} from '/lib/spineCommon.js';

/**
 * @param {Object} cfg
 * @param {string} cfg.listMethod
 * @param {string} cfg.detailMethod
 * @param {string} cfg.title
 * @param {string} cfg.subtitle
 * @param {Array<{label:string, shape?:string, field?:string, width?:number}>} cfg.columns
 * @param {(obj:any)=>HTMLElement|null} [cfg.detailExtra]
 *   Optional renderer that returns extra cards to inject on the detail screen
 *   (e.g. cross-link buttons specific to the subsystem).
 * @returns {{ renderList: (root:HTMLElement, subRoute:string)=>void,
 *             renderDetail: (root:HTMLElement, subRoute:string, id:string)=>void }}
 */
export function buildObjectBrowse(cfg) {
  return {
    async renderList(root, subRoute, hubRoute = 'subsystems') {
      root.replaceChildren();
      const head = document.createElement('div');
      head.className = 'spine-section-head';
      const h = document.createElement('h2');
      h.textContent = cfg.title;
      head.appendChild(h);
      if (cfg.subtitle) {
        const sub = document.createElement('p');
        sub.className = 'spine-section-sub';
        sub.textContent = cfg.subtitle;
        head.appendChild(sub);
      }
      root.appendChild(head);

      const wrap = document.createElement('div');
      wrap.className = 'spine-table-wrap';
      wrap.appendChild(loadingNode('Loading…'));
      root.appendChild(wrap);

      let resp;
      try {
        resp = await rpcWithDisclosure(cfg.listMethod, { limit: 100 });
      } catch (err) {
        wrap.replaceChildren(errorNode(err));
        return;
      }
      const items = (resp && Array.isArray(resp.items)) ? resp.items : [];
      if (items.length === 0) {
        wrap.replaceChildren(emptyState('No records yet.'));
        return;
      }

      const table = document.createElement('table');
      table.className = 'spine-table';
      const thead = document.createElement('thead');
      const tr = document.createElement('tr');
      for (const c of cfg.columns) {
        const th = document.createElement('th');
        th.textContent = c.label;
        tr.appendChild(th);
      }
      thead.appendChild(tr);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      for (const obj of items) {
        const row = document.createElement('tr');
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
          window.location.hash = `#/${hubRoute}/${subRoute}/${encodeURIComponent(obj.id || obj.ID)}`;
        });
        for (const c of cfg.columns) {
          row.appendChild(buildCell(c, obj));
        }
        tbody.appendChild(row);
      }
      table.appendChild(tbody);
      wrap.replaceChildren(table);

      const meta = document.createElement('div');
      meta.className = 'spine-table-meta';
      meta.textContent = `${items.length} record${items.length === 1 ? '' : 's'}${resp.total !== items.length ? ` (of ${resp.total} total)` : ''}`;
      root.appendChild(meta);
    },

    async renderDetail(root, subRoute, id, hubRoute = 'subsystems') {
      root.replaceChildren();
      const head = document.createElement('div');
      head.className = 'spine-section-head';
      const back = document.createElement('a');
      back.className = 'spine-back';
      back.href = `#/${hubRoute}/${subRoute}`;
      back.textContent = `← ${cfg.title}`;
      head.appendChild(back);
      const h = document.createElement('h2');
      h.className = 'mono';
      h.textContent = id;
      head.appendChild(h);
      root.appendChild(head);

      let obj;
      try {
        obj = await rpcWithDisclosure(cfg.detailMethod, { id });
      } catch (err) {
        root.appendChild(errorNode(err));
        return;
      }
      if (!obj) {
        root.appendChild(errorNode(new Error('not found')));
        return;
      }

      const grid = document.createElement('div');
      grid.className = 'detail-grid';
      root.appendChild(grid);

      // Envelope card (built from columns + standard ManagedObject fields)
      const envBody = document.createElement('div');
      envBody.appendChild(kvRow('ID', obj.id || obj.ID));
      envBody.appendChild(kvRow('Type', obj.type || obj.Type));
      envBody.appendChild(kvRow('State', statusPill(obj.state || obj.State || 'unknown', 'info')));
      envBody.appendChild(kvRow('Created', formatTime(obj.created || obj.Created)));
      envBody.appendChild(kvRow('Updated', formatTime(obj.updated || obj.Updated)));
      if (obj.createdByIntentID) envBody.appendChild(kvRow('Created by intent', shortHashLink(obj.createdByIntentID, 'intents')));
      if (obj.createdByPlanID) envBody.appendChild(kvRow('Created by plan', shortHashLink(obj.createdByPlanID, 'plans')));
      grid.appendChild(card('Envelope', envBody));

      // Fields card (every field projected from cfg.columns + a few canonical extras)
      const fields = obj.fields || obj.Fields || {};
      const fieldsBody = document.createElement('div');
      const seenFields = new Set();
      for (const c of cfg.columns) {
        if (c.field) seenFields.add(c.field);
      }
      for (const c of cfg.columns) {
        if (!c.field) continue;
        const v = fields[c.field] !== undefined ? fields[c.field] : fields[firstLowercase(c.field)];
        fieldsBody.appendChild(kvRow(c.label, formatFieldValue(v)));
      }
      // Spill: any other meaningful field gets surfaced
      for (const [k, v] of Object.entries(fields)) {
        if (seenFields.has(k)) continue;
        if (k.length > 64) continue; // skip huge keys
        if (v && typeof v === 'object') continue; // nested objects go in raw
        fieldsBody.appendChild(kvRow(k, formatFieldValue(v)));
      }
      grid.appendChild(card('Fields', fieldsBody));

      // Subsystem-specific extras (e.g. bridge-proof verifier link)
      if (typeof cfg.detailExtra === 'function') {
        try {
          const extra = cfg.detailExtra(obj);
          if (extra) grid.appendChild(extra);
        } catch (err) {
          console.error('detailExtra failed', err);
        }
      }

      // Audit trail
      const audit = obj.audit || obj.Audit || [];
      if (Array.isArray(audit) && audit.length > 0) {
        const auditBody = document.createElement('div');
        const list = document.createElement('div');
        list.className = 'history-list';
        for (const e of audit) {
          const row = document.createElement('div');
          row.className = 'history-row';
          const ts = document.createElement('span');
          ts.className = 'history-ts mono';
          ts.textContent = formatTime(e.timestamp || e.Timestamp);
          row.appendChild(ts);
          const tp = document.createElement('span');
          tp.className = 'history-type';
          tp.textContent = e.action || e.Action || '';
          row.appendChild(tp);
          const det = document.createElement('span');
          det.className = 'history-detail';
          det.textContent = e.details || e.Details || `${e.actor || e.Actor || ''}`;
          row.appendChild(det);
          list.appendChild(row);
        }
        auditBody.appendChild(list);
        grid.appendChild(card(`Audit trail (${audit.length})`, auditBody));
      }

      // Raw envelope
      const rawBody = document.createElement('details');
      rawBody.className = 'raw-details';
      const summary = document.createElement('summary');
      summary.textContent = 'Raw managed object';
      rawBody.appendChild(summary);
      rawBody.appendChild(jsonBlock(obj));
      grid.appendChild(card('Inspect', rawBody));
    },
  };
}

function buildCell(col, obj) {
  const td = document.createElement('td');
  if (col.shape === 'id') {
    const id = obj.id || obj.ID;
    td.className = 'mono';
    td.textContent = shortHash(id, col.width || 22, 6);
    td.title = id;
    return td;
  }
  if (col.shape === 'time') {
    td.textContent = formatTime(obj.created || obj.Created);
    return td;
  }
  if (col.shape === 'state') {
    const v = obj.state || obj.State || '—';
    td.appendChild(statusPill(v, kindForState(v)));
    return td;
  }
  if (col.shape === 'updated') {
    td.textContent = formatTime(obj.updated || obj.Updated);
    return td;
  }
  if (col.shape === 'hash') {
    const v = readField(obj, col.field);
    if (v) td.appendChild(hashChip(String(v), { head: 12, tail: 8 }));
    else td.textContent = '—';
    return td;
  }
  if (col.field) {
    const v = readField(obj, col.field);
    td.textContent = formatFieldValue(v);
    if (col.mono) td.classList.add('mono');
    return td;
  }
  td.textContent = '—';
  return td;
}

function readField(obj, key) {
  if (!obj) return undefined;
  const fields = obj.fields || obj.Fields || {};
  if (Object.prototype.hasOwnProperty.call(fields, key)) return fields[key];
  const lc = firstLowercase(key);
  if (Object.prototype.hasOwnProperty.call(fields, lc)) return fields[lc];
  return undefined;
}

function firstLowercase(k) {
  if (!k) return k;
  return k.charAt(0).toLowerCase() + k.slice(1);
}

function formatFieldValue(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }
  if (typeof v === 'string' && v.length > 80) return v.slice(0, 60) + '…';
  return String(v);
}

function kindForState(s) {
  const x = String(s).toLowerCase();
  if (['active', 'completed', 'verified', 'granted', 'confirmed', 'success'].includes(x)) return 'ok';
  if (['failed', 'revoked', 'rejected', 'alert'].includes(x)) return 'alert';
  if (['pending', 'created', 'pending_approval', 'pending_settlement'].includes(x)) return 'warn';
  return 'info';
}

function shortHashLink(value, route) {
  const a = document.createElement('a');
  a.className = 'mono spine-link';
  a.href = `#/${route}/${encodeURIComponent(value)}`;
  a.textContent = shortHash(value, 14, 6);
  a.title = value;
  return a;
}
