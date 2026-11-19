import { memo, useCallback, useEffect, useId, useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';
import {
  CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Egg, LayoutDashboard, Loader2,
  LogOut, Pencil, Plus, Search, Trash2, TrendingDown, TrendingUp, Wallet, X,
} from 'lucide-react';
import { AnimatedNumber, SaveFeedback, ScreenTransition, SegmentedControl } from './components/MotionUI';
import BrandMark from './components/BrandMark';
import * as api from './lib/api';
import { useLedger } from './lib/useLedger';
import { TRAY_SIZE, saleTotal } from './lib/salePricing';
import { useSalePricing } from './lib/useSalePricing';
import { SPRING } from './lib/motion';
import { CHART, COLORS, ELEVATION, inputClasses } from './lib/theme';
import {
  CURRENCY, formatCount, formatCurrency, formatShare, formatShortDate, formatTrays, formatWeekday,
} from './lib/format';
import {
  aggregateByPeriod, formatSelectedPeriodLabel, getPeriodDefaultValue, getTodayLocal,
  isInSelectedPeriod, stepPeriod,
} from './lib/periods';
import { breakdown } from './lib/rows';
import { getLoadedTrendChart, loadTrendChart } from './lib/charts';

const EGG_SIZES = ['Extra Small', 'Small', 'Medium', 'Large', 'Extra Large', 'Jumbo', 'Reject'];
// Phone-width chip labels, so all seven sizes fit in two even rows.
const EGG_SIZE_SHORT = { 'Extra Small': 'X-Small', 'Extra Large': 'X-Large' };
const EXPENSE_ITEMS = ['Feeds', 'Fly Trap', 'Medicines/Vitamins', 'Others'];
const TAB_ORDER = ['dashboard', 'addSale', 'addExpense', 'addHarvest', 'records'];
const RECORD_TABS = ['sales', 'expenses', 'harvests'];

// The records list mounts this many rows at a time; "Show more" adds the
// next batch. Every mounted row is re-measured for its layout animation
// whenever the list changes (that's how rows glide into place after a
// delete), so capping the mounted rows keeps each tap and keystroke equally
// quick whether the ledger holds 50 entries or 5,000.
const PAGE_SIZE = 30;

const GRANULARITIES = [
  { id: 'daily', label: 'Day' },
  { id: 'weekly', label: 'Week' },
  { id: 'monthly', label: 'Month' },
  { id: 'yearly', label: 'Year' },
];
const PERIOD_NOUN = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };
const PAYMENT_OPTIONS = [
  { id: 'paid', label: 'Paid' },
  { id: 'pending', label: 'Pending (utang)' },
];

// Built once at load time. The dashboard cards are memoized, and a fresh
// `<TrendingUp />` element on every render would count as a changed prop
// and defeat that.
const ICONS = {
  up: <TrendingUp size={22} />,
  down: <TrendingDown size={22} />,
  egg: <span className="text-sm leading-none" aria-hidden="true">🥚</span>,
  harvest: <Egg size={16} />,
};

// Shared attributes for number fields. inputMode picks the phone keyboard:
// a plain number pad for whole numbers, a pad with a decimal point for
// money. (pattern does the same job on older iOS.)
const WHOLE_NUMBER_INPUT = { type: 'number', inputMode: 'numeric', pattern: '[0-9]*', min: '0', step: '1' };
const MONEY_INPUT = { type: 'number', inputMode: 'decimal', min: '0', step: '0.01' };

const expenseTotal = (e) => e.quantity * e.price;
const formatEggs = (n) => `${formatCount(n)} eggs`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Most-recently-added first — not the sale/expense/harvest date, which is
// user-entered and can be backdated, so it doesn't reflect entry order.
const sortByRecentlyAdded = (rows) => [...rows].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

// Blank fields default to 0 (a partial "3 trays, no loose pcs" entry is
// normal), but a genuinely invalid number (negative, non-integer) returns
// null so the caller can reject it instead of silently treating it as 0.
function trayPcsToTotal(trays, pcs) {
  const t = trays === '' ? 0 : Number(trays);
  const p = pcs === '' ? 0 : Number(pcs);
  if (!Number.isInteger(t) || t < 0 || !Number.isInteger(p) || p < 0) return null;
  return t * TRAY_SIZE + p;
}

// Staggers a list's entrance animation, capped so the last rows of a batch
// aren't still visibly waiting to appear.
function rowDelay(index) {
  return Math.min(index, 8) * 35;
}

// ── Form building blocks ──────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="eggy-label">{label}</span>
      {children}
    </label>
  );
}

// An input with a small caption underneath; the caption doubles as the
// input's accessible name.
function CaptionedInput({ caption, children }) {
  return (
    <label className="block min-w-0">
      {children}
      <span className="eggy-hint">{caption}</span>
    </label>
  );
}

// One tap per choice instead of open → scroll → pick in a native dropdown,
// and the current choice stays visible. Real radio buttons underneath — see
// .eggy-chip in index.css.
//
// With `shortLabels`, phones get an even four-column grid using the short
// names (two rows for the seven egg sizes — three ragged rows of full names
// pushed the Add Sale button off the first screen), and wider screens show
// the full names. Each radio's accessible name is always the full name.
function ChipGroup({ label, options, value, onChange, shortLabels }) {
  const name = useId();
  return (
    <fieldset>
      <legend className="eggy-label">{label}</legend>
      <div className={shortLabels ? 'grid grid-cols-4 gap-2 sm:flex sm:flex-wrap' : 'flex flex-wrap gap-2'}>
        {options.map((option) => {
          const short = shortLabels?.[option];
          return (
            <label
              key={option}
              className={`eggy-chip relative ${shortLabels ? 'justify-center px-2 sm:px-3.5' : ''} ${value === option ? 'is-active' : ''}`}
            >
              <input
                type="radio"
                name={name}
                value={option}
                checked={value === option}
                onChange={() => onChange(option)}
                aria-label={option}
                className="sr-only"
              />
              {short ? (
                <>
                  <span className="sm:hidden" aria-hidden="true">{short}</span>
                  <span className="hidden sm:inline" aria-hidden="true">{option}</span>
                </>
              ) : (
                <span aria-hidden="true">{option}</span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// Lets a count be entered as whole trays + loose pcs instead of one number
// the user has to multiply out by hand first (e.g. "3 trays and 10 pcs"
// instead of pre-computing 3*30+10=100). The running total sits beside the
// label, so it's visible while typing.
function TrayPcsField({ label, trays, pcs, onTraysChange, onPcsChange }) {
  const labelId = useId();
  const total = trayPcsToTotal(trays, pcs);
  const hasValue = trays !== '' || pcs !== '';
  return (
    <div role="group" aria-labelledby={labelId}>
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="eggy-label">{label}</span>
        {hasValue && (
          <span className={`text-xs font-medium tabular-nums ${total === null ? 'text-brick' : 'text-ink-soft'}`}>
            {total === null ? 'Whole numbers, 0 or more' : `= ${formatEggs(total)}`}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <CaptionedInput caption={`Trays (× ${TRAY_SIZE})`}>
          <input {...WHOLE_NUMBER_INPUT} value={trays} onChange={(e) => onTraysChange(e.target.value)} placeholder="0" className={`${inputClasses} tabular-nums`} />
        </CaptionedInput>
        <CaptionedInput caption="Pcs">
          <input {...WHOLE_NUMBER_INPUT} value={pcs} onChange={(e) => onPcsChange(e.target.value)} placeholder="0" className={`${inputClasses} tabular-nums`} />
        </CaptionedInput>
      </div>
    </div>
  );
}

function MoneyInput({ value, onChange, caption }) {
  return (
    <CaptionedInput caption={caption}>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted" aria-hidden="true">{CURRENCY}</span>
        <input
          {...MONEY_INPUT}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.00"
          className={`${inputClasses} eggy-price-input pl-7 pr-2 tabular-nums`}
        />
      </span>
    </CaptionedInput>
  );
}

// Sales include a price per 30-egg tray between the unit and total prices.
function PriceField({ quantity, perUnit, perTray, total, onPerUnitChange, onPerTrayChange, onTotalChange, perUnitCaption, totalCaption }) {
  const labelId = useId();
  const hasTray = !!onPerTrayChange;
  return (
    <div role="group" aria-labelledby={labelId}>
      <span id={labelId} className="eggy-label">Price</span>
      <div className={`grid gap-2 ${hasTray ? 'grid-cols-2 min-[360px]:grid-cols-3' : 'grid-cols-2'}`}>
        <MoneyInput value={perUnit} onChange={onPerUnitChange} caption={perUnitCaption} />
        {hasTray && <MoneyInput value={perTray} onChange={onPerTrayChange} caption={`Per tray (${TRAY_SIZE} eggs)`} />}
        <div className={hasTray ? 'col-span-2 min-[360px]:col-span-1' : undefined}>
          <MoneyInput value={total} onChange={onTotalChange} caption={totalCaption} />
        </div>
      </div>
      {quantity <= 0 && (
        <p className="eggy-hint">{hasTray ? 'Enter a quantity above to calculate the sale total.' : 'Enter a quantity above to auto-fill the other price.'}</p>
      )}
    </div>
  );
}

function FormTitle({ icon: Icon, color, children }) {
  return (
    <h2 className="font-display font-semibold text-lg text-ink mb-4 flex items-center gap-2">
      <Icon size={18} style={{ color }} aria-hidden="true" />
      {children}
    </h2>
  );
}

function EditActions({ saving, onCancel }) {
  return (
    <div className="flex gap-2">
      <button type="submit" disabled={saving} className="eggy-btn eggy-btn-primary eggy-focus flex-1 py-3 text-sm">
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
      <button type="button" onClick={onCancel} disabled={saving} className="eggy-btn eggy-btn-quiet eggy-focus flex-1 py-3 text-sm">
        Cancel
      </button>
    </div>
  );
}

// Clears the "recorded" confirmation a couple of seconds after it appears.
function useSuccessFlag() {
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(false), 2000);
    return () => clearTimeout(t);
  }, [success]);
  return [success, setSuccess];
}

// ── Shared pieces ─────────────────────────────────────────────────────────

function StampBadge({ icon, color, size = 44 }) {
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        border: `2px solid ${color}`,
        // Tinted fill inside the ring plus a soft halo, tilted like an ink
        // stamp with the icon counter-rotated upright.
        backgroundColor: `${color}14`,
        boxShadow: `0 0 0 4px ${color}12`,
        color,
        transform: 'rotate(-6deg)',
      }}
      aria-hidden="true"
    >
      <span style={{ transform: 'rotate(6deg)', display: 'flex' }}>{icon}</span>
    </div>
  );
}

const Header = memo(function Header({ username, onLogout }) {
  return (
    <header
      className="sticky top-0 z-20 h-16 px-4 flex items-center"
      style={{
        // Gradient + a gold hairline along the bottom edge, so the header
        // reads as a lit surface rather than a flat brown block.
        backgroundImage: `linear-gradient(160deg, #4A3120 0%, ${COLORS.barnwood} 55%, ${COLORS.barnwoodDeep} 100%)`,
        borderBottom: `1px solid ${COLORS.yolk}33`,
        boxShadow: ELEVATION.lg,
      }}
    >
      <div className="max-w-4xl mx-auto w-full flex items-center gap-3">
        <BrandMark size={40} onDark />
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-[17px] font-bold leading-tight tracking-tight text-white">Egg Farm Ledger</h1>
          {/* Today's date where a fixed tagline used to be — useful context
              right before recording something. */}
          <p className="text-[11px] tracking-wide text-gold truncate">{formatWeekday(new Date())}</p>
        </div>
        {onLogout && (
          <div className="flex items-center gap-2 shrink-0">
            {username && <span className="text-xs hidden sm:inline text-gold">{username}</span>}
            <button
              type="button"
              onClick={onLogout}
              className="eggy-press eggy-focus flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl text-white"
              style={{ backgroundColor: 'rgba(255,255,255,0.07)', border: `1px solid ${COLORS.yolk}55` }}
            >
              <LogOut size={14} />
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
});

function ErrorBanner({ message, onClose, onRetry }) {
  return (
    <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl pl-3 pr-1 py-1.5 text-sm text-brick bg-[#F7E6E1] border border-[#9B443355]">
      <span>{message}</span>
      <div className="flex shrink-0 items-center gap-1">
        {onRetry && <button type="button" onClick={onRetry} className="eggy-btn eggy-btn-quiet eggy-focus px-3 py-1 text-xs">Retry</button>}
        <button type="button" onClick={onClose} aria-label="Dismiss error" className="eggy-icon-btn eggy-focus">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

// Shown during a background refresh (see the visibilitychange handling in
// useLedger) so a slow one — e.g. Vercel's function and Neon's compute both
// waking up after the PWA sat idle — doesn't look like the app is frozen.
// 'syncing' only appears after a short delay and 'slow' only after a few
// seconds, so a normal, already-warm refresh never flashes anything.
function SyncBanner({ status }) {
  if (status === 'idle') return null;
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-moss bg-[#EEF1E4] border border-[#4D7A3E55]">
      <Loader2 size={14} className="animate-spin shrink-0" />
      <span>{status === 'slow' ? 'Still syncing — the server may be waking up, this can take a few seconds…' : 'Syncing…'}</span>
    </div>
  );
}

function CardHeader({ title, children }) {
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
      <h2 className="font-display font-semibold text-ink">{title}</h2>
      {children}
    </div>
  );
}

function EmptyNote({ children }) {
  return <p className="text-sm py-8 text-center text-muted">{children}</p>;
}

// ── Dashboard ─────────────────────────────────────────────────────────────

// Net profit is the one number the whole ledger exists to answer, so it gets
// its own surface, a wash in the sign's colour, and a figure readable at
// arm's length. Revenue and expenses sit underneath as its two halves — they
// used to repeat as separate cards further down.
const HeroCard = memo(function HeroCard({ netProfit, totalRevenue, totalExpenses }) {
  const positive = netProfit >= 0;
  const color = positive ? COLORS.moss : COLORS.brick;
  return (
    <section
      aria-label="Net profit"
      className="eggy-card eggy-rise relative overflow-hidden"
      style={{
        // A very low-opacity wash of the profit/loss colour bleeding in from
        // the top-right, so "up" and "down" are legible before you read a
        // single digit — without tinting the whole card and hurting contrast.
        backgroundImage: `radial-gradient(120% 140% at 100% 0%, ${color}1F 0%, ${color}0A 38%, transparent 68%)`,
        boxShadow: ELEVATION.lg,
      }}
    >
      {/* Accent rule along the top edge, in the same colour as the figure. */}
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundImage: `linear-gradient(90deg, ${color}, ${color}22)` }} />
      <div className="p-5 pb-4">
        <div className="flex items-center gap-3">
          <StampBadge icon={positive ? ICONS.up : ICONS.down} color={color} size={44} />
          <div className="flex-1 min-w-0">
            <p className="eggy-overline">Net profit</p>
            <p className="text-xs text-muted">All time</p>
          </div>
          <span
            className="text-[10px] font-bold px-2 py-1 rounded-full uppercase shrink-0"
            style={{ backgroundColor: `${color}1F`, color, letterSpacing: '0.06em' }}
          >
            {positive ? 'In profit' : 'At a loss'}
          </span>
        </div>
        <p className="mt-3 text-[2.25rem] leading-none font-semibold tracking-tight" style={{ color }}>
          <AnimatedNumber value={netProfit} format={formatCurrency} />
        </p>
      </div>
      <div className="grid grid-cols-2 border-t border-hairline">
        <HeroFigure label="Revenue" value={totalRevenue} dot={COLORS.moss} />
        <HeroFigure label="Expenses" value={totalExpenses} dot={COLORS.brick} className="border-l border-hairline" />
      </div>
    </section>
  );
});

// Identity comes from the coloured dot beside the label; the figure itself
// stays in ink so it reads cleanly.
function HeroFigure({ label, value, dot, className = '' }) {
  return (
    <div className={`px-5 py-3 min-w-0 ${className}`}>
      <p className="flex items-center gap-1.5 text-xs text-ink-soft">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: dot }} aria-hidden="true" />
        {label}
      </p>
      <p className="mt-0.5 text-base font-semibold text-ink truncate">
        <AnimatedNumber value={value} format={formatCurrency} />
      </p>
    </div>
  );
}

// `delay` staggers the entrance so the grid assembles rather than snapping
// in all at once.
const StatCard = memo(function StatCard({ icon, label, value, color, format, suffix, sub, delay = 0 }) {
  return (
    <div className="eggy-card eggy-rise p-4 min-w-0" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-2.5">
        <StampBadge icon={icon} color={color} size={32} />
        <p className="eggy-overline truncate">{label}</p>
      </div>
      <p className="mt-3 text-xl font-semibold tracking-tight text-ink">
        <AnimatedNumber value={value} format={format} suffix={suffix} />
      </p>
      {sub && <p className="text-xs mt-0.5 text-muted tabular-nums truncate">{sub}</p>}
    </div>
  );
});

// Swatch legend in ink text (the old one coloured the words themselves,
// which made "Revenue" in light green hard to read). Rectangles, matching
// the bars they stand for.
function ChartLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-ink-soft mb-2" aria-hidden="true">
      {[['Revenue', CHART.revenue], ['Expenses', CHART.expenses]].map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

// The chart's numbers as a table for screen readers — a bar chart alone
// says nothing to someone who can't see it.
function ChartTable({ data }) {
  return (
    <table className="sr-only">
      <caption>Revenue and expenses by period</caption>
      <thead>
        <tr><th scope="col">Period</th><th scope="col">Revenue</th><th scope="col">Expenses</th></tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.key}><th scope="row">{d.label}</th><td>{formatCurrency(d.revenue)}</td><td>{formatCurrency(d.expenses)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

// Renders the chart from its separately loaded chunk (see lib/charts.js).
// If the chunk already arrived — the usual case, since App starts the
// download at launch — it renders straight away. Otherwise a placeholder of
// the exact same height holds the space, and a failed download (offline,
// or mid-deploy) offers a retry instead of breaking the whole dashboard.
function LazyTrendChart({ data }) {
  const [Chart, setChart] = useState(getLoadedTrendChart);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (Chart) return;
    let active = true;
    loadTrendChart().then(
      (component) => { if (active) setChart(() => component); },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, [Chart, attempt]);

  if (failed) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-center" style={{ height: CHART.height }}>
        <p className="text-sm text-muted">The chart couldn't load. Check your connection.</p>
        <button
          type="button"
          onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}
          className="eggy-btn eggy-btn-quiet eggy-focus px-3 py-1.5 text-xs"
        >
          Try again
        </button>
      </div>
    );
  }
  if (!Chart) return <div className="eggy-skeleton w-full" style={{ height: CHART.height }} />;
  return <Chart data={data} />;
}

function MiniFigure({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-ink-soft truncate">{label}</p>
      <p className="text-[15px] font-semibold text-ink tabular-nums mt-0.5 truncate">{value}</p>
    </div>
  );
}

// Memoized with its own aggregation, so switching Day/Week/Month/Year
// redraws only this card — not the hero, the period summary and both
// breakdowns along with it.
const TrendCard = memo(function TrendCard({ paidSales, expenses, granularity, onGranularityChange, avgPricePerEgg }) {
  const chartData = useMemo(() => aggregateByPeriod(paidSales, expenses, granularity), [paidSales, expenses, granularity]);
  const avgRevenue = chartData.length ? chartData.reduce((sum, d) => sum + d.revenue, 0) / chartData.length : 0;
  return (
    <section className="eggy-card p-5">
      <CardHeader title="Revenue vs Expenses">
        <SegmentedControl options={GRANULARITIES} value={granularity} onChange={onGranularityChange} label="Time period" />
      </CardHeader>
      {chartData.length === 0 ? (
        <EmptyNote>No data for this view yet.</EmptyNote>
      ) : (
        <>
          <ChartLegend />
          <LazyTrendChart data={chartData} />
          <ChartTable data={chartData} />
        </>
      )}
      <div className="mt-4 pt-3 border-t border-hairline grid grid-cols-2 gap-3">
        <MiniFigure label={`Avg revenue / ${PERIOD_NOUN[granularity]}`} value={formatCurrency(avgRevenue)} />
        <MiniFigure label="Avg price / egg" value={formatCurrency(avgPricePerEgg)} />
      </div>
    </section>
  );
});

// Native picker matching the selected granularity. Note: <input type="week">
// only renders as a real week-picker in Chromium browsers — Firefox and
// Safari fall back to a plain text field there, a known HTML limitation.
// The arrows beside it work everywhere.
function PeriodPicker({ granularity, value, onChange, availableYears }) {
  const handleChange = (e) => onChange(e.target.value);
  const label = `Selected ${PERIOD_NOUN[granularity]}`;
  if (granularity === 'yearly') {
    return (
      <select value={value} onChange={handleChange} className={inputClasses} aria-label={label}>
        {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    );
  }
  const type = { daily: 'date', weekly: 'week', monthly: 'month' }[granularity];
  // Keyed by type so switching granularity mounts a fresh input rather than
  // re-typing one that still holds a value in the old format.
  return <input key={type} type={type} value={value} onChange={handleChange} className={inputClasses} aria-label={label} />;
}

function SummaryRow({ label, detail, value, color, total = false }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2.5 ${total ? 'border-t border-hairline' : ''}`}>
      <dt className={total ? 'text-sm font-semibold text-ink' : 'text-sm text-ink-soft'}>
        {label}
        {detail && <span className="block text-[11px] text-muted">{detail}</span>}
      </dt>
      <dd className={`tabular-nums text-ink ${total ? 'text-base font-semibold' : 'text-sm font-medium'}`} style={color ? { color } : undefined}>
        <AnimatedNumber value={value} format={formatCurrency} />
      </dd>
    </div>
  );
}

// Totals for one chosen day/week/month/year: paid sales minus expenses, the
// same way net profit is worked out, scoped to that period. Laid out like a
// ledger statement — figures right-aligned in a column, a rule above the
// result — so long amounts never get squeezed into narrow tiles.
const PeriodSummaryCard = memo(function PeriodSummaryCard({
  paidSales, expenses, granularity, value, onGranularityChange, onValueChange, availableYears,
}) {
  const totals = useMemo(() => {
    const inPeriod = (record) => isInSelectedPeriod(record.date, granularity, value);
    const periodSales = paidSales.filter(inPeriod);
    const periodExpenses = expenses.filter(inPeriod);
    return {
      sales: periodSales.reduce((sum, s) => sum + saleTotal(s), 0),
      expenses: periodExpenses.reduce((sum, e) => sum + expenseTotal(e), 0),
      salesCount: periodSales.length,
      expensesCount: periodExpenses.length,
    };
  }, [paidSales, expenses, granularity, value]);
  const profit = totals.sales - totals.expenses;
  const hasData = totals.salesCount > 0 || totals.expensesCount > 0;
  const noun = PERIOD_NOUN[granularity];

  // One tap to the previous or next period, instead of reopening the native
  // picker each time. Years are limited to the ones the year picker lists,
  // and there's nothing to step to after the current period.
  const prev = value ? stepPeriod(granularity, value, -1) : null;
  const next = value ? stepPeriod(granularity, value, 1) : null;
  const yearly = granularity === 'yearly';
  const canPrev = prev !== null && (!yearly || availableYears.includes(prev));
  const canNext = next !== null && next <= getPeriodDefaultValue(granularity) && (!yearly || availableYears.includes(next));

  return (
    <section className="eggy-card p-5">
      <CardHeader title="Period Summary">
        <SegmentedControl options={GRANULARITIES} value={granularity} onChange={onGranularityChange} label="Period length" />
      </CardHeader>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onValueChange(prev)}
          disabled={!canPrev}
          aria-label={`Previous ${noun}`}
          className="eggy-icon-btn eggy-focus shrink-0 border border-hairline bg-card-alt"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <PeriodPicker granularity={granularity} value={value} onChange={onValueChange} availableYears={availableYears} />
        </div>
        <button
          type="button"
          onClick={() => onValueChange(next)}
          disabled={!canNext}
          aria-label={`Next ${noun}`}
          className="eggy-icon-btn eggy-focus shrink-0 border border-hairline bg-card-alt"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      {!hasData ? (
        <EmptyNote>No entries for this {noun}.</EmptyNote>
      ) : (
        <>
          <p className="text-xs mt-4 mb-2 text-ink-soft">{formatSelectedPeriodLabel(granularity, value)}</p>
          <dl className="eggy-inset px-4">
            <SummaryRow label="Sales" detail={plural(totals.salesCount, 'paid sale')} value={totals.sales} />
            <SummaryRow label="Expenses" detail={plural(totals.expensesCount, 'expense')} value={totals.expenses} />
            <SummaryRow label="Profit" value={profit} color={profit >= 0 ? COLORS.moss : COLORS.brick} total />
          </dl>
        </>
      )}
    </section>
  );
});

// A ranked bar list instead of a pie: bars on a shared baseline compare far
// more precisely than slices (the old pie couldn't show 2% against 1%),
// every value is printed so nothing hides behind a tooltip — which a phone
// can't hover anyway — and it needs no charting library. One colour per
// card: each bar is labelled, so colour isn't needed to tell them apart.
const BreakdownCard = memo(function BreakdownCard({ title, items, color, formatValue, emptyText, total }) {
  const reducedMotion = useReducedMotion();
  return (
    <section className="eggy-card p-5">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2 className="font-display font-semibold text-ink">{title}</h2>
        {items.length > 0 && <span className="text-xs text-muted tabular-nums shrink-0">{formatValue(total)}</span>}
      </div>
      {items.length === 0 ? (
        <EmptyNote>{emptyText}</EmptyNote>
      ) : (
        <ul className="space-y-3.5">
          {items.map((item, i) => (
            <li key={item.name}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-ink truncate">{item.name}</span>
                <span className="shrink-0 tabular-nums text-ink-soft">
                  <span className="font-semibold text-ink">{formatValue(item.value)}</span>
                  <span className="inline-block w-11 text-right">{formatShare(item.share)}</span>
                </span>
              </div>
              {/* Track in a light step of the bar's own colour; the bar is
                  square at the baseline with a rounded end, and grows in
                  over the same 650ms the old pie took to sweep. */}
              <div className="mt-1.5 h-2 rounded-r-[4px] overflow-hidden" style={{ backgroundColor: `${color}1F` }} aria-hidden="true">
                <motion.div
                  className="h-full rounded-r-[4px]"
                  style={{ backgroundColor: color }}
                  initial={reducedMotion ? false : { width: 0 }}
                  animate={{ width: `${item.share * 100}%` }}
                  transition={{ duration: reducedMotion ? 0 : 0.65, ease: 'easeOut', delay: reducedMotion ? 0 : i * 0.05 }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});

function EmptyState() {
  return (
    <div className="eggy-card p-10 text-center">
      <span className="text-4xl" aria-hidden="true">🥚</span>
      <p className="font-display font-semibold mt-3 text-ink">No entries yet</p>
      <p className="text-sm mt-1 text-muted">Add your first sale or expense to see charts here.</p>
    </div>
  );
}

function DashboardView({
  sales, paidSales, expenses, harvests, granularity, onGranularityChange,
  avgGranularity, onAvgGranularityChange, avgPeriodValue, onAvgPeriodValueChange, availableYears,
}) {
  const totals = useMemo(() => {
    const revenue = paidSales.reduce((sum, s) => sum + saleTotal(s), 0);
    const eggs = paidSales.reduce((sum, s) => sum + s.quantity, 0);
    const spent = expenses.reduce((sum, e) => sum + expenseTotal(e), 0);
    const harvested = harvests.reduce((sum, h) => sum + h.harvested, 0);
    const rejected = harvests.reduce((sum, h) => sum + h.rejected, 0);
    return {
      revenue,
      eggs,
      spent,
      avgPricePerEgg: eggs ? revenue / eggs : 0,
      // Average per harvest record entered (in practice usually one per
      // day) — the requested "average production and reject eggs".
      avgHarvested: harvests.length ? Math.round(harvested / harvests.length) : 0,
      avgRejected: harvests.length ? Math.round(rejected / harvests.length) : 0,
    };
  }, [paidSales, expenses, harvests]);
  // Egg sizes keep their natural small → large order; expense categories
  // have none, so they're ranked largest first.
  const sizeBreakdown = useMemo(() => breakdown(paidSales, (s) => s.eggSize, (s) => s.quantity, EGG_SIZES), [paidSales]);
  const expenseBreakdown = useMemo(() => breakdown(expenses, (e) => e.item, expenseTotal), [expenses]);

  return (
    <div className="space-y-4">
      <HeroCard netProfit={totals.revenue - totals.spent} totalRevenue={totals.revenue} totalExpenses={totals.spent} />
      <div className="grid grid-cols-2 gap-3">
        <StatCard delay={60} icon={ICONS.egg} label="Eggs sold" value={totals.eggs} format={formatCount} color={COLORS.yolk} sub={formatTrays(totals.eggs)} />
        <StatCard
          delay={120}
          icon={ICONS.harvest}
          label="Avg harvest"
          value={totals.avgHarvested}
          format={formatCount}
          suffix=" eggs"
          color={COLORS.moss}
          sub={`${formatCount(totals.avgRejected)} rejected`}
        />
      </div>

      {sales.length === 0 && expenses.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <TrendCard
            paidSales={paidSales}
            expenses={expenses}
            granularity={granularity}
            onGranularityChange={onGranularityChange}
            avgPricePerEgg={totals.avgPricePerEgg}
          />
          <PeriodSummaryCard
            paidSales={paidSales}
            expenses={expenses}
            granularity={avgGranularity}
            value={avgPeriodValue}
            onGranularityChange={onAvgGranularityChange}
            onValueChange={onAvgPeriodValueChange}
            availableYears={availableYears}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <BreakdownCard
              title="Sales by Egg Size"
              items={sizeBreakdown}
              color={CHART.sizes}
              formatValue={formatEggs}
              emptyText="No paid sales yet"
              total={totals.eggs}
            />
            <BreakdownCard
              title="Expenses by Category"
              items={expenseBreakdown}
              color={CHART.expenses}
              formatValue={formatCurrency}
              emptyText="No expenses yet"
              total={totals.spent}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ── Forms ─────────────────────────────────────────────────────────────────

// Records a new sale, or — given `sale` — edits that one in place of its
// row in Records. Adding clears the per-sale fields afterwards (size, date
// and payment status stay for the next entry); editing hands the result to
// the parent, which closes the editor.
function SaleForm({ sale, onSubmit, onCancel }) {
  const editing = Boolean(sale);
  const [eggSize, setEggSize] = useState(sale?.eggSize ?? 'Medium');
  const [trays, setTrays] = useState(sale ? String(Math.floor(sale.quantity / TRAY_SIZE)) : '');
  const [pcs, setPcs] = useState(sale ? String(sale.quantity % TRAY_SIZE) : '');
  const [date, setDate] = useState(() => sale?.date ?? getTodayLocal());
  const [isPending, setIsPending] = useState(sale?.status === 'pending');
  const [description, setDescription] = useState(sale?.description ?? '');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useSuccessFlag();

  const q = trayPcsToTotal(trays, pcs) ?? 0;
  const pricing = useSalePricing(q, sale);
  const total = Number(pricing.total);
  const hasTotal = pricing.total !== '' && Number.isFinite(total) && total >= 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    const quantity = trayPcsToTotal(trays, pcs);
    if (quantity === null || quantity <= 0) { setFormError('Enter a quantity greater than 0 (trays and/or pcs).'); return; }
    const pricePerEgg = Number(pricing.perEgg);
    if (pricing.perEgg === '' || !Number.isFinite(pricePerEgg) || pricePerEgg < 0) { setFormError('Enter a valid price of 0 or more.'); return; }
    if (!hasTotal || total >= 1e18) { setFormError('Enter a valid sale total.'); return; }
    if (!date) { setFormError('Select a date.'); return; }
    setFormError('');
    setSuccess(false);
    setSaving(true);
    const note = description.trim();
    try {
      await onSubmit({
        eggSize, quantity, date, pricePerEgg, totalPrice: total,
        status: isPending ? 'pending' : 'paid',
        // A new sale simply omits an empty note; an edit sends null so a
        // note that was there gets cleared.
        description: note || (editing ? null : undefined),
      });
      if (!editing) {
        setTrays('');
        setPcs('');
        pricing.reset();
        setDescription('');
        setSuccess(true);
      }
    } catch (err) {
      setFormError(api.errorMessage(err, editing ? 'Could not update this sale. Please try again.' : 'Could not save your sale. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`eggy-card p-5 ${editing ? 'eggy-rise' : ''}`} style={editing ? { borderColor: COLORS.yolk, boxShadow: ELEVATION.lg } : undefined}>
      <FormTitle icon={editing ? Pencil : Plus} color={COLORS.moss}>{editing ? 'Edit Sale' : 'Record a Sale'}</FormTitle>
      <form onSubmit={handleSubmit}>
        <fieldset disabled={saving} className="eggy-form-flow space-y-4">
          <ChipGroup label="Egg size" options={EGG_SIZES} value={eggSize} onChange={setEggSize} shortLabels={EGG_SIZE_SHORT} />
          <TrayPcsField label="Quantity" trays={trays} pcs={pcs} onTraysChange={setTrays} onPcsChange={setPcs} />
          <PriceField
            quantity={q}
            perUnit={pricing.perEgg}
            perTray={pricing.perTray}
            total={pricing.total}
            onPerUnitChange={pricing.changePerEgg}
            onPerTrayChange={pricing.changePerTray}
            onTotalChange={pricing.changeTotal}
            perUnitCaption="Per egg"
            totalCaption="Total sale"
          />
          <div>
            <span className="eggy-label">Payment</span>
            <SegmentedControl
              options={PAYMENT_OPTIONS}
              value={isPending ? 'pending' : 'paid'}
              onChange={(next) => setIsPending(next === 'pending')}
              label="Payment status"
              className="w-full [&_.eggy-segment-item]:py-2 [&_.eggy-segment-item]:text-sm"
            />
            {isPending && (
              <p className="eggy-hint eggy-fade-in">
                The customer took the eggs but hasn&apos;t paid yet. It won&apos;t count as revenue until you mark it paid in Records.
              </p>
            )}
          </div>
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClasses} />
          </Field>
          <Field label="Description (optional)">
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="e.g. sold to Aling Nena" className={inputClasses} />
          </Field>
          {formError && <p role="alert" className="text-sm text-brick">{formError}</p>}
          {!editing && <SaveFeedback visible={success}>{isPending ? 'Pending sale recorded.' : 'Sale recorded.'}</SaveFeedback>}
          {editing ? (
            <EditActions saving={saving} onCancel={onCancel} />
          ) : (
            // The button repeats the total being saved, so the amount is
            // confirmed at the moment of tapping — not only up in the field.
            <button type="submit" className={`eggy-btn eggy-focus w-full py-3 text-sm ${isPending ? 'eggy-btn-accent' : 'eggy-btn-primary'}`}>
              {saving ? 'Saving…' : (
                <>
                  {isPending ? 'Add Pending Sale' : 'Add Sale'}
                  {hasTotal && <span className="tabular-nums font-medium opacity-80"> · {formatCurrency(total)}</span>}
                </>
              )}
            </button>
          )}
        </fieldset>
      </form>
    </section>
  );
}

// Same pattern as SaleForm, for expenses: per-item price and total stay
// linked, so either can be typed.
function ExpenseForm({ expense, onSubmit, onCancel }) {
  const editing = Boolean(expense);
  const [item, setItem] = useState(expense?.item ?? 'Feeds');
  const [quantity, setQuantity] = useState(expense ? String(expense.quantity) : '');
  const [date, setDate] = useState(() => expense?.date ?? getTodayLocal());
  const [perUnitPrice, setPerUnitPrice] = useState(expense ? expense.price.toFixed(2) : '');
  const [totalPrice, setTotalPrice] = useState(expense ? (expense.quantity * expense.price).toFixed(2) : '');
  const [description, setDescription] = useState(expense?.description ?? '');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useSuccessFlag();

  const q = Number(quantity) || 0;
  const total = Number(totalPrice);
  const hasTotal = totalPrice !== '' && Number.isFinite(total) && total >= 0;

  function handlePerUnitChange(value) {
    setPerUnitPrice(value);
    if (value === '') { setTotalPrice(''); return; }
    const num = Number(value);
    if (q > 0 && Number.isFinite(num) && num >= 0) setTotalPrice((num * q).toFixed(2));
  }

  function handleTotalChange(value) {
    setTotalPrice(value);
    if (value === '') { setPerUnitPrice(''); return; }
    const num = Number(value);
    if (q > 0 && Number.isFinite(num) && num >= 0) setPerUnitPrice((num / q).toFixed(2));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    if (!Number.isSafeInteger(q) || q <= 0) { setFormError('Enter a whole-number quantity greater than 0.'); return; }
    const pricePerItem = Number(perUnitPrice);
    if (perUnitPrice === '' || !Number.isFinite(pricePerItem) || pricePerItem < 0) { setFormError('Enter a valid price of 0 or more.'); return; }
    if (!date) { setFormError('Select a date.'); return; }
    setFormError('');
    setSuccess(false);
    setSaving(true);
    const note = description.trim();
    try {
      await onSubmit({ item, quantity: q, date, price: pricePerItem, description: note || (editing ? null : undefined) });
      if (!editing) {
        setQuantity('');
        setPerUnitPrice('');
        setTotalPrice('');
        setDescription('');
        setSuccess(true);
      }
    } catch (err) {
      setFormError(api.errorMessage(err, editing ? 'Could not update this expense. Please try again.' : 'Could not save your expense. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`eggy-card p-5 ${editing ? 'eggy-rise' : ''}`} style={editing ? { borderColor: COLORS.yolk, boxShadow: ELEVATION.lg } : undefined}>
      <FormTitle icon={editing ? Pencil : Wallet} color={COLORS.brick}>{editing ? 'Edit Expense' : 'Record an Expense'}</FormTitle>
      <form onSubmit={handleSubmit}>
        <fieldset disabled={saving} className="eggy-form-flow space-y-4">
          <ChipGroup label="Item" options={EXPENSE_ITEMS} value={item} onChange={setItem} />
          <Field label="Quantity">
            <input {...WHOLE_NUMBER_INPUT} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 2" className={`${inputClasses} tabular-nums`} />
          </Field>
          <PriceField
            quantity={q}
            perUnit={perUnitPrice}
            total={totalPrice}
            onPerUnitChange={handlePerUnitChange}
            onTotalChange={handleTotalChange}
            perUnitCaption="Per item"
            totalCaption="Total cost"
          />
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClasses} />
          </Field>
          <Field label="Description (optional)">
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="e.g. 50kg layer feed from Cruz Agrivet" className={inputClasses} />
          </Field>
          {formError && <p role="alert" className="text-sm text-brick">{formError}</p>}
          {!editing && <SaveFeedback visible={success}>Expense recorded.</SaveFeedback>}
          {editing ? (
            <EditActions saving={saving} onCancel={onCancel} />
          ) : (
            <button type="submit" className="eggy-btn eggy-btn-primary eggy-focus w-full py-3 text-sm">
              {saving ? 'Saving…' : (
                <>
                  Add Expense
                  {hasTotal && <span className="tabular-nums font-medium opacity-80"> · {formatCurrency(total)}</span>}
                </>
              )}
            </button>
          )}
        </fieldset>
      </form>
    </section>
  );
}

function AddHarvestForm({ onSubmit }) {
  const [harvestedTrays, setHarvestedTrays] = useState('');
  const [harvestedPcs, setHarvestedPcs] = useState('');
  const [rejectedTrays, setRejectedTrays] = useState('');
  const [rejectedPcs, setRejectedPcs] = useState('');
  const [date, setDate] = useState(getTodayLocal);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useSuccessFlag();

  const harvested = trayPcsToTotal(harvestedTrays, harvestedPcs);
  const rejected = trayPcsToTotal(rejectedTrays, rejectedPcs);
  const good = harvested !== null && rejected !== null && harvested > 0 && rejected <= harvested ? harvested - rejected : null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    if (harvested === null) { setFormError('Enter a valid number of trays/pcs harvested (0 or more).'); return; }
    if (rejected === null) { setFormError('Enter a valid number of trays/pcs rejected (0 or more).'); return; }
    if (rejected > harvested) { setFormError('Rejected eggs cannot exceed harvested eggs.'); return; }
    if (!date) { setFormError('Select a date.'); return; }
    setFormError('');
    setSuccess(false);
    setSaving(true);
    try {
      await onSubmit({ harvested, rejected, date });
      setHarvestedTrays('');
      setHarvestedPcs('');
      setRejectedTrays('');
      setRejectedPcs('');
      setSuccess(true);
    } catch (err) {
      setFormError(api.errorMessage(err, 'Could not save your harvest. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="eggy-card p-5">
      <FormTitle icon={Egg} color={COLORS.yolkDeep}>Record a Harvest</FormTitle>
      <form onSubmit={handleSubmit}>
        <fieldset disabled={saving} className="eggy-form-flow space-y-4">
          <TrayPcsField label="Eggs harvested" trays={harvestedTrays} pcs={harvestedPcs} onTraysChange={setHarvestedTrays} onPcsChange={setHarvestedPcs} />
          <TrayPcsField label="Eggs rejected" trays={rejectedTrays} pcs={rejectedPcs} onTraysChange={setRejectedTrays} onPcsChange={setRejectedPcs} />
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClasses} />
          </Field>
          {formError && <p role="alert" className="text-sm text-brick">{formError}</p>}
          <SaveFeedback visible={success}>Harvest recorded.</SaveFeedback>
          <button type="submit" className="eggy-btn eggy-btn-primary eggy-focus w-full py-3 text-sm">
            {saving ? 'Saving…' : (
              <>
                Add Harvest
                {good !== null && <span className="tabular-nums font-medium opacity-80"> · {formatCount(good)} good</span>}
              </>
            )}
          </button>
        </fieldset>
      </form>
    </section>
  );
}

// ── Records ───────────────────────────────────────────────────────────────

function EmptyRecords({ text }) {
  return (
    <div className="eggy-card p-10 text-center">
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}

// Memoized, and every callback takes the row's id, so a row only re-renders
// when something it shows actually changed (its own confirm/saving state),
// not every time a sibling does.
const RecordRow = memo(function RecordRow({
  id, title, subtitle, description, amount, amountColor, accent, pending, confirming, removing, busy, delay = 0,
  onEdit, onRequestDelete, onConfirmDelete, onCancelDelete, onMarkPaid,
}) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      layout="position"
      className="eggy-card-flush eggy-card-interactive px-4 py-3"
      aria-busy={busy || removing}
      initial={{ opacity: reducedMotion ? 1 : 0, y: reducedMotion ? 0 : 6 }}
      animate={{ opacity: 1, y: 0, transition: { duration: reducedMotion ? 0 : 0.31, delay: reducedMotion ? 0 : delay / 1000 } }}
      exit={{ opacity: 0, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0, transition: { duration: reducedMotion ? 0 : 0.26 } }}
      transition={{ layout: reducedMotion ? { duration: 0 } : SPRING }}
      style={{
        overflow: 'hidden',
        // A colour-coded edge on the left makes money-in vs money-out
        // scannable down the list without reading a single figure.
        borderLeft: `3px solid ${accent}`,
      }}
    >
      {/* The text column gets the full remaining width; the amount and the
          two small icon actions stack in a narrow column on the right. They
          used to share the title's line, which squeezed titles like "Extra
          Large · 520 eggs" onto two lines on a phone. */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-semibold text-[15px] leading-snug text-ink">{title}</p>
            {pending && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 uppercase tracking-[0.06em] text-pending bg-[#E5A62E26]">
                Unpaid
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5 text-muted tabular-nums">{subtitle}</p>
          {description && <p className="text-xs mt-1.5 pl-2 text-ink-soft border-l-2 border-hairline">{description}</p>}
        </div>
        <div className="shrink-0 flex flex-col items-end">
          <span className="font-semibold text-base leading-snug tabular-nums" style={{ color: amountColor }}>{amount}</span>
          {!confirming && (
            <fieldset disabled={busy || removing} className="flex items-center -mr-2 -mb-1.5 mt-0.5">
              {onEdit && (
                <button type="button" onClick={() => onEdit(id)} aria-label="Edit entry" className="eggy-icon-btn eggy-focus">
                  <Pencil size={16} />
                </button>
              )}
              <button type="button" onClick={() => onRequestDelete(id)} aria-label="Delete entry" className="eggy-icon-btn eggy-icon-btn-danger eggy-focus">
                <Trash2 size={16} />
              </button>
            </fieldset>
          )}
        </div>
      </div>
      {confirming ? (
        // Says what's about to happen, right on the row it applies to.
        <fieldset disabled={removing} className="mt-2.5 flex items-center gap-2">
          <span className="text-xs mr-auto font-medium text-brick">Delete this entry?</span>
          <button type="button" onClick={() => onConfirmDelete(id)} className="eggy-btn eggy-btn-danger eggy-focus text-xs px-3 py-1.5">
            {removing ? 'Deleting…' : 'Delete'}
          </button>
          <button type="button" onClick={onCancelDelete} className="eggy-btn eggy-btn-quiet eggy-focus text-xs px-3 py-1.5">
            Cancel
          </button>
        </fieldset>
      ) : pending && onMarkPaid ? (
        // Only unpaid sales carry an inline status button: settling one is
        // the action that actually gets taken. The reverse (marking a paid
        // sale unpaid) is rare and lives in Edit.
        <fieldset disabled={busy || removing} className="mt-2.5">
          <button
            type="button"
            onClick={() => onMarkPaid(id)}
            className="eggy-btn eggy-btn-accent eggy-focus w-full py-2 text-sm flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 size={16} />
            {busy ? 'Saving…' : 'Mark as paid'}
          </button>
        </fieldset>
      ) : null}
    </motion.div>
  );
});

function RecordsView({ sales, expenses, harvests, onDeleteSale, onDeleteExpense, onDeleteHarvest, onUpdateSaleStatus, onUpdateSale, onUpdateExpense }) {
  const [subTab, setSubTab] = useState('sales');
  const [direction, setDirection] = useState(1);
  const [confirmId, setConfirmId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [workingIds, setWorkingIds] = useState(() => new Set());
  const [actionError, setActionError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [saleSearch, setSaleSearch] = useState('');
  const [saleStatusFilter, setSaleStatusFilter] = useState('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const sortedSales = useMemo(() => sortByRecentlyAdded(sales), [sales]);
  const sortedExpenses = useMemo(() => sortByRecentlyAdded(expenses), [expenses]);
  const sortedHarvests = useMemo(() => sortByRecentlyAdded(harvests), [harvests]);
  const unpaidCount = useMemo(() => sales.reduce((n, s) => n + (s.status === 'pending' ? 1 : 0), 0), [sales]);

  // Records saved before the status field existed (or a sale marked as
  // settled) come through with `status` unset, not `'paid'` — treat unset
  // the same as paid, matching the `paidSales` split used on the dashboard.
  const filteredSales = useMemo(() => {
    const query = saleSearch.trim().toLowerCase();
    return sortedSales.filter((s) => {
      const isPending = s.status === 'pending';
      const matchesStatus = saleStatusFilter === 'all' || (saleStatusFilter === 'pending' ? isPending : !isPending);
      const matchesSearch = query === '' || (s.description || '').toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [sortedSales, saleSearch, saleStatusFilter]);

  const list = subTab === 'sales' ? filteredSales : subTab === 'expenses' ? sortedExpenses : sortedHarvests;
  const visible = list.slice(0, visibleCount);
  const currentYear = new Date().getFullYear();

  // Stable handlers (they take the row's id) so memoized rows stay put.
  const deleteRecord = { sales: onDeleteSale, expenses: onDeleteExpense, harvests: onDeleteHarvest }[subTab];
  const requestDelete = useCallback((id) => { setEditingId(null); setConfirmId(id); }, []);
  const cancelDelete = useCallback(() => setConfirmId(null), []);
  const startEdit = useCallback((id) => { setConfirmId(null); setEditingId(id); }, []);
  const confirmDelete = useCallback(async (id) => {
    setActionError('');
    setRemovingId(id);
    try {
      await deleteRecord(id);
      setConfirmId(null);
    } catch (err) {
      setActionError(api.errorMessage(err, 'Could not delete this entry. Please try again.'));
    } finally {
      setRemovingId(null);
    }
  }, [deleteRecord]);
  const markPaid = useCallback(async (id) => {
    setActionError('');
    setWorkingIds((previous) => new Set([...previous, id]));
    try {
      await onUpdateSaleStatus(id, 'paid');
    } catch (err) {
      setActionError(api.errorMessage(err, 'Could not update this sale. Please try again.'));
    } finally {
      setWorkingIds((previous) => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
    }
  }, [onUpdateSaleStatus]);

  function changeSubTab(next) {
    setDirection(RECORD_TABS.indexOf(next) > RECORD_TABS.indexOf(subTab) ? 1 : -1);
    setSubTab(next);
    setConfirmId(null);
    setEditingId(null);
    setVisibleCount(PAGE_SIZE);
  }

  function renderRow(record, index) {
    // Rows revealed by "Show more" cascade in from the top of their batch.
    const delay = rowDelay(index % PAGE_SIZE);
    const shared = {
      id: record.id,
      delay,
      confirming: confirmId === record.id,
      removing: removingId === record.id,
      onRequestDelete: requestDelete,
      onConfirmDelete: confirmDelete,
      onCancelDelete: cancelDelete,
    };
    if (subTab === 'sales') {
      if (editingId === record.id) {
        return (
          <SaleForm
            key={record.id}
            sale={record}
            onSubmit={async (fields) => { await onUpdateSale(record.id, fields); setEditingId(null); }}
            onCancel={() => setEditingId(null)}
          />
        );
      }
      const pending = record.status === 'pending';
      return (
        <RecordRow
          key={record.id}
          {...shared}
          title={`${record.eggSize} · ${formatTrays(record.quantity)}`}
          subtitle={`${formatShortDate(record.date, currentYear)} · ${formatEggs(record.quantity)} · ${formatCurrency(record.pricePerEgg)}/egg`}
          description={record.description}
          amount={formatCurrency(saleTotal(record))}
          amountColor={pending ? COLORS.pending : COLORS.moss}
          accent={pending ? COLORS.yolk : COLORS.moss}
          pending={pending}
          busy={workingIds.has(record.id)}
          onEdit={startEdit}
          onMarkPaid={markPaid}
        />
      );
    }
    if (subTab === 'expenses') {
      if (editingId === record.id) {
        return (
          <ExpenseForm
            key={record.id}
            expense={record}
            onSubmit={async (fields) => { await onUpdateExpense(record.id, fields); setEditingId(null); }}
            onCancel={() => setEditingId(null)}
          />
        );
      }
      return (
        <RecordRow
          key={record.id}
          {...shared}
          title={`${record.item} · ${record.quantity}×`}
          subtitle={`${formatShortDate(record.date, currentYear)} · ${formatCurrency(record.price)} each`}
          description={record.description}
          amount={formatCurrency(expenseTotal(record))}
          amountColor={COLORS.brick}
          accent={COLORS.brick}
          onEdit={startEdit}
        />
      );
    }
    return (
      <RecordRow
        key={record.id}
        {...shared}
        title={`${formatEggs(record.harvested)} harvested`}
        subtitle={`${formatShortDate(record.date, currentYear)} · ${formatCount(record.rejected)} rejected`}
        amount={`${formatCount(record.harvested - record.rejected)} good`}
        amountColor={COLORS.moss}
        accent={COLORS.moss}
      />
    );
  }

  const emptyText = {
    sales: sortedSales.length === 0 ? 'No sales recorded yet.' : 'No sales match your search.',
    expenses: 'No expenses recorded yet.',
    harvests: 'No harvests recorded yet.',
  }[subTab];

  return (
    <div className="space-y-3">
      {actionError && <ErrorBanner message={actionError} onClose={() => setActionError('')} />}
      {/* Sticky just under the header, so you can switch ledgers without
          scrolling back up through forty-odd rows first. */}
      <SegmentedControl
        className="eggy-record-segment sticky top-16 z-10"
        style={{ boxShadow: ELEVATION.sm }}
        label="Record type"
        value={subTab}
        onChange={changeSubTab}
        options={[
          { id: 'sales', label: 'Sales', count: sales.length },
          { id: 'expenses', label: 'Expenses', count: expenses.length },
          { id: 'harvests', label: 'Harvests', count: harvests.length },
        ]}
      />

      <ScreenTransition viewKey={subTab} direction={direction}>
        <div className="space-y-3">
          {subTab === 'sales' && sales.length > 0 && (
            <div className="space-y-2">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted" />
                <input
                  type="search"
                  value={saleSearch}
                  onChange={(e) => { setSaleSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
                  placeholder="Search description…"
                  aria-label="Search sales by description"
                  className={`${inputClasses} pl-9 ${saleSearch ? 'pr-10' : ''} [&::-webkit-search-cancel-button]:appearance-none`}
                />
                {saleSearch && (
                  <button
                    type="button"
                    onClick={() => { setSaleSearch(''); setVisibleCount(PAGE_SIZE); }}
                    aria-label="Clear search"
                    className="eggy-icon-btn eggy-focus absolute right-1 top-1/2 -translate-y-1/2"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              {/* One tap per filter, with counts, instead of a dropdown —
                  "Unpaid (3)" also answers "who still owes us?" at a glance. */}
              <SegmentedControl
                label="Filter sales by status"
                value={saleStatusFilter}
                onChange={(next) => { setSaleStatusFilter(next); setVisibleCount(PAGE_SIZE); }}
                options={[
                  { id: 'all', label: 'All', count: sales.length },
                  { id: 'paid', label: 'Paid', count: sales.length - unpaidCount },
                  { id: 'pending', label: 'Unpaid', count: unpaidCount },
                ]}
              />
            </div>
          )}

          {list.length === 0 ? (
            <EmptyRecords text={emptyText} />
          ) : (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {visible.map(renderRow)}
              </AnimatePresence>
            </div>
          )}

          {list.length > visibleCount && (
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              className="eggy-btn eggy-btn-quiet eggy-focus w-full py-3 text-sm"
            >
              Show {Math.min(PAGE_SIZE, list.length - visibleCount)} more
              <span className="font-normal text-muted"> · {visibleCount} of {list.length}</span>
            </button>
          )}
        </div>
      </ScreenTransition>
    </div>
  );
}

// ── Navigation & shell ────────────────────────────────────────────────────

const TABS = [
  // Short labels: five cells across a 390px phone gives each ~78px. The
  // icon already carries the "add" sense, so the noun alone is enough — the
  // full phrasing stays on aria-label for screen readers.
  { id: 'dashboard', label: 'Home', title: 'Dashboard', icon: LayoutDashboard },
  { id: 'addSale', label: 'Sale', title: 'Add Sale', icon: Plus },
  { id: 'addExpense', label: 'Expense', title: 'Add Expense', icon: Wallet },
  { id: 'addHarvest', label: 'Harvest', title: 'Add Harvest', icon: Egg },
  { id: 'records', label: 'Records', title: 'Records', icon: ClipboardList },
];

const TabBar = memo(function TabBar({ tab, onSelect }) {
  const reducedMotion = useReducedMotion();
  return (
    <LayoutGroup id="main-navigation">
      <motion.nav layoutRoot aria-label="Main navigation" className="eggy-tabbar fixed bottom-0 left-0 right-0 z-20">
        <div className="max-w-4xl mx-auto grid grid-cols-5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t.id)}
                aria-label={t.title}
                aria-current={active ? 'page' : undefined}
                className={`eggy-tab eggy-focus flex flex-col items-center gap-1 pt-2 pb-2.5 px-1 text-[11px] font-medium ${active ? 'is-active' : ''}`}
              >
                <span className="eggy-tab-icon relative isolate flex items-center justify-center">
                  {active && (
                    <motion.span
                      layoutId="active-tab"
                      className="eggy-tab-selection"
                      transition={reducedMotion ? { duration: 0 } : SPRING}
                      aria-hidden="true"
                    />
                  )}
                  <Icon size={19} strokeWidth={active ? 2.4 : 2} />
                </span>
                <span className="truncate max-w-full">{t.label}</span>
              </button>
            );
          })}
        </div>
      </motion.nav>
    </LayoutGroup>
  );
});

// A skeleton of the real layout rather than a lone spinner: it shows the
// shape of what's coming, so the first paint doesn't jump when data lands.
// Also used by App while it checks the login, so app start is one
// continuous placeholder instead of a spinner followed by a skeleton.
export function DashboardSkeleton({ username }) {
  return (
    <div className="min-h-screen pb-28 bg-paper" aria-busy="true">
      <Header username={username} />
      <main className="max-w-4xl mx-auto px-4 pt-4 space-y-4">
        <div className="eggy-card overflow-hidden">
          <div className="p-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="eggy-skeleton rounded-full" style={{ width: 44, height: 44 }} />
              <div className="eggy-skeleton h-3 w-24" />
            </div>
            <div className="eggy-skeleton h-9 w-52 mt-4" />
          </div>
          <div className="grid grid-cols-2 border-t border-hairline">
            {[0, 1].map((i) => (
              <div key={i} className={`px-5 py-3 ${i ? 'border-l border-hairline' : ''}`}>
                <div className="eggy-skeleton h-2.5 w-16" />
                <div className="eggy-skeleton h-4 w-24 mt-2" />
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="eggy-card p-4">
              <div className="flex items-center gap-2.5">
                <div className="eggy-skeleton rounded-full" style={{ width: 32, height: 32 }} />
                <div className="eggy-skeleton h-2.5 w-16" />
              </div>
              <div className="eggy-skeleton h-5 w-24 mt-3" />
            </div>
          ))}
        </div>
        <div className="eggy-card p-5">
          <div className="eggy-skeleton h-4 w-40 mb-4" />
          <div className="eggy-skeleton w-full" style={{ height: CHART.height }} />
        </div>
      </main>
    </div>
  );
}

export default function EggFarmDashboard({ username, onLogout, initialLedger }) {
  const {
    sales, expenses, harvests, loading, error, syncStatus, clearError, retry,
    addSale, updateSale, updateSaleStatus, deleteSale,
    addExpense, updateExpense, deleteExpense, addHarvest, deleteHarvest,
  } = useLedger(initialLedger);
  const [tab, setTab] = useState('dashboard');
  const [direction, setDirection] = useState(1);
  const [granularity, setGranularity] = useState('daily');
  const [avgGranularity, setAvgGranularity] = useState('daily');
  const [avgPeriodValue, setAvgPeriodValue] = useState(() => getPeriodDefaultValue('daily'));

  // Switching modes (Day/Week/Month/Year) resets the picker to "now" in
  // that mode, rather than leaving it on a value that no longer makes
  // sense (e.g. a leftover week string after switching to Year).
  const handleAvgGranularityChange = useCallback((g) => {
    setAvgGranularity(g);
    setAvgPeriodValue(getPeriodDefaultValue(g));
  }, []);

  const selectTab = useCallback((next) => {
    if (next === tab) return;
    setDirection(TAB_ORDER.indexOf(next) > TAB_ORDER.indexOf(tab) ? 1 : -1);
    setTab(next);
  }, [tab]);

  // Pending (utang) sales aren't real revenue yet — exclude them from every
  // stat/chart so the dashboard only reflects money actually received.
  // They still appear in Records so they can be tracked and paid.
  const paidSales = useMemo(() => sales.filter((s) => s.status !== 'pending'), [sales]);

  const availableYears = useMemo(() => {
    const years = new Set([String(new Date().getFullYear())]);
    sales.forEach((s) => years.add(s.date.slice(0, 4)));
    expenses.forEach((e) => years.add(e.date.slice(0, 4)));
    harvests.forEach((h) => years.add(h.date.slice(0, 4)));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [sales, expenses, harvests]);

  if (loading) return <DashboardSkeleton username={username} />;

  return (
    <div className="min-h-screen pb-28 bg-paper text-ink">
      <Header username={username} onLogout={onLogout} />
      <main className="max-w-4xl mx-auto px-4 pt-4">
        <SyncBanner status={syncStatus} />
        {error && <ErrorBanner message={error} onClose={clearError} onRetry={retry} />}
        <ScreenTransition viewKey={tab} direction={direction} resetScroll>
          {tab === 'dashboard' && (
            <DashboardView
              sales={sales}
              paidSales={paidSales}
              expenses={expenses}
              harvests={harvests}
              granularity={granularity}
              onGranularityChange={setGranularity}
              avgGranularity={avgGranularity}
              onAvgGranularityChange={handleAvgGranularityChange}
              avgPeriodValue={avgPeriodValue}
              onAvgPeriodValueChange={setAvgPeriodValue}
              availableYears={availableYears}
            />
          )}
          {tab === 'addSale' && <SaleForm onSubmit={addSale} />}
          {tab === 'addExpense' && <ExpenseForm onSubmit={addExpense} />}
          {tab === 'addHarvest' && <AddHarvestForm onSubmit={addHarvest} />}
          {tab === 'records' && (
            <RecordsView
              sales={sales}
              expenses={expenses}
              harvests={harvests}
              onDeleteSale={deleteSale}
              onDeleteExpense={deleteExpense}
              onDeleteHarvest={deleteHarvest}
              onUpdateSaleStatus={updateSaleStatus}
              onUpdateSale={updateSale}
              onUpdateExpense={updateExpense}
            />
          )}
        </ScreenTransition>
      </main>
      <TabBar tab={tab} onSelect={selectTab} />
    </div>
  );
}
