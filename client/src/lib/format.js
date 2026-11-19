// Display formatting shared by the dashboard, the records list and the chart.
//
// Every formatter is built once and reused. `n.toLocaleString('en-US', opts)`
// quietly constructs a brand-new Intl.NumberFormat on every call — measured
// at ~21µs per call versus ~0.5µs for a cached one (toLocaleDateString: ~43µs
// vs ~1.3µs). The animated counters format on every animation frame and the
// records list formats several values per row, so on a phone this is the
// difference between a smooth count-up and a stuttering one.
import { TRAY_SIZE } from './salePricing.js';

export const CURRENCY = '₱';

const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const monthDayYear = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const monthYear = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' });
const weekdayLong = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

export function formatCurrency(amount) {
  // Round to cents before picking the sign, so a counter passing through
  // -0.004 on its way up reads ₱0.00 rather than flashing -₱0.00.
  const cents = Math.round((amount || 0) * 100);
  return `${cents < 0 ? '-' : ''}${CURRENCY}${money.format(Math.abs(cents) / 100)}`;
}

export function formatCount(value) {
  // `+ 0` turns -0 into 0; Intl prints negative zero as "-0".
  return whole.format(Math.round(value || 0) + 0);
}

// "10 trays", "11 trays + 1 pc", "12 pcs" — how the farm actually counts.
export function formatTrays(eggs) {
  const trays = Math.floor(eggs / TRAY_SIZE);
  const pcs = eggs % TRAY_SIZE;
  const trayPart = trays ? `${whole.format(trays)} tray${trays === 1 ? '' : 's'}` : '';
  const pcsPart = pcs ? `${pcs} pc${pcs === 1 ? '' : 's'}` : '';
  if (trayPart && pcsPart) return `${trayPart} + ${pcsPart}`;
  return trayPart || pcsPart || '0 pcs';
}

// 'YYYY-MM-DD' (the API's date shape) as a local-midnight Date. `new
// Date('2026-11-19')` would parse as UTC midnight instead, which lands on
// the previous day anywhere west of Greenwich.
export function parseDateLocal(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(dateStr) {
  return monthDayYear.format(parseDateLocal(dateStr));
}

// Drops the year for dates in the current year ("Nov 19"), keeps it for
// older ones ("Dec 31, 2025") — less noise down a long list of rows.
export function formatShortDate(dateStr, currentYear = new Date().getFullYear()) {
  const date = parseDateLocal(dateStr);
  return (date.getFullYear() === currentYear ? monthDay : monthDayYear).format(date);
}

export const formatMonthDay = (date) => monthDay.format(date);
export const formatMonthYear = (date) => monthYear.format(date);
export const formatWeekday = (date) => weekdayLong.format(date);

// Y-axis ticks: in full below ten thousand (₱2,500), compact once the axis
// reaches it (₱12K) — one style for the whole axis, picked from its maximum,
// so ₱7,500 and ₱10K never sit on the same scale.
export function axisTickFormatter(maxValue) {
  const useCompact = Math.abs(maxValue) >= 10000;
  return (value) => `${value < 0 ? '-' : ''}${CURRENCY}${(useCompact ? compact : whole).format(Math.abs(value))}`;
}

// A part's share of a whole as a whole percentage. A category that exists
// but rounds to nothing reads "<1%", so it isn't mistaken for "none".
export function formatShare(share) {
  if (share > 0 && share < 0.005) return '<1%';
  return `${Math.round(share * 100)}%`;
}

// Round, evenly spaced axis ticks from 0 to just past `max` — 0 / 2,500 /
// 5,000 / 7,500 / 10,000 rather than the chart library's own guess. Knowing
// the top tick up front is what lets axisTickFormatter pick one label style
// for the whole axis, and lets the chart size its label column to fit.
export function niceTicks(max, intervals = 4) {
  if (!(max > 0)) return [0, 1];
  const rough = max / intervals;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough);
  const count = Math.ceil(max / step);
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}
