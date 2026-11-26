// POST /api/chat {ws, asOf, messages:[{role:'user'|'model', text}]}
// -> {reply, trace (tools used), pendingActions (drafts awaiting confirmation), model}
import { readJson, send, WS_IDS } from '../lib/http.js';
import { getOverrides } from '../lib/store.js';
import { loadWorkspace } from '../public/lib/workspaces.js';
import { calendar } from '../public/lib/metrics.js';
import { runCopilot } from '../lib/copilot.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const body = await readJson(req);
    if (!WS_IDS.includes(body.ws)) return send(res, 400, { error: 'Unknown workspace' });
    const W = loadWorkspace(body.ws, await getOverrides(body.ws)); // always the latest saved data
    const asOf = /^\d{4}-\d{2}-\d{2}$/.test(body.asOf || '') ? body.asOf : calendar(W).defaultAsOf;
    const out = await runCopilot({ W, asOf, messages: body.messages });
    return send(res, out.error ? 502 : 200, out);
  } catch (e) {
    return send(res, 500, { error: e.message || String(e) });
  }
}
