import assert from 'node:assert/strict';
import { test } from 'node:test';
import { breakdown, sameRows } from '../src/lib/rows.js';

const sale = (overrides = {}) => ({ id: 'a', eggSize: 'Large', quantity: 300, pricePerEgg: 7.5, status: 'paid', ...overrides });

test('rows with identical contents are the same even when they are new objects', () => {
  assert.equal(sameRows([sale(), sale({ id: 'b' })], [sale(), sale({ id: 'b' })]), true);
});

test('a changed field makes the rows differ', () => {
  assert.equal(sameRows([sale()], [sale({ status: 'pending' })]), false);
});

test('an added or removed row makes the rows differ', () => {
  assert.equal(sameRows([sale()], [sale(), sale({ id: 'b' })]), false);
  assert.equal(sameRows([sale(), sale({ id: 'b' })], [sale()]), false);
});

test('a breakdown follows the given order and skips categories with no records', () => {
  const sales = [sale({ eggSize: 'Large', quantity: 60 }), sale({ eggSize: 'Small', quantity: 30 }), sale({ eggSize: 'Large', quantity: 30 })];
  const result = breakdown(sales, (s) => s.eggSize, (s) => s.quantity, ['Small', 'Medium', 'Large']);
  assert.deepEqual(result.map((r) => [r.name, r.value]), [['Small', 30], ['Large', 90]]);
});

test('a breakdown without an order ranks the largest first', () => {
  const items = [{ k: 'Fly Trap', v: 150 }, { k: 'Feeds', v: 6000 }, { k: 'Others', v: 320 }];
  assert.deepEqual(breakdown(items, (i) => i.k, (i) => i.v).map((r) => r.name), ['Feeds', 'Others', 'Fly Trap']);
});

test('categories missing from the order are kept at the end rather than dropped', () => {
  const items = [{ k: 'Legacy', v: 5 }, { k: 'Small', v: 10 }];
  assert.deepEqual(breakdown(items, (i) => i.k, (i) => i.v, ['Small']).map((r) => r.name), ['Small', 'Legacy']);
});

test('each part carries its share of the whole', () => {
  const items = [{ k: 'a', v: 1 }, { k: 'b', v: 3 }];
  assert.deepEqual(breakdown(items, (i) => i.k, (i) => i.v, ['a', 'b']).map((r) => r.share), [0.25, 0.75]);
});
