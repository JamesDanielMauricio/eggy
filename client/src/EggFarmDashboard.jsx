import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  DollarSign, TrendingUp, TrendingDown, Receipt, Plus, Trash2,
  LayoutDashboard, ClipboardList, Wallet, Loader2, Egg, EggOff, LogOut,
  CheckCircle2,
} from 'lucide-react';
import * as api from './lib/api';
import { COLORS, FONT_DISPLAY, FONT_BODY, inputClasses, inputStyle } from './lib/theme';

const EGG_SIZES = ['Extra Small', 'Small', 'Medium', 'Large', 'Extra Large', 'Jumbo', 'Reject'];
const EXPENSE_ITEMS = ['Feeds', 'Fly Trap', 'Medicines/Vitamins', 'Others'];
const CURRENCY = '₱';

const EGG_SIZE_COLORS = {
  'Extra Small': '#F3D48A',
  'Small': '#E9BB56',
  'Medium': '#E5A62E',
  'Large': '#B97D28',
  'Extra Large': '#7A4F1E',
  'Jumbo': '#4F2F13',
  'Reject': '#8B8577',
};

const EXPENSE_COLORS = {
  'Feeds': '#6B8E4E',
  'Fly Trap': '#4E7A8C',
  'Medicines/Vitamins': '#9B4433',
  'Others': '#8C8272',
};

const PERIOD_LIMITS = { daily: 30, weekly: 12, monthly: 12, yearly: 6 };
const TRAY_SIZE = 30;

// Blank fields default to 0 (a partial "3 trays, no loose pcs" entry is
// normal), but a genuinely invalid number (negative, non-integer) returns
// null so the caller can reject it instead of silently treating it as 0.
function trayPcsToTotal(trays, pcs) {
  const t = trays === '' ? 0 : Number(trays);
  const p = pcs === '' ? 0 : Number(pcs);
  if (!Number.isInteger(t) || t < 0 || !Number.isInteger(p) || p < 0) return null;
  return t * TRAY_SIZE + p;
}

function parseDateLocal(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getTodayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatCurrency(amount) {
  const val = amount || 0;
  const sign = val < 0 ? '-' : '';
  const abs = Math.abs(val);
  return `${sign}${CURRENCY}${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateDisplay(dateStr) {
  return parseDateLocal(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getWeekKey(dateStr) {
  const d = parseDateLocal(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.getFullYear(), d.getMonth(), diff);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const dd = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function getPeriodKey(dateStr, granularity) {
  if (granularity === 'daily') return dateStr;
  if (granularity === 'weekly') return getWeekKey(dateStr);
  if (granularity === 'monthly') return dateStr.slice(0, 7);
  return dateStr.slice(0, 4);
}

function formatPeriodLabel(key, granularity) {
  if (granularity === 'daily' || granularity === 'weekly') {
    return parseDateLocal(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (granularity === 'monthly') {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  return key;
}

function aggregateByPeriod(sales, expenses, granularity) {
  const groups = {};
  sales.forEach((s) => {
    const key = getPeriodKey(s.date, granularity);
    if (!groups[key]) groups[key] = { key, revenue: 0, quantity: 0, expenses: 0 };
    groups[key].revenue += s.quantity * s.pricePerEgg;
    groups[key].quantity += s.quantity;
  });
  expenses.forEach((e) => {
    const key = getPeriodKey(e.date, granularity);
    if (!groups[key]) groups[key] = { key, revenue: 0, quantity: 0, expenses: 0 };
    groups[key].expenses += e.quantity * e.price;
  });
  const sorted = Object.values(groups).sort((a, b) => a.key.localeCompare(b.key));
  const limited = sorted.slice(-PERIOD_LIMITS[granularity]);
  return limited.map((g) => ({ ...g, label: formatPeriodLabel(g.key, granularity), profit: g.revenue - g.expenses }));
}

// ISO 8601 weeks start Monday and week 1 is whichever week contains
// Jan 4th. Needed to translate the browser's native <input type="week">
// value ("2026-W07") into the same Monday-keyed grouping getWeekKey
// already uses everywhere else in this file, so period filtering lines
// up with how the trend chart buckets weeks.
function isoWeekValueToMonday(weekValue) {
  const [yearStr, weekStr] = weekValue.split('-W');
  const year = Number(yearStr);
  const week = Number(weekStr);
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const week1Monday = new Date(year, 0, 4 - jan4Day + 1);
  const monday = new Date(week1Monday.getFullYear(), week1Monday.getMonth(), week1Monday.getDate() + (week - 1) * 7);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getCurrentISOWeekValue() {
  const today = new Date();
  const day = today.getDay() || 7;
  const thursday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 4 - day);
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
  return `${thursday.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// Default picker value for each mode, so switching granularity always
// lands on "now" (today / this week / this month / this year) instead of
// an empty picker.
function getPeriodDefaultValue(granularity) {
  if (granularity === 'daily') return getTodayLocal();
  if (granularity === 'weekly') return getCurrentISOWeekValue();
  if (granularity === 'monthly') return getTodayLocal().slice(0, 7);
  return getTodayLocal().slice(0, 4);
}

function isInSelectedPeriod(dateStr, granularity, periodValue) {
  if (!periodValue) return false;
  if (granularity === 'daily') return dateStr === periodValue;
  if (granularity === 'weekly') return getWeekKey(dateStr) === isoWeekValueToMonday(periodValue);
  if (granularity === 'monthly') return dateStr.slice(0, 7) === periodValue;
  return dateStr.slice(0, 4) === periodValue;
}

function formatSelectedPeriodLabel(granularity, periodValue) {
  if (!periodValue) return '';
  if (granularity === 'daily') return formatDateDisplay(periodValue);
  if (granularity === 'weekly') return `Week of ${formatDateDisplay(isoWeekValueToMonday(periodValue))}`;
  if (granularity === 'monthly') {
    const [y, m] = periodValue.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  return periodValue;
}

function aggregateBy(items, keyFn, valueFn) {
  const groups = {};
  items.forEach((item) => {
    const key = keyFn(item);
    groups[key] = (groups[key] || 0) + valueFn(item);
  });
  return Object.entries(groups).map(([name, value]) => ({ name, value }));
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium mb-1" style={{ color: COLORS.inkSoft, fontFamily: FONT_BODY }}>{label}</span>
      {children}
    </label>
  );
}

// Lets a count be entered as whole trays + loose pcs instead of one number
// the user has to multiply out by hand first (e.g. "3 trays and 10 pcs"
// instead of pre-computing 3*30+10=100).
function TrayPcsField({ label, trays, pcs, onTraysChange, onPcsChange, unitLabel = 'eggs' }) {
  const total = trayPcsToTotal(trays, pcs);
  const hasValue = trays !== '' || pcs !== '';
  return (
    <Field label={label}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <input
            type="number" min="0" step="1"
            value={trays}
            onChange={(e) => onTraysChange(e.target.value)}
            placeholder="0"
            className={inputClasses}
            style={inputStyle}
          />
          <span className="block text-[11px] mt-1" style={{ color: COLORS.muted, fontFamily: FONT_BODY }}>Trays (× {TRAY_SIZE})</span>
        </div>
        <div>
          <input
            type="number" min="0" step="1"
            value={pcs}
            onChange={(e) => onPcsChange(e.target.value)}
            placeholder="0"
            className={inputClasses}
            style={inputStyle}
          />
          <span className="block text-[11px] mt-1" style={{ color: COLORS.muted, fontFamily: FONT_BODY }}>Pcs</span>
        </div>
      </div>
      {hasValue && (
        <p className="text-xs mt-1" style={{ color: COLORS.inkSoft, fontFamily: FONT_BODY }}>
          {total === null ? 'Enter whole numbers, 0 or more.' : `= ${total.toLocaleString()} ${unitLabel}`}
        </p>
      )}
    </Field>
  );
}

function StampBadge({ icon, color, size = 44 }) {
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        border: `2px solid ${color}`,
        boxShadow: `0 0 0 3px ${color}22`,
        color,
        transform: 'rotate(-6deg)',
      }}
    >
      <span style={{ transform: 'rotate(6deg)', display: 'flex' }}>{icon}</span>
    </div>
  );
}

function Header({ username, onLogout }) {
  return (
    <header className="px-4 py-4 shadow-md" style={{ backgroundColor: COLORS.barnwood }}>
      <div className="max-w-4xl mx-auto flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ border: `2px solid ${COLORS.yolk}`, transform: 'rotate(-6deg)' }}
        >
          <span style={{ transform: 'rotate(6deg)' }} className="text-lg">🥚</span>
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight text-white" style={{ fontFamily: FONT_DISPLAY }}>
            Egg Farm Ledger
          </h1>
          <p className="text-xs" style={{ color: COLORS.yolk, fontFamily: FONT_BODY }}>Sales &amp; expense tracker</p>
        </div>
        {onLogout && (
          <div className="flex items-center gap-2">
            {username && (
              <span className="text-xs" style={{ color: COLORS.yolk, fontFamily: FONT_BODY }}>{username}</span>
            )}
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg"
              style={{ color: 'white', border: `1px solid ${COLORS.yolk}66`, fontFamily: FONT_BODY }}
            >
              <LogOut size={14} />
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function ErrorBanner({ message, onClose }) {
  return (
    <div
      className="text-sm rounded-lg px-3 py-2 mb-4 flex items-center justify-between"
      style={{ backgroundColor: '#F7E6E1', border: `1px solid ${COLORS.brick}55`, color: COLORS.brick, fontFamily: FONT_BODY }}
    >
      <span>{message}</span>
      <button type="button" onClick={onClose} className="font-bold px-2">×</button>
    </div>
  );
}

// Shown during a background refresh (see the visibilitychange effect in
// EggFarmDashboard) so a slow one — e.g. Vercel's function and Neon's
// compute both waking up after the PWA sat idle — doesn't look like the
// app is just frozen. 'syncing' only appears after a short delay and
// 'slow' only after a few seconds, so a normal, already-warm refresh
// never flashes anything on screen.
function SyncBanner({ status }) {
  if (status === 'idle') return null;
  const message = status === 'slow'
    ? 'Still syncing — the server may be waking up, this can take a few seconds…'
    : 'Syncing…';
  return (
    <div
      className="text-sm rounded-lg px-3 py-2 mb-4 flex items-center gap-2"
      style={{ backgroundColor: '#EEF1E4', border: `1px solid ${COLORS.moss}55`, color: COLORS.moss, fontFamily: FONT_BODY }}
    >
      <Loader2 size={14} className="animate-spin" />
      <span>{message}</span>
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  return (
    <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.cardBorder}` }}>
      <StampBadge icon={icon} color={color} />
      <p className="text-xs mt-2.5" style={{ color: COLORS.inkSoft, fontFamily: FONT_BODY }}>{label}</p>
      <p className="text-xl font-bold mt-0.5" style={{ color: COLORS.ink, fontFamily: FONT_DISPLAY }}>{value}</p>
    </div>
  );
}

function GranularityToggle({ value, onChange }) {
  const options = [
    { id: 'daily', label: 'Day' },
    { id: 'weekly', label: 'Week' },
    { id: 'monthly', label: 'Month' },
    { id: 'yearly', label: 'Year' },
  ];
  return (
    <div className="flex rounded-lg p-0.5" style={{ backgroundColor: COLORS.paper, border: `1px solid ${COLORS.cardBorder}` }}>
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className="px-2.5 py-1 text-xs font-medium rounded-md transition-colors"
            style={{
              backgroundColor: active ? COLORS.barnwood : 'transparent',
              color: active ? '#FFFFFF' : COLORS.inkSoft,
              fontFamily: FONT_BODY,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function PieCard({ title, data, colors, empty, emptyText, valueFormatter }) {
  return (
    <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.cardBorder}` }}>
      <h2 className="font-semibold mb-3 text-sm" style={{ color: COLORS.ink, fontFamily: FONT_DISPLAY }}>{title}</h2>
      {empty || data.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: COLORS.muted, fontFamily: FONT_BODY }}>{emptyText}</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={70}
              label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={colors[entry.name] || COLORS.muted} />
              ))}
            </Pie>
            <Tooltip formatter={(value, name) => [valueFormatter(value), name]} contentStyle={{ borderRadius: 8, fontSize: 12, fontFamily: FONT_BODY }} />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: FONT_BODY }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// Native picker matching the selected granularity. Note: <input type="week">
// only renders as a real week-picker in Chromium browsers — Firefox and
// Safari fall back to a plain text field there, a known HTML limitation,
// not something fixable from this end without building a custom widget.
function PeriodPicker({ granularity, value, onChange, availableYears }) {
  const style = { ...inputStyle, maxWidth: 200 };
  if (granularity === 'daily') {
    return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputClasses} style={style} />;
  }
  if (granularity === 'weekly') {
    return <input type="week" value={value} onChange={(e) => onChange(e.target.value)} className={inputClasses} style={style} />;
  }
  if (granularity === 'monthly') {
    return <input type="month" value={value} onChange={(e) => onChange(e.target.value)} className={inputClasses} style={style} />;
  }
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClasses} style={style}>
      {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
    </select>
  );
}

// A single selected period reduces to three headline numbers (sales,
// expenses, profit) — a bar chart would just draw one lonely bar per
// category, so this is a small KPI row instead, the same "stamp + label +
// value" language as the StatCards at the top of the dashboard.
function MiniStatTile({ icon, label, value, color }) {
  return (
    <div className="rounded-xl p-3" style={{ backgroundColor: COLORS.paper, border: `1px solid ${COLORS.cardBorder}` }}>
      <StampBadge icon={icon} color={color} size={32} />
      <p className="text-xs mt-2" style={{ color: COLORS.inkSoft, fontFamily: FONT_BODY }}>{label}</p>
      <p className="text-base font-bold mt-0.5 truncate" style={{ color: COLORS.ink, fontFamily: FONT_DISPLAY }}>{value}</p>
    </div>
  );
}

function PeriodAverageCard({
  avgGranularity, onAvgGranularityChange, avgPeriodValue, onAvgPeriodValueChange,
  availableYears, avgPeriodLabel, periodSalesTotal, periodExpensesTotal,
  periodProfit, avgPeriodCounts,
}) {
  const hasData = avgPeriodCounts.expenses > 0 || avgPeriodCounts.sales > 0;

  return (
    <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.cardBorder}` }}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="font-semibold" style={{ color: COLORS.ink, fontFamily: FONT_DISPLAY }}>Period Averages</h2>
        <GranularityToggle value={avgGranularity} onChange={onAvgGranularityChange} />
      </div>
      <div className="mb-3">
        <PeriodPicker granularity={avgGranularity} value={avgPeriodValue} onChange={onAvgPeriodValueChange} availableYears={availableYears} />
      </div>
      {!hasData ? (
        <p className="text-sm py-8 text-center" style={{ color: COLORS.muted, fontFamily: FONT_BODY }}>No entries for this period.</p>
      ) : (
        <>
          <p className="text-xs mb-2" style={{ color: COLORS.inkSoft, fontFamily: FONT_BODY }}>{avgPeriodLabel}</p>
          <div className="grid grid-cols-3 gap-2">
            <MiniStatTile icon={<DollarSign size={16} />} label="Sales" value={formatCurrency(periodSalesTotal)} color={COLORS.moss} />
            <MiniStatTile icon={<Receipt size={16} />} label="Expenses" value={formatCurrency(periodExpensesTotal)} color={COLORS.brick} />
            <MiniStatTile
              icon={periodProfit >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              label="Profit"
              value={formatCurrency(periodProfit)}
              color={periodProfit >= 0 ? COLORS.moss : COLORS.brick}
            />
          </div>
          <p className="text-xs mt-3" style={{ color: COLORS.muted, fontFamily: FONT_BODY }}>
            Based on {avgPeriodCounts.sales} sale{avgPeriodCounts.sales === 1 ? '' : 's'}, {avgPeriodCounts.expenses} expense{avgPeriodCounts.expenses === 1 ? '' : 's'} logged for this period.
          </p>
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl p-8 shadow-sm text-center" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.cardBorder}` }}>
      <span className="text-4xl">🥚</span>
      <p className="font-medium mt-3" style={{ color: COLORS.ink, fontFamily: FONT_DISPLAY }}>No entries yet</p>
      <p className="text-sm mt-1" style={{ color: COLORS.muted, fontFamily: FONT_BODY }}>Add your first sale or expense to see charts here.</p>
    </div>
  );
}

function DashboardView({
  totalRevenue, totalExpenses, netProfit, totalEggs, avgPricePerEgg,
  avgRevenuePerPeriod, granularity, setGranularity, chartData,
  sizeBreakdown, expenseBreakdown, hasSales, hasExpenses,
  avgHarvested, avgRejected,
  avgGranularity, onAvgGranularityChange, avgPeriodValue, onAvgPeriodValueChange,
  availableYears, avgPeriodLabel, periodSalesTotal, periodExpensesTotal,
  periodProfit, avgPeriodCounts,
}) {
  const granularityLabels = { daily: 'Day', weekly: 'Week', monthly: 'Month', yearly: 'Year' };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={<DollarSign size={20} />} label="Total Revenue" value={formatCurrency(totalRevenue)} color={COLORS.moss} />
        <StatCard icon={<Receipt size={20} />} label="Total Expenses" value={formatCurrency(totalExpenses)} color={COLORS.brick} />
        <StatCard
          icon={netProfit >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
          label="Net Profit"
          value={formatCurrency(netProfit)}
          color={netProfit >= 0 ? COLORS.moss : COLORS.brick}
        />
        <StatCard icon={<span className="text-base">🥚</span>} label="Eggs Sold" value={totalEggs.toLocaleString()} color={COLORS.yolk} />
        <StatCard icon={<Egg size={20} />} label="Avg Production" value={`${avgHarvested.toLocaleString()} eggs`} color={COLORS.moss} />
        <StatCard icon={<EggOff size={20} />} label="Avg Rejects" value={`${avgRejected.toLocaleString()} eggs`} color={COLORS.brick} />
      </div>

      {!hasSales && !hasExpenses ? (
        <EmptyState />
      ) : (
        <>
          <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.cardBorder}` }}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="font-semibold" style={{ color: COLORS.ink, fontFamily: FONT_DISPLAY }}>Revenue vs Expenses</h2>
              <GranularityToggle value={granularity} onChange={setGranularity} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs" style={{ color: COLORS.inkSoft, fontFamily: FONT_BODY }}>
              <span>Avg / {granularityLabels[granularity]}: <strong style={{ color: COLORS.ink }}>{formatCurrency(avgRevenuePerPeriod)}</strong></span>
              <span>Avg price/egg: <strong style={{ color: COLORS.ink }}>{formatCurrency(avgPricePerEgg)}</strong></span>
            </div>
            {chartData.length === 0 ? (
              <p className="text-sm py-8 text-center" style={{ color: COLORS.muted, fontFamily: FONT_BODY }}>No data for this view yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cardBorder} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: COLORS.inkSoft, fontFamily: FONT_BODY }} />
                  <YAxis tick={{ fontSize: 11, fill: COLORS.inkSoft, fontFamily: FONT_BODY }} />
                  <Tooltip
                    formatter={(value, name) => [formatCurrency(value), name === 'revenue' ? 'Revenue' : 'Expenses']}
                    contentStyle={{ borderRadius: 8, border: `1px solid ${COLORS.cardBorder}`, fontSize: 12, fontFamily: FONT_BODY }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, fontFamily: FONT_BODY }} formatter={(v) => (v === 'revenue' ? 'Revenue' : 'Expenses')} />
                  <Bar dataKey="revenue" fill={COLORS.moss} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" fill={COLORS.brick} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <PeriodAverageCard
            avgGranularity={avgGranularity}
            onAvgGranularityChange={onAvgGranularityChange}
            avgPeriodValue={avgPeriodValue}
            onAvgPeriodValueChange={onAvgPeriodValueChange}
            availableYears={availableYears}
            avgPeriodLabel={avgPeriodLabel}
            periodSalesTotal={periodSalesTotal}
            periodExpensesTotal={periodExpensesTotal}
            periodProfit={periodProfit}
            avgPeriodCounts={avgPeriodCounts}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PieCard
              title="Sales by Egg Size"
              data={sizeBreakdown}
              colors={EGG_SIZE_COLORS}
              empty={!hasSales}
              emptyText="No sales yet"
              valueFormatter={(v) => `${v.toLocaleString()} eggs`}
            />
            <PieCard
              title="Expenses by Category"
              data={expenseBreakdown}
              colors={EXPENSE_COLORS}
              empty={!hasExpenses}
              emptyText="No expenses yet"
              valueFormatter={formatCurrency}
            />
          </div>
        </>
      )}
    </div>
  );
}

// Two price inputs that stay in sync with each other via the quantity:
// typing a per-unit price fills in the total, typing a total fills in the
// per-unit price — whichever one the user didn't type into is derived, so
// they never have to do that division/multiplication by hand.
function TwoWayPriceField({ label, quantity, perUnit, total, onPerUnitChange, onTotalChange, perUnitCaption, totalCaption }) {
  return (
    <Field label={label}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: COLORS.muted }}>{CURRENCY}</span>
            <input
              type="number" min="0" step="0.01"
              value={perUnit}
              onChange={(e) => onPerUnitChange(e.target.value)}
              placeholder="0.00"
              className={`${inputClasses} pl-7`}
              style={inputStyle}
            />
          </div>
          <span className="block text-[11px] mt-1" style={{ color: COLORS.muted, fontFamily: FONT_BODY }}>{perUnitCaption}</span>
        </div>
        <div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: COLORS.muted }}>{CURRENCY}</span>
            <input
              type="number" min="0" step="0.01"
              value={total}
              onChange={(e) => onTotalChange(e.target.value)}
              placeholder="0.00"
              className={`${inputClasses} pl-7`}
              style={inputStyle}
            />
          </div>
          <span className="block text-[11px] mt-1" style={{ color: COLORS.muted, fontFamily: FONT_BODY }}>{totalCaption}</span>
        </div>
      </div>
      {quantity <= 0 && (
        <p className="text-xs mt-1" style={{ color: COLORS.muted, fontFamily: FONT_BODY }}>Enter a quantity above to auto-fill the other price.</p>
      )}
    </Field>
  );
}

function AddSaleForm({ onSubmit }) {
  const [eggSize, setEggSize] = useState('Medium');
  const [trays, setTrays] = useState('');
  const [pcs, setPcs] = useState('');
  const [date, setDate] = useState(getTodayLocal());
  const [perUnitPrice, setPerUnitPrice] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(false), 2000);
    return () => clearTimeout(t);
  }, [success]);

  const q = trayPcsToTotal(trays, pcs) ?? 0;

  function handlePerUnitChange(value) {
    setPerUnitPrice(value);
    if (value === '') { setTotalPrice(''); return; }
    const num = Number(value);
    if (q > 0 && Number.isFinite(num) && num >= 0) {
      setTotalPrice((num * q).toFixed(2));
    }
  }

  function handleTotalChange(value) {
    setTotalPrice(value);
    if (value === '') { setPerUnitPrice(''); return; }
    const num = Number(value);
    if (q > 0 && Number.isFinite(num) && num >= 0) {
      setPerUnitPrice((num / q).toFixed(2));
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    const quantity = trayPcsToTotal(trays, pcs);
    if (quantity === null || quantity <= 0) { setFormError('Enter a quantity greater than 0 (trays and/or pcs).'); return; }
    const pricePerEgg = Number(perUnitPrice);
    if (!perUnitPrice || pricePerEgg <= 0) { setFormError('Enter a price greater than 0.'); return; }
    if (!date) { setFormError('Select a date.'); return; }
    onSubmit({ eggSize, quantity, date, pricePerEgg, status: isPending ? 'pending' : 'paid' });
    setFormError('');
    setTrays('');
    setPcs('');
    setPerUnitPrice('');
    setTotalPrice('');
    setSuccess(true);
  }

  return (
    <div className="rounded-2xl p-5 shadow-sm" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.cardBorder}` }}>
      <h2 className="font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.ink, fontFamily: FONT_DISPLAY }}>
        <Plus size={16} style={{ color: COLORS.moss }} /> Record a Sale
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Egg size">
          <select value={eggSize} onChange={(e) => setEggSize(e.target.value)} className={inputClasses} style={inputStyle}>
            {EGG_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <TrayPcsField label="Quantity" trays={trays} pcs={pcs} onTraysChange={setTrays} onPcsChange={setPcs} unitLabel="eggs" />
        <TwoWayPriceField
          label="Price"
          quantity={q}
          perUnit={perUnitPrice}
          total={totalPrice}
          onPerUnitChange={handlePerUnitChange}
          onTotalChange={handleTotalChange}
          perUnitCaption="Per egg"
          totalCaption="Total sale"
        />
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClasses} style={inputStyle} />
        </Field>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isPending}
            onChange={(e) => setIsPending(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded"
            style={{ accentColor: COLORS.yolk }}
          />
          <span className="text-sm" style={{ color: COLORS.inkSoft, fontFamily: FONT_BODY }}>
            Pending (utang) — customer took the eggs but hasn't paid yet
          </span>
        </label>
        {formError && <p className="text-sm" style={{ color: COLORS.brick }}>{formError}</p>}
        {success && (
          <div className="flex items-center gap-1.5 eggy-anim-pop-in" style={{ color: COLORS.moss }}>
            <CheckCircle2 size={16} />
            <p className="text-sm font-medium">{isPending ? 'Pending sale recorded.' : 'Sale recorded.'}</p>
          </div>
        )}
        <button
          type="submit"
          className="w-full font-semibold py-2.5 rounded-lg transition-colors"
          style={{ backgroundColor: isPending ? COLORS.yolk : COLORS.barnwood, color: '#FFFFFF', fontFamily: FONT_BODY }}
        >
          {isPending ? 'Add Pending Sale' : 'Add Sale'}
        </button>
      </form>
    </div>
  );
}

function AddExpenseForm({ onSubmit }) {
  const [item, setItem] = useState('Feeds');
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(getTodayLocal());
  const [perUnitPrice, setPerUnitPrice] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(false), 2000);
    return () => clearTimeout(t);
  }, [success]);

  const q = Number(quantity) || 0;

  function handlePerUnitChange(value) {
    setPerUnitPrice(value);
    if (value === '') { setTotalPrice(''); return; }
    const num = Number(value);
    if (q > 0 && Number.isFinite(num) && num >= 0) {
      setTotalPrice((num * q).toFixed(2));
    }
  }

  function handleTotalChange(value) {
    setTotalPrice(value);
    if (value === '') { setPerUnitPrice(''); return; }
    const num = Number(value);
    if (q > 0 && Number.isFinite(num) && num >= 0) {
      setPerUnitPrice((num / q).toFixed(2));
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!quantity || q <= 0) { setFormError('Enter a quantity greater than 0.'); return; }
    const pricePerItem = Number(perUnitPrice);
    if (!perUnitPrice || pricePerItem <= 0) { setFormError('Enter a price greater than 0.'); return; }
    if (!date) { setFormError('Select a date.'); return; }
    onSubmit({ item, quantity: q, date, price: pricePerItem });
    setFormError('');
    setQuantity('');
    setPerUnitPrice('');
    setTotalPrice('');
    setSuccess(true);
  }

  return (
    <div className="rounded-2xl p-5 shadow-sm" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.cardBorder}` }}>
      <h2 className="font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.ink, fontFamily: FONT_DISPLAY }}>
        <Wallet size={16} style={{ color: COLORS.brick }} /> Record an Expense
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Item">
          <select value={item} onChange={(e) => setItem(e.target.value)} className={inputClasses} style={inputStyle}>
            {EXPENSE_ITEMS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Quantity">
          <input type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 2" className={inputClasses} style={inputStyle} />
        </Field>
        <TwoWayPriceField
          label="Price"
          quantity={q}
          perUnit={perUnitPrice}
          total={totalPrice}
          onPerUnitChange={handlePerUnitChange}
          onTotalChange={handleTotalChange}
          perUnitCaption="Per item"
          totalCaption="Total cost"
        />
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClasses} style={inputStyle} />
        </Field>
        {formError && <p className="text-sm" style={{ color: COLORS.brick }}>{formError}</p>}
        {success && (
          <div className="flex items-center gap-1.5 eggy-anim-pop-in" style={{ color: COLORS.moss }}>
            <CheckCircle2 size={16} />
            <p className="text-sm font-medium">Expense recorded.</p>
          </div>
        )}
        <button
          type="submit"
          className="w-full font-semibold py-2.5 rounded-lg transition-colors"
          style={{ backgroundColor: COLORS.barnwood, color: '#FFFFFF', fontFamily: FONT_BODY }}
        >
          Add Expense
        </button>
      </form>
    </div>
  );
}

function AddHarvestForm({ onSubmit }) {
  const [harvestedTrays, setHarvestedTrays] = useState('');
  const [harvestedPcs, setHarvestedPcs] = useState('');
  const [rejectedTrays, setRejectedTrays] = useState('');
  const [rejectedPcs, setRejectedPcs] = useState('');
  const [date, setDate] = useState(getTodayLocal());
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(false), 2000);
    return () => clearTimeout(t);
  }, [success]);

  function handleSubmit(e) {
    e.preventDefault();
    const h = trayPcsToTotal(harvestedTrays, harvestedPcs);
    const r = trayPcsToTotal(rejectedTrays, rejectedPcs);
    if (h === null) { setFormError('Enter a valid number of trays/pcs harvested (0 or more).'); return; }
    if (r === null) { setFormError('Enter a valid number of trays/pcs rejected (0 or more).'); return; }
    if (r > h) { setFormError('Rejected eggs cannot exceed harvested eggs.'); return; }
    if (!date) { setFormError('Select a date.'); return; }
    onSubmit({ harvested: h, rejected: r, date });
    setFormError('');
    setHarvestedTrays('');
    setHarvestedPcs('');
    setRejectedTrays('');
    setRejectedPcs('');
    setSuccess(true);
  }

  return (
    <div className="rounded-2xl p-5 shadow-sm" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.cardBorder}` }}>
      <h2 className="font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.ink, fontFamily: FONT_DISPLAY }}>
        <Egg size={16} style={{ color: COLORS.yolk }} /> Record a Harvest
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <TrayPcsField label="Eggs harvested" trays={harvestedTrays} pcs={harvestedPcs} onTraysChange={setHarvestedTrays} onPcsChange={setHarvestedPcs} unitLabel="eggs" />
        <TrayPcsField label="Eggs rejected" trays={rejectedTrays} pcs={rejectedPcs} onTraysChange={setRejectedTrays} onPcsChange={setRejectedPcs} unitLabel="eggs" />
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClasses} style={inputStyle} />
        </Field>
        {formError && <p className="text-sm" style={{ color: COLORS.brick }}>{formError}</p>}
        {success && (
          <div className="flex items-center gap-1.5 eggy-anim-pop-in" style={{ color: COLORS.moss }}>
            <CheckCircle2 size={16} />
            <p className="text-sm font-medium">Harvest recorded.</p>
          </div>
        )}
        <button
          type="submit"
          className="w-full font-semibold py-2.5 rounded-lg transition-colors"
          style={{ backgroundColor: COLORS.barnwood, color: '#FFFFFF', fontFamily: FONT_BODY }}
        >
          Add Harvest
        </button>
      </form>
    </div>
  );
}

function EmptyRecords({ text }) {
  return (
    <div className="rounded-2xl p-8 shadow-sm text-center" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.cardBorder}` }}>
      <p className="text-sm" style={{ color: COLORS.muted, fontFamily: FONT_BODY }}>{text}</p>
    </div>
  );
}

function RecordRow({ title, subtitle, amount, amountColor, badge, secondaryAction, confirming, removing, onDeleteClick, onCancel }) {
  return (
    <div
      className="rounded-xl px-4 py-3 shadow-sm flex items-center justify-between gap-3"
      style={{
        backgroundColor: COLORS.card,
        border: `1px solid ${COLORS.cardBorder}`,
        overflow: 'hidden',
        transition: 'opacity 260ms ease, transform 260ms ease, max-height 260ms ease, margin-top 260ms ease, padding 260ms ease',
        opacity: removing ? 0 : 1,
        transform: removing ? 'scale(0.95)' : 'scale(1)',
        maxHeight: removing ? 0 : 200,
        ...(removing ? { marginTop: 0, paddingTop: 0, paddingBottom: 0 } : null),
      }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="font-medium text-sm truncate" style={{ color: COLORS.ink, fontFamily: FONT_BODY }}>{title}</p>
          {badge}
        </div>
        <p className="text-xs truncate" style={{ color: COLORS.muted, fontFamily: FONT_BODY }}>{subtitle}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!confirming && secondaryAction}
        <span className="font-semibold text-sm" style={{ color: amountColor, fontFamily: FONT_DISPLAY }}>{amount}</span>
        {confirming ? (
          <div className="flex items-center gap-1">
            <button type="button" onClick={onDeleteClick} className="text-xs px-2 py-1 rounded-md font-medium" style={{ backgroundColor: COLORS.brick, color: '#FFF' }}>Delete</button>
            <button type="button" onClick={onCancel} className="text-xs px-2 py-1 rounded-md font-medium" style={{ backgroundColor: COLORS.paper, color: COLORS.inkSoft }}>Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={onDeleteClick} className="p-1" style={{ color: COLORS.muted }}>
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function RecordsView({ sales, expenses, harvests, onDeleteSale, onDeleteExpense, onDeleteHarvest, onUpdateSaleStatus }) {
  const [subTab, setSubTab] = useState('sales');
  const [confirmId, setConfirmId] = useState(null);
  const [removingId, setRemovingId] = useState(null);

  // Most-recently-added first — not the sale/expense/harvest date, which is
  // user-entered and can be backdated, so it doesn't reflect entry order.
  const byRecentlyAdded = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
  const sortedSales = useMemo(() => [...sales].sort(byRecentlyAdded), [sales]);
  const sortedExpenses = useMemo(() => [...expenses].sort(byRecentlyAdded), [expenses]);
  const sortedHarvests = useMemo(() => [...harvests].sort(byRecentlyAdded), [harvests]);

  function handleDeleteClick(id) {
    if (confirmId === id) {
      setConfirmId(null);
      // Play the collapse animation first, then actually remove the row —
      // deleting immediately would yank it out from under the animation
      // (the array update unmounts it mid-transition instead of finishing).
      setRemovingId(id);
      const tab = subTab;
      setTimeout(() => {
        if (tab === 'sales') onDeleteSale(id);
        else if (tab === 'expenses') onDeleteExpense(id);
        else onDeleteHarvest(id);
        setRemovingId(null);
      }, 260);
    } else {
      setConfirmId(id);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex rounded-lg p-1 shadow-sm" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.cardBorder}` }}>
        <button
          type="button"
          onClick={() => { setSubTab('sales'); setConfirmId(null); }}
          className="flex-1 py-2 text-sm font-medium rounded-md"
          style={{ backgroundColor: subTab === 'sales' ? COLORS.barnwood : 'transparent', color: subTab === 'sales' ? '#FFF' : COLORS.inkSoft, fontFamily: FONT_BODY }}
        >
          Sales ({sales.length})
        </button>
        <button
          type="button"
          onClick={() => { setSubTab('expenses'); setConfirmId(null); }}
          className="flex-1 py-2 text-sm font-medium rounded-md"
          style={{ backgroundColor: subTab === 'expenses' ? COLORS.barnwood : 'transparent', color: subTab === 'expenses' ? '#FFF' : COLORS.inkSoft, fontFamily: FONT_BODY }}
        >
          Expenses ({expenses.length})
        </button>
        <button
          type="button"
          onClick={() => { setSubTab('harvests'); setConfirmId(null); }}
          className="flex-1 py-2 text-sm font-medium rounded-md"
          style={{ backgroundColor: subTab === 'harvests' ? COLORS.barnwood : 'transparent', color: subTab === 'harvests' ? '#FFF' : COLORS.inkSoft, fontFamily: FONT_BODY }}
        >
          Harvests ({harvests.length})
        </button>
      </div>

      {subTab === 'sales' && (
        sortedSales.length === 0 ? (
          <EmptyRecords text="No sales recorded yet." />
        ) : (
          <div className="space-y-2">
            {sortedSales.map((s) => (
              <RecordRow
                key={s.id}
                title={`${s.eggSize} · ${s.quantity} eggs`}
                subtitle={`${formatDateDisplay(s.date)} · ${formatCurrency(s.pricePerEgg)}/egg`}
                amount={formatCurrency(s.quantity * s.pricePerEgg)}
                amountColor={s.status === 'pending' ? COLORS.muted : COLORS.moss}
                badge={s.status === 'pending' && (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ backgroundColor: COLORS.yolk, color: '#FFF', fontFamily: FONT_BODY }}
                  >
                    PENDING
                  </span>
                )}
                secondaryAction={
                  <button
                    type="button"
                    onClick={() => onUpdateSaleStatus(s.id, s.status === 'pending' ? 'paid' : 'pending')}
                    className="text-xs px-2 py-1 rounded-md font-medium whitespace-nowrap"
                    style={{ backgroundColor: COLORS.paper, color: COLORS.inkSoft, fontFamily: FONT_BODY }}
                  >
                    {s.status === 'pending' ? 'Mark Paid' : 'Mark Pending'}
                  </button>
                }
                confirming={confirmId === s.id}
                removing={removingId === s.id}
                onDeleteClick={() => handleDeleteClick(s.id)}
                onCancel={() => setConfirmId(null)}
              />
            ))}
          </div>
        )
      )}

      {subTab === 'expenses' && (
        sortedExpenses.length === 0 ? (
          <EmptyRecords text="No expenses recorded yet." />
        ) : (
          <div className="space-y-2">
            {sortedExpenses.map((e) => (
              <RecordRow
                key={e.id}
                title={`${e.item} · ${e.quantity}x`}
                subtitle={`${formatDateDisplay(e.date)} · ${formatCurrency(e.price)} each`}
                amount={formatCurrency(e.quantity * e.price)}
                amountColor={COLORS.brick}
                confirming={confirmId === e.id}
                removing={removingId === e.id}
                onDeleteClick={() => handleDeleteClick(e.id)}
                onCancel={() => setConfirmId(null)}
              />
            ))}
          </div>
        )
      )}

      {subTab === 'harvests' && (
        sortedHarvests.length === 0 ? (
          <EmptyRecords text="No harvests recorded yet." />
        ) : (
          <div className="space-y-2">
            {sortedHarvests.map((h) => (
              <RecordRow
                key={h.id}
                title={`${h.harvested} eggs harvested`}
                subtitle={`${formatDateDisplay(h.date)} · ${h.rejected} rejected`}
                amount={`${(h.harvested - h.rejected).toLocaleString()} good`}
                amountColor={COLORS.moss}
                confirming={confirmId === h.id}
                removing={removingId === h.id}
                onDeleteClick={() => handleDeleteClick(h.id)}
                onCancel={() => setConfirmId(null)}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}

function TabBar({ tab, setTab }) {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'addSale', label: 'Add Sale', icon: Plus },
    { id: 'addExpense', label: 'Add Expense', icon: Wallet },
    { id: 'addHarvest', label: 'Add Harvest', icon: Egg },
    { id: 'records', label: 'Records', icon: ClipboardList },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 shadow-lg" style={{ backgroundColor: COLORS.card, borderTop: `1px solid ${COLORS.cardBorder}` }}>
      <div className="max-w-4xl mx-auto grid grid-cols-5">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors"
              style={{ color: active ? COLORS.barnwood : COLORS.muted, fontFamily: FONT_BODY }}
            >
              <Icon size={19} />
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default function EggFarmDashboard({ username, onLogout }) {
  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [harvests, setHarvests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('dashboard');
  const [granularity, setGranularity] = useState('daily');
  const [error, setErrorMsg] = useState('');
  const [avgGranularity, setAvgGranularity] = useState('daily');
  const [avgPeriodValue, setAvgPeriodValue] = useState(() => getPeriodDefaultValue('daily'));
  // 'idle' | 'syncing' | 'slow' — drives SyncBanner, shown only for a
  // background refresh (see the visibilitychange effect below).
  const [syncStatus, setSyncStatus] = useState('idle');

  // Shared by every load() call (mount or background) instead of a local
  // flag scoped to one effect, since background refreshes are triggered
  // from a separate effect further down.
  const mountedRef = useRef(true);
  useEffect(() => {
    // Reset (not just initialize) on mount: React StrictMode's dev-only
    // double-invoke runs this effect's cleanup once immediately after the
    // first mount to test for leaks, which would otherwise leave this
    // stuck at false forever — silently dropping every setState in load()
    // below, including the one that clears the loading spinner.
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Switching modes (Day/Week/Month/Year) resets the picker to "now" in
  // that mode, rather than leaving it on a value that no longer makes
  // sense (e.g. a leftover week string after switching to Year).
  function handleAvgGranularityChange(g) {
    setAvgGranularity(g);
    setAvgPeriodValue(getPeriodDefaultValue(g));
  }

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Bitter:wght@500;600;700&family=Work+Sans:wght@400;500;600&display=swap';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  // background=true is used for a resume refresh (see the visibilitychange
  // effect below): it skips the SyncBanner delay logic on the initial
  // mount load, and on failure leaves existing data on screen instead of
  // wiping it to empty — stale data the user can still see beats a blank
  // dashboard because one request hit a slow cold start.
  const load = useCallback(async ({ background = false } = {}) => {
    let syncingTimer;
    let slowTimer;
    if (background) {
      // Only surface the banner if this is actually slow — most resumes
      // hit an already-warm backend and finish near-instantly, and
      // flashing a status message for those would just be noise. "slow"
      // lands around what a cold Vercel function + cold Neon compute
      // together tend to cost, which is the case worth telling the user
      // about.
      syncingTimer = setTimeout(() => { if (mountedRef.current) setSyncStatus('syncing'); }, 500);
      slowTimer = setTimeout(() => { if (mountedRef.current) setSyncStatus('slow'); }, 3000);
    }

    // Fire all three requests together instead of one-at-a-time — calling
    // these without awaiting starts each fetch immediately, so they run
    // concurrently on the network. The awaits below just pick up results
    // as they arrive; each keeps its own try/catch so one endpoint failing
    // (e.g. harvests) still lets the other two populate normally.
    const salesPromise = api.listSales();
    const expensesPromise = api.listExpenses();
    const harvestsPromise = api.listHarvests();

    try {
      const s = await salesPromise;
      if (mountedRef.current) setSales(s);
    } catch (e) {
      if (mountedRef.current) {
        if (!background) setSales([]);
        setErrorMsg('Could not load sales. Please try again.');
      }
    }
    try {
      const ex = await expensesPromise;
      if (mountedRef.current) setExpenses(ex);
    } catch (e) {
      if (mountedRef.current) {
        if (!background) setExpenses([]);
        setErrorMsg('Could not load expenses. Please try again.');
      }
    }
    try {
      const h = await harvestsPromise;
      if (mountedRef.current) setHarvests(h);
    } catch (e) {
      if (mountedRef.current) {
        if (!background) setHarvests([]);
        setErrorMsg('Could not load harvests. Please try again.');
      }
    }

    if (mountedRef.current) {
      setLoading(false);
      if (background) {
        clearTimeout(syncingTimer);
        clearTimeout(slowTimer);
        setSyncStatus('idle');
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Mobile PWAs are often kept alive in the background instead of being
  // fully closed, so reopening the app can show data that's minutes or
  // hours stale with no indication anything needs refreshing. Refetching
  // on every foreground return keeps things current — these are cheap,
  // already-parallelized reads, and pinging on resume has the side benefit
  // of helping keep Vercel's function and Neon's compute from going cold
  // as often in the first place.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') load({ background: true });
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [load]);

  // Optimistic: show the sale immediately under a temporary id rather than
  // waiting for the round trip. On success we swap in the server's row (real
  // id, so delete works); on failure we remove the temp entry and surface an
  // error, instead of leaving a record on screen that was never actually saved.
  const addSale = useCallback(async (entry) => {
    const tempId = crypto.randomUUID();
    setSales((prev) => [...prev, { ...entry, id: tempId, createdAt: new Date().toISOString() }]);
    try {
      const sale = await api.createSale(entry);
      setSales((prev) => prev.map((s) => (s.id === tempId ? sale : s)));
    } catch (e) {
      setSales((prev) => prev.filter((s) => s.id !== tempId));
      setErrorMsg('Could not save your sale. Please try again.');
    }
  }, []);

  const deleteSale = useCallback(async (id) => {
    try {
      await api.deleteSale(id);
      setSales((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setErrorMsg('Could not delete this sale. Please try again.');
    }
  }, []);

  // Optimistic like addSale above: flip the status in place immediately (a
  // paid/pending toggle is low-risk and instantly reversible by tapping
  // again), then reconcile with the server. On failure, revert to whatever
  // status this sale had before the tap rather than guessing the opposite.
  const updateSaleStatus = useCallback(async (id, status) => {
    let previousStatus;
    setSales((prev) => prev.map((s) => {
      if (s.id !== id) return s;
      previousStatus = s.status;
      return { ...s, status };
    }));
    try {
      const sale = await api.updateSaleStatus(id, status);
      setSales((prev) => prev.map((s) => (s.id === id ? sale : s)));
    } catch (e) {
      setSales((prev) => prev.map((s) => (s.id === id ? { ...s, status: previousStatus } : s)));
      setErrorMsg('Could not update this sale. Please try again.');
    }
  }, []);

  // Same optimistic-then-reconcile approach as addSale above.
  const addExpense = useCallback(async (entry) => {
    const tempId = crypto.randomUUID();
    setExpenses((prev) => [...prev, { ...entry, id: tempId, createdAt: new Date().toISOString() }]);
    try {
      const expense = await api.createExpense(entry);
      setExpenses((prev) => prev.map((x) => (x.id === tempId ? expense : x)));
    } catch (e) {
      setExpenses((prev) => prev.filter((x) => x.id !== tempId));
      setErrorMsg('Could not save your expense. Please try again.');
    }
  }, []);

  const deleteExpense = useCallback(async (id) => {
    try {
      await api.deleteExpense(id);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      setErrorMsg('Could not delete this expense. Please try again.');
    }
  }, []);

  // Same optimistic-then-reconcile approach as addSale above.
  const addHarvest = useCallback(async (entry) => {
    const tempId = crypto.randomUUID();
    setHarvests((prev) => [...prev, { ...entry, id: tempId, createdAt: new Date().toISOString() }]);
    try {
      const harvest = await api.createHarvest(entry);
      setHarvests((prev) => prev.map((x) => (x.id === tempId ? harvest : x)));
    } catch (e) {
      setHarvests((prev) => prev.filter((x) => x.id !== tempId));
      setErrorMsg('Could not save your harvest. Please try again.');
    }
  }, []);

  const deleteHarvest = useCallback(async (id) => {
    try {
      await api.deleteHarvest(id);
      setHarvests((prev) => prev.filter((h) => h.id !== id));
    } catch (e) {
      setErrorMsg('Could not delete this harvest. Please try again.');
    }
  }, []);

  // Pending (utang) sales aren't real revenue yet — exclude them from every
  // stat/chart below so the dashboard only reflects money actually received.
  // They still appear in the Records list so they can be tracked and paid.
  const paidSales = useMemo(() => sales.filter((s) => s.status !== 'pending'), [sales]);

  const totalRevenue = useMemo(() => paidSales.reduce((s, x) => s + x.quantity * x.pricePerEgg, 0), [paidSales]);
  const totalExpenses = useMemo(() => expenses.reduce((s, x) => s + x.quantity * x.price, 0), [expenses]);
  const totalEggs = useMemo(() => paidSales.reduce((s, x) => s + x.quantity, 0), [paidSales]);
  const avgPricePerEgg = totalEggs ? totalRevenue / totalEggs : 0;
  const netProfit = totalRevenue - totalExpenses;

  const chartData = useMemo(() => aggregateByPeriod(paidSales, expenses, granularity), [paidSales, expenses, granularity]);
  const avgRevenuePerPeriod = chartData.length ? chartData.reduce((s, d) => s + d.revenue, 0) / chartData.length : 0;

  const sizeBreakdown = useMemo(() => aggregateBy(paidSales, (s) => s.eggSize, (s) => s.quantity), [paidSales]);
  const expenseBreakdown = useMemo(() => aggregateBy(expenses, (e) => e.item, (e) => e.quantity * e.price), [expenses]);

  // Average per harvest record entered (in practice usually one per day) —
  // matches the requested "average production and reject eggs" directly,
  // without needing the same day/week/month granularity machinery the
  // revenue chart uses.
  const totalHarvested = useMemo(() => harvests.reduce((s, h) => s + h.harvested, 0), [harvests]);
  const totalRejected = useMemo(() => harvests.reduce((s, h) => s + h.rejected, 0), [harvests]);
  const avgHarvested = harvests.length ? Math.round(totalHarvested / harvests.length) : 0;
  const avgRejected = harvests.length ? Math.round(totalRejected / harvests.length) : 0;

  // "Period Averages" card: independent of the granularity above (which
  // drives the Revenue vs Expenses trend). This lets a specific day/week/
  // month/year be picked and shows the profit — paid sales minus expenses,
  // the same way netProfit is computed above but scoped to just that period
  // instead of all-time.
  const avgPeriodSales = useMemo(
    () => paidSales.filter((s) => isInSelectedPeriod(s.date, avgGranularity, avgPeriodValue)),
    [paidSales, avgGranularity, avgPeriodValue]
  );
  const avgPeriodExpenses = useMemo(
    () => expenses.filter((e) => isInSelectedPeriod(e.date, avgGranularity, avgPeriodValue)),
    [expenses, avgGranularity, avgPeriodValue]
  );
  const periodSalesTotal = avgPeriodSales.reduce((s, s2) => s + s2.quantity * s2.pricePerEgg, 0);
  const periodExpensesTotal = avgPeriodExpenses.reduce((s, e) => s + e.quantity * e.price, 0);
  const periodProfit = periodSalesTotal - periodExpensesTotal;
  const avgPeriodLabel = formatSelectedPeriodLabel(avgGranularity, avgPeriodValue);
  const avgPeriodCounts = {
    expenses: avgPeriodExpenses.length,
    sales: avgPeriodSales.length,
  };

  const availableYears = useMemo(() => {
    const years = new Set([String(new Date().getFullYear())]);
    sales.forEach((s) => years.add(s.date.slice(0, 4)));
    expenses.forEach((e) => years.add(e.date.slice(0, 4)));
    harvests.forEach((h) => years.add(h.date.slice(0, 4)));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [sales, expenses, harvests]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.paper }}>
        <Loader2 className="animate-spin" size={32} style={{ color: COLORS.barnwood }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: COLORS.paper, fontFamily: FONT_BODY, color: COLORS.ink }}>
      <Header username={username} onLogout={onLogout} />
      <main className="max-w-4xl mx-auto px-4 pt-4">
        <SyncBanner status={syncStatus} />
        {error && <ErrorBanner message={error} onClose={() => setErrorMsg('')} />}
        {tab === 'dashboard' && (
          <DashboardView
            totalRevenue={totalRevenue}
            totalExpenses={totalExpenses}
            netProfit={netProfit}
            totalEggs={totalEggs}
            avgPricePerEgg={avgPricePerEgg}
            avgRevenuePerPeriod={avgRevenuePerPeriod}
            granularity={granularity}
            setGranularity={setGranularity}
            chartData={chartData}
            sizeBreakdown={sizeBreakdown}
            expenseBreakdown={expenseBreakdown}
            hasSales={sales.length > 0}
            hasExpenses={expenses.length > 0}
            avgHarvested={avgHarvested}
            avgRejected={avgRejected}
            avgGranularity={avgGranularity}
            onAvgGranularityChange={handleAvgGranularityChange}
            avgPeriodValue={avgPeriodValue}
            onAvgPeriodValueChange={setAvgPeriodValue}
            availableYears={availableYears}
            avgPeriodLabel={avgPeriodLabel}
            periodSalesTotal={periodSalesTotal}
            periodExpensesTotal={periodExpensesTotal}
            periodProfit={periodProfit}
            avgPeriodCounts={avgPeriodCounts}
          />
        )}
        {tab === 'addSale' && <AddSaleForm onSubmit={addSale} />}
        {tab === 'addExpense' && <AddExpenseForm onSubmit={addExpense} />}
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
          />
        )}
      </main>
      <TabBar tab={tab} setTab={setTab} />
    </div>
  );
}
