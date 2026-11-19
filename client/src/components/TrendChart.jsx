import { memo } from 'react';
import { useReducedMotion } from 'motion/react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART, COLORS } from '../lib/theme';
import { axisTickFormatter, formatCurrency, niceTicks } from '../lib/format';

// Loaded as a separate chunk — see lib/charts.js. Keep recharts imports in
// this file only, and never import from this file statically (not even a
// constant), or the whole library ends up back in the startup bundle.

const SERIES = [
  { key: 'revenue', label: 'Revenue', color: CHART.revenue },
  { key: 'expenses', label: 'Expenses', color: CHART.expenses },
];

// Value first, series name second: the reader already knows which series
// they're pointing at and wants the number. Short line keys rather than
// filled boxes, and a profit line so the gap needn't be worked out by eye.
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="eggy-card-flush px-3 py-2.5 text-ink" style={{ boxShadow: 'var(--eggy-elev-lg)' }}>
      <p className="text-xs font-medium text-ink-soft mb-1.5">{label}</p>
      {SERIES.map((series) => (
        <p key={series.key} className="flex items-center gap-2 text-sm leading-6">
          <span className="h-[3px] w-3 rounded-full" style={{ backgroundColor: series.color }} aria-hidden="true" />
          <span className="font-semibold tabular-nums">{formatCurrency(point[series.key])}</span>
          <span className="text-xs text-muted">{series.label}</span>
        </p>
      ))}
      <p className="mt-1.5 pt-1.5 border-t border-hairline text-xs text-ink-soft tabular-nums">
        Profit <span className="font-semibold" style={{ color: point.profit >= 0 ? COLORS.moss : COLORS.brick }}>{formatCurrency(point.profit)}</span>
      </p>
    </div>
  );
}

function TrendChart({ data }) {
  const reducedMotion = useReducedMotion();
  const max = data.reduce((m, d) => Math.max(m, d.revenue, d.expenses), 0);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const formatTick = axisTickFormatter(top);
  // Just wide enough for the longest label (~7px per character at 11px), so
  // the bars get the rest of a phone's narrow width.
  const axisWidth = Math.max(...ticks.map((t) => formatTick(t).length)) * 7 + 6;
  return (
    <ResponsiveContainer width="100%" height={CHART.height}>
      <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="14%">
        {/* Solid hairline, horizontal only: dashes read as a threshold or
            projection when this is just a grid, and vertical rules add
            noise on a categorical axis. */}
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={{ stroke: CHART.grid }}
          tick={{ fontSize: 11, fill: CHART.axisText }}
          minTickGap={14}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: CHART.axisText }}
          ticks={ticks}
          domain={[0, top]}
          interval={0}
          tickFormatter={formatTick}
          width={axisWidth}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: COLORS.paper, opacity: 0.7 }} />
        {/* Bars capped at 24px so a sparse week doesn't draw slabs; 4px
            rounded tops, square at the baseline. Animation unchanged. */}
        <Bar dataKey="revenue" name="Revenue" fill={CHART.revenue} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={!reducedMotion} animationDuration={650} animationEasing="ease-out" />
        <Bar dataKey="expenses" name="Expenses" fill={CHART.expenses} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={!reducedMotion} animationDuration={650} animationBegin={60} animationEasing="ease-out" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default memo(TrendChart);
