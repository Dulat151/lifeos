"use client";
import { ArrowLeft, Check, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { EntityDialog } from "@/components/entity";
import { FileList } from "@/components/files";
import { Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, ErrorState, Input, Progress, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { useGet, useMut } from "@/hooks/use-api";
import { del, patch, post } from "@/lib/api";
import type { GoalDetail } from "@/lib/types";
import { cn, fmtDate, fmtDateTime, GOAL_CATEGORIES, STATUS_LABEL } from "@/lib/utils";
import { GOAL_FIELDS } from "@/lib/fields";

export default function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { locale } = useI18n();
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
      <Link href="/goals" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text"><ArrowLeft className="size-4" />Цели</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{g.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge tone="accent">{GOAL_CATEGORIES[g.category]}</Badge>
            {g.start_date && <span>с {fmtDate(g.start_date, locale)}</span>}
            {g.deadline && <span>до {fmtDate(g.deadline, locale, { day: "numeric", month: "long", year: "numeric" })}</span>}
            {g.status !== "active" && <Badge tone={g.status === "completed" ? "success" : "neutral"}>{g.status === "completed" ? "Завершена" : "Архив"}</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          {g.status === "active" ? <Button size="sm" variant="outline" onClick={() => setStatus.mutate("completed")}><CheckCircle2 />Завершить</Button>
            : <Button size="sm" variant="outline" onClick={() => setStatus.mutate("active")}>Сделать активной</Button>}
          {g.status !== "archived" && <Button size="sm" variant="ghost" onClick={() => setStatus.mutate("archived")}>В архив</Button>}
          <Button size="icon" variant="ghost" onClick={() => setEditing(true)} aria-label="Изменить"><Pencil /></Button>
          <Button size="icon" variant="ghost" onClick={() => setDeleting(true)} aria-label="Удалить"><Trash2 /></Button>
        </div>
      </div>
      <Card className="mb-5 p-4">
        <div className="mb-2 flex justify-between text-sm"><span>Прогресс</span><span className="font-semibold tabular-nums">{g.progress}%</span></div>
        <Progress value={g.progress} className="h-2" />
        {g.metric_name && <p className="mt-2 text-xs text-muted">{g.metric_name}: {g.metric_current ?? 0} / {g.metric_target ?? "—"}</p>}
        {g.description && <p className="mt-3 whitespace-pre-wrap text-sm">{g.description}</p>}
      </Card>
      <Tabs defaultValue="milestones">
        <TabsList className="mb-4"><TabsTrigger value="milestones">Этапы и задачи</TabsTrigger><TabsTrigger value="timeline">Таймлайн</TabsTrigger><TabsTrigger value="links">Связи</TabsTrigger><TabsTrigger value="files">Файлы</TabsTrigger><TabsTrigger value="history">История</TabsTrigger></TabsList>
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
        <TabsContent value="links" className="grid gap-3 md:grid-cols-3">
          <Card><CardHeader title="Привычки" /><CardBody>{g.habits.length ? g.habits.map((h) => <div key={h.id} className="text-sm">{h.title}</div>) : <p className="text-sm text-muted">Нет. Привяжите привычку к цели в её настройках.</p>}</CardBody></Card>
          <Card><CardHeader title="События" /><CardBody>{g.events.length ? g.events.map((e) => <div key={e.id} className="text-sm">{e.title} <span className="text-muted">{fmtDateTime(e.starts_at, locale)}</span></div>) : <p className="text-sm text-muted">Нет связанных событий</p>}</CardBody></Card>
          <Card><CardHeader title="Заметки" /><CardBody>{g.notes_linked.length ? g.notes_linked.map((n) => <Link key={n.id} href={`/notes/${n.id}`} className="block text-sm text-accent">{n.title}</Link>) : <p className="text-sm text-muted">Нет связанных заметок</p>}</CardBody></Card>
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
