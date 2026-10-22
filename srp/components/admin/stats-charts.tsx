"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// FR-09 charts. Each chart carries exactly one series (title names it — no
// legend needed) with a single theme hue; grid and axes stay recessive.
// Recharts lays out in LTR geometry, so the RTL reading order is built in
// explicitly (UI-G2): category labels and the value axis sit at the start
// (right) edge, bars grow from it, and time runs right to left. Nothing
// animates on load (DESIGN.md §10, UI-G1).

export type NamedCount = { name: string; count: number };
export type DailyCount = { date: string; count: number };

const AXIS_TICK = {
  fill: "var(--muted-foreground)",
  fontSize: 12,
} as const;

const TOOLTIP_STYLE = {
  direction: "rtl" as const,
  backgroundColor: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: "12px",
};

function truncate(value: string, max = 18) {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function HorizontalCountChart({
  data,
  color = "var(--chart-1)",
  valueLabel,
}: {
  data: NamedCount[];
  color?: string;
  valueLabel: string;
}) {
  return (
    <div dir="ltr" className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 24, right: 8 }}>
          <CartesianGrid
            horizontal={false}
            stroke="var(--border)"
            strokeDasharray="3 3"
          />
          <XAxis
            type="number"
            reversed
            allowDecimals={false}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            orientation="right"
            width={140}
            tick={AXIS_TICK}
            tickFormatter={(v: string) => truncate(v)}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => [String(value), valueLabel]}
          />
          <Bar
            dataKey="count"
            fill={color}
            barSize={18}
            radius={[4, 0, 0, 4]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DailyAreaChart({ data }: { data: DailyCount[] }) {
  return (
    <div dir="ltr" className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 24, right: 0, top: 8 }}>
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="date"
            reversed
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={32}
          />
          <YAxis
            allowDecimals={false}
            orientation="right"
            width={32}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
            contentStyle={TOOLTIP_STYLE}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="var(--chart-2)"
            strokeWidth={2}
            fill="var(--chart-2)"
            fillOpacity={0.15}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
