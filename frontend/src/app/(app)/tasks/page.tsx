"use client";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Archive, CalendarDays, Check, Copy, KanbanSquare, List, ListChecks, Lock, Plus, Repeat, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Badge, Button, Card, EmptyState, Input, PageHeader, QueryState, Select, Tabs, TabsList, TabsTrigger } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { useGet, useMut } from "@/hooks/use-api";
import { post, qs } from "@/lib/api";
import type { Goal, Page, Task, TaskStatus } from "@/lib/types";
import { cn, fmtDate, fmtDateTime, PRIORITY_LABEL, STATUS_LABEL } from "@/lib/utils";
import { TaskDialog } from "./task-dialog";

const VIEWS = [["all", "Все"], ["today", "Сегодня"], ["upcoming", "Предстоящие"], ["overdue", "Просроченные"], ["completed", "Выполненные"], ["templates", "Шаблоны"], ["archived", "Архив"]] as const;
const COLUMNS: TaskStatus[] = ["backlog", "todo", "in_progress", "done"];
const PRIO_TONE: Record<number, "danger" | "warning" | "accent" | "neutral"> = { 1: "danger", 2: "warning", 3: "accent", 4: "neutral" };

export default function TasksPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [view, setView] = React.useState(params.get("view") || "all");
  const [mode, setMode] = React.useState<"list" | "kanban" | "calendar">("list");
  const [q, setQ] = React.useState("");
  const [priority, setPriority] = React.useState("");
  const [tag, setTag] = React.useState("");
  const [goal, setGoal] = React.useState("");
  const [sort, setSort] = React.useState("smart");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [open, setOpen] = React.useState<Task | "new" | null>(params.get("new") === "1" ? "new" : null);
  const [quick, setQuick] = React.useState("");
  const key = ["tasks", view, q, priority, tag, goal, sort, mode];
  const list = useGet<Page<Task>>(key, `/tasks${qs({ view: mode === "kanban" && view === "all" ? "all" : view, q, priority, tag, goal_id: goal, sort: mode === "kanban" ? "position" : sort, limit: 500 })}`);
  const tags = useGet<{ name: string; count: number }[]>(["tasks", "tags"], "/tasks/tags");
  const goals = useGet<Goal[]>(["goals", "active"], "/goals?status=active");
  const inv = { invalidate: [["tasks"], ["goals"]] };
  const quickAdd = useMut(() => post("/tasks/quick", { text: quick }), { ...inv, success: "Задача добавлена", onSuccess: () => setQuick("") });
  const toggle = useMut((t: Task) => post(`/tasks/${t.id}/move`, { status: t.status === "done" ? "todo" : "done", position: t.position }), inv);
  const bulk = useMut((body: Record<string, unknown>) => post<{ updated: number }>("/tasks/bulk", { ids: [...selected], ...body }), { ...inv, onSuccess: (r) => { setSelected(new Set()); } , success: "Готово" });
  const fromTemplate = useMut((id: string) => post(`/tasks/${id}/duplicate`), { ...inv, success: "Задача создана из шаблона" });
  const move = useMut((v: { id: string; status: TaskStatus; position: number }) => post(`/tasks/${v.id}/move`, { status: v.status, position: v.position }), inv);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const t = list.data?.items.find((x) => x.id === e.active.id);
    const status = e.over?.id as TaskStatus | undefined;
    if (!t || !status || t.status === status) return;
    const col = list.data!.items.filter((x) => x.status === status);
    move.mutate({ id: t.id, status, position: (col.at(-1)?.position ?? 0) + 1 });
  };
  const closeDialog = () => { setOpen(null); if (params.get("new")) router.replace("/tasks"); };
  const sel = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div>
      <PageHeader icon={<ListChecks />} title="Задачи" subtitle="Срочные задачи дают бонусный опыт. Задачи связываются с целями и проектами" actions={<>
        <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}><TabsList>
          <TabsTrigger value="list"><List className="mr-1 inline size-4" />Список</TabsTrigger>
          <TabsTrigger value="kanban"><KanbanSquare className="mr-1 inline size-4" />Kanban</TabsTrigger>
          <TabsTrigger value="calendar"><CalendarDays className="mr-1 inline size-4" />Календарь</TabsTrigger>
        </TabsList></Tabs>
        <Button onClick={() => setOpen("new")}><Plus />Задача</Button></>} />
      <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (quick.trim()) quickAdd.mutate(); }}>
        <Input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Быстрое добавление: «Позвонить маме #семья !2 завтра»" aria-label="Быстрое добавление задачи" />
        <Button type="submit" variant="secondary" loading={quickAdd.isPending}>Добавить</Button>
      </form>
      <div className="mb-3 flex flex-wrap gap-1">
        {VIEWS.map(([v, l]) => <Button key={v} size="sm" variant={view === v ? "secondary" : "ghost"} onClick={() => setView(v)}>{l}</Button>)}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Поиск…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select className="w-36" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">Приоритет</option>{[1, 2, 3, 4].map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</Select>
        <Select className="w-36" value={tag} onChange={(e) => setTag(e.target.value)}><option value="">Тег</option>{tags.data?.map((t) => <option key={t.name} value={t.name}>#{t.name} ({t.count})</option>)}</Select>
        <Select className="w-44" value={goal} onChange={(e) => setGoal(e.target.value)}><option value="">Цель</option>{goals.data?.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</Select>
        {mode === "list" && <Select className="w-40" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="smart">Умная сортировка</option><option value="due">По сроку</option><option value="priority">По приоритету</option><option value="created">По созданию</option><option value="title">По названию</option></Select>}
      </div>
      {selected.size > 0 && (
        <Card className="mb-3 flex flex-wrap items-center gap-2 p-2 text-sm">
          <span className="px-2">Выбрано: {selected.size}</span>
          <Button size="sm" variant="secondary" onClick={() => bulk.mutate({ action: "status", status: "done" })}><Check />Выполнено</Button>
          <Select className="h-8 w-40" defaultValue="" onChange={(e) => e.target.value && bulk.mutate({ action: "priority", priority: Number(e.target.value) })}><option value="">Приоритет…</option>{[1, 2, 3, 4].map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</Select>
          <Button size="sm" variant="secondary" onClick={() => bulk.mutate({ action: "archive" })}><Archive />В архив</Button>
          <Button size="sm" variant="danger" onClick={() => bulk.mutate({ action: "delete" })}><Trash2 />Удалить</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Снять выделение</Button>
        </Card>
      )}
      <QueryState q={list} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="Задач нет" text="Добавьте задачу через быстрый ввод или кнопку «Задача»." />}>
        {(d) => mode === "kanban" ? (
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {COLUMNS.map((c) => <Column key={c} status={c} tasks={d.items.filter((t) => t.status === c)} onOpen={setOpen} />)}
            </div>
          </DndContext>
        ) : mode === "calendar" ? <TaskCalendar tasks={d.items} onOpen={setOpen} /> : (
          <Card className="divide-y divide-border">
            {d.items.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                <input type="checkbox" checked={selected.has(t.id)} onChange={() => sel(t.id)} aria-label="Выбрать" className="accent-[var(--accent)]" />
                {view === "templates" ? <Button size="icon-sm" variant="ghost" onClick={() => fromTemplate.mutate(t.id)} aria-label="Создать из шаблона"><Copy /></Button> : (
                  <button onClick={() => toggle.mutate(t)} disabled={t.blocked && t.status !== "done"} aria-label="Переключить статус"
                    className={cn("grid size-5 shrink-0 place-items-center rounded-full border", t.status === "done" ? "border-success bg-success text-white" : "border-border hover:border-accent", t.blocked && "opacity-40")}>
                    {t.status === "done" && <Check className="size-3" />}
                  </button>
                )}
                <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(t)}>
                  <div className={cn("truncate text-sm", t.status === "done" && "text-muted line-through")}>{t.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    {t.blocked && <span className="flex items-center gap-0.5 text-warning"><Lock className="size-3" />заблокирована</span>}
                    {t.recurrence_rule && <Repeat className="size-3" />}
                    {t.tags.map((x) => <span key={x}>#{x}</span>)}
                    {t.subtasks_total > 0 && <span>{t.subtasks_done}/{t.subtasks_total} подзадач</span>}
                    {t.checklist.length > 0 && <span>☑ {t.checklist.filter((c) => c.done).length}/{t.checklist.length}</span>}
                  </div>
                </button>
                <Badge tone="neutral" className="hidden sm:inline-flex">{STATUS_LABEL[t.status]}</Badge>
                <Badge tone={PRIO_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>
                {t.due_at && <span className={cn("w-28 text-right text-xs", t.status !== "done" && new Date(t.due_at) < new Date() ? "text-danger" : "text-muted")}>{fmtDateTime(t.due_at)}</span>}
              </div>
            ))}
          </Card>
        )}
      </QueryState>
      {open && <TaskDialog task={open === "new" ? null : open} onClose={closeDialog} defaultTemplate={view === "templates"} />}
    </div>
  );
}

function Column({ status, tasks, onOpen }: { status: TaskStatus; tasks: Task[]; onOpen: (t: Task) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} className={cn("min-h-40 rounded-[var(--radius-card)] border border-border bg-surface-2/50 p-2", isOver && "border-accent bg-accent-soft/40")}>
      <div className="mb-2 flex items-center justify-between px-1 text-sm font-medium">{STATUS_LABEL[status]}<span className="text-xs text-muted">{tasks.length}</span></div>
      <div className="space-y-2">{tasks.map((t) => <KanbanCard key={t.id} task={t} onOpen={onOpen} />)}</div>
    </div>
  );
}

function KanbanCard({ task, onOpen }: { task: Task; onOpen: (t: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} onClick={() => onOpen(task)}
      className={cn("cursor-grab rounded-[var(--radius-ctl)] border border-border bg-surface p-2.5 text-sm shadow-[var(--shadow)] active:cursor-grabbing", isDragging && "z-10 opacity-80 shadow-lg")}>
      <div className={cn(task.status === "done" && "text-muted line-through")}>{task.title}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <Badge tone={PRIO_TONE[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>
        {task.due_at && <span>{fmtDate(task.due_at)}</span>}
        {task.blocked && <Lock className="size-3 text-warning" />}
      </div>
    </div>
  );
}

function TaskCalendar({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  const { locale } = useI18n();
  const [month, setMonth] = React.useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const start = new Date(month); start.setDate(1 - ((month.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const by = new Map<string, Task[]>();
  for (const t of tasks) if (t.due_at) { const k = key(new Date(t.due_at)); by.set(k, [...(by.get(k) ?? []), t]); }
  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</Button>
        <span className="text-sm font-medium capitalize">{month.toLocaleDateString(locale, { month: "long", year: "numeric" })}</span>
        <Button size="sm" variant="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</Button>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md bg-border text-xs">
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => <div key={d} className="bg-surface p-1.5 text-center text-muted">{d}</div>)}
        {days.map((d) => (
          <div key={d.toISOString()} className={cn("min-h-20 bg-surface p-1", d.getMonth() !== month.getMonth() && "opacity-40")}>
            <div className={cn("mb-0.5 text-right", key(d) === key(new Date()) && "font-bold text-accent")}>{d.getDate()}</div>
            {(by.get(key(d)) ?? []).slice(0, 3).map((t) => (
              <button key={t.id} onClick={() => onOpen(t)} className={cn("block w-full truncate rounded px-1 text-left hover:bg-surface-2", t.status === "done" && "text-muted line-through")}>{t.title}</button>
            ))}
            {(by.get(key(d))?.length ?? 0) > 3 && <div className="px-1 text-muted">+{by.get(key(d))!.length - 3}</div>}
          </div>
        ))}
      </div>
    </Card>
  );
}
