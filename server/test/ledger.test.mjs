import assert from 'node:assert/strict';
import { after, before, beforeEach, mock, test } from 'node:test';
import { once } from 'node:events';

process.env.VERCEL = '1';
process.env.JWT_SECRET = 'ledger-route-tests-only';
let queries = [];
let failQuery = false;
const ledger = { sales: [], expenses: [], harvests: [] };
mock.module('../dist/db/index.js', { namedExports: { db: {
  execute: async (query) => {
    queries.push(query);
    if (failQuery) throw new Error('Database unavailable');
    return [ledger];
  },
} } });
const { default: app } = await import('../dist/index.js');
const { signToken } = await import('../dist/lib/auth.js');
const { PgDialect } = await import('drizzle-orm/pg-core');
const cookie = `token=${signToken({ userId: 'test-user', username: 'farmer' })}`;
let server;
let base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => { queries = []; failQuery = false; });
after(() => server.close());

test('ledger requires a login before it queries the database', async () => {
  const response = await fetch(`${base}/api/ledger`);
  assert.equal(response.status, 401);
  assert.equal(queries.length, 0);
});

test('ledger loads all three collections with one database execution', async () => {
  const response = await fetch(`${base}/api/ledger`, { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), ledger);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(queries.length, 1);
  const query = new PgDialect().sqlToQuery(queries[0]);
  // Preserve the client field names while selecting PostgreSQL columns.
  for (const field of ['eggSize', 'saleDate', 'pricePerEgg', 'expenseDate', 'harvestDate', 'createdAt']) {
    assert(query.params.includes(field), `Missing serialized field ${field}`);
  }
});

test('a failed ledger query returns an error, never a successful empty ledger', async () => {
  failQuery = true;
  const log = mock.method(console, 'error', () => {});
  try {
    const response = await fetch(`${base}/api/ledger`, { headers: { cookie } });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'internal server error' });
  } finally {
    log.mock.restore();
  }
});
