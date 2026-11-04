import assert from 'node:assert/strict';
import { test } from 'node:test';
import { salePrices, saleTotal } from '../src/lib/salePricing.js';

test('per-egg prices calculate tray and total prices, including loose eggs', () => {
  assert.deepEqual(salePrices({ basis: 'perEgg', amount: '7.50' }, 75), {
    perEgg: '7.50', perTray: '225.00', total: '562.50',
  });
});

test('a tray price preserves the exact total before rounding per egg', () => {
  assert.deepEqual(salePrices({ basis: 'perTray', amount: '175' }, 60), {
    perEgg: '5.83', perTray: '175', total: '350.00',
  });
  assert.equal(salePrices({ basis: 'perTray', amount: '175' }, 75).total, '437.50');
});

test('half-cent derived prices round up without floating-point truncation', () => {
  assert.deepEqual(salePrices({ basis: 'perTray', amount: '169.95' }, 1), {
    perEgg: '5.67', perTray: '169.95', total: '5.67',
  });
});

test('entering a total fills both unit prices without changing that total', () => {
  assert.deepEqual(salePrices({ basis: 'total', amount: '350' }, 60), {
    perEgg: '5.83', perTray: '175.00', total: '350',
  });
});

test('tray pricing works before quantity entry and recalculates when quantity changes', () => {
  const source = { basis: 'perTray', amount: '175' };
  assert.deepEqual(salePrices(source, 0), { perEgg: '5.83', perTray: '175', total: '' });
  assert.equal(salePrices(source, 60).total, '350.00');
  assert.equal(salePrices(source, 90).total, '525.00');
});

test('a total entered before quantity is retained until unit prices can be calculated', () => {
  const source = { basis: 'total', amount: '350' };
  assert.deepEqual(salePrices(source, 0), { perEgg: '', perTray: '', total: '350' });
  assert.equal(salePrices(source, 60).perTray, '175.00');
});

test('clearing any price clears all linked prices, while zero stays valid', () => {
  for (const basis of ['perEgg', 'perTray', 'total']) {
    assert.deepEqual(salePrices({ basis, amount: '' }, 60), { perEgg: '', perTray: '', total: '' });
    const prices = salePrices({ basis, amount: '0' }, 60);
    assert.equal(Number(prices.perEgg), 0);
    assert.equal(Number(prices.perTray), 0);
    assert.equal(Number(prices.total), 0);
  }
});

test('editing an exact tray-priced sale retains its price and total', () => {
  const source = { basis: 'existing', amount: '350.00', quantity: 60 };
  assert.deepEqual(salePrices(source, 60), { perEgg: '5.83', perTray: '175.00', total: '350.00' });
  assert.equal(salePrices(source, 90).total, '525.00');
});

test('saved totals take precedence, including zero; legacy sales retain their totals', () => {
  assert.equal(saleTotal({ quantity: 60, pricePerEgg: 5.83, totalPrice: 350 }), 350);
  assert.equal(saleTotal({ quantity: 60, pricePerEgg: 5.83, totalPrice: 0 }), 0);
  assert.equal(saleTotal({ quantity: 60, pricePerEgg: 5.83, totalPrice: null }), 349.8);
});
