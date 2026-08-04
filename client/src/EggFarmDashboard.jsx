import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
    onSubmit({ eggSize, quantity, date, pricePerEgg });
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
        {formError && <p className="text-sm" style={{ color: COLORS.brick }}>{formError}</p>}
        {success && (
          <div className="flex items-center gap-1.5 eggy-anim-pop-in" style={{ color: COLORS.moss }}>
            <CheckCircle2 size={16} />
            <p className="text-sm font-medium">Sale recorded.</p>
          </div>
        )}
        <button
          type="submit"
          className="w-full font-semibold py-2.5 rounded-lg transition-colors"
          style={{ backgroundColor: COLORS.barnwood, color: '#FFFFFF', fontFamily: FONT_BODY }}
        >
          Add Sale
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

function RecordRow({ title, subtitle, amount, amountColor, confirming, removing, onDeleteClick, onCancel }) {
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
        <p className="font-medium text-sm truncate" style={{ color: COLORS.ink, fontFamily: FONT_BODY }}>{title}</p>
        <p className="text-xs truncate" style={{ color: COLORS.muted, fontFamily: FONT_BODY }}>{subtitle}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
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

function RecordsView({ sales, expenses, harvests, onDeleteSale, onDeleteExpense, onDeleteHarvest }) {
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
                amountColor={COLORS.moss}
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

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Bitter:wght@500;600;700&family=Work+Sans:wght@400;500;600&display=swap';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const s = await api.listSales();
        if (mounted) setSales(s);
      } catch (e) {
        if (mounted) {
          setSales([]);
          setErrorMsg('Could not load sales. Please try again.');
        }
      }
      try {
        const ex = await api.listExpenses();
        if (mounted) setExpenses(ex);
      } catch (e) {
        if (mounted) {
          setExpenses([]);
          setErrorMsg('Could not load expenses. Please try again.');
        }
      }
      try {
        const h = await api.listHarvests();
        if (mounted) setHarvests(h);
      } catch (e) {
        if (mounted) {
          setHarvests([]);
          setErrorMsg('Could not load harvests. Please try again.');
        }
      }
      if (mounted) setLoading(false);
    }
    load();
    return () => { mounted = false; };
  }, []);

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

  const totalRevenue = useMemo(() => sales.reduce((s, x) => s + x.quantity * x.pricePerEgg, 0), [sales]);
  const totalExpenses = useMemo(() => expenses.reduce((s, x) => s + x.quantity * x.price, 0), [expenses]);
  const totalEggs = useMemo(() => sales.reduce((s, x) => s + x.quantity, 0), [sales]);
  const avgPricePerEgg = totalEggs ? totalRevenue / totalEggs : 0;
  const netProfit = totalRevenue - totalExpenses;

  const chartData = useMemo(() => aggregateByPeriod(sales, expenses, granularity), [sales, expenses, granularity]);
  const avgRevenuePerPeriod = chartData.length ? chartData.reduce((s, d) => s + d.revenue, 0) / chartData.length : 0;

  const sizeBreakdown = useMemo(() => aggregateBy(sales, (s) => s.eggSize, (s) => s.quantity), [sales]);
  const expenseBreakdown = useMemo(() => aggregateBy(expenses, (e) => e.item, (e) => e.quantity * e.price), [expenses]);

  // Average per harvest record entered (in practice usually one per day) —
  // matches the requested "average production and reject eggs" directly,
  // without needing the same day/week/month granularity machinery the
  // revenue chart uses.
  const totalHarvested = useMemo(() => harvests.reduce((s, h) => s + h.harvested, 0), [harvests]);
  const totalRejected = useMemo(() => harvests.reduce((s, h) => s + h.rejected, 0), [harvests]);
  const avgHarvested = harvests.length ? Math.round(totalHarvested / harvests.length) : 0;
  const avgRejected = harvests.length ? Math.round(totalRejected / harvests.length) : 0;

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
          />
        )}
      </main>
      <TabBar tab={tab} setTab={setTab} />
    </div>
  );
}
