"use client";
import { ArrowDown, ArrowUp, Bot, CalendarDays, Check, Eye, EyeOff, Flame, GraduationCap, ListChecks, Quote, Repeat, Settings2, Sparkles, Star, Sun, Sunset, Target, Timer } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { BarsChart } from "@/components/charts";
import { Badge, Button, Card, CardBody, CardHeader, Dialog, EmptyState, ErrorState, Field, Progress, Select, Skeleton, Stat, Textarea } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { useGet, useMut } from "@/hooks/use-api";
import { patch, post, put } from "@/lib/api";
import type { TKey } from "@/lib/i18n";
import type { Goal, Habit, Occurrence, Task } from "@/lib/types";
import { cn, fmtDate, fmtMinutes, fmtTime } from "@/lib/utils";

type Dash = {
  user: { name: string }; date: string; layout: { widgets?: { id: string; visible: boolean }[] };
  today_tasks: Task[]; priorities: Task[]; overdue_count: number; habits: Habit[]; events: Occurrence[]; goals: Goal[];
  learning: { minutes_today: number; minutes_week: number; active_courses: { id: string; title: string; progress: number }[] };
  focus: { today_minutes: number; week_minutes: number; completed_sessions: number };
  cards_due: number;
  stats: { daily_progress: number | null; weekly_progress: number | null; monthly_progress: number | null; tasks_done_today: number; habits_done_today: number; habits_scheduled_today: number; learning_minutes_today: number; focus_minutes_today: number; current_streak: number; xp: number; level: number; level_xp_start: number; level_xp_next: number };
  weekly: { date: string; tasks_done: number; habit_checks: number; focus_minutes: number }[];
  quote: { text: string; author: string };
  recommendations: { kind: string; text: string; link: string }[];
};

const WIDGETS: { id: string; key: TKey; wide?: boolean }[] = [
  { id: "stats", key: "dash.stats", wide: true }, { id: "today_tasks", key: "dash.today_tasks" }, { id: "priorities", key: "dash.priorities" },
  { id: "habits", key: "dash.habits" }, { id: "events", key: "dash.events" }, { id: "goals", key: "dash.goals" },
  { id: "learning", key: "dash.learning" }, { id: "focus", key: "dash.focus" }, { id: "weekly", key: "dash.weekly", wide: true },
  { id: "quote", key: "dash.quote" }, { id: "ai", key: "dash.ai" },
];

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
}

export default function DashboardPage() {
  const { t, locale } = useI18n();
  const q = useGet<Dash>(["dashboard"], "/dashboard");
  const [customize, setCustomize] = React.useState(false);
  const [startOpen, setStartOpen] = React.useState(false);
  const [endOpen, setEndOpen] = React.useState(false);
  const toggleTask = useMut((tk: Task) => patch(`/tasks/${tk.id}`, { status: tk.status === "done" ? "todo" : "done" }), { invalidate: [["tasks"]] });
  const checkHabit = useMut((h: Habit) => post(`/habits/${h.id}/check`, {}), { invalidate: [["habits"]] });

  if (q.isLoading) return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48" />)}</div>;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const layout = (d.layout.widgets?.length ? d.layout.widgets : WIDGETS.map((w) => ({ id: w.id, visible: true })))
    .filter((w) => WIDGETS.some((x) => x.id === w.id));
  for (const w of WIDGETS) if (!layout.some((l) => l.id === w.id)) layout.push({ id: w.id, visible: false });

  const TaskRow = ({ tk }: { tk: Task }) => (
    <li className="flex items-center gap-2.5 py-1.5">
      <button onClick={() => toggleTask.mutate(tk)} aria-label="Отметить выполненной"
        className={cn("grid size-5 shrink-0 place-items-center rounded-full border", tk.status === "done" ? "border-success bg-success text-white" : "border-border hover:border-accent")}>
        {tk.status === "done" && <Check className="size-3" />}
      </button>
      <span className={cn("flex-1 truncate text-sm", tk.status === "done" && "text-muted line-through")}>{tk.title}</span>
      {tk.due_at && new Date(tk.due_at) < new Date(d.date + "T00:00:00") && <Badge tone="danger">просрочено</Badge>}
      {tk.priority === 1 && <Badge tone="warning">!</Badge>}
    </li>
  );

  const render = (id: string): React.ReactNode => {
    const s = d.stats;
    switch (id) {
      case "stats": return (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <Stat label="Прогресс дня" value={s.daily_progress === null ? "—" : `${s.daily_progress}%`} hint={`неделя ${s.weekly_progress ?? "—"}% · месяц ${s.monthly_progress ?? "—"}%`} />
          <Stat label="Задачи сегодня" value={s.tasks_done_today} hint="выполнено" icon={<ListChecks className="size-4" />} />
          <Stat label="Привычки" value={`${s.habits_done_today}/${s.habits_scheduled_today}`} icon={<Repeat className="size-4" />} />
          <Stat label="Обучение / Фокус" value={`${s.learning_minutes_today} / ${s.focus_minutes_today}`} hint="минут сегодня" icon={<Timer className="size-4" />} />
          <Stat label={t("dash.streak")} value={<span className="flex items-center gap-1">{s.current_streak}<Flame className="size-5 text-warning" /></span>} hint="дней подряд" />
          <Card className="p-4">
            <div className="flex items-center justify-between text-xs text-muted">{t("dash.level")} {s.level}<Star className="size-4" /></div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">{s.xp} XP</div>
            <Progress className="mt-2" value={((s.xp - s.level_xp_start) / Math.max(1, s.level_xp_next - s.level_xp_start)) * 100} />
            <div className="mt-1 text-[11px] text-muted">до уровня {s.level + 1}: {s.level_xp_next - s.xp} XP</div>
          </Card>
        </div>
      );
      case "today_tasks": return (
        <Card><CardHeader title={t("dash.today_tasks")} icon={<ListChecks className="size-4" />} action={<Link href="/tasks?view=today" className="text-xs text-accent">Все</Link>} />
          <CardBody>{d.today_tasks.length ? <ul className="divide-y divide-border">{d.today_tasks.slice(0, 8).map((tk) => <TaskRow key={tk.id} tk={tk} />)}</ul>
            : <p className="py-4 text-center text-sm text-muted">На сегодня задач нет</p>}
            {d.overdue_count > 0 && <p className="mt-2 text-xs text-danger">Просрочено: {d.overdue_count}</p>}</CardBody></Card>
      );
      case "priorities": return (
        <Card><CardHeader title={t("dash.priorities")} icon={<Star className="size-4" />} action={<Button size="sm" variant="ghost" onClick={() => setStartOpen(true)}>Выбрать</Button>} />
          <CardBody>{d.priorities.length ? <ul>{d.priorities.map((tk) => <TaskRow key={tk.id} tk={tk} />)}</ul> : <p className="py-4 text-center text-sm text-muted">Нет открытых задач</p>}</CardBody></Card>
      );
      case "habits": return (
        <Card><CardHeader title={t("dash.habits")} icon={<Repeat className="size-4" />} action={<Link href="/habits" className="text-xs text-accent">Все</Link>} />
          <CardBody>{d.habits.filter((h) => h.scheduled_today).length ? (
            <ul className="space-y-1.5">{d.habits.filter((h) => h.scheduled_today).map((h) => (
              <li key={h.id} className="flex items-center gap-2.5">
                <button onClick={() => checkHabit.mutate(h)} disabled={h.today_status === "done" && h.kind === "boolean"} aria-label={`Отметить ${h.title}`}
                  className="grid size-6 place-items-center rounded-md border" style={h.today_status === "done" ? { background: h.color, borderColor: h.color, color: "#fff" } : {}}>
                  {h.today_status === "done" && <Check className="size-3.5" />}
                </button>
                <span className="flex-1 truncate text-sm">{h.title}</span>
                {h.kind !== "boolean" && <span className="text-xs text-muted">{h.today_value}/{h.target} {h.unit}</span>}
                {h.current_streak > 0 && <span className="flex items-center gap-0.5 text-xs text-warning"><Flame className="size-3" />{h.current_streak}</span>}
              </li>))}</ul>) : <p className="py-4 text-center text-sm text-muted">Сегодня привычек нет</p>}</CardBody></Card>
      );
      case "events": return (
        <Card><CardHeader title={t("dash.events")} icon={<CalendarDays className="size-4" />} action={<Link href="/calendar" className="text-xs text-accent">Календарь</Link>} />
          <CardBody>{d.events.length ? <ul className="space-y-2">{d.events.slice(0, 6).map((e) => (
            <li key={e.event_id + e.starts_at} className="flex items-center gap-2 text-sm"><span className="h-8 w-1 rounded-full" style={{ background: e.color }} />
              <div className="min-w-0"><div className="truncate">{e.title}</div><div className="text-xs text-muted">{fmtDate(e.starts_at, locale, { weekday: "short", day: "numeric", month: "short" })} · {e.all_day ? "весь день" : fmtTime(e.starts_at, locale)}</div></div></li>))}</ul>
            : <p className="py-4 text-center text-sm text-muted">Событий на неделе нет</p>}</CardBody></Card>
      );
      case "goals": return (
        <Card><CardHeader title={t("dash.goals")} icon={<Target className="size-4" />} action={<Link href="/goals" className="text-xs text-accent">Все</Link>} />
          <CardBody>{d.goals.length ? <ul className="space-y-3">{d.goals.map((g) => (
            <li key={g.id}><Link href={`/goals/${g.id}`} className="block"><div className="mb-1 flex justify-between text-sm"><span className="truncate">{g.title}</span><span className="text-muted tabular-nums">{g.progress}%</span></div><Progress value={g.progress} /></Link></li>))}</ul>
            : <p className="py-4 text-center text-sm text-muted">Нет активных целей</p>}</CardBody></Card>
      );
      case "learning": return (
        <Card><CardHeader title={t("dash.learning")} icon={<GraduationCap className="size-4" />} action={<Link href="/learning" className="text-xs text-accent">Открыть</Link>} />
          <CardBody><div className="mb-3 flex gap-4 text-sm"><div><div className="text-xl font-semibold">{d.learning.minutes_today}</div><div className="text-xs text-muted">мин сегодня</div></div>
            <div><div className="text-xl font-semibold">{fmtMinutes(d.learning.minutes_week)}</div><div className="text-xs text-muted">за неделю</div></div>
            <div><div className="text-xl font-semibold">{d.cards_due}</div><div className="text-xs text-muted">карточек к повтору</div></div></div>
            {d.learning.active_courses.map((c) => <div key={c.id} className="mb-2"><div className="mb-1 flex justify-between text-xs"><span className="truncate">{c.title}</span><span>{c.progress}%</span></div><Progress value={c.progress} /></div>)}</CardBody></Card>
      );
      case "focus": return (
        <Card><CardHeader title={t("dash.focus")} icon={<Timer className="size-4" />} />
          <CardBody><div className="mb-3 flex gap-4"><div><div className="text-xl font-semibold">{d.focus.today_minutes}</div><div className="text-xs text-muted">мин сегодня</div></div>
            <div><div className="text-xl font-semibold">{fmtMinutes(d.focus.week_minutes)}</div><div className="text-xs text-muted">за неделю</div></div></div>
            <Button asChild className="w-full"><Link href="/focus"><Timer />Начать фокус-сессию</Link></Button></CardBody></Card>
      );
      case "weekly": return (
        <Card><CardHeader title={t("dash.weekly")} />
          <CardBody><BarsChart data={d.weekly.map((x) => ({ ...x, day: fmtDate(x.date, locale, { weekday: "short" }) }))} x="day"
            series={[{ key: "tasks_done", label: "Задачи" }, { key: "habit_checks", label: "Привычки" }]} height={200} /></CardBody></Card>
      );
      case "quote": return (
        <Card className="p-5"><Quote className="mb-2 size-5 text-muted" /><p className="text-sm leading-relaxed">{d.quote.text}</p><p className="mt-2 text-xs text-muted">— {d.quote.author}</p></Card>
      );
      case "ai": return (
        <Card><CardHeader title={t("dash.ai")} icon={<Sparkles className="size-4" />} action={<Link href="/ai" className="text-xs text-accent">AI</Link>} />
          <CardBody>{d.recommendations.length ? <ul className="space-y-2">{d.recommendations.map((r, i) => (
            <li key={i}><Link href={r.link} className="block rounded-md bg-surface-2 px-3 py-2 text-sm hover:bg-border">{r.text}</Link></li>))}</ul>
            : <p className="py-4 text-center text-sm text-muted">Всё под контролем — рекомендаций нет</p>}
            <p className="mt-2 text-[11px] text-muted">Рекомендации построены по правилам на основе ваших данных</p></CardBody></Card>
      );
    }
    return null;
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{new Date(d.date + "T12:00:00").toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{greeting()}, {d.user.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setStartOpen(true)}><Sun />{t("dash.start_day")}</Button>
          <Button variant="outline" size="sm" onClick={() => setEndOpen(true)}><Sunset />{t("dash.end_day")}</Button>
          <Button variant="outline" size="sm" asChild><Link href="/tasks?new=1">Задача</Link></Button>
          <Button variant="outline" size="sm" asChild><Link href="/habits?new=1">Привычка</Link></Button>
          <Button variant="outline" size="sm" asChild><Link href="/goals?new=1">Цель</Link></Button>
          <Button variant="outline" size="sm" asChild><Link href="/ai"><Bot />AI</Link></Button>
          <Button variant="ghost" size="sm" onClick={() => setCustomize(true)} aria-label={t("dash.customize")}><Settings2 /></Button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {layout.filter((w) => w.visible).map((w) => {
          const def = WIDGETS.find((x) => x.id === w.id)!;
          return <div key={w.id} className={def.wide ? "md:col-span-2 xl:col-span-3" : ""}>{render(w.id)}</div>;
        })}
      </div>
      {layout.every((w) => !w.visible) && <EmptyState title="Все виджеты скрыты" action={<Button size="sm" onClick={() => setCustomize(true)}>Настроить</Button>} />}
      <CustomizeDialog open={customize} onOpenChange={setCustomize} layout={layout} />
      <StartDayDialog open={startOpen} onOpenChange={setStartOpen} />
      <EndDayDialog open={endOpen} onOpenChange={setEndOpen} />
    </div>
  );
}

function CustomizeDialog({ open, onOpenChange, layout }: { open: boolean; onOpenChange: (v: boolean) => void; layout: { id: string; visible: boolean }[] }) {
  const { t } = useI18n();
  const [items, setItems] = React.useState(layout);
  React.useEffect(() => { if (open) setItems(layout); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMut(() => put("/dashboard/layout", { widgets: items }), { invalidate: [["me"]], success: "Расположение сохранено", onSuccess: () => onOpenChange(false) });
  const move = (i: number, dir: -1 | 1) => setItems((x) => { const y = [...x]; const j = i + dir; if (j < 0 || j >= y.length) return x; [y[i], y[j]] = [y[j], y[i]]; return y; });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("dash.customize")} description="Порядок, видимость и добавление виджетов сохраняются в вашем профиле."
      footer={<Button onClick={() => save.mutate()} loading={save.isPending}>Сохранить</Button>}>
      <ul className="space-y-1">{items.map((w, i) => { const def = WIDGETS.find((x) => x.id === w.id)!; return (
        <li key={w.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <span className={cn("flex-1", !w.visible && "text-muted")}>{t(def.key)}</span>
          <Button size="icon-sm" variant="ghost" onClick={() => move(i, -1)} aria-label="Выше"><ArrowUp /></Button>
          <Button size="icon-sm" variant="ghost" onClick={() => move(i, 1)} aria-label="Ниже"><ArrowDown /></Button>
          <Button size="icon-sm" variant="ghost" onClick={() => setItems((x) => x.map((y) => y.id === w.id ? { ...y, visible: !y.visible } : y))} aria-label={w.visible ? "Скрыть" : "Показать"}>{w.visible ? <Eye /> : <EyeOff />}</Button>
        </li>); })}</ul>
    </Dialog>
  );
}

function StartDayDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const tasks = useGet<{ items: Task[] }>(["tasks", "open-for-priorities"], open ? "/tasks?status=todo,in_progress,backlog&sort=priority&limit=50" : null);
  const [sel, setSel] = React.useState<string[]>(["", "", ""]);
  const [intention, setIntention] = React.useState("");
  const save = useMut(() => post("/dashboard/start-day", { priority_task_ids: sel.filter(Boolean), intention }), { invalidate: [["journal"]], success: "День начат", onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Начать день" description="Выберите три главных приоритета и намерение на день."
      footer={<Button onClick={() => save.mutate()} loading={save.isPending}>Начать</Button>}>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Field key={i} label={`Приоритет ${i + 1}`}>
            <Select value={sel[i]} onChange={(e) => setSel((x) => x.map((v, j) => (j === i ? e.target.value : v)))}>
              <option value="">—</option>
              {tasks.data?.items.map((tk) => <option key={tk.id} value={tk.id}>{tk.title}</option>)}
            </Select>
          </Field>
        ))}
        <Field label="Намерение на день (запишется в дневник)"><Textarea value={intention} onChange={(e) => setIntention(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}

function EndDayDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [reflection, setReflection] = React.useState("");
  const [mood, setMood] = React.useState("");
  const [result, setResult] = React.useState<{ summary: { tasks_done: number; habit_days_done: number; habit_days_evaluated: number; focus_hours: number; learning_hours: number; productivity_score: number | null } } | null>(null);
  const save = useMut(() => post<typeof result>("/dashboard/end-day", { reflection, mood: mood ? Number(mood) : null }), { invalidate: [["journal"]], onSuccess: (r) => setResult(r) });
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setResult(null); }} title="Завершить день"
      footer={result ? <Button onClick={() => onOpenChange(false)}>Готово</Button> : <Button onClick={() => save.mutate()} loading={save.isPending}>Подвести итоги</Button>}>
      {result ? (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="Задач выполнено" value={result.summary.tasks_done} />
          <Stat label="Привычки" value={`${result.summary.habit_days_done}/${result.summary.habit_days_evaluated}`} />
          <Stat label="Фокус" value={`${Math.round(result.summary.focus_hours * 60)} мин`} />
          <Stat label="Продуктивность" value={result.summary.productivity_score === null ? "—" : `${result.summary.productivity_score}%`} />
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Как прошёл день?"><Textarea value={reflection} onChange={(e) => setReflection(e.target.value)} placeholder="Что получилось, что можно улучшить…" /></Field>
          <Field label="Настроение (1–10)"><Select value={mood} onChange={(e) => setMood(e.target.value)}><option value="">—</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</Select></Field>
        </div>
      )}
    </Dialog>
  );
}
