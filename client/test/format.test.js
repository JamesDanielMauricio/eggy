import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  axisTickFormatter, formatCount, formatCurrency, formatShare, formatShortDate, formatTrays, niceTicks,
} from '../src/lib/format.js';

test('currency has the peso sign, thousands separators and two decimals', () => {
  assert.equal(formatCurrency(1234.5), '₱1,234.50');
  assert.equal(formatCurrency(0), '₱0.00');
});

test('negative amounts put the minus before the peso sign', () => {
  assert.equal(formatCurrency(-76720), '-₱76,720.00');
});

test('missing amounts render as zero', () => {
  assert.equal(formatCurrency(undefined), '₱0.00');
  assert.equal(formatCurrency(null), '₱0.00');
});

test('amounts that round to zero never show a minus sign', () => {
  // An animated counter passes through values like -0.004 on its way up.
  assert.equal(formatCurrency(-0.004), '₱0.00');
});

test('counts are rounded whole numbers with separators', () => {
  assert.equal(formatCount(28700.6), '28,701');
});

test('egg counts read as trays plus loose pieces', () => {
  assert.equal(formatTrays(300), '10 trays');
  assert.equal(formatTrays(30), '1 tray');
  assert.equal(formatTrays(331), '11 trays + 1 pc');
  assert.equal(formatTrays(45), '1 tray + 15 pcs');
  assert.equal(formatTrays(12), '12 pcs');
});

test('short dates drop the year only within the current year', () => {
  assert.equal(formatShortDate('2026-11-19', 2026), 'Nov 19');
  assert.equal(formatShortDate('2025-12-31', 2026), 'Dec 31, 2025');
});

test('shares are whole percentages, and a real but tiny share is never shown as 0%', () => {
  assert.equal(formatShare(0.257), '26%');
  assert.equal(formatShare(0.003), '<1%');
  assert.equal(formatShare(0), '0%');
});

test('axis ticks are round steps from zero to just past the largest value', () => {
  assert.deepEqual(niceTicks(9480), [0, 2500, 5000, 7500, 10000]);
  assert.deepEqual(niceTicks(7000), [0, 2000, 4000, 6000, 8000]);
  assert.deepEqual(niceTicks(12000), [0, 5000, 10000, 15000]);
});

test('an all-zero chart still gets a usable axis', () => {
  assert.deepEqual(niceTicks(0), [0, 1]);
});

test('axis ticks stay in full below ten thousand and go compact from there', () => {
  const small = axisTickFormatter(7500);
  assert.equal(small(0), '₱0');
  assert.equal(small(2500), '₱2,500');
  const large = axisTickFormatter(12000);
  assert.equal(large(2500), '₱2.5K');
  assert.equal(large(12000), '₱12K');
});
