import { useState } from "react";
import {
  ResponsiveContainer,
  BarChart as RCBar,
  Bar,
  ComposedChart as RCComposed,
  LineChart as RCLine,
  Line,
  AreaChart as RCArea,
  Area,
  PieChart as RCPie,
  Pie,
  Sector,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { formatMoney, formatNumber } from "@/utils/currency";
import { cn } from "@/utils/cn";
import { useLegendToggle } from "@/sc/components/analytics/kit";

const CHART_COLORS = [
  "hsl(221 83% 53%)", // primary blue
  "hsl(160 84% 39%)", // emerald
  "hsl(35 92% 50%)", // amber
  "hsl(262 83% 58%)", // violet
  "hsl(351 95% 59%)", // rose
  "hsl(199 89% 48%)", // sky
];

function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 font-medium">{label ?? ""}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color || entry.payload?.color }} />
          <span>{entry.name}:</span>
          <span className="font-medium text-foreground tabular-nums">
            {formatter ? formatter(entry.value, entry.name) : formatNumber(entry.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

export interface ChartProps<T = Record<string, any>> {
  data: T[];
  /** key -> label mapping for series */
  series: { key: string; label: string; color?: string }[];
  xKey: string;
  height?: number;
  money?: boolean;
  /** Currency code for `money` formatting. Defaults to USD. */
  currency?: string;
  legend?: boolean;
  /**
   * BarChart only: a field on each data row holding a CSS color for that
   * row's bar (e.g. green for a positive value, rose for negative) —
   * overrides the series' own flat color per-point. Ignored with more than
   * one series, where a single color-per-category wouldn't be meaningful.
   */
  colorKey?: string;
  /** BarChart only: stack the series instead of drawing them side by side. */
  stacked?: boolean;
  /** Values are percentages — axis and tooltip show "12%". Ignored when `money` is set. */
  percent?: boolean;
  /** BarChart only: tilt the category labels so long names all fit (every label is shown). */
  angledLabels?: boolean;
  /** LineChart only: fit the Y axis to the data instead of starting at 0, so close lines (target vs actual) separate. */
  zoom?: boolean;
}

function axisFormatter(money: boolean, currency: string, v: number, percent?: boolean) {
  if (money) return formatMoney(v, currency, { compact: true });
  return percent ? `${formatNumber(v, 0)}%` : formatNumber(v, 0);
}

/** Tooltip value formatter shared by the cartesian charts (undefined = plain number). */
function valueFormatter(money: boolean | undefined, currency: string, percent?: boolean) {
  if (money) return (v: number) => formatMoney(v, currency);
  if (percent) return (v: number) => `${formatNumber(v, 1)}%`;
  return undefined;
}

export function BarChart({ data, series, xKey, height = 260, money, currency = "USD", legend, colorKey, stacked, percent, angledLabels }: ChartProps) {
  const lt = useLegendToggle(); // click a legend entry to hide / show that series
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RCBar data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: angledLabels ? 11 : 12, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          {...(angledLabels ? { angle: -35, textAnchor: "end", height: 78, interval: 0 } : {})}
        />
        <YAxis
          tickFormatter={(v: number) => axisFormatter(!!money, currency, v, percent)}
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          content={<ChartTooltip formatter={valueFormatter(money, currency, percent)} />}
          cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
        />
        {legend && lt.legend}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key} hide={lt.hidden.has(s.key)}
            name={s.label}
            fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
            stackId={stacked ? "stack" : undefined}
            radius={stacked && i < series.length - 1 ? [0, 0, 0, 0] : [4, 4, 0, 0]}
            maxBarSize={40}
          >
            {colorKey && series.length === 1 && data.map((d, di) => <Cell key={di} fill={(d as any)[colorKey] ?? s.color ?? CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Bar>
        ))}
      </RCBar>
    </ResponsiveContainer>
  );
}

export function LineChart({ data, series, xKey, height = 260, money, currency = "USD", legend, percent, zoom }: ChartProps) {
  const lt = useLegendToggle(); // click a legend entry to hide / show that series
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RCLine data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
        <YAxis
          tickFormatter={(v: number) => axisFormatter(!!money, currency, v, percent)}
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          domain={zoom ? [(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(max + 1)] : undefined}
        />
        <Tooltip content={<ChartTooltip formatter={valueFormatter(money, currency, percent)} />} />
        {legend && lt.legend}
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key} hide={lt.hidden.has(s.key)}
            name={s.label}
            stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2}
            strokeDasharray={(s as { dashed?: boolean }).dashed ? "6 4" : undefined}
            dot={(s as { dashed?: boolean }).dashed ? false : { r: 3 }}
          />
        ))}
      </RCLine>
    </ResponsiveContainer>
  );
}
/**
 * One series of a `ComboChart` — bars and lines share the same panel, so a total
 * (bars) and a ratio derived from it (line) can be read together.
 * `axis: "right"` moves the series onto a second, right-hand scale, which a ratio
 * against a much larger total needs to stay legible; requires `dualAxis`.
 */
export interface ComboSeries {
  key: string;
  label: string;
  color?: string;
  /** Draw as a bar (default) or a line. */
  type?: "bar" | "line";
  /** Which Y axis to measure against. Defaults to "left". */
  axis?: "left" | "right";
  /** How this series' values read. Defaults to percent when the label ends in "%", else the chart's money/number. */
  format?: "money" | "number" | "percent";
}

export interface ComboChartProps<T = Record<string, any>> {
  data: T[];
  series: ComboSeries[];
  xKey: string;
  height?: number;
  money?: boolean;
  /** Currency code for `money` formatting. Defaults to USD. */
  currency?: string;
  legend?: boolean;
  /** Render the right-hand Y axis used by series with `axis: "right"`. */
  dualAxis?: boolean;
}

/** Bars and lines in a single panel (recharts ComposedChart). */
export function ComboChart({ data, series, xKey, height = 260, money, currency = "USD", legend, dualAxis }: ComboChartProps) {
  const lt = useLegendToggle(); // click a legend entry to hide / show that series
  // A money chart can carry a % or count line (export share, OTIF, transit days): format each series on its own.
  const fmtOf = (s: ComboSeries) => s.format ?? (/%\s*$/.test(s.label) ? "percent" : money ? "money" : "number");
  const axisFmt = (side: "left" | "right") => {
    const own = series.filter((s) => (dualAxis && s.axis === "right" ? "right" : "left") === side);
    return own.length ? fmtOf(own[0]) : money ? "money" : "number";
  };
  const tickFor = (side: "left" | "right") => {
    const f = axisFmt(side);
    return (v: number) => axisFormatter(f === "money", currency, v, f === "percent");
  };
  const byName = new Map(series.map((s) => [s.label, fmtOf(s)]));
  const tooltipValue = (v: number, name?: string) => {
    const f = (name && byName.get(name)) || (money ? "money" : "number");
    return f === "money" ? formatMoney(v, currency) : f === "percent" ? `${formatNumber(v, 1)}%` : formatNumber(v, Math.abs(v) < 100 && v % 1 !== 0 ? 1 : 0);
  };
  const tick = { fontSize: 12, fill: "hsl(var(--muted-foreground))" };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RCComposed data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey={xKey} tick={tick} tickLine={false} axisLine={false} />
        <YAxis yAxisId="left" tickFormatter={tickFor("left")} tick={tick} tickLine={false} axisLine={false} />
        {dualAxis && <YAxis yAxisId="right" orientation="right" tickFormatter={tickFor("right")} tick={tick} tickLine={false} axisLine={false} />}
        <Tooltip
          content={<ChartTooltip formatter={tooltipValue} />}
          cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
        />
        {legend && lt.legend}
        {series.map((s, i) => {
          const color = s.color ?? CHART_COLORS[i % CHART_COLORS.length];
          // Bars/lines must name the axis they belong to once `dualAxis` adds a second one.
          const yAxisId = dualAxis && s.axis === "right" ? "right" : "left";
          return s.type === "line" ? (
            <Line key={s.key} yAxisId={yAxisId} type="monotone" dataKey={s.key} hide={lt.hidden.has(s.key)} name={s.label} stroke={color} strokeWidth={2} dot={{ r: 3 }} />
          ) : (
            <Bar key={s.key} yAxisId={yAxisId} dataKey={s.key} hide={lt.hidden.has(s.key)} name={s.label} fill={color} radius={[4, 4, 0, 0]} maxBarSize={40} />
          );
        })}
      </RCComposed>
    </ResponsiveContainer>
  );
}

export function AreaChart({ data, series, xKey, height = 260, money, currency = "USD", legend, percent }: ChartProps) {
  const lt = useLegendToggle(); // click a legend entry to hide / show that series
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RCArea data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.35} />
              <stop offset="95%" stopColor={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(v: number) => axisFormatter(!!money, currency, v, percent)} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
        <Tooltip content={<ChartTooltip formatter={valueFormatter(money, currency, percent)} />} />
        {legend && lt.legend}
        {series.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key} hide={lt.hidden.has(s.key)}
            name={s.label}
            stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
            fill={`url(#grad-${s.key})`}
            strokeWidth={2}
          />
        ))}
      </RCArea>
    </ResponsiveContainer>
  );
}

export interface PieChartProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  money?: boolean;
  /** Currency code for `money` formatting (center label + tooltip). Defaults to USD. */
  currency?: string;
  innerRadius?: number | string;
  legend?: boolean;
}

/** Hover "pop": the active wedge grows outward with rounded caps; a thin ring
 * gap is stroked in the surface color so it reads as lifted, not just resized. */
function renderActiveSlice(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 10}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      cornerRadius={8}
      stroke="hsl(var(--card))"
      strokeWidth={2}
    />
  );
}

export function PieChart({ data, height = 260, money, currency = "USD", innerRadius = 0, legend = true }: PieChartProps) {
  const safeData = data.filter((d) => d.value !== 0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const isDonut = innerRadius !== 0 && innerRadius !== "0";
  const total = safeData.reduce((s, d) => s + d.value, 0);
  const fmt = (v: number) => (money ? formatMoney(v, currency) : formatNumber(v));
  // Centre text must fit inside the hole: compact amounts and a clipped label (the full one is in the legend/tooltip).
  const fmtShort = (v: number) => (money ? formatMoney(v, currency, { compact: true }) : formatNumber(v, 0));
  const clip = (t: string, n = 18) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
  const active = activeIndex != null ? safeData[activeIndex] : undefined;
  // Legend lives below the chart as HTML so long account/group names truncate instead of wrapping and
  // squeezing the pie; the chart keeps a fixed share of the height.
  const chartH = legend ? Math.max(170, Math.round(height * 0.66)) : height;

  return (
    <div style={{ height }} className="flex flex-col">
    <ResponsiveContainer width="100%" height={chartH}>
      <RCPie>
        <Pie
          data={safeData}
          dataKey="value"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius="88%"
          paddingAngle={3}
          cornerRadius={6}
          stroke="hsl(var(--card))"
          strokeWidth={2}
          activeIndex={activeIndex ?? undefined}
          activeShape={renderActiveSlice}
          onMouseEnter={(_, i) => setActiveIndex(i)}
          onMouseLeave={() => setActiveIndex(null)}
          animationDuration={400}
        >
          {safeData.map((d, i) => (
            <Cell
              key={i}
              fill={d.color ?? CHART_COLORS[i % CHART_COLORS.length]}
              opacity={activeIndex == null || activeIndex === i ? 1 : 0.35}
              style={{ transition: "opacity 200ms ease" }}
            />
          ))}
        </Pie>
        {isDonut && (
          <>
            <text x="50%" y="50%" dy={active ? -10 : -4} textAnchor="middle" className="fill-foreground text-lg font-bold">
              {fmtShort(active ? active.value : total)}
            </text>
            <text x="50%" y="50%" dy={14} textAnchor="middle" className="fill-muted-foreground text-xs">
              {active ? clip(active.label.replace(/^\d+\s*-\s*/, "")) : "Total"}
            </text>
            {active && total > 0 && (
              <text x="50%" y="50%" dy={30} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                {Math.round((active.value / total) * 100)}%
              </text>
            )}
          </>
        )}
        <Tooltip content={<ChartTooltip formatter={money ? (v: number) => formatMoney(v, currency) : undefined} />} />
      </RCPie>
    </ResponsiveContainer>
    {legend && (
      <ul className="mt-2 grid min-h-0 flex-1 grid-cols-1 content-start gap-x-4 gap-y-1 overflow-y-auto pr-1 text-xs scrollbar-thin sm:grid-cols-2">
        {safeData.map((d, i) => (
          <li
            key={d.label}
            title={`${d.label}: ${fmt(d.value)}`}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
            className={cn("flex min-w-0 cursor-default items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-muted", activeIndex === i && "bg-muted")}
          >
            <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color ?? CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate text-foreground">{d.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    )}
    </div>
  );
}

export function DonutChart(props: PieChartProps) {
  return <PieChart {...props} innerRadius={props.innerRadius ?? "62%"} />;
}

export { CHART_COLORS };
/**
 * Horizontal bar gauge: one row per item — label and value above, a full-width track with a
 * gradient fill scaled to the largest value, segment ticks, and the item's share of the total.
 */
export function BarGauge({
  data,
  money,
  currency,
  height,
  format,
}: {
  data: { label: string; value: number; color?: string }[];
  money?: boolean;
  currency?: string;
  height?: number;
  format?: (v: number) => string;
}) {
  const rows = data.filter((d) => Number(d.value));
  const max = Math.max(...rows.map((d) => Math.abs(Number(d.value))), 0);
  const total = rows.reduce((s, d) => s + Math.abs(Number(d.value)), 0);
  const fmt = format ?? ((v: number) => (money ? formatMoney(v, currency, { compact: true }) : formatNumber(v, 0)));
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">No data in this period.</p>;
  return (
    <div className="space-y-3 overflow-y-auto pr-1 scrollbar-thin" style={height ? { maxHeight: height } : undefined}>
      {rows.map((d, i) => {
        const v = Math.abs(Number(d.value));
        const pct = max ? (v / max) * 100 : 0;
        const share = total ? (v / total) * 100 : 0;
        const color = d.color ?? CHART_COLORS[i % CHART_COLORS.length];
        return (
          <div key={d.label} className="group" title={`${d.label}: ${fmt(Number(d.value))} · ${formatNumber(share, 1)}% of total`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-1.5">
                <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                <span className="truncate font-medium">{d.label}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                <b className="font-semibold">{fmt(Number(d.value))}</b>
                <span className="ml-1.5 inline-block w-11 text-right text-muted-foreground">{formatNumber(share, 1)}%</span>
              </span>
            </div>
            <div className="relative h-3.5 overflow-hidden rounded-md bg-muted ring-1 ring-inset ring-border/60">
              <div
                className="absolute inset-y-0 left-0 rounded-md transition-[width] duration-700 ease-out group-hover:brightness-110"
                style={{
                  width: `${Math.max(pct, 1.5)}%`,
                  background: `linear-gradient(90deg, color-mix(in srgb, ${color} 35%, transparent), ${color})`,
                  boxShadow: `0 0 10px -2px ${color}`,
                }}
              />
              {/* segment ticks give the gauge look */}
              <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_9px,hsl(var(--card)/0.55)_9px_11px)]" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
