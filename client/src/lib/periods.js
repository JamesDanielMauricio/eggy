// Day / week / month / year period logic for the dashboard: grouping records
// into chart buckets, the Period Summary picker, and stepping between periods.
import { saleTotal } from './salePricing.js';
import { formatDate, formatMonthDay, formatMonthYear, parseDateLocal } from './format.js';

// How many buckets the trend chart shows per granularity.
export const PERIOD_LIMITS = { daily: 30, weekly: 12, monthly: 12, yearly: 6 };

const pad = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' for a local Date — the same shape the API's date columns use.
export function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getTodayLocal() {
  return toDateKey(new Date());
}

// Calendar arithmetic is done in UTC, where every day is exactly 24 hours.
// In local time a daylight-saving change makes one day 23 or 25 hours long,
// which is enough to land on the wrong date after dividing by 86,400,000.
function utcDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDays(dateStr, days) {
  const t = utcDate(dateStr);
  t.setUTCDate(t.getUTCDate() + days);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

// Monday of the week containing dateStr (weeks run Monday–Sunday).
export function getWeekKey(dateStr) {
  const day = utcDate(dateStr).getUTCDay(); // 0 = Sunday
  return addDays(dateStr, day === 0 ? -6 : 1 - day);
}

// The ISO 8601 week ("2026-W07") a date belongs to. Weeks start Monday and
// week 1 is the one containing 4 January, so a week straddling New Year
// belongs to whichever year holds its Thursday — 1 Jan 2027 (a Friday) is
// still in 2026-W53.
export function isoWeekValueOf(dateStr) {
  const thursday = addDays(getWeekKey(dateStr), 3);
  const year = Number(thursday.slice(0, 4));
  const dayOfYear = (utcDate(thursday) - Date.UTC(year, 0, 1)) / 86400000; // 0-based
  return `${year}-W${pad(Math.floor(dayOfYear / 7) + 1)}`;
}

// Translates the browser's native <input type="week"> value ("2026-W07")
// into the Monday-keyed grouping getWeekKey uses everywhere else, so period
// filtering lines up with how the trend chart buckets weeks.
export function isoWeekValueToMonday(weekValue) {
  const [year, week] = weekValue.split('-W').map(Number);
  // 4 January is always in week 1: find that week's Monday, then step forward.
  return addDays(getWeekKey(`${year}-01-04`), (week - 1) * 7);
}

// Default picker value for each mode, so switching granularity always lands
// on "now" (today / this week / this month / this year), never a blank.
export function getPeriodDefaultValue(granularity) {
  const today = getTodayLocal();
  if (granularity === 'daily') return today;
  if (granularity === 'weekly') return isoWeekValueOf(today);
  if (granularity === 'monthly') return today.slice(0, 7);
  return today.slice(0, 4);
}

// The period `delta` steps before (-1) or after (+1) `value`, in the same
// format the matching native picker uses.
export function stepPeriod(granularity, value, delta) {
  if (granularity === 'daily') return addDays(value, delta);
  if (granularity === 'weekly') return isoWeekValueOf(addDays(isoWeekValueToMonday(value), delta * 7));
  if (granularity === 'monthly') {
    const [y, m] = value.split('-').map(Number);
    const months = y * 12 + (m - 1) + delta;
    return `${Math.floor(months / 12)}-${pad((months % 12) + 1)}`;
  }
  return String(Number(value) + delta);
}

export function getPeriodKey(dateStr, granularity) {
  if (granularity === 'daily') return dateStr;
  if (granularity === 'weekly') return getWeekKey(dateStr);
  if (granularity === 'monthly') return dateStr.slice(0, 7);
  return dateStr.slice(0, 4);
}

export function formatPeriodLabel(key, granularity) {
  if (granularity === 'daily' || granularity === 'weekly') return formatMonthDay(parseDateLocal(key));
  if (granularity === 'monthly') {
    const [y, m] = key.split('-').map(Number);
    return formatMonthYear(new Date(y, m - 1, 1));
  }
  return key;
}

export function aggregateByPeriod(sales, expenses, granularity) {
  const groups = {};
  const bucket = (key) => (groups[key] ??= { key, revenue: 0, quantity: 0, expenses: 0 });
  sales.forEach((s) => {
    const group = bucket(getPeriodKey(s.date, granularity));
    group.revenue += saleTotal(s);
    group.quantity += s.quantity;
  });
  expenses.forEach((e) => {
    bucket(getPeriodKey(e.date, granularity)).expenses += e.quantity * e.price;
  });
  const sorted = Object.values(groups).sort((a, b) => a.key.localeCompare(b.key));
  return sorted.slice(-PERIOD_LIMITS[granularity]).map((g) => ({
    ...g, label: formatPeriodLabel(g.key, granularity), profit: g.revenue - g.expenses,
  }));
}

export function isInSelectedPeriod(dateStr, granularity, periodValue) {
  if (!periodValue) return false;
  if (granularity === 'daily') return dateStr === periodValue;
  if (granularity === 'weekly') return getWeekKey(dateStr) === isoWeekValueToMonday(periodValue);
  if (granularity === 'monthly') return dateStr.slice(0, 7) === periodValue;
  return dateStr.slice(0, 4) === periodValue;
}

export function formatSelectedPeriodLabel(granularity, periodValue) {
  if (!periodValue) return '';
  if (granularity === 'daily') return formatDate(periodValue);
  if (granularity === 'weekly') return `Week of ${formatDate(isoWeekValueToMonday(periodValue))}`;
  if (granularity === 'monthly') {
    const [y, m] = periodValue.split('-').map(Number);
    return formatMonthYear(new Date(y, m - 1, 1));
  }
  return periodValue;
}
