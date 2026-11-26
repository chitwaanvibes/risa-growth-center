// Persistence. Supabase (Postgres) when configured; a local JSON file for development.
// Every edit is stored as a full row keyed by (workspace, table, id) on top of the read-only seed data.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const storeMode = () => (SB_URL && SB_KEY ? 'supabase' : process.env.VERCEL ? 'memory' : 'file');
export const isPersistent = () => storeMode() !== 'memory';

const headers = (extra = {}) => ({
  apikey: SB_KEY, 'Content-Type': 'application/json',
  ...(SB_KEY.startsWith('eyJ') ? { Authorization: `Bearer ${SB_KEY}` } : {}), // legacy service_role JWT only
  ...extra,
});
async function sb(path, opts = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...opts, headers: headers(opts.headers) });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Supabase ${r.status}: ${t.slice(0, 300)}${r.status === 404 ? ' (did you run supabase/setup.sql?)' : ''}`);
  }
  return r.status === 204 || r.headers.get('content-length') === '0' ? null : r.json().catch(() => null);
}

// ----- local file / memory fallback -----
const FILE = join(process.cwd(), '.data', 'store.json');
let mem = { records: {}, log: [] };
function loadLocal() {
  if (storeMode() === 'file' && existsSync(FILE)) { try { mem = JSON.parse(readFileSync(FILE, 'utf8')); } catch { /* keep memory */ } }
  mem.records ||= {}; mem.log ||= [];
  return mem;
}
function saveLocal() {
  if (storeMode() !== 'file') return;
  mkdirSync(join(process.cwd(), '.data'), { recursive: true });
  writeFileSync(FILE, JSON.stringify(mem));
}

export async function getOverrides(ws) {
  if (storeMode() !== 'supabase') {
    const d = loadLocal();
    return Object.values(d.records[ws] || {}).sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  }
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = await sb(`app_records?ws=eq.${encodeURIComponent(ws)}&select=tbl,id,data,deleted,updated_at&order=updated_at.asc,tbl.asc,id.asc`,
      { headers: { Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } });
    out.push(...(rows || []));
    if (!rows || rows.length < 1000) break;
  }
  return out;
}

export async function putOverrides(ws, ops) {
  const now = new Date().toISOString();
  const rows = ops.map(o => ({ ws, tbl: o.tbl, id: String(o.id), data: o.deleted ? null : o.data, deleted: !!o.deleted, updated_at: now }));
  if (storeMode() !== 'supabase') {
    const d = loadLocal(); d.records[ws] ||= {};
    for (const r of rows) { const { ws: _w, ...rest } = r; d.records[ws][`${r.tbl}:${r.id}`] = rest; }
    saveLocal(); return rows.length;
  }
  for (let i = 0; i < rows.length; i += 500) {
    await sb('app_records?on_conflict=ws,tbl,id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 500)) });
  }
  return rows.length;
}

export async function addLog(ws, actor, summary) {
  const row = { ws, actor: String(actor).slice(0, 80), summary: String(summary).slice(0, 500), at: new Date().toISOString() };
  if (storeMode() !== 'supabase') { const d = loadLocal(); d.log.unshift(row); d.log = d.log.slice(0, 500); saveLocal(); return; }
  await sb('app_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
}

export async function getLog(ws, limit = 40) {
  if (storeMode() !== 'supabase') return loadLocal().log.filter(l => l.ws === ws).slice(0, limit);
  return (await sb(`app_log?ws=eq.${encodeURIComponent(ws)}&select=actor,summary,at&order=at.desc&limit=${limit}`)) || [];
}

export async function resetWorkspace(ws) {
  if (storeMode() !== 'supabase') { const d = loadLocal(); delete d.records[ws]; d.log = d.log.filter(l => l.ws !== ws); saveLocal(); return; }
  await sb(`app_records?ws=eq.${encodeURIComponent(ws)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  await sb(`app_log?ws=eq.${encodeURIComponent(ws)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}
