// Small helpers shared by the API routes (work on Vercel and on the local dev server).
export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body || '{}'); } catch { return {}; } }
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 5e6) throw new Error('Request too large'); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}
export function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
export function checkPasscode(req) {
  const need = process.env.APP_PASSCODE;
  if (!need) return true;
  return req.headers['x-app-passcode'] === need;
}
export const WS_IDS = ['original', 'plan'];
