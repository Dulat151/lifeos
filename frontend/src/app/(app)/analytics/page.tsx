"use client";
import { ArrowDownRight, ArrowUpRight, Download, Info } from "lucide-react";
import * as React from "react";
import { BarsChart, LinesChart } from "@/components/charts";
import { Button, Card, CardBody, CardHeader, Dialog, Input, PageHeader, QueryState, Select, Tabs, TabsList, TabsTrigger } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { useGet } from "@/hooks/use-api";
import { useOverview } from "@/hooks/use-overview";
import { download, qs } from "@/lib/api";
import { fmtDate, fmtMoney, GOAL_CATEGORIES } from "@/lib/utils";


function Delta({ cur, prev, suffix = "" }: { cur: number | null; prev: number | null | undefined; suffix?: string }) {
  if (cur === null || prev === null || prev === undefined) return null;
  const d = Math.round((cur - prev) * 10) / 10;
  if (d === 0) return <span className="text-xs text-muted">без изменений</span>;
  return <span className={`inline-flex items-center text-xs ${d > 0 ? "text-success" : "text-danger"}`}>{d > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{d > 0 ? "+" : ""}{d}{suffix} к прошлому периоду</span>;
}

function Metric({ label, value, cur, prev, suffix, hint }: { label: string; value: React.ReactNode; cur: number | null; prev?: number | null; suffix?: string; hint?: string }) {
  return <Card className="p-4"><div className="text-xs text-muted">{label}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div><Delta cur={cur} prev={prev} suffix={suffix} />{hint && <div className="mt-0.5 text-[11px] text-muted">{hint}</div>}</Card>;
}


export default function AnalyticsPage() {
  const { locale } = useI18n();
  const [period, setPeriod] = React.useState("last30");
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [formulas, setFormulas] = React.useState(false);
  const q = useOverview(period, start, end, category);
  const doc = useGet<{ doc: string }>(["analytics", "formulas"], formulas ? "/analytics/formulas" : null);
  return (
    <div>
      <PageHeader title="Аналитика" subtitle="Все показатели считаются из ваших реальных данных" actions={<>
        <Button variant="ghost" size="sm" onClick={() => setFormulas(true)}><Info />Формулы</Button>
        <Button variant="outline" size="sm" onClick={() => download(`/analytics/export.csv${qs(period === "custom" && start && end ? { start, end } : { period: period === "custom" ? "last30" : period })}`, "analytics.csv")}><Download />CSV</Button></>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={period} onValueChange={setPeriod}><TabsList>
          {[["day", "День"], ["week", "Неделя"], ["month", "Месяц"], ["last30", "30 дней"], ["year", "Год"], ["custom", "Период"]].map(([v, l]) => <TabsTrigger key={v} value={v}>{l}</TabsTrigger>)}
        </TabsList></Tabs>
        {period === "custom" && <><Input type="date" className="w-40" value={start} onChange={(e) => setStart(e.target.value)} /><Input type="date" className="w-40" value={end} onChange={(e) => setEnd(e.target.value)} /></>}
        <Select className="w-48" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Все категории</option>{Object.entries(GOAL_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      </div>
      <QueryState q={q}>{(d) => {
        const p = d.previous;
        const series = d.series.map((x) => ({ ...x, day: fmtDate(x.date, locale) }));
        return (
          <>
            <p className="mb-3 text-xs text-muted">{fmtDate(d.period.start, locale, { day: "numeric", month: "long", year: "numeric" })} — {fmtDate(d.period.end, locale, { day: "numeric", month: "long", year: "numeric" })} ({d.period.days} дн.)</p>
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Metric label="Продуктивность" value={d.productivity_score === null ? "—" : `${d.productivity_score}`} cur={d.productivity_score} prev={p?.productivity_score} hint="индекс 0–100" />
              <Metric label="Выполнение задач" value={d.task_completion_rate === null ? "—" : `${d.task_completion_rate}%`} cur={d.task_completion_rate} prev={p?.task_completion_rate} suffix="%" hint={`${d.tasks_done} из ${d.tasks_considered}`} />
              <Metric label="Выполнение привычек" value={d.habit_completion_rate === null ? "—" : `${d.habit_completion_rate}%`} cur={d.habit_completion_rate} prev={p?.habit_completion_rate} suffix="%" hint={`${d.habit_days_done} из ${d.habit_days_evaluated}`} />
              <Metric label="Прогресс целей" value={d.goal_progress === null ? "—" : `${d.goal_progress}%`} cur={d.goal_progress} prev={p?.goal_progress} hint={`${d.active_goals} активных`} />
              <Metric label="Обучение" value={`${d.learning_hours} ч`} cur={d.learning_hours} prev={p?.learning_hours} suffix=" ч" />
              <Metric label="Фокус" value={`${d.focus_hours} ч`} cur={d.focus_hours} prev={p?.focus_hours} suffix=" ч" hint={`${d.focus_sessions} сессий`} />
              <Metric label="Чтение" value={`${d.reading_pages} стр.`} cur={d.reading_pages} prev={p?.reading_pages} />
              <Metric label="Тренировки" value={d.workouts} cur={d.workouts} prev={p?.workouts} hint={`${d.workout_minutes} мин`} />
              <Metric label="Доходы" value={fmtMoney(d.finance.income, d.finance.currency, locale)} cur={null} />
              <Metric label="Расходы" value={fmtMoney(d.finance.expense, d.finance.currency, locale)} cur={null} />
              <Metric label="Баланс" value={fmtMoney(d.finance.balance, d.finance.currency, locale)} cur={null} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card><CardHeader title="Задачи и привычки по дням" /><CardBody><BarsChart data={series} x="day" series={[{ key: "tasks_done", label: "Задачи" }, { key: "habit_checks", label: "Привычки" }]} /></CardBody></Card>
              <Card><CardHeader title="Фокус и обучение, минут" /><CardBody><LinesChart data={series} x="day" series={[{ key: "focus_minutes", label: "Фокус" }, { key: "learning_minutes", label: "Обучение" }]} /></CardBody></Card>
            </div>
          </>
        );
      }}</QueryState>
      <Dialog open={formulas} onOpenChange={setFormulas} title="Формулы расчёта" wide><pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md bg-surface-2 p-3 text-xs">{doc.data?.doc ?? "Загрузка…"}</pre></Dialog>
    </div>
  );
}
