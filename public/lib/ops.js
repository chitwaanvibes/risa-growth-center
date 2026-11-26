// Validation of edits before they are saved. Shared by the browser (instant feedback) and the API (enforcement).
import { TABLES, cleanRow } from './schema.js';
import { buildWorkspace } from './metrics.js';

// ops: [{ tbl, id, data } | { tbl, id, deleted: true }]
// Returns { ok, ops (normalised), errors: [string] }
export function validateOps(seed, overrides, ops) {
  const errors = []; const clean = [];
  if (!Array.isArray(ops) || !ops.length) return { ok: false, ops: [], errors: ['No changes sent'] };
  if (ops.length > 2000) return { ok: false, ops: [], errors: ['Too many changes in one request (max 2000)'] };
  for (const [i, o] of ops.entries()) {
    const spec = TABLES[o?.tbl];
    if (!spec) { errors.push(`Change ${i + 1}: unknown table "${o?.tbl}"`); continue; }
    if (o.deleted) { if (!o.id) errors.push(`Change ${i + 1}: delete needs an id`); else clean.push({ tbl: o.tbl, id: String(o.id), deleted: true }); continue; }
    const { row, errors: e } = cleanRow(o.tbl, o.data);
    const id = row?.[spec.pk];
    if (o.id !== undefined && id !== undefined && String(o.id) !== String(id)) e.push(`${spec.pk} cannot be changed (create a new row instead)`);
    if (e.length) errors.push(`${spec.label} ${id ?? o.id ?? `row ${i + 1}`}: ${e.join('; ')}`);
    else clean.push({ tbl: o.tbl, id: String(id), data: row });
  }
  if (errors.length) return { ok: false, ops: clean, errors };
  // referential integrity against the workspace as it would look after these changes
  const W = buildWorkspace(seed, [...overrides, ...clean]);
  const ids = Object.fromEntries(Object.entries(W.tables).map(([t, rows]) => [t, new Set(rows.map(r => String(r[TABLES[t].pk])))]));
  for (const o of clean) {
    if (o.deleted) {
      const refs = [];
      for (const [t, spec] of Object.entries(TABLES)) for (const [k, fs] of Object.entries(spec.fields)) {
        if (fs.ref === o.tbl) { const n = W.tables[t].filter(r => String(r[k]) === o.id).length; if (n) refs.push(`${n} ${spec.label.toLowerCase()}`); }
      }
      if (refs.length) errors.push(`Cannot delete ${TABLES[o.tbl].label.toLowerCase()} ${o.id}: still used by ${refs.join(', ')}`);
      continue;
    }
    for (const [k, fs] of Object.entries(TABLES[o.tbl].fields)) {
      if (fs.ref && o.data[k] !== undefined && !ids[fs.ref].has(String(o.data[k]))) errors.push(`${TABLES[o.tbl].label} ${o.id}: ${k} "${o.data[k]}" does not exist in ${TABLES[fs.ref].label}`);
    }
  }
  return { ok: errors.length === 0, ops: clean, errors };
}

export function nextId(rows, field, prefix, width = 3) {
  let max = 0;
  for (const r of rows) { const m = String(r[field] || '').match(new RegExp(`^${prefix}(\\d+)$`)); if (m) max = Math.max(max, Number(m[1])); }
  return prefix + String(max + 1).padStart(width, '0');
}
