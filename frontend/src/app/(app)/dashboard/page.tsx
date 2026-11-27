"use client";
import {
  ArrowRight, BookOpen, CalendarDays, Check, ChevronRight, Coins, Crosshair, Flame, FolderKanban, GraduationCap, ListChecks, Plus, Quote,
  Repeat, Snowflake, Sparkles, StickyNote, Sun, Sunset, Target, Trophy,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { BarsChart } from "@/components/charts";
import { useI18n, useMe } from "@/components/providers";
import { useQuickCreate } from "@/components/quick-create";
import {
  Badge, Button, Card, CardBody, CardHeader, Dialog, ErrorState, Field, Input, Progress, ProgressRing, Segmented, Select, Skeleton, Stat, Textarea, useToast,
} from "@/components/ui";
import { useGet, useMut } from "@/hooks/use-api";
import { patch, post } from "@/lib/api";
import type { Goal, Habit, Occurrence, Quest, Task } from "@/lib/types";
import { cn, fmtDate, fmtTime } from "@/lib/utils";

type Dash = {
  user: { name: string }; date: string;
  today_tasks: Task[]; priorities: Task[]; overdue_count: number; habits: Habit[]; events: Occurrence[]; goals: Goal[];
  focus: { today_minutes: number; week_minutes: number; completed_sessions: number };
  cards_due: number;
  stats: { daily_progress: number | null; weekly_progress: number | null; monthly_progress: number | null; tasks_done_today: number; habits_done_today: number; habits_scheduled_today: number; learning_minutes_today: number; focus_minutes_today: number; current_streak: number; xp: number; level: number; level_xp_start: number; level_xp_next: number };
  weekly: { date: string; tasks_done: number; habit_checks: number; focus_minutes: number }[];
  quote: { text: string; author: string };
  recommendations: { kind: string; text: string; link: string }[];
  continue: { kind: "task" | "project" | "course" | "note"; id: string; title: string; subtitle: string; progress: number | null; link: string }[];
  quests: Quest[]; coins: number;
  streak_restore: { missed_yesterday: boolean; free_available: boolean; freezes: number };
};

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
}

const CONTINUE_ICON = { task: ListChecks, project: FolderKanban, course: GraduationCap, note: StickyNote };

export default function DashboardPage() {
  const { locale } = useI18n();
  const me = useMe();
  const q = useGet<Dash>(["dashboard"], "/dashboard");
  const [startOpen, setStartOpen] = React.useState(false);
  const [endOpen, setEndOpen] = React.useState(false);
  const toggleTask = useMut((tk: Task) => patch(`/tasks/${tk.id}`, { status: tk.status === "done" ? "todo" : "done" }), { invalidate: [["tasks"], ["quests"]] });
  const checkHabit = useMut((h: Habit) => post(`/habits/${h.id}/check`, {}), { invalidate: [["habits"], ["quests"]] });
  const claim = useMut((code: string) => post<{ xp: number; coins: number }>(`/quests/${code}/claim`), { invalidate: [["quests"]] });
  const restore = useMut(() => post("/streaks/restore"), { invalidate: [["streaks"]], success: "Серия восстановлена" });
  const gamification = me.data?.settings.gamification_enabled !== false;

  if (q.isLoading) return <DashboardSkeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const s = d.stats;
  const habitsToday = d.habits.filter((h) => h.scheduled_today);
  const doneUnits = s.tasks_done_today + s.habits_done_today;
  const totalUnits = s.tasks_done_today + d.today_tasks.length + habitsToday.length;
  const dayPct = totalUnits ? (doneUnits / totalUnits) * 100 : 0;
  const levelPct = ((s.xp - s.level_xp_start) / Math.max(1, s.level_xp_next - s.level_xp_start)) * 100;
  const todayLine = [d.today_tasks.length && `${d.today_tasks.length} ${plural(d.today_tasks.length, "задача", "задачи", "задач")}`,
    habitsToday.length - s.habits_done_today > 0 && `${habitsToday.length - s.habits_done_today} ${plural(habitsToday.length - s.habits_done_today, "привычка", "привычки", "привычек")}`,
    d.events.filter((e) => e.starts_at.slice(0, 10) === d.date).length && `${d.events.filter((e) => e.starts_at.slice(0, 10) === d.date).length} в календаре`].filter(Boolean);

  const TaskRow = ({ tk, big }: { tk: Task; big?: boolean }) => (
    <li className={cn("group flex items-center gap-3", big ? "py-2.5" : "py-2")}>
      <button onClick={() => toggleTask.mutate(tk)} aria-label={tk.status === "done" ? "Вернуть в работу" : "Отметить выполненной"}
        className={cn("grid shrink-0 place-items-center rounded-full border-2 transition-all", big ? "size-6" : "size-5",
          tk.status === "done" ? "border-success bg-success text-white" : "border-border-strong hover:border-accent hover:bg-accent-softer")}>
        {tk.status === "done" && <Check className="size-3" strokeWidth={3} />}
      </button>
      <span className={cn("min-w-0 flex-1 truncate", big ? "text-[15px] font-medium" : "text-sm", tk.status === "done" && "text-muted line-through")}>{tk.title}</span>
      {tk.due_at && new Date(tk.due_at) < new Date(d.date + "T00:00:00") && tk.status !== "done" && <Badge tone="danger">просрочено</Badge>}
      {tk.priority === 1 && <Badge tone="warning">срочно</Badge>}
    </li>
  );

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------ hero */}
      <section className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="flex flex-col justify-end">
          <p className="text-sm text-muted first-letter:uppercase">{new Date(d.date + "T12:00:00").toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight sm:text-3xl">{greeting()}, {d.user.name || "друг"}</h1>
          <p className="mt-1.5 text-sm text-muted">{todayLine.length ? `Сегодня: ${todayLine.join(" · ")}` : "На сегодня всё спокойно — хорошее время для цели или обучения."}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="soft" onClick={() => setStartOpen(true)}><Sun />Начать день</Button>
            <Button size="sm" variant="ghost" onClick={() => setEndOpen(true)}><Sunset />Завершить день</Button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:min-w-[440px]">
          <HeroTile label="Прогресс дня" sub={totalUnits ? `${doneUnits} из ${totalUnits}` : "нет дел"}>
            <ProgressRing value={dayPct} size={58} stroke={6} color="var(--success)" label="Прогресс дня"><span className="text-sm font-semibold">{Math.round(dayPct)}%</span></ProgressRing>
          </HeroTile>
          {gamification ? (
            <HeroTile label={`Уровень ${s.level}`} sub={`${s.level_xp_next - s.xp} XP до ${s.level + 1}`} href="/rewards">
              <ProgressRing value={levelPct} size={58} stroke={6} label="Прогресс уровня"><span className="text-lg font-bold">{s.level}</span></ProgressRing>
            </HeroTile>
          ) : <HeroTile label="Задачи сегодня" sub="выполнено"><span className="text-3xl font-semibold">{s.tasks_done_today}</span></HeroTile>}
          <HeroTile label="Серия" sub={s.current_streak ? "дней подряд" : "начните сегодня"} href="/progress">
            <div className="flex items-center gap-1"><Flame className={cn("size-7", s.current_streak ? "text-warning" : "text-faint")} /><span className="text-3xl font-semibold tabular-nums">{s.current_streak}</span></div>
          </HeroTile>
        </div>
      </section>

      {gamification && d.streak_restore.missed_yesterday && (d.streak_restore.free_available || d.streak_restore.freezes > 0) && (
        <Card className="flex flex-wrap items-center gap-3 border-info/30 bg-info/5 p-4">
          <Snowflake className="size-5 text-info" />
          <p className="flex-1 text-sm">Вчера активности не было. Серию можно сохранить {d.streak_restore.free_available ? "— бесплатное восстановление доступно раз в неделю" : `заморозкой (есть ${d.streak_restore.freezes})`}.</p>
          <Button size="sm" variant="outline" loading={restore.isPending} onClick={() => restore.mutate()}>Сохранить серию</Button>
        </Card>
      )}

      {/* ------------------------------------------------ focus + quick add */}
      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="relative overflow-hidden xl:col-span-2">
          <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-accent/10 blur-3xl" />
          <CardHeader title="Сегодняшний фокус" subtitle="1–3 главные задачи — остальное подождёт" icon={<Crosshair />}
            action={<Button size="xs" variant="ghost" onClick={() => setStartOpen(true)}>{d.priorities.length ? "Изменить" : "Выбрать"}</Button>} />
          <CardBody>
            {d.priorities.length ? <ul className="divide-y divide-border">{d.priorities.map((tk) => <TaskRow key={tk.id} tk={tk} big />)}</ul> : (
              <div className="flex flex-col items-start gap-3 py-3">
                <p className="text-sm text-muted">Выберите до трёх задач, на которых сосредоточитесь сегодня. За план дня начисляется +10 XP.</p>
                <Button size="sm" onClick={() => setStartOpen(true)}><Crosshair />Выбрать фокус</Button>
              </div>
            )}
          </CardBody>
        </Card>
        <QuickAdd />
      </section>

      {/* ------------------------------------------------ today */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title="Задачи на сегодня" icon={<ListChecks />} subtitle={d.overdue_count ? `просрочено: ${d.overdue_count}` : undefined}
            action={<Link href="/tasks?view=today" className="text-xs text-muted hover:text-accent">Все</Link>} />
          <CardBody>{d.today_tasks.length ? <ul className="divide-y divide-border">{d.today_tasks.slice(0, 7).map((tk) => <TaskRow key={tk.id} tk={tk} />)}</ul>
            : <Empty icon={<Check />} text="На сегодня задач нет" action="/tasks" label="Запланировать" />}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Привычки сегодня" icon={<Repeat />} subtitle={habitsToday.length ? `${s.habits_done_today} из ${habitsToday.length}` : undefined}
            action={<Link href="/habits" className="text-xs text-muted hover:text-accent">Все</Link>} />
          <CardBody>{habitsToday.length ? (
            <ul className="space-y-1">{habitsToday.map((h) => (
              <li key={h.id} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
                <button onClick={() => checkHabit.mutate(h)} disabled={h.today_status === "done" && h.kind === "boolean"} aria-label={`Отметить ${h.title}`}
                  className="grid size-7 shrink-0 place-items-center rounded-lg border-2 transition-all hover:scale-105"
                  style={h.today_status === "done" ? { background: h.color, borderColor: h.color, color: "#fff" } : { borderColor: `color-mix(in srgb, ${h.color} 50%, var(--border))` }}>
                  {h.today_status === "done" && <Check className="size-4" strokeWidth={3} />}
                </button>
                <span className={cn("min-w-0 flex-1 truncate text-sm", h.today_status === "done" && "text-muted")}>{h.title}</span>
                {h.kind !== "boolean" && <span className="text-xs tabular-nums text-muted">{h.today_value}/{h.target}</span>}
                {h.current_streak > 0 && <span className="flex items-center gap-0.5 text-xs font-medium text-warning"><Flame className="size-3.5" />{h.current_streak}</span>}
              </li>))}</ul>) : <Empty icon={<Repeat />} text="Сегодня привычек нет" action="/habits" label="Добавить привычку" />}</CardBody>
        </Card>
        <Card className="md:col-span-2 xl:col-span-1">
          <CardHeader title="Ближайшие события" icon={<CalendarDays />} action={<Link href="/calendar" className="text-xs text-muted hover:text-accent">Календарь</Link>} />
          <CardBody>{d.events.length ? <ul className="space-y-2.5">{d.events.slice(0, 5).map((e) => (
            <li key={e.event_id + e.starts_at} className="flex items-center gap-3 text-sm">
              <div className="w-11 shrink-0 text-center"><div className="text-[10px] uppercase text-faint">{fmtDate(e.starts_at, locale, { weekday: "short" })}</div><div className="text-base font-semibold leading-tight">{new Date(e.starts_at).getDate()}</div></div>
              <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: e.color }} />
              <div className="min-w-0"><div className={cn("truncate", e.done && "text-muted line-through")}>{e.title}</div><div className="text-xs text-muted">{e.all_day ? "весь день" : fmtTime(e.starts_at, locale)}</div></div>
            </li>))}</ul>
            : <Empty icon={<CalendarDays />} text="Событий на неделе нет" action="/calendar" label="Открыть календарь" />}</CardBody>
        </Card>
      </section>

      {/* ------------------------------------------------ growth */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title="Активные цели" icon={<Target />} action={<Link href="/goals" className="text-xs text-muted hover:text-accent">Все</Link>} />
          <CardBody>{d.goals.length ? <ul className="space-y-3.5">{d.goals.map((g) => (
            <li key={g.id}><Link href={`/goals/${g.id}`} className="group block">
              <div className="mb-1.5 flex justify-between gap-2 text-sm"><span className="truncate group-hover:text-accent">{g.title}</span><span className="tabular-nums text-muted">{Math.round(g.progress)}%</span></div>
              <Progress value={g.progress} />
              {g.deadline && <div className="mt-1 text-[11px] text-faint">до {fmtDate(g.deadline, locale, { day: "numeric", month: "long" })}</div>}
            </Link></li>))}</ul>
            : <Empty icon={<Target />} text="Поставьте первую цель — к ней можно привязать задачи и привычки" action="/goals" label="Создать цель" />}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Продолжить развитие" icon={<Sparkles />} subtitle="К чему вы недавно возвращались" />
          <CardBody>{d.continue.length ? <ul className="space-y-1">{d.continue.map((c) => {
            const I = CONTINUE_ICON[c.kind];
            return (
              <li key={c.kind + c.id}><Link href={c.link} className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-surface-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted group-hover:text-accent"><I className="size-4" /></span>
                <div className="min-w-0 flex-1"><div className="truncate text-sm">{c.title}</div>
                  <div className="flex items-center gap-2 text-[11px] text-muted">{c.subtitle}{c.progress !== null && <Progress value={c.progress} size="xs" className="max-w-20" />}</div></div>
                <ChevronRight className="size-4 text-faint transition-transform group-hover:translate-x-0.5" />
              </Link></li>);
          })}</ul> : <Empty icon={<BookOpen />} text="Здесь появятся проекты в работе, курсы и последние заметки" action="/projects" label="Начать проект" />}</CardBody>
        </Card>
        {gamification ? (
          <Card className="md:col-span-2 xl:col-span-1">
            <CardHeader title="Квесты дня" icon={<Trophy />} subtitle={<span className="flex items-center gap-1"><Coins className="size-3 text-warning" />{d.coins} монет</span>}
              action={<Link href="/rewards" className="text-xs text-muted hover:text-accent">Все квесты</Link>} />
            <CardBody><ul className="space-y-3">{[...d.quests].sort((a, b) => Number(a.claimed) - Number(b.claimed) || Number(b.completed) - Number(a.completed)).slice(0, 4).map((qq) => (
              <li key={qq.code} className={cn(qq.claimed && "opacity-55")}>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                  <span className={cn("truncate", qq.claimed && "line-through")}>{qq.title}</span>
                  {qq.completed && !qq.claimed ? <Button size="xs" onClick={() => claim.mutate(qq.code)} loading={claim.isPending && claim.variables === qq.code}>+{qq.xp} XP</Button>
                    : <span className="text-xs tabular-nums text-muted">{qq.claimed ? "получено" : `${qq.progress}/${qq.target}`}</span>}
                </div>
                <Progress value={(qq.progress / qq.target) * 100} size="xs" color={qq.completed ? "var(--success)" : undefined} />
              </li>))}</ul></CardBody>
          </Card>
        ) : (
          <Card className="p-5"><Quote className="mb-2 size-5 text-faint" /><p className="text-sm leading-relaxed">{d.quote.text}</p><p className="mt-2 text-xs text-muted">— {d.quote.author}</p></Card>
        )}
      </section>

      {/* ------------------------------------------------ week */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Последние 7 дней" icon={<Sparkles />} action={<Link href="/progress" className="flex items-center gap-1 text-xs text-muted hover:text-accent">Прогресс<ArrowRight className="size-3" /></Link>} />
          <CardBody>
            <div className="mb-3 grid grid-cols-3 gap-3">
              <MiniStat label="Продуктивность" value={s.weekly_progress === null ? "—" : `${s.weekly_progress}%`} />
              <MiniStat label="Фокус сегодня" value={`${s.focus_minutes_today} мин`} />
              <MiniStat label="Обучение сегодня" value={`${s.learning_minutes_today} мин`} />
            </div>
            <BarsChart data={d.weekly.map((x) => ({ ...x, day: fmtDate(x.date, locale, { weekday: "short" }) }))} x="day"
              series={[{ key: "tasks_done", label: "Задачи" }, { key: "habit_checks", label: "Привычки" }]} height={180} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Подсказки" icon={<Sparkles />} subtitle="По правилам на основе ваших данных" />
          <CardBody className="space-y-2">
            {d.recommendations.length ? d.recommendations.slice(0, 4).map((r, i) => (
              <Link key={i} href={r.link} className="block rounded-xl bg-surface-2 px-3 py-2.5 text-sm transition-colors hover:bg-surface-3">{r.text}</Link>))
              : <p className="rounded-xl bg-surface-2 px-3 py-3 text-sm text-muted">Всё под контролем — подсказок нет.</p>}
            <div className="rounded-xl border border-border p-3"><Quote className="mb-1 size-4 text-faint" /><p className="text-sm leading-relaxed">{d.quote.text}</p><p className="mt-1 text-xs text-muted">— {d.quote.author}</p></div>
          </CardBody>
        </Card>
      </section>

      <StartDayDialog open={startOpen} onOpenChange={setStartOpen} current={d.priorities.map((p) => p.id)} />
      <EndDayDialog open={endOpen} onOpenChange={setEndOpen} />
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
}

function HeroTile({ label, sub, children, href }: { label: string; sub: string; children: React.ReactNode; href?: string }) {
  const body = (
    <Card interactive={!!href} className="flex h-full flex-col items-center justify-center gap-1.5 px-2 py-4 text-center">
      {children}
      <div className="text-xs font-medium">{label}</div>
      <div className="text-[11px] text-muted">{sub}</div>
    </Card>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-xl bg-surface-2 px-3 py-2"><div className="text-[11px] text-muted">{label}</div><div className="text-base font-semibold tabular-nums">{value}</div></div>;
}

function Empty({ icon, text, action, label }: { icon: React.ReactNode; text: string; action: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-5 text-center">
      <span className="grid size-9 place-items-center rounded-xl bg-surface-2 text-faint [&_svg]:size-4">{icon}</span>
      <p className="max-w-60 text-sm text-muted">{text}</p>
      <Button size="xs" variant="ghost" asChild><Link href={action}><Plus />{label}</Link></Button>
    </div>
  );
}

/** Type a title and press Enter: task, note or habit in one step. */
function QuickAdd() {
  const [kind, setKind] = React.useState<"task" | "note" | "habit">("task");
  const [title, setTitle] = React.useState("");
  const create = useQuickCreate();
  const toast = useToast();
  const add = useMut(async () => {
    const t = title.trim();
    if (kind === "task") return post("/tasks", { title: t, due_at: new Date(new Date().setHours(18, 0, 0, 0)).toISOString() });
    if (kind === "note") return post("/notes", { title: t });
    return post("/habits", { title: t, start_date: new Date().toISOString().slice(0, 10) });
  }, { invalidate: [["tasks"], ["notes"], ["habits"]], onSuccess: () => { toast(kind === "task" ? "Задача на сегодня добавлена" : kind === "note" ? "Заметка создана" : "Привычка добавлена"); setTitle(""); } });
  return (
    <Card>
      <CardHeader title="Быстро добавить" icon={<Plus />} />
      <CardBody className="space-y-3">
        <Segmented size="sm" stretch value={kind} onChange={setKind} options={[{ value: "task", label: "Задача" }, { value: "note", label: "Заметка" }, { value: "habit", label: "Привычка" }]} />
        <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) add.mutate(); }} className="flex gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-label="Название"
            placeholder={kind === "task" ? "Что сделать сегодня?" : kind === "note" ? "Название заметки" : "Новая привычка"} />
          <Button type="submit" size="icon" loading={add.isPending} disabled={!title.trim()} aria-label="Добавить"><ArrowRight /></Button>
        </form>
        <button onClick={() => create(kind)} className="text-xs text-muted hover:text-accent">Больше полей: срок, цель, проект, шаблон →</button>
      </CardBody>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="grid gap-4 lg:grid-cols-[1fr_440px]"><div className="space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-9 w-72" /><Skeleton className="h-4 w-56" /></div>
        <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}</div></div>
      <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-44 lg:col-span-2" /><Skeleton className="h-44" /></div>
      <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-60" />)}</div>
    </div>
  );
}

function StartDayDialog({ open, onOpenChange, current }: { open: boolean; onOpenChange: (v: boolean) => void; current: string[] }) {
  const tasks = useGet<{ items: Task[] }>(["tasks", "open-for-priorities"], open ? "/tasks?status=todo,in_progress,backlog&sort=priority&limit=50" : null);
  const [sel, setSel] = React.useState<string[]>(["", "", ""]);
  const [intention, setIntention] = React.useState("");
  React.useEffect(() => { if (open) setSel([0, 1, 2].map((i) => current[i] ?? "")); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMut(() => post("/dashboard/start-day", { priority_task_ids: sel.filter(Boolean), intention }), { invalidate: [["journal"], ["quests"]], success: "Фокус дня сохранён", onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Сегодняшний фокус" description="Выберите до трёх главных задач и, если хотите, намерение на день."
      footer={<Button onClick={() => save.mutate()} loading={save.isPending}>Сохранить</Button>}>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Field key={i} label={`Главное №${i + 1}`}>
            <Select value={sel[i]} onChange={(e) => setSel((x) => x.map((v, j) => (j === i ? e.target.value : v)))}>
              <option value="">—</option>
              {tasks.data?.items.map((tk) => <option key={tk.id} value={tk.id}>{tk.title}</option>)}
            </Select>
          </Field>
        ))}
        {tasks.data && !tasks.data.items.length && <p className="text-sm text-muted">Открытых задач нет — сначала добавьте задачу.</p>}
        <Field label="Намерение на день (запишется в дневник)"><Textarea value={intention} onChange={(e) => setIntention(e.target.value)} placeholder="Например: спокойно и без спешки закончить отчёт" /></Field>
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
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setResult(null); }} title="Итоги дня"
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
