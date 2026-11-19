// Fake Egg Farm Ledger API + static file server.
//
// The real server must not be used for testing: server/.env points at the
// production Neon database. This serves a built client (client/dist) and the
// same /api routes from in-memory sample data, in the row shape Drizzle
// returns (saleDate, numeric columns as strings). Log in as demo / demo.
//
// CLI:    node .claude/skills/run-eggfarm/mock-api.mjs [--dist DIR] [--port 3000] [--latency MS]
// Import: const api = await startMockApi({ latency: 250 }); ... await api.close();
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '../../..');
export const DEFAULT_DIST = path.join(REPO_ROOT, 'client', 'dist');

// Deterministic sample data (seeded PRNG) covering `days` days and ending
// YESTERDAY: records sort newest-entered first, so a sample row stamped later
// than "now" would sit above anything you add during a test.
function sampleData(days) {
  let seed = 42;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const customers = ['sold to Aling Nena', 'Mang Jose sari-sari store', 'Bakery sa kanto', 'Palengke stall #12', null, null, null];
  const perTrayPrice = { Small: 175, Medium: 205, Large: 225, 'Extra Large': 245, Jumbo: 265 };
  const sales = [], expenses = [], harvests = [];
  for (let n = days; n >= 1; n--) {
    const day = new Date();
    day.setDate(day.getDate() - n);
    const created = new Date(day);
    created.setHours(8, 0, 0, 0);
    const count = 1 + Math.floor(rand() * 2);
    for (let i = 0; i < count; i++) {
      const eggSize = pick(['Medium', 'Large', 'Large', 'Extra Large', 'Small', 'Jumbo', 'Medium']);
      const quantity = (4 + Math.floor(rand() * 14)) * 30 + (rand() < 0.3 ? Math.floor(rand() * 29) : 0);
      const total = (perTrayPrice[eggSize] * quantity) / 30;
      created.setMinutes(created.getMinutes() + 37);
      sales.push({
        id: crypto.randomUUID(), eggSize, quantity,
        pricePerEgg: (Math.round((total / quantity) * 100) / 100).toFixed(2),
        totalPrice: total.toFixed(2),
        saleDate: iso(day),
        status: n < 12 && rand() < 0.22 ? 'pending' : 'paid',
        description: pick(customers),
        createdAt: created.toISOString(),
      });
    }
    if (n % 7 === 3) {
      created.setMinutes(created.getMinutes() + 11);
      expenses.push({ id: crypto.randomUUID(), item: 'Feeds', quantity: 4 + Math.floor(rand() * 3), price: '1580.00', expenseDate: iso(day), description: '50kg layer feed from Cruz Agrivet', createdAt: created.toISOString() });
    }
    if (n % 15 === 5) {
      created.setMinutes(created.getMinutes() + 13);
      expenses.push({ id: crypto.randomUUID(), item: pick(['Medicines/Vitamins', 'Fly Trap', 'Others']), quantity: 1 + Math.floor(rand() * 3), price: pick(['150.00', '450.00', '320.00']), expenseDate: iso(day), description: rand() < 0.5 ? 'Vitamins for layers' : null, createdAt: created.toISOString() });
    }
    if (n % 2 === 0) {
      created.setMinutes(created.getMinutes() + 5);
      harvests.push({ id: crypto.randomUUID(), harvested: 900 + Math.floor(rand() * 220), rejected: 8 + Math.floor(rand() * 30), harvestDate: iso(day), createdAt: created.toISOString() });
    }
  }
  return { sales, expenses, harvests };
}

const DATE_FIELD = { sales: 'saleDate', expenses: 'expenseDate', harvests: 'harvestDate' };
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.woff': 'font/woff',
};

// Request body (the client's camelCase fields) → stored row (Drizzle shape).
function toRow(collection, body, existing) {
  const row = { ...existing };
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) continue;
    if (key === 'date') row[DATE_FIELD[collection]] = value;
    else if (['pricePerEgg', 'totalPrice', 'price'].includes(key)) row[key] = value === null ? null : Number(value).toFixed(2);
    else row[key] = value;
  }
  return row;
}

export function startMockApi({ staticDir = DEFAULT_DIST, port = 3000, latency = 0, days = 60 } = {}) {
  const root = path.resolve(staticDir);
  const tables = sampleData(days);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };

    if (url.pathname.startsWith('/api/')) {
      // Lets the Vite dev server (localhost:5173) call this API with cookies,
      // the way the real server allows its CLIENT_ORIGIN.
      const origin = req.headers.origin;
      if (origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      }
      if (req.method === 'OPTIONS') return send(204);
      if (latency) await new Promise((resolve) => setTimeout(resolve, latency));
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { return send(400, { error: 'invalid JSON body' }); }

      if (url.pathname === '/api/auth/login' && req.method === 'POST') {
        if (body.username === 'demo' && body.password === 'demo') {
          return send(200, { username: 'demo' }, { 'Set-Cookie': 'token=demo; Path=/; HttpOnly; SameSite=Lax' });
        }
        return send(401, { error: 'invalid username or password' });
      }
      if (url.pathname === '/api/auth/logout') return send(204, undefined, { 'Set-Cookie': 'token=; Path=/; Max-Age=0' });
      if (!/(?:^|;\s*)token=demo(?:;|$)/.test(req.headers.cookie || '')) return send(401, { error: 'unauthorized' });
      if (url.pathname === '/api/auth/me') return send(200, { username: 'demo' });
      if (url.pathname === '/api/ledger') return send(200, tables);

      const [, , collection, id] = url.pathname.split('/');
      const table = tables[collection];
      if (!table) return send(404, { error: 'not found' });
      if (req.method === 'POST' && !id) {
        const defaults = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...(collection === 'sales' ? { status: 'paid', totalPrice: null } : {}), ...(collection === 'harvests' ? {} : { description: null }) };
        const row = toRow(collection, body, defaults);
        table.push(row);
        return send(201, row);
      }
      const index = table.findIndex((row) => row.id === id);
      if (index === -1) return send(404, { error: 'not found' });
      if (req.method === 'PATCH') {
        table[index] = toRow(collection, body, table[index]);
        return send(200, table[index]);
      }
      if (req.method === 'DELETE') {
        table.splice(index, 1);
        return send(204);
      }
      return send(405, { error: 'method not allowed' });
    }

    // Static files with SPA fallback.
    if (!fs.existsSync(path.join(root, 'index.html'))) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      return res.end(`No build at ${root}. Run: npm run build --prefix client`);
    }
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve({
      url: `http://localhost:${port}`,
      counts: { sales: tables.sales.length, expenses: tables.expenses.length, harvests: tables.harvests.length },
      close: () => new Promise((done) => { server.closeAllConnections(); server.close(() => done()); }),
    }));
  });
}

// Run directly → serve until Ctrl-C.
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const samePath = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
if (samePath(invokedPath, fileURLToPath(import.meta.url))) {
  const flag = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i === -1 ? fallback : process.argv[i + 1]; };
  const api = await startMockApi({ staticDir: flag('dist', DEFAULT_DIST), port: Number(flag('port', 3000)), latency: Number(flag('latency', 0)) });
  console.log(`mock API on ${api.url} (latency ${flag('latency', 0)}ms) — ${api.counts.sales} sales, ${api.counts.expenses} expenses, ${api.counts.harvests} harvests. Log in as demo / demo. Ctrl-C to stop.`);
}
