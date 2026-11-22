"use client";
import { Check, Flame, Pencil, Plus, SkipForward, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { BarsChart, Heatmap } from "@/components/charts";
import { Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, Field, Input, PageHeader, QueryState, Select, Stat, Switch, Textarea } from "@/components/ui";
import { useGet, useMut } from "@/hooks/use-api";
import { del, patch, post } from "@/lib/api";
import type { Goal, Habit, HabitStats } from "@/lib/types";
import { cn, isoDate } from "@/lib/utils";

const FREQ: Record<string, string> = { daily: "Ежедневно", weekly: "N раз в неделю", selected_days: "По дням недели", monthly: "N раз в месяц", custom: "Каждые N дней" };
const KIND: Record<string, string> = { boolean: "Да / Нет", numeric: "Количество", duration: "Длительность (мин)" };
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export default function HabitsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const q = useGet<Habit[]>(["habits"], "/habits");
  const [editing, setEditing] = React.useState<Habit | "new" | null>(params.get("new") === "1" ? "new" : null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const inv = { invalidate: [["habits"]] };
  const check = useMut((v: { h: Habit; value?: number; status?: string }) => post(`/habits/${v.h.id}/check`, { value: v.value, status: v.status ?? "done" }), inv);
  const uncheck = useMut((h: Habit) => del(`/habits/${h.id}/check`), inv);
  const active = q.data?.filter((h) => h.is_active) ?? [];
  const sel = q.data?.find((h) => h.id === selected) ?? active[0];
  return (
    <div>
      <PageHeader title="Привычки" subtitle="Одна отметка в день; пропуск сохраняет серию" actions={<Button onClick={() => setEditing("new")}><Plus />Привычка</Button>} />
      <QueryState q={q} empty={<EmptyState title="Привычек пока нет" text="Начните с одной маленькой привычки — например, стакан воды утром." action={<Button size="sm" onClick={() => setEditing("new")}><Plus />Создать</Button>} />}>
        {(habits) => (
          <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
            <div className="space-y-2">
              {habits.map((h) => {
                const done = h.today_status === "done" && (h.kind === "boolean" || h.today_value >= h.target);
                return (
                  <Card key={h.id} className={cn("flex items-center gap-3 p-3", sel?.id === h.id && "border-accent/60", !h.is_active && "opacity-60")}>
                    <button onClick={() => (done && h.kind === "boolean" ? uncheck.mutate(h) : check.mutate({ h }))} disabled={!h.scheduled_today && !done} aria-label={done ? "Снять отметку" : "Отметить"}
                      className="grid size-9 shrink-0 place-items-center rounded-lg border-2 transition-colors" style={done ? { background: h.color, borderColor: h.color, color: "#fff" } : { borderColor: h.color }}>
                      {done ? <Check className="size-5" /> : h.kind !== "boolean" ? <span className="text-[10px] font-semibold" style={{ color: h.color }}>{Math.round((h.today_value / h.target) * 100)}%</span> : null}
                    </button>
                    <button className="min-w-0 flex-1 text-left" onClick={() => setSelected(h.id)}>
                      <div className="truncate text-sm font-medium">{h.title}</div>
                      <div className="flex flex-wrap gap-2 text-xs text-muted">
                        <span>{FREQ[h.frequency]}{h.frequency === "selected_days" && `: ${(h.schedule.weekdays ?? []).map((d) => WD[d]).join(", ")}`}</span>
                        {h.kind !== "boolean" && <span>{h.today_value}/{h.target} {h.unit}</span>}
                        {!h.scheduled_today && <span>сегодня не запланирована</span>}
                        {h.today_status === "skipped" && <Badge tone="warning">пропуск</Badge>}
                      </div>
                    </button>
                    {h.kind !== "boolean" && h.scheduled_today && <NumericInput h={h} onAdd={(v) => check.mutate({ h, value: v })} />}
                    {h.scheduled_today && !done && h.today_status !== "skipped" && <Button size="icon-sm" variant="ghost" title="Пропустить сегодня" aria-label="Пропустить" onClick={() => check.mutate({ h, status: "skipped" })}><SkipForward /></Button>}
                    <span className="flex w-10 items-center justify-end gap-0.5 text-sm text-warning"><Flame className="size-4" />{h.current_streak}</span>
                    <Button size="icon-sm" variant="ghost" onClick={() => setEditing(h)} aria-label="Изменить"><Pencil /></Button>
                  </Card>
                );
              })}
            </div>
            {sel && <HabitStatsPanel habit={sel} />}
          </div>
        )}
      </QueryState>
      {editing && <HabitDialog habit={editing === "new" ? null : editing} onClose={() => { setEditing(null); if (params.get("new")) router.replace("/habits"); }} />}
    </div>
  );
}

function NumericInput({ h, onAdd }: { h: Habit; onAdd: (v: number) => void }) {
  const [v, setV] = React.useState("");
  return (
    <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const n = Number(v); if (n > 0) { onAdd(h.allow_multiple_per_day ? n : n); setV(""); } }}>
      <Input className="h-8 w-20" type="number" min={0} value={v} onChange={(e) => setV(e.target.value)} placeholder={h.allow_multiple_per_day ? "+" : "="} aria-label="Значение" />
    </form>
  );
}

function HabitStatsPanel({ habit }: { habit: Habit }) {
  const stats = useGet<HabitStats>(["habits", habit.id, "stats"], `/habits/${habit.id}/stats`);
  const heat = useGet<{ date: string; level: number; scheduled: boolean; status: string | null; value: number }[]>(["habits", habit.id, "heatmap"], `/habits/${habit.id}/heatmap?days=182`);
  const weekly = React.useMemo(() => {
    const out: { week: string; done: number }[] = [];
    const days = heat.data ?? [];
    for (let i = Math.max(0, days.length - 84); i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      out.push({ week: chunk[0]?.date.slice(5) ?? "", done: chunk.filter((d) => d.status === "done").length });
    }
    return out;
  }, [heat.data]);
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="mb-3 font-medium">{habit.title}</h3>
        {stats.data && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Текущая серия" value={stats.data.current_streak} /><Stat label="Лучшая серия" value={stats.data.best_streak} />
            <Stat label="Выполнение" value={`${stats.data.completion_rate}%`} /><Stat label="Всего" value={stats.data.total_completions} />
            <Stat label="Неделя" value={`${stats.data.weekly_completion}%`} /><Stat label="Месяц" value={`${stats.data.monthly_completion}%`} />
            <Stat label="Год" value={`${stats.data.yearly_completion}%`} /><Stat label="Пропущено" value={stats.data.missed} />
          </div>
        )}
      </Card>
      <Card className="p-4"><h4 className="mb-2 text-sm font-medium">Тепловая карта (полгода)</h4>{heat.data && <Heatmap days={heat.data} color={habit.color} />}</Card>
      <Card className="p-4"><h4 className="mb-2 text-sm font-medium">Выполнений по неделям</h4><BarsChart data={weekly} x="week" series={[{ key: "done", label: "Дней", color: habit.color }]} height={160} /></Card>
      <HistoryEditor habit={habit} days={heat.data ?? []} />
    </div>
  );
}

function HistoryEditor({ habit, days }: { habit: Habit; days: { date: string; status: string | null; value: number; scheduled: boolean }[] }) {
  const inv = { invalidate: [["habits"]] };
  const mark = useMut((d: string) => post(`/habits/${habit.id}/check`, { log_date: d }), inv);
  const unmark = useMut((d: string) => del(`/habits/${habit.id}/check?log_date=${d}`), inv);
  const last = days.slice(-14);
  return (
    <Card className="p-4">
      <h4 className="mb-2 text-sm font-medium">История (14 дней) — нажмите, чтобы исправить</h4>
      <div className="flex flex-wrap gap-1.5">
        {last.map((d) => (
          <button key={d.date} onClick={() => (d.status ? unmark.mutate(d.date) : mark.mutate(d.date))} disabled={d.date < habit.start_date}
            className={cn("w-10 rounded-md border py-1 text-center text-xs", d.status === "done" ? "text-white" : d.status === "skipped" ? "border-warning text-warning" : "border-border text-muted", !d.scheduled && "opacity-50")}
            style={d.status === "done" ? { background: habit.color, borderColor: habit.color } : undefined} title={d.date}>
            {d.date.slice(8)}
          </button>
        ))}
      </div>
    </Card>
  );
}

function HabitDialog({ habit, onClose }: { habit: Habit | null; onClose: () => void }) {
  const goals = useGet<Goal[]>(["goals", "active"], "/goals?status=active");
  const [f, setF] = React.useState({
    title: habit?.title ?? "", description: habit?.description ?? "", category: habit?.category ?? "", color: habit?.color ?? "#22c55e",
    icon: habit?.icon ?? "check", kind: habit?.kind ?? "boolean", frequency: habit?.frequency ?? "daily", target: String(habit?.target ?? 1),
    unit: habit?.unit ?? "", allow_multiple_per_day: habit?.allow_multiple_per_day ?? false, reminder_time: habit?.reminder_time ?? "",
    start_date: habit?.start_date ?? isoDate(), end_date: habit?.end_date ?? "", is_active: habit?.is_active ?? true, goal_id: habit?.goal_id ?? "",
    weekdays: habit?.schedule.weekdays ?? [0, 1, 2, 3, 4], times: String(habit?.schedule.times_per_period ?? 3), interval: String(habit?.schedule.interval_days ?? 2),
  });
  const [err, setErr] = React.useState("");
  const [confirm, setConfirm] = React.useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const inv = { invalidate: [["habits"], ["goals"]] };
  const save = useMut((b: Record<string, unknown>) => (habit ? patch(`/habits/${habit.id}`, b) : post("/habits", b)), { ...inv, success: "Привычка сохранена", onSuccess: onClose });
  const remove = useMut(() => del(`/habits/${habit!.id}`), { ...inv, success: "Удалено", onSuccess: onClose });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.title.trim()) return setErr("Введите название");
    if (f.kind !== "boolean" && !(Number(f.target) > 0)) return setErr("Цель должна быть больше 0");
    if (f.frequency === "selected_days" && !f.weekdays.length) return setErr("Выберите дни недели");
    if (f.end_date && f.end_date < f.start_date) return setErr("Дата окончания раньше начала");
    const schedule = f.frequency === "selected_days" ? { weekdays: f.weekdays } : f.frequency === "weekly" || f.frequency === "monthly" ? { times_per_period: Number(f.times) || 1 }
      : f.frequency === "custom" ? { interval_days: Number(f.interval) || 1 } : {};
    save.mutate({ title: f.title.trim(), description: f.description, category: f.category || null, color: f.color, icon: f.icon, kind: f.kind, frequency: f.frequency, schedule,
      target: f.kind === "boolean" ? 1 : Number(f.target), unit: f.unit || null, allow_multiple_per_day: f.allow_multiple_per_day, reminder_time: f.reminder_time || null,
      start_date: f.start_date, end_date: f.end_date || null, is_active: f.is_active, goal_id: f.goal_id || null });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={habit ? "Изменить привычку" : "Новая привычка"} wide>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
        <Field label="Название *" className="sm:col-span-2"><Input value={f.title} onChange={set("title")} autoFocus /></Field>
        <Field label="Тип"><Select value={f.kind} onChange={set("kind")}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Частота"><Select value={f.frequency} onChange={set("frequency")}>{Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        {f.frequency === "selected_days" && <Field label="Дни недели" className="sm:col-span-2"><div className="flex gap-1">{WD.map((d, i) => (
          <button type="button" key={d} onClick={() => setF((x) => ({ ...x, weekdays: x.weekdays.includes(i) ? x.weekdays.filter((y) => y !== i) : [...x.weekdays, i].sort() }))}
            className={cn("h-8 w-10 rounded-md border text-sm", f.weekdays.includes(i) ? "border-accent bg-accent-soft text-accent" : "border-border")}>{d}</button>))}</div></Field>}
        {(f.frequency === "weekly" || f.frequency === "monthly") && <Field label="Раз за период"><Input type="number" min={1} max={31} value={f.times} onChange={set("times")} /></Field>}
        {f.frequency === "custom" && <Field label="Каждые N дней"><Input type="number" min={1} max={365} value={f.interval} onChange={set("interval")} /></Field>}
        {f.kind !== "boolean" && <><Field label="Цель за день"><Input type="number" min={0} step="any" value={f.target} onChange={set("target")} /></Field>
          <Field label="Единица"><Input value={f.unit} onChange={set("unit")} placeholder={f.kind === "duration" ? "мин" : "стаканов, шагов…"} /></Field>
          <div className="sm:col-span-2"><Switch checked={f.allow_multiple_per_day} onCheckedChange={(v) => setF((x) => ({ ...x, allow_multiple_per_day: v }))} label="Суммировать несколько отметок за день" /></div></>}
        <Field label="Дата начала"><Input type="date" value={f.start_date} onChange={set("start_date")} /></Field>
        <Field label="Дата окончания"><Input type="date" value={f.end_date} onChange={set("end_date")} /></Field>
        <Field label="Время напоминания"><Input type="time" value={f.reminder_time} onChange={set("reminder_time")} /></Field>
        <Field label="Цвет"><Input type="color" className="h-9 w-20 p-1" value={f.color} onChange={set("color")} /></Field>
        <Field label="Категория"><Input value={f.category} onChange={set("category")} /></Field>
        <Field label="Связанная цель"><Select value={f.goal_id} onChange={set("goal_id")}><option value="">—</option>{goals.data?.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</Select></Field>
        <Field label="Описание" className="sm:col-span-2"><Textarea value={f.description} onChange={set("description")} /></Field>
        <div className="sm:col-span-2"><Switch checked={f.is_active} onCheckedChange={(v) => setF((x) => ({ ...x, is_active: v }))} label="Активна" /></div>
        {err && <p className="text-sm text-danger sm:col-span-2" role="alert">{err}</p>}
        <div className="flex justify-between sm:col-span-2">
          {habit ? <Button type="button" variant="ghost" onClick={() => setConfirm(true)}><Trash2 />Удалить</Button> : <span />}
          <Button type="submit" loading={save.isPending}>Сохранить</Button>
        </div>
      </form>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Удалить привычку?" text="История отметок будет скрыта вместе с привычкой." onConfirm={() => remove.mutate()} loading={remove.isPending} />
    </Dialog>
  );
}

