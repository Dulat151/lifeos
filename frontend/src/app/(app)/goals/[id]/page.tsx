"use client";
import { ArrowLeft, CalendarDays, Check, CheckCircle2, FolderKanban, ListChecks, Pencil, Plus, Repeat, StickyNote, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { EntityDialog } from "@/components/entity";
import { FileList } from "@/components/files";
import { useQuickCreate } from "@/components/quick-create";
import { Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, ErrorState, Input, Progress, ProgressRing, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { useGet, useMut } from "@/hooks/use-api";
import { del, patch, post } from "@/lib/api";
import type { GoalDetail } from "@/lib/types";
import { PROJECT_COLUMNS } from "@/lib/projects";
import { cn, fmtDate, fmtDateTime, GOAL_CATEGORIES, GOAL_CATEGORY_COLOR, STATUS_LABEL } from "@/lib/utils";
import { GOAL_FIELDS } from "@/lib/fields";

export default function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { locale } = useI18n();
  const create = useQuickCreate();
  const q = useGet<GoalDetail>(["goals", id], `/goals/${id}`);
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [msTitle, setMsTitle] = React.useState("");
  const [taskTitle, setTaskTitle] = React.useState<Record<string, string>>({});
  const inv = { invalidate: [["goals"], ["tasks"]] };
  const addMs = useMut(() => post(`/goals/${id}/milestones`, { title: msTitle, position: q.data?.milestones.length ?? 0 }), { ...inv, onSuccess: () => setMsTitle("") });
  const toggleMs = useMut((msId: string) => post(`/goals/${id}/milestones/${msId}/toggle`), inv);
  const delMs = useMut((msId: string) => del(`/goals/${id}/milestones/${msId}`), inv);
  const addTask = useMut((msId: string) => post("/tasks", { title: taskTitle[msId], milestone_id: msId === "_" ? null : msId, goal_id: id }), { ...inv, onSuccess: (_, msId) => setTaskTitle((x) => ({ ...x, [msId]: "" })) });
  const toggleTask = useMut((t: { id: string; status: string }) => patch(`/tasks/${t.id}`, { status: t.status === "done" ? "todo" : "done" }), inv);
  const setStatus = useMut((status: string) => patch(`/goals/${id}`, { status }), { ...inv, success: "Статус обновлён" });
  const remove = useMut(() => del(`/goals/${id}`), { invalidate: [["goals"]], success: "Цель удалена", onSuccess: () => router.replace("/goals") });

  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const g = q.data;
  const color = GOAL_CATEGORY_COLOR[g.category] ?? "var(--accent)";
  const daysLeft = g.deadline ? Math.ceil((new Date(g.deadline + "T23:59:59").getTime() - Date.now()) / 864e5) : null;
  const tasksFor = (msId: string | null) => g.tasks.filter((t) => t.milestone_id === msId);

  const TaskLine = ({ t }: { t: GoalDetail["tasks"][number] }) => (
    <li className="flex items-center gap-2 py-1 text-sm">
      <button onClick={() => toggleTask.mutate(t)} aria-label="Переключить" className={cn("grid size-4 place-items-center rounded border", t.status === "done" ? "border-success bg-success text-white" : "border-border")}>{t.status === "done" && <Check className="size-3" />}</button>
      <span className={cn("flex-1", t.status === "done" && "text-muted line-through")}>{t.title}</span>
      <span className="text-xs text-muted">{STATUS_LABEL[t.status]}</span>
    </li>
  );
  const AddTask = ({ msId }: { msId: string }) => (
    <form className="mt-1 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (taskTitle[msId]?.trim()) addTask.mutate(msId); }}>
      <Input className="h-8" placeholder="Новая задача…" value={taskTitle[msId] ?? ""} onChange={(e) => setTaskTitle((x) => ({ ...x, [msId]: e.target.value }))} />
      <Button size="sm" variant="secondary" type="submit"><Plus /></Button>
    </form>
  );

  return (
    <div>
      <Link href="/goals" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><ArrowLeft className="size-4" />Все цели</Link>
      <Card className="relative mb-5 overflow-hidden p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full blur-3xl" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }} />
        <div className="relative flex flex-wrap items-start gap-5">
          <ProgressRing value={g.progress} size={92} stroke={8} color={color} label="Прогресс цели">
            <div><div className="text-xl font-bold leading-none">{Math.round(g.progress)}%</div><div className="mt-0.5 text-[10px] text-muted">миссия</div></div>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full px-2 py-0.5 font-medium" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>{GOAL_CATEGORIES[g.category] ?? g.category}</span>
              {g.status !== "active" && <Badge tone={g.status === "completed" ? "success" : "neutral"}>{g.status === "completed" ? "Достигнута" : "Архив"}</Badge>}
              {daysLeft !== null && g.status === "active" && <Badge tone={daysLeft < 0 ? "danger" : daysLeft < 14 ? "warning" : "neutral"}>{daysLeft < 0 ? `просрочено на ${-daysLeft} дн.` : `осталось ${daysLeft} дн.`}</Badge>}
              <Badge>{["", "Высокий", "Средний", "Низкий"][g.priority] ?? ""} приоритет</Badge>
            </div>
            <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight">{g.title}</h1>
            {g.description && <p className="mt-1.5 max-w-2xl whitespace-pre-wrap text-sm text-muted">{g.description}</p>}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              {g.start_date && <span>Старт: {fmtDate(g.start_date, locale, { day: "numeric", month: "long" })}</span>}
              {g.deadline && <span>Дедлайн: {fmtDate(g.deadline, locale, { day: "numeric", month: "long", year: "numeric" })}</span>}
              <span>Этапы: {g.milestones.filter((m) => m.completed_at).length}/{g.milestones.length}</span>
              <span>Задачи: {g.tasks.filter((t) => t.status === "done").length}/{g.tasks.length}</span>
              {g.metric_name && <span>{g.metric_name}: {g.metric_current ?? 0} / {g.metric_target ?? "—"}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {g.status === "active" ? <Button size="sm" onClick={() => setStatus.mutate("completed")}><CheckCircle2 />Цель достигнута</Button>
              : <Button size="sm" variant="outline" onClick={() => setStatus.mutate("active")}>Сделать активной</Button>}
            {g.status !== "archived" && <Button size="sm" variant="ghost" onClick={() => setStatus.mutate("archived")}>В архив</Button>}
            <Button size="icon-sm" variant="ghost" onClick={() => setEditing(true)} aria-label="Изменить"><Pencil /></Button>
            <Button size="icon-sm" variant="ghost" onClick={() => setDeleting(true)} aria-label="Удалить"><Trash2 /></Button>
          </div>
        </div>
        <div className="relative mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
          <span className="mr-1 self-center text-xs text-muted">Добавить к цели:</span>
          {([["task", "Задачу"], ["habit", "Привычку"], ["project", "Проект"], ["note", "Заметку"], ["event", "Событие"]] as const).map(([k, l]) => (
            <Button key={k} size="xs" variant="outline" onClick={() => create(k, { goal_id: g.id })}><Plus />{l}</Button>))}
        </div>
      </Card>
      <Tabs defaultValue="all">
        <TabsList className="mb-4"><TabsTrigger value="all">Всё по цели</TabsTrigger><TabsTrigger value="milestones">Этапы и задачи</TabsTrigger><TabsTrigger value="timeline">Таймлайн</TabsTrigger><TabsTrigger value="files">Файлы</TabsTrigger><TabsTrigger value="history">История</TabsTrigger></TabsList>
        <TabsContent value="milestones" className="space-y-3">
          {g.milestones.map((m) => (
            <Card key={m.id} className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <button onClick={() => toggleMs.mutate(m.id)} aria-label="Отметить этап" className={cn("grid size-5 place-items-center rounded-full border", m.completed_at ? "border-success bg-success text-white" : "border-border")}>{m.completed_at && <Check className="size-3" />}</button>
                <h3 className={cn("flex-1 font-medium", m.completed_at && "text-muted line-through")}>{m.title}</h3>
                {m.due_date && <span className="text-xs text-muted">{fmtDate(m.due_date, locale)}</span>}
                <span className="text-xs tabular-nums text-muted">{m.tasks_done}/{m.tasks_total} · {m.progress}%</span>
                <Button size="icon-sm" variant="ghost" onClick={() => delMs.mutate(m.id)} aria-label="Удалить этап"><Trash2 /></Button>
              </div>
              <Progress value={m.progress} className="mb-2" />
              <ul>{tasksFor(m.id).map((t) => <TaskLine key={t.id} t={t} />)}</ul>
              <AddTask msId={m.id} />
            </Card>
          ))}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (msTitle.trim()) addMs.mutate(); }}>
            <Input placeholder="Новый этап (milestone)…" value={msTitle} onChange={(e) => setMsTitle(e.target.value)} />
            <Button type="submit" loading={addMs.isPending}><Plus />Этап</Button>
          </form>
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-medium text-muted">Задачи без этапа</h3>
            <ul>{tasksFor(null).map((t) => <TaskLine key={t.id} t={t} />)}</ul>
            <AddTask msId="_" />
          </Card>
        </TabsContent>
        <TabsContent value="timeline">
          <Card className="p-4">
            <ol className="relative border-l border-border pl-5">
              {g.start_date && <li className="mb-4"><span className="absolute -left-1.5 size-3 rounded-full bg-accent" /><div className="text-xs text-muted">{fmtDate(g.start_date, locale)}</div><div className="text-sm">Старт</div></li>}
              {[...g.milestones].sort((a, b) => (a.due_date ?? "9").localeCompare(b.due_date ?? "9")).map((m) => (
                <li key={m.id} className="mb-4"><span className={cn("absolute -left-1.5 size-3 rounded-full", m.completed_at ? "bg-success" : "bg-border")} />
                  <div className="text-xs text-muted">{m.due_date ? fmtDate(m.due_date, locale) : "без даты"}{m.completed_at && ` · выполнен ${fmtDate(m.completed_at, locale)}`}</div><div className="text-sm">{m.title}</div></li>
              ))}
              {g.deadline && <li><span className="absolute -left-1.5 size-3 rounded-full bg-danger" /><div className="text-xs text-muted">{fmtDate(g.deadline, locale)}</div><div className="text-sm">Дедлайн</div></li>}
            </ol>
          </Card>
        </TabsContent>
        <TabsContent value="all" className="grid gap-4 md:grid-cols-2">
          <LinkCard title="Проекты" icon={<FolderKanban />} empty="Крупные шаги к цели можно оформить проектами" onAdd={() => create("project", { goal_id: g.id })}>
            {g.projects.map((p) => <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2"><span className="size-2 rounded-full" style={{ background: p.color }} /><span className="flex-1 truncate">{p.title}</span><span className="text-xs text-muted">{PROJECT_COLUMNS.find((c) => c.status === p.status)?.label}</span></Link>)}
          </LinkCard>
          <LinkCard title="Привычки, которые ведут к цели" icon={<Repeat />} empty="Ежедневные действия, которые приближают результат" onAdd={() => create("habit", { goal_id: g.id })}>
            {g.habits.map((h) => <Link key={h.id} href="/habits" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2"><span className="size-2 rounded-full" style={{ background: h.color }} />{h.title}</Link>)}
          </LinkCard>
          <LinkCard title="Задачи" icon={<ListChecks />} empty="Конкретные шаги — с ними растёт прогресс" onAdd={() => create("task", { goal_id: g.id })}>
            {g.tasks.filter((t) => t.status !== "done").slice(0, 8).map((t) => <TaskLine key={t.id} t={t} />)}
            {g.tasks.some((t) => t.status === "done") && <p className="px-2 pt-1 text-xs text-muted">Выполнено: {g.tasks.filter((t) => t.status === "done").length}</p>}
          </LinkCard>
          <LinkCard title="Заметки" icon={<StickyNote />} empty="Мысли, материалы и конспекты по цели" onAdd={() => create("note", { goal_id: g.id })}>
            {g.notes_linked.map((n) => <Link key={n.id} href={`/notes/${n.id}`} className="block truncate rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">{n.title}</Link>)}
          </LinkCard>
          <LinkCard title="События" icon={<CalendarDays />} empty="Встречи и важные даты цели" onAdd={() => create("event", { goal_id: g.id })} className="md:col-span-2">
            {g.events.map((e) => <div key={e.id} className="flex justify-between gap-2 px-2 py-1.5 text-sm"><span className="truncate">{e.title}</span><span className="shrink-0 text-xs text-muted">{fmtDateTime(e.starts_at, locale)}</span></div>)}
          </LinkCard>
        </TabsContent>
        <TabsContent value="files"><FileList entityType="goal" entityId={g.id} /></TabsContent>
        <TabsContent value="history">
          <Card className="p-4">{g.history.length ? <ul className="space-y-1.5 text-sm">{g.history.map((h, i) => (
            <li key={i} className="flex gap-3"><span className="w-36 shrink-0 text-xs text-muted">{fmtDateTime(h.at, locale)}</span><span><b>{h.field}</b>: {h.old ?? "—"} → {h.new ?? "—"}</span></li>))}</ul>
            : <p className="text-sm text-muted">Изменений пока нет</p>}</Card>
        </TabsContent>
      </Tabs>
      <EntityDialog open={editing} onOpenChange={setEditing} title="Изменить цель" fields={GOAL_FIELDS} endpoint="/goals"
        initial={{ ...g, priority: String(g.priority) } as unknown as Record<string, unknown> & { id: string }} invalidate={[["goals"]]} />
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Удалить цель?" text="Цель будет удалена, связанные задачи останутся." onConfirm={() => remove.mutate()} loading={remove.isPending} />
    </div>
  );
}

function LinkCard({ title, icon, empty, onAdd, children, className }: { title: string; icon: React.ReactNode; empty: string; onAdd: () => void; children: React.ReactNode; className?: string }) {
  const has = React.Children.toArray(children).filter(Boolean).length > 0;
  return (
    <Card className={className}>
      <CardHeader title={title} icon={icon} action={<Button size="xs" variant="ghost" onClick={onAdd}><Plus />Добавить</Button>} />
      <CardBody>{has ? <div className="space-y-0.5">{children}</div> : <p className="text-sm text-muted">{empty}</p>}</CardBody>
    </Card>
  );
}
