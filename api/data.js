// GET  /api/data?ws=plan            -> saved edits + activity log for a workspace
// POST /api/data {ws, action:'save', ops, actor, summary}  -> validate and persist edits
// POST /api/data {ws, action:'reset'}                      -> drop all edits (back to seed data)
import { readJson, send, checkPasscode, WS_IDS } from '../lib/http.js';
import { getOverrides, putOverrides, addLog, getLog, resetWorkspace, storeMode, isPersistent } from '../lib/store.js';
import { WORKSPACES } from '../public/lib/workspaces.js';
import { validateOps } from '../public/lib/ops.js';

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET') {
      const ws = url.searchParams.get('ws') || 'plan';
      if (!WS_IDS.includes(ws)) return send(res, 400, { error: 'Unknown workspace' });
      const [overrides, log] = await Promise.all([getOverrides(ws), getLog(ws)]);
      return send(res, 200, { ws, overrides, log, store: storeMode(), persistent: isPersistent(), passcode: !!process.env.APP_PASSCODE, ai: !!process.env.GEMINI_API_KEY });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    if (!checkPasscode(req)) return send(res, 401, { error: 'Passcode required to make changes' });
    const body = await readJson(req);
    const ws = body.ws;
    if (!WS_IDS.includes(ws)) return send(res, 400, { error: 'Unknown workspace' });
    if (body.action === 'reset') {
      await resetWorkspace(ws);
      await addLog(ws, body.actor || 'user', 'Workspace reset to original seed data');
      return send(res, 200, { ok: true, overrides: [] });
    }
    if (body.action !== 'save') return send(res, 400, { error: 'Unknown action' });
    const overrides = await getOverrides(ws);
    const v = validateOps(WORKSPACES[ws].seed, overrides, body.ops);
    if (!v.ok) return send(res, 422, { error: 'Validation failed', details: v.errors.slice(0, 20) });
    await putOverrides(ws, v.ops);
    await addLog(ws, body.actor || 'user', body.summary || `${v.ops.length} change(s) saved`);
    return send(res, 200, { ok: true, saved: v.ops.length, overrides: await getOverrides(ws), log: await getLog(ws) });
  } catch (e) {
    return send(res, 500, { error: e.message || String(e) });
  }
}
