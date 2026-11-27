"use client";
import { ArrowDownRight, ArrowUpRight, Flame, Lightbulb, Minus, Sparkles, Target, TrendingUp, Trophy } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { BarsChart, LinesChart } from "@/components/charts";
import { useI18n } from "@/components/providers";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Progress, ProgressRing, QueryState, Segmented, Skeleton } from "@/components/ui";
import { useGet } from "@/hooks/use-api";
import type { Goal, Streaks } from "@/lib/types";
import { cn, fmtDate, GOAL_CATEGORY_COLOR } from "@/lib/utils";

type Period = "week" | "month" | "year";
type ProgressData = {
  period: Period; start: string; end: string;
  totals: { tasks_done: number; habit_checks: number; focus_minutes: number; learning_minutes: number; xp: number; habit_completion_rate: number | null; task_completion_rate: number | null; productivity_score: number | null };
  series: { date: string; tasks_done: number; habit_checks: number; focus_minutes: number; xp: number }[];
  level: { level: number; xp: number; start: number; next: number }; coins: number; streaks: Streaks; goals: Goal[];
};
type Report = {
  start: string; end: string; has_data: boolean; insights: string[]; tips: string[];
  metrics: Record<"tasks_done" | "habit_completion_rate" | "focus_minutes" | "learning_minutes" | "xp", { value: number | null; prev: number | null }>;
};

export default function ProgressPage() {
  const { locale } = useI18n();
  const [period, setPeriod] = React.useState<Period>("month");
  const q = useGet<ProgressData>(["progress", period], `/progress?period=${period}`);
  const report = useGet<Report>(["progress", "weekly-report"], "/progress/weekly-report");
  return (
    <div>
      <PageHeader icon={<TrendingUp />} title="Прогресс" subtitle="Как вы развиваетесь: только реальные данные, без выдуманных цифр"
        actions={<Segmented size="sm" value={period} onChange={setPeriod} options={[{ value: "week", label: "Неделя" }, { value: "month", label: "Месяц" }, { value: "year", label: "Год" }]} />} />
      <QueryState q={q} skeleton={<div className="space-y-4"><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-72" /></div>}>
        {(d) => {
          const lvlPct = ((d.level.xp - d.level.start) / Math.max(1, d.level.next - d.level.start)) * 100;
          const label = (iso: string) => period === "year" ? fmtDate(iso, locale, { day: "numeric", month: "short" }) : period === "week" ? fmtDate(iso, locale, { weekday: "short" }) : fmtDate(iso, locale, { day: "numeric" });
          const series = d.series.map((x) => ({ ...x, label: label(x.date) }));
          const empty = !d.totals.tasks_done && !d.totals.habit_checks && !d.totals.xp && !d.totals.focus_minutes;
          return (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <Kpi label="Задач выполнено" value={d.totals.tasks_done} />
                <Kpi label="Отметок привычек" value={d.totals.habit_checks} hint={d.totals.habit_completion_rate !== null ? `${d.totals.habit_completion_rate}% от плана` : undefined} />
                <Kpi label="Фокус" value={`${Math.round(d.totals.focus_minutes / 60 * 10) / 10} ч`} />
                <Kpi label="Обучение" value={`${Math.round(d.totals.learning_minutes / 60 * 10) / 10} ч`} />
                <Card className="col-span-2 flex items-center gap-4 p-4 lg:col-span-1">
                  <ProgressRing value={lvlPct} size={56} stroke={6} label="Уровень"><span className="text-base font-bold">{d.level.level}</span></ProgressRing>
                  <div><div className="text-xs text-muted">Опыт за период</div><div className="text-xl font-semibold tabular-nums">+{d.totals.xp} XP</div><div className="text-[11px] text-faint">уровень {d.level.level} · {d.level.xp} XP</div></div>
                </Card>
              </div>

              {empty ? (
                <EmptyState icon={<Sparkles />} title="За этот период пока нет активности" text="Выполните задачу или отметьте привычку — графики начнут заполняться." />
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card><CardHeader title="Задачи и привычки" icon={<TrendingUp />} subtitle={period === "year" ? "по неделям" : "по дням"} />
                    <CardBody><LinesChart area data={series} x="label" height={230} series={[{ key: "tasks_done", label: "Задачи" }, { key: "habit_checks", label: "Привычки" }]} /></CardBody></Card>
                  <Card><CardHeader title="Полученный опыт" icon={<Sparkles />} subtitle={period === "year" ? "по неделям" : "по дням"} />
                    <CardBody><BarsChart data={series} x="label" height={230} series={[{ key: "xp", label: "XP" }]} /></CardBody></Card>
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-3">
                <WeeklyReport q={report} />
                <Card>
                  <CardHeader title="Прогресс целей" icon={<Target />} action={<Link href="/goals" className="text-xs text-muted hover:text-accent">Все</Link>} />
                  <CardBody>{d.goals.length ? <ul className="space-y-3">{d.goals.map((g) => (
                    <li key={g.id}><Link href={`/goals/${g.id}`} className="block">
                      <div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate">{g.title}</span><span className="tabular-nums text-muted">{Math.round(g.progress)}%</span></div>
                      <Progress value={g.progress} color={GOAL_CATEGORY_COLOR[g.category]} />
                    </Link></li>))}</ul> : <p className="text-sm text-muted">Целей пока нет.</p>}</CardBody>
                </Card>
                <Card>
                  <CardHeader title="Серии" icon={<Flame />} action={<Link href="/rewards?tab=streaks" className="text-xs text-muted hover:text-accent">Подробнее</Link>} />
                  <CardBody className="grid grid-cols-2 gap-3">
                    {([["Активные дни", d.streaks.daily], ["Привычки", d.streaks.habits], ["Продуктивные", d.streaks.productive], ["Успешные недели", d.streaks.weeks]] as const).map(([l, v]) => (
                      <div key={l} className="rounded-xl bg-surface-2 p-3"><div className="text-[11px] text-muted">{l}</div><div className="flex items-baseline gap-1"><span className="text-2xl font-semibold tabular-nums">{v.current}</span><span className="text-[11px] text-faint">рекорд {v.best}</span></div></div>))}
                  </CardBody>
                </Card>
              </div>

              <Card>
                <CardHeader title="Активность за год" icon={<Trophy />} subtitle="Каждая клетка — день с выполненной задачей, привычкой или фокусом" />
                <CardBody><YearHeatmap days={new Set(d.streaks.calendar)} /></CardBody>
              </Card>
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return <Card className="p-4"><div className="text-xs text-muted">{label}</div><div className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>{hint && <div className="mt-0.5 text-[11px] text-faint">{hint}</div>}</Card>;
}

function Delta({ v, prev, suffix = "" }: { v: number | null; prev: number | null; suffix?: string }) {
  if (v === null) return <span className="text-muted">—</span>;
  const diff = prev === null ? null : v - prev;
  return (
    <span className="flex items-center gap-1.5">
      <span className="font-semibold tabular-nums">{v}{suffix}</span>
      {diff !== null && diff !== 0 && <span className={cn("flex items-center text-[11px]", diff > 0 ? "text-success" : "text-danger")}>{diff > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{Math.abs(diff)}{suffix}</span>}
      {diff === 0 && <Minus className="size-3 text-faint" />}
    </span>
  );
}

function WeeklyReport({ q }: { q: ReturnType<typeof useGet<Report>> }) {
  const { locale } = useI18n();
  const r = q.data;
  return (
    <Card>
      <CardHeader title="Отчёт за неделю" icon={<Sparkles />} subtitle={r ? `${fmtDate(r.start, locale)} — ${fmtDate(r.end, locale)} · сравнение с прошлой неделей` : undefined} />
      <CardBody>
        {!r ? <Skeleton className="h-40" /> : !r.has_data ? <p className="text-sm text-muted">На этой неделе пока нет данных для отчёта.</p> : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <span className="text-muted">Задачи</span><Delta v={r.metrics.tasks_done.value} prev={r.metrics.tasks_done.prev} />
              <span className="text-muted">Привычки</span><Delta v={r.metrics.habit_completion_rate.value} prev={r.metrics.habit_completion_rate.prev} suffix="%" />
              <span className="text-muted">Фокус</span><Delta v={r.metrics.focus_minutes.value} prev={r.metrics.focus_minutes.prev} suffix=" мин" />
              <span className="text-muted">Опыт</span><Delta v={r.metrics.xp.value} prev={r.metrics.xp.prev} suffix=" XP" />
            </div>
            <ul className="space-y-1.5 text-sm">{r.insights.map((t, i) => <li key={i} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-accent" />{t}</li>)}</ul>
            {r.tips.length > 0 && <div className="space-y-1.5 rounded-xl bg-surface-2 p-3">{r.tips.map((t, i) => <p key={i} className="flex gap-2 text-xs text-muted"><Lightbulb className="size-3.5 shrink-0 text-warning" />{t}</p>)}</div>}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function YearHeatmap({ days }: { days: Set<string> }) {
  const { locale } = useI18n();
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 364 - ((start.getDay() + 6) % 7));
  const cells: Date[] = [];
  for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) cells.push(new Date(d));
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return (
    <div className="overflow-x-auto pb-1">
      <div className="grid w-max grid-flow-col grid-rows-7 gap-[3px]">
        {cells.map((d) => <div key={iso(d)} title={fmtDate(iso(d), locale, { day: "numeric", month: "short", year: "numeric" })}
          className={cn("size-[11px] rounded-[3px]", days.has(iso(d)) ? "bg-accent" : "bg-surface-3/70")} />)}
      </div>
      <p className="mt-2 text-[11px] text-muted">Активных дней за год: {days.size}</p>
    </div>
  );
}
