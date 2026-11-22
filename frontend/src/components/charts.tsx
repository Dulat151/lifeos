"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const axis = { stroke: "var(--muted)", fontSize: 11, tickLine: false, axisLine: false } as const;
const tooltip = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text)" },
  cursor: { fill: "var(--surface-2)" },
};

type Series = { key: string; label: string; color?: string };

export function BarsChart({ data, x, series, height = 220, stacked }: { data: Record<string, unknown>[]; x: string; series: Series[]; height?: number; stacked?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey={x} {...axis} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip {...tooltip} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? COLORS[i % 5]} radius={[4, 4, 0, 0]} stackId={stacked ? "a" : undefined} maxBarSize={28} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LinesChart({ data, x, series, height = 220, area }: { data: Record<string, unknown>[]; x: string; series: Series[]; height?: number; area?: boolean }) {
  if (area) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey={x} {...axis} /><YAxis {...axis} /><Tooltip {...tooltip} />
          {series.map((s, i) => <Area key={s.key} dataKey={s.key} name={s.label} stroke={s.color ?? COLORS[i % 5]} fill={s.color ?? COLORS[i % 5]} fillOpacity={0.15} strokeWidth={2} type="monotone" />)}
        </AreaChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey={x} {...axis} /><YAxis {...axis} /><Tooltip {...tooltip} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color ?? COLORS[i % 5]} strokeWidth={2} dot={false} type="monotone" />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function WheelChart({ data, compare }: { data: { area: string; value: number; prev?: number }[]; compare?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={data} outerRadius="75%">
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="area" tick={{ fill: "var(--muted)", fontSize: 11 }} />
        <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
        <Radar dataKey="value" name="Текущая" stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.25} />
        {compare && <Radar dataKey="prev" name="Предыдущая" stroke={COLORS[2]} fill={COLORS[2]} fillOpacity={0.1} />}
        <Tooltip {...tooltip} />
        {compare && <Legend wrapperStyle={{ fontSize: 12 }} />}
      </RadarChart>
    </ResponsiveContainer>
  );
}

/** GitHub-style heatmap for habit history. */
export function Heatmap({ days, color = "var(--accent)" }: { days: { date: string; level: number; scheduled: boolean; status: string | null }[]; color?: string }) {
  const weeks: (typeof days[number] | null)[][] = [];
  if (days.length) {
    const first = new Date(days[0].date + "T00:00:00");
    const pad = (first.getDay() + 6) % 7;
    const cells: (typeof days[number] | null)[] = [...Array(pad).fill(null), ...days];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  }
  const op = [0.08, 0.35, 0.55, 0.75, 1];
  return (
    <div className="flex gap-[3px] overflow-x-auto pb-1" role="img" aria-label="Тепловая карта выполнения">
      {weeks.map((w, i) => (
        <div key={i} className="flex flex-col gap-[3px]">
          {w.map((d, j) => d ? (
            <div key={j} title={`${d.date}${d.status ? " · " + (d.status === "done" ? "выполнено" : "пропуск") : ""}`}
              className="size-3 rounded-[3px]"
              style={{ background: d.status === "skipped" ? "var(--warning)" : color, opacity: d.status === "skipped" ? 0.4 : op[d.level] ?? 0.08 }} />
          ) : <div key={j} className="size-3" />)}
        </div>
      ))}
    </div>
  );
}
