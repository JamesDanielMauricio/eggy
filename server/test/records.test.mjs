import assert from 'node:assert/strict';
import { after, before, beforeEach, mock, test } from 'node:test';
import { once } from 'node:events';
import express from 'express';
import { SQL } from 'drizzle-orm';

// Route contracts run against the real validators and Drizzle-generated
// updates, with no connection to the configured farm database.
let writes;
const fakeDb = {
  update: () => ({ set: (fields) => ({ where: () => ({ returning: async () => {
    writes.push(fields);
    return [{ id: RECORD_ID, ...Object.fromEntries(Object.entries(fields).filter(([, value]) => !(value instanceof SQL))) }];
  } }) }) }),
  insert: () => ({ values: (fields) => ({ returning: async () => {
    writes.push(fields);
    return [{ id: RECORD_ID, ...fields }];
  } }) }),
};
mock.module('../dist/db/index.js', { namedExports: { db: fakeDb } });
const { salesRouter } = await import('../dist/routes/sales.js');
const { expensesRouter } = await import('../dist/routes/expenses.js');
const RECORD_ID = 'e5de5eb3-b757-428a-a228-202bb570b7db';
const app = express();
app.use(express.json());
app.use('/sales', salesRouter);
app.use('/expenses', expensesRouter);
let server;
let base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => { writes = []; });
after(() => server.close());

async function send(path, body, method = 'PATCH') {
  return fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

test('editing a sale can set pending with an empty description', async () => {
  const response = await send(`/sales/${RECORD_ID}`, {
    eggSize: 'Large', quantity: 30, pricePerEgg: 7, date: '2026-11-04',
    status: 'pending', description: null,
  });
  assert.equal(response.status, 200, await response.text());
  assert.equal(writes[0].status, 'pending');
  assert.equal(writes[0].description, null);
});

test('expense edits can clear a description', async () => {
  const response = await send(`/expenses/${RECORD_ID}`, { description: null });
  assert.equal(response.status, 200, await response.text());
  assert.deepEqual(writes, [{ description: null }]);
});

for (const [type, body] of [
  ['sales', { eggSize: 'Large', quantity: 30, pricePerEgg: 0, date: '2026-11-04' }],
  ['expenses', { item: 'Feeds', quantity: 1, price: 0, date: '2026-11-04' }],
]) {
  test(`${type} accepts a null description on create`, async () => {
    const response = await send(`/${type}`, { ...body, description: null }, 'POST');
    assert.equal(response.status, 201, await response.text());
    assert.equal(writes[0].description, null);
  });

  test(`${type} rejects invalid descriptions before writing`, async () => {
    for (const description of [42, {}, 'x'.repeat(501)]) {
      const response = await send(`/${type}/${RECORD_ID}`, { description });
      assert.equal(response.status, 400);
    }
    assert.equal(writes.length, 0);
  });

  test(`${type} normalizes whitespace and keeps omitted descriptions unchanged`, async () => {
    assert.equal((await send(`/${type}/${RECORD_ID}`, { description: '   ' })).status, 200);
    assert.deepEqual(writes[0], { description: null });
    assert.equal((await send(`/${type}/${RECORD_ID}`, { quantity: 2 })).status, 200);
    assert.equal(writes[1].quantity, 2);
    assert.equal(Object.hasOwn(writes[1], 'description'), false);
  });
}

test('status-only updates still work and invalid statuses never write', async () => {
  for (const status of ['pending', 'paid']) {
    assert.equal((await send(`/sales/${RECORD_ID}`, { status })).status, 200);
  }
  assert.equal((await send(`/sales/${RECORD_ID}`, { status: 'unpaid' })).status, 400);
  assert.deepEqual(writes, [{ status: 'pending' }, { status: 'paid' }]);
});

test('tray-priced sales store an exact total instead of multiplying the rounded egg price', async () => {
  const response = await send('/sales', {
    eggSize: 'Large', quantity: 60, pricePerEgg: 5.83, totalPrice: 350, date: '2026-11-05',
  }, 'POST');
  assert.equal(response.status, 201, await response.text());
  assert.equal(writes[0].totalPrice, '350.00');
});

test('sale edits save exact totals for trays plus loose eggs', async () => {
  const response = await send(`/sales/${RECORD_ID}`, { quantity: 75, pricePerEgg: 5.83, totalPrice: 437.5 });
  assert.equal(response.status, 200, await response.text());
  assert.equal(writes[0].totalPrice, '437.50');
});

test('invalid sale totals are rejected before writing', async () => {
  for (const totalPrice of [-1, null, '350', 1e18]) {
    const response = await send(`/sales/${RECORD_ID}`, { totalPrice });
    assert.equal(response.status, 400);
  }
  assert.equal(writes.length, 0);
});

test('zero is a valid exact sale total', async () => {
  const response = await send(`/sales/${RECORD_ID}`, { totalPrice: 0 });
  assert.equal(response.status, 200, await response.text());
  assert.deepEqual(writes, [{ totalPrice: '0.00' }]);
});
