// Local server: serves /public and routes /api/* to the same handlers Vercel runs.
// Usage: node scripts/dev-server.js  (reads .env if present)
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
const root = process.cwd();
if (existsSync(join(root, '.env'))) for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const api = { '/api/data': (await import('../api/data.js')).default, '/api/chat': (await import('../api/chat.js')).default };
const port = Number(process.env.PORT || 3000);
createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (api[path]) return api[path](req, res);
  let file = normalize(join(root, 'public', path === '/' ? 'index.html' : path));
  if (!file.startsWith(join(root, 'public'))) { res.statusCode = 403; return res.end(); }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'public', 'index.html');
  res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
}).listen(port, () => console.log(`Growth Center on http://localhost:${port}  (store: ${process.env.SUPABASE_URL ? 'supabase' : 'local file .data/store.json'}, AI: ${process.env.GEMINI_API_KEY ? 'on' : 'off'})`));
