"use client";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Download, Plus, Repeat, Upload } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Select, Switch, Tabs, TabsList, TabsTrigger, Textarea, ConfirmDialog, useToast } from "@/components/ui";
import { useI18n, useMe } from "@/components/providers";
import { useGet, useMut } from "@/hooks/use-api";
import { api, del, download, get, patch, post } from "@/lib/api";
import type { CalEvent, Goal, Habit, Occurrence, Page, Task } from "@/lib/types";
import { cn, fmtTime, isoToLocalInput } from "@/lib/utils";

type View = "day" | "week" | "month" | "year" | "agenda";

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d: Date) { const x = startOfDay(d); return addDays(x, -((x.getDay() + 6) % 7)); }
function sameDay(a: Date, b: Date) { return a.toDateString() === b.toDateString(); }

function range(view: View, cursor: Date): [Date, Date] {
  if (view === "day") return [startOfDay(cursor), addDays(startOfDay(cursor), 1)];
  if (view === "week") { const s = startOfWeek(cursor); return [s, addDays(s, 7)]; }
  if (view === "month") { const s = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1)); return [s, addDays(s, 42)]; }
  if (view === "year") return [new Date(cursor.getFullYear(), 0, 1), new Date(cursor.getFullYear() + 1, 0, 1)];
  return [startOfDay(cursor), addDays(startOfDay(cursor), 60)];
}

export default function CalendarPage() {
  const { locale } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = React.useState<View>("week");
  const [cursor, setCursor] = React.useState(new Date());
  const [editing, setEditing] = React.useState<{ ev?: CalEvent; start?: Date } | null>(params.get("new") === "1" ? {} : null);
  const [s, e] = range(view, cursor);
  const key = ["calendar", view, s.toISOString()];
  const q = useGet<Occurrence[]>(key, `/calendar/events?start=${encodeURIComponent(s.toISOString())}&end=${encodeURIComponent(e.toISOString())}`);
  const integrations = useGet<{ google: { configured: boolean; connected: boolean; last_sync_at: string | null } }>(["integrations"], "/integrations");
  const moveEv = useMut((v: { id: string; starts_at: string; ends_at: string }) => patch(`/calendar/events/${v.id}`, { starts_at: v.starts_at, ends_at: v.ends_at }), { invalidate: [["calendar"]], success: "Событие перенесено" });
  const sync = useMut(() => post<{ created: number; updated: number }>("/integrations/google/sync"), { invalidate: [["calendar"], ["integrations"]], onSuccess: (r) => toast(`Google: создано ${r.created}, обновлено ${r.updated}`) });
  const fileRef = React.useRef<HTMLInputElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const shift = (dir: number) => {
    const d = new Date(cursor);
    if (view === "day") d.setDate(d.getDate() + dir);
    else if (view === "week") d.setDate(d.getDate() + 7 * dir);
    else if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "year") d.setFullYear(d.getFullYear() + dir);
    else d.setDate(d.getDate() + 30 * dir);
    setCursor(d);
  };
  const openEvent = async (o: Occurrence) => {
    try { setEditing({ ev: await get<CalEvent>(`/calendar/events/${o.event_id}`) }); } catch (err) { toast((err as Error).message, "error"); }
  };
  const onDragEnd = (ev: DragEndEvent) => {
    const occ = q.data?.find((o) => o.event_id + o.starts_at === ev.active.id);
    const target = ev.over?.id as string | undefined;
    if (!occ || !target) return;
    if (occ.is_recurring) return toast("Повторяющееся событие переносится через редактирование", "info");
    const oldStart = new Date(occ.starts_at);
    const [dateStr, hourStr] = target.split("|");
    const ns = new Date(dateStr + "T00:00:00");
    if (hourStr !== undefined) ns.setHours(Number(hourStr), 0, 0, 0); else ns.setHours(oldStart.getHours(), oldStart.getMinutes());
    const dur = new Date(occ.ends_at).getTime() - oldStart.getTime();
    moveEv.mutate({ id: occ.event_id, starts_at: ns.toISOString(), ends_at: new Date(ns.getTime() + dur).toISOString() });
  };
  const importIcs = async (f: File) => {
    const fd = new FormData(); fd.append("file", f);
    try {
      const r = await api<{ created: number; updated: number; skipped: number }>("/calendar/import.ics", { method: "POST", form: fd });
      toast(`Импорт: создано ${r.created}, обновлено ${r.updated}, пропущено ${r.skipped}`); q.refetch();
    } catch (err) { toast((err as Error).message, "error"); }
    if (fileRef.current) fileRef.current.value = "";
  };

  const title = view === "year" ? String(cursor.getFullYear()) : view === "day" ? cursor.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })
    : cursor.toLocaleDateString(locale, { month: "long", year: "numeric" });
  const occ = q.data ?? [];

  return (
    <div>
      <PageHeader title="Календарь" actions={<>
        <Button variant="outline" size="sm" onClick={() => download("/calendar/export.ics", "lifeos.ics")}><Download />ICS</Button>
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload />Импорт ICS</Button>
        <input ref={fileRef} type="file" accept=".ics,text/calendar" hidden onChange={(ev) => ev.target.files?.[0] && importIcs(ev.target.files[0])} />
        {integrations.data?.google.connected ? <Button variant="outline" size="sm" onClick={() => sync.mutate()} loading={sync.isPending}>Синхр. Google</Button>
          : <Button variant="ghost" size="sm" onClick={() => router.push("/settings#integrations")}>Google Calendar</Button>}
        <Button size="sm" onClick={() => setEditing({ start: new Date() })}><Plus />Событие</Button></>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => shift(-1)} aria-label="Назад"><ChevronLeft /></Button>
        <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>Сегодня</Button>
        <Button size="icon" variant="ghost" onClick={() => shift(1)} aria-label="Вперёд"><ChevronRight /></Button>
        <span className="text-sm font-medium capitalize">{title}</span>
        <Tabs value={view} onValueChange={(v) => setView(v as View)} className="ml-auto"><TabsList>
          {(["day", "week", "month", "year", "agenda"] as View[]).map((v) => <TabsTrigger key={v} value={v}>{{ day: "День", week: "Неделя", month: "Месяц", year: "Год", agenda: "Повестка" }[v]}</TabsTrigger>)}
        </TabsList></Tabs>
      </div>
      {q.error && <p className="mb-2 text-sm text-danger">{q.error.message}</p>}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        {(view === "day" || view === "week") && <TimeGrid days={view === "day" ? [startOfDay(cursor)] : Array.from({ length: 7 }, (_, i) => addDays(s, i))} occ={occ} onOpen={openEvent} onSlot={(d) => setEditing({ start: d })} />}
        {view === "month" && <MonthGrid start={s} month={cursor.getMonth()} occ={occ} onOpen={openEvent} onDay={(d) => { setCursor(d); setView("day"); }} />}
      </DndContext>
      {view === "year" && <YearGrid year={cursor.getFullYear()} occ={occ} onMonth={(m) => { setCursor(new Date(cursor.getFullYear(), m, 1)); setView("month"); }} />}
      {view === "agenda" && (occ.length ? (
        <Card className="divide-y divide-border">{occ.map((o) => (
          <button key={o.event_id + o.starts_at} onClick={() => openEvent(o)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2">
            <span className="h-8 w-1 rounded-full" style={{ background: o.color }} />
            <span className="w-40 text-xs text-muted">{new Date(o.starts_at).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })} · {o.all_day ? "весь день" : fmtTime(o.starts_at, locale)}</span>
            <span className="flex-1 text-sm">{o.title}</span>{o.is_recurring && <Repeat className="size-3.5 text-muted" />}
          </button>))}</Card>) : <EmptyState title="Событий в ближайшие 60 дней нет" />)}
      {editing && <EventDialog ev={editing.ev} start={editing.start} onClose={() => { setEditing(null); if (params.get("new")) router.replace("/calendar"); }} />}
    </div>
  );
}

function EventChip({ o, onOpen, compact }: { o: Occurrence; onOpen: (o: Occurrence) => void; compact?: boolean }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: o.event_id + o.starts_at, disabled: o.is_recurring });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={(e) => { e.stopPropagation(); onOpen(o); }}
      style={{ borderLeftColor: o.color, transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined }}
      className={cn("cursor-pointer truncate rounded border-l-[3px] bg-surface-2 px-1.5 py-0.5 text-xs hover:bg-border", o.is_time_block && "border-dashed", transform && "z-20 shadow-lg")}>
      {!compact && !o.all_day && <span className="mr-1 text-muted">{fmtTime(o.starts_at)}</span>}{o.title}
    </div>
  );
}

function Slot({ id, children, className, onClick }: { id: string; children?: React.ReactNode; className?: string; onClick?: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} onClick={onClick} className={cn(className, isOver && "bg-accent-soft")}>{children}</div>;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function TimeGrid({ days, occ, onOpen, onSlot }: { days: Date[]; occ: Occurrence[]; onOpen: (o: Occurrence) => void; onSlot: (d: Date) => void }) {
  const { locale } = useI18n();
  const scroller = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { scroller.current?.scrollTo({ top: 7 * 48 }); }, []);
  return (
    <Card className="overflow-hidden">
      <div className="grid border-b border-border text-xs" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
        <div />
        {days.map((d) => (
          <div key={d.toISOString()} className={cn("p-2 text-center", sameDay(d, new Date()) && "font-semibold text-accent")}>
            {d.toLocaleDateString(locale, { weekday: "short", day: "numeric" })}
            <div className="mt-1 space-y-0.5">{occ.filter((o) => o.all_day && sameDay(new Date(o.starts_at), d)).map((o) => <EventChip key={o.event_id + o.starts_at} o={o} onOpen={onOpen} compact />)}</div>
          </div>
        ))}
      </div>
      <div ref={scroller} className="max-h-[620px] overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
          {HOURS.map((h) => (
            <React.Fragment key={h}>
              <div className="h-12 border-b border-border pr-2 pt-0.5 text-right text-[10px] text-muted">{String(h).padStart(2, "0")}:00</div>
              {days.map((d) => {
                const here = occ.filter((o) => !o.all_day && sameDay(new Date(o.starts_at), d) && new Date(o.starts_at).getHours() === h);
                return (
                  <Slot key={d.toISOString() + h} id={`${isoDay(d)}|${h}`} className="h-12 space-y-0.5 overflow-hidden border-b border-l border-border p-0.5"
                    onClick={() => { const x = new Date(d); x.setHours(h, 0, 0, 0); onSlot(x); }}>
                    {here.map((o) => <EventChip key={o.event_id + o.starts_at} o={o} onOpen={onOpen} />)}
                  </Slot>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </Card>
  );
}

function MonthGrid({ start, month, occ, onOpen, onDay }: { start: Date; month: number; occ: Occurrence[]; onOpen: (o: Occurrence) => void; onDay: (d: Date) => void }) {
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border text-center text-xs text-muted">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => <div key={d} className="p-2">{d}</div>)}</div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const here = occ.filter((o) => { const s = startOfDay(new Date(o.starts_at)).getTime(); const e = new Date(o.ends_at).getTime(); return s <= d.getTime() && e > d.getTime() || sameDay(new Date(o.starts_at), d); });
          return (
            <Slot key={d.toISOString()} id={isoDay(d)} className={cn("min-h-24 space-y-0.5 border-b border-l border-border p-1", d.getMonth() !== month && "bg-surface-2/40 text-muted")}>
              <button className={cn("mb-0.5 block w-full text-right text-xs", sameDay(d, new Date()) && "font-bold text-accent")} onClick={() => onDay(d)}>{d.getDate()}</button>
              {here.slice(0, 3).map((o) => <EventChip key={o.event_id + o.starts_at} o={o} onOpen={onOpen} />)}
              {here.length > 3 && <div className="text-[10px] text-muted">+{here.length - 3}</div>}
            </Slot>
          );
        })}
      </div>
    </Card>
  );
}

function YearGrid({ year, occ, onMonth }: { year: number; occ: Occurrence[]; onMonth: (m: number) => void }) {
  const { locale } = useI18n();
  const busy = new Set(occ.map((o) => new Date(o.starts_at).toDateString()));
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 12 }, (_, m) => {
        const first = new Date(year, m, 1);
        const s = startOfWeek(first);
        const days = Array.from({ length: 42 }, (_, i) => addDays(s, i));
        return (
          <Card key={m} className="cursor-pointer p-3 hover:border-accent/50" onClick={() => onMonth(m)}>
            <div className="mb-2 text-sm font-medium capitalize">{first.toLocaleDateString(locale, { month: "long" })}</div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[10px]">
              {days.map((d) => <div key={d.toISOString()} className={cn("rounded py-0.5", d.getMonth() !== m && "opacity-0", busy.has(d.toDateString()) && "bg-accent-soft text-accent font-semibold", sameDay(d, new Date()) && "ring-1 ring-accent")}>{d.getDate()}</div>)}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

const RECUR = [["", "Не повторять"], ["FREQ=DAILY", "Ежедневно"], ["FREQ=WEEKLY", "Еженедельно"], ["FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "По будням"], ["FREQ=MONTHLY", "Ежемесячно"], ["FREQ=YEARLY", "Ежегодно"]];

function EventDialog({ ev, start, onClose }: { ev?: CalEvent; start?: Date; onClose: () => void }) {
  const me = useMe();
  const s0 = ev ? new Date(ev.starts_at) : start ?? new Date();
  if (!ev && !start) s0.setMinutes(0, 0, 0);
  const e0 = ev ? new Date(ev.ends_at) : new Date(s0.getTime() + 3_600_000);
  const [f, setF] = React.useState({
    title: ev?.title ?? "", description: ev?.description ?? "", location: ev?.location ?? "", category: ev?.category ?? "general", color: ev?.color ?? "#6366f1",
    starts_at: isoToLocalInput(s0.toISOString()), ends_at: isoToLocalInput(e0.toISOString()), all_day: ev?.all_day ?? false, recurrence_rule: ev?.recurrence_rule ?? "",
    is_time_block: ev?.is_time_block ?? false, task_id: ev?.task_id ?? "", goal_id: ev?.goal_id ?? "", habit_id: ev?.habit_id ?? "", reminders: "15",
  });
  const [err, setErr] = React.useState("");
  const [confirm, setConfirm] = React.useState(false);
  const goals = useGet<Goal[]>(["goals", "active"], "/goals?status=active");
  const tasks = useGet<Page<Task>>(["tasks", "open-list"], "/tasks?status=todo,in_progress,backlog&limit=200");
  const habits = useGet<Habit[]>(["habits"], "/habits");
  const rem = useGet<number[]>(["calendar", "rem", ev?.id], ev ? `/calendar/events/${ev.id}/reminders` : null);
  React.useEffect(() => { if (rem.data) setF((x) => ({ ...x, reminders: rem.data.join(", ") })); }, [rem.data]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const inv = { invalidate: [["calendar"], ["reminders"]] };
  const save = useMut((b: Record<string, unknown>) => (ev ? patch(`/calendar/events/${ev.id}`, b) : post("/calendar/events", b)), { ...inv, success: "Событие сохранено", onSuccess: onClose });
  const remove = useMut(() => del(`/calendar/events/${ev!.id}`), { ...inv, success: "Удалено", onSuccess: onClose });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.title.trim()) return setErr("Введите название");
    let s = new Date(f.starts_at), en = new Date(f.ends_at);
    if (f.all_day) { s = new Date(f.starts_at.slice(0, 10) + "T00:00:00"); en = new Date(f.ends_at.slice(0, 10) + "T00:00:00"); en.setDate(en.getDate() + 1); }
    if (en <= s) return setErr("Окончание должно быть позже начала");
    const mins = f.reminders.split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n >= 0 && f.reminders.trim() !== "");
    save.mutate({ title: f.title.trim(), description: f.description, location: f.location, category: f.category || "general", color: f.color,
      starts_at: s.toISOString(), ends_at: en.toISOString(), all_day: f.all_day, recurrence_rule: f.recurrence_rule || null, is_time_block: f.is_time_block,
      timezone: me.data?.profile.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      task_id: f.task_id || null, goal_id: f.goal_id || null, habit_id: f.habit_id || null, reminder_minutes_before: mins });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={ev ? "Событие" : "Новое событие"} wide>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
        <Field label="Название *" className="sm:col-span-2"><Input value={f.title} onChange={set("title")} autoFocus /></Field>
        <Field label="Начало"><Input type="datetime-local" value={f.starts_at} onChange={set("starts_at")} /></Field>
        <Field label="Окончание"><Input type="datetime-local" value={f.ends_at} onChange={set("ends_at")} /></Field>
        <div className="flex gap-4 sm:col-span-2"><Switch checked={f.all_day} onCheckedChange={(v) => setF((x) => ({ ...x, all_day: v }))} label="Весь день" />
          <Switch checked={f.is_time_block} onCheckedChange={(v) => setF((x) => ({ ...x, is_time_block: v }))} label="Блок времени" /></div>
        <Field label="Повторение"><Select value={f.recurrence_rule} onChange={set("recurrence_rule")}>{RECUR.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          {f.recurrence_rule && !RECUR.some(([v]) => v === f.recurrence_rule) && <option value={f.recurrence_rule}>{f.recurrence_rule}</option>}</Select></Field>
        <Field label="Напоминания, минут до" hint="через запятую, например 15, 60"><Input value={f.reminders} onChange={set("reminders")} /></Field>
        <Field label="Категория"><Input value={f.category} onChange={set("category")} /></Field>
        <Field label="Цвет"><Input type="color" className="h-9 w-20 p-1" value={f.color} onChange={set("color")} /></Field>
        <Field label="Место" className="sm:col-span-2"><Input value={f.location} onChange={set("location")} /></Field>
        <Field label="Задача"><Select value={f.task_id} onChange={set("task_id")}><option value="">—</option>{tasks.data?.items.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</Select></Field>
        <Field label="Цель"><Select value={f.goal_id} onChange={set("goal_id")}><option value="">—</option>{goals.data?.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</Select></Field>
        <Field label="Привычка"><Select value={f.habit_id} onChange={set("habit_id")}><option value="">—</option>{habits.data?.map((h) => <option key={h.id} value={h.id}>{h.title}</option>)}</Select></Field>
        <Field label="Описание" className="sm:col-span-2"><Textarea value={f.description} onChange={set("description")} /></Field>
        <p className="text-xs text-muted sm:col-span-2">Часовой пояс: {me.data?.profile.timezone}. Повторения рассчитываются с учётом перехода на летнее время.</p>
        {err && <p className="text-sm text-danger sm:col-span-2" role="alert">{err}</p>}
        <div className="flex justify-between sm:col-span-2">
          {ev ? <Button type="button" variant="ghost" onClick={() => setConfirm(true)}>Удалить</Button> : <span />}
          <Button type="submit" loading={save.isPending}>Сохранить</Button>
        </div>
      </form>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Удалить событие?" text={ev?.recurrence_rule ? "Будут удалены все повторения." : undefined} onConfirm={() => remove.mutate()} loading={remove.isPending} />
    </Dialog>
  );
}

