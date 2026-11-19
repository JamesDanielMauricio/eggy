import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isInSelectedPeriod, isoWeekValueOf, isoWeekValueToMonday, stepPeriod,
} from '../src/lib/periods.js';

test('stepping a day crosses month and year boundaries', () => {
  assert.equal(stepPeriod('daily', '2026-03-01', -1), '2026-02-28');
  assert.equal(stepPeriod('daily', '2026-12-31', 1), '2027-01-01');
});

test('stepping a week enters and leaves a 53-week year', () => {
  assert.equal(stepPeriod('weekly', '2026-W52', 1), '2026-W53');
  assert.equal(stepPeriod('weekly', '2026-W53', 1), '2027-W01');
  assert.equal(stepPeriod('weekly', '2027-W01', -1), '2026-W53');
  assert.equal(stepPeriod('weekly', '2025-W52', 1), '2026-W01');
});

test('stepping a month wraps around the year', () => {
  assert.equal(stepPeriod('monthly', '2026-12', 1), '2027-01');
  assert.equal(stepPeriod('monthly', '2026-01', -1), '2025-12');
});

test('stepping a year moves one calendar year', () => {
  assert.equal(stepPeriod('yearly', '2026', -1), '2025');
});

test('an ISO week value maps to the Monday it starts on', () => {
  // 1 Jan 2026 is a Thursday, so week 1 starts on Monday 29 Dec 2025.
  assert.equal(isoWeekValueToMonday('2026-W01'), '2025-12-29');
  assert.equal(isoWeekValueToMonday('2026-W47'), '2026-11-16');
});

test('a date maps to its ISO week, including early-January days of the previous ISO year', () => {
  assert.equal(isoWeekValueOf('2026-11-19'), '2026-W47');
  assert.equal(isoWeekValueOf('2025-12-29'), '2026-W01');
  assert.equal(isoWeekValueOf('2027-01-01'), '2026-W53');
});

test('a record is in the selected week from Monday through Sunday only', () => {
  assert.equal(isInSelectedPeriod('2026-11-16', 'weekly', '2026-W47'), true);
  assert.equal(isInSelectedPeriod('2026-11-22', 'weekly', '2026-W47'), true);
  assert.equal(isInSelectedPeriod('2026-11-23', 'weekly', '2026-W47'), false);
});
