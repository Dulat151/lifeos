"use client";
import { Timer } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { BarsChart, LinesChart } from "@/components/charts";
import { Button, Card, CardBody, CardHeader, PageHeader, QueryState, Stat, Tabs, TabsList, TabsTrigger } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { useGet } from "@/hooks/use-api";
import { useOverview } from "@/hooks/use-overview";
import { fmtDate } from "@/lib/utils";

/** Productivity view: daily / weekly / monthly productivity score, focus and task throughput. */
export default function ProductivityPage() {
  const { locale } = useI18n();
  const [period, setPeriod] = React.useState("week");
  const day = useOverview("day", "", "");
  const cur = useOverview(period, "", "");
  const distractions = useGet<{ id: string; description: string; occurred_at: string }[]>(["focus", "distractions"], "/focus/distractions?limit=200");
  const top = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const d of distractions.data ?? []) m.set(d.description.toLowerCase(), (m.get(d.description.toLowerCase()) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [distractions.data]);
  return (
    <div>
      <PageHeader title="Продуктивность" subtitle="Индекс = 40% задачи + 40% привычки + 20% фокус (цель 2 ч/день)" actions={<Button asChild><Link href="/focus"><Timer />Фокус</Link></Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Сегодня" value={day.data?.productivity_score ?? "—"} hint="индекс продуктивности" />
        <Stat label="Задач сегодня" value={day.data ? `${day.data.tasks_done}/${day.data.tasks_considered}` : "—"} />
        <Stat label="Фокус сегодня" value={day.data ? `${Math.round(day.data.focus_hours * 60)} мин` : "—"} />
        <Stat label="Привычки сегодня" value={day.data ? `${day.data.habit_days_done}/${day.data.habit_days_evaluated}` : "—"} />
      </div>
      <Tabs value={period} onValueChange={setPeriod} className="mb-4"><TabsList><TabsTrigger value="week">Неделя</TabsTrigger><TabsTrigger value="month">Месяц</TabsTrigger><TabsTrigger value="year">Год</TabsTrigger></TabsList></Tabs>
      <QueryState q={cur}>{(d) => {
        const series = d.series.map((x) => ({ ...x, day: fmtDate(x.date, locale) }));
        return (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader title={`Итог периода: индекс ${d.productivity_score ?? "—"}`} /><CardBody className="grid grid-cols-2 gap-3 text-sm">
              <div>Задачи: <b>{d.task_completion_rate ?? "—"}%</b></div><div>Привычки: <b>{d.habit_completion_rate ?? "—"}%</b></div>
              <div>Фокус: <b>{d.focus_hours} ч</b> ({d.focus_sessions} сессий)</div><div>Обучение: <b>{d.learning_hours} ч</b></div>
            </CardBody></Card>
            <Card><CardHeader title="Частые отвлечения" /><CardBody>{top.length ? <ul className="space-y-1 text-sm">{top.map(([t, n]) => <li key={t} className="flex justify-between"><span>{t}</span><span className="text-muted">{n}</span></li>)}</ul>
              : <p className="text-sm text-muted">Записывайте отвлечения во время фокус-сессий</p>}</CardBody></Card>
            <Card><CardHeader title="Фокус, минут по дням" /><CardBody><BarsChart data={series} x="day" series={[{ key: "focus_minutes", label: "Фокус" }]} /></CardBody></Card>
            <Card><CardHeader title="Выполнено задач по дням" /><CardBody><LinesChart data={series} x="day" series={[{ key: "tasks_done", label: "Задачи" }, { key: "habit_checks", label: "Привычки" }]} area /></CardBody></Card>
          </div>
        );
      }}</QueryState>
    </div>
  );
}
