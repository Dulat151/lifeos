"use client";
import { Plus, Trash2, X } from "lucide-react";
import * as React from "react";
import { FileList } from "@/components/files";
import { Button, ConfirmDialog, Dialog, Field, Input, Select, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from "@/components/ui";
import { useGet, useMut } from "@/hooks/use-api";
import { del, patch, post } from "@/lib/api";
import type { Goal, GoalDetail, Page, Project, Task } from "@/lib/types";
import { fmtDateTime, isoToLocalInput, PRIORITY_LABEL, STATUS_LABEL } from "@/lib/utils";

const RECUR = [["", "Не повторять"], ["FREQ=DAILY", "Каждый день"], ["FREQ=WEEKLY", "Каждую неделю"], ["FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "По будням"], ["FREQ=MONTHLY", "Каждый месяц"], ["FREQ=YEARLY", "Каждый год"]];

export function TaskDialog({ task, onClose, defaultTemplate }: { task: Task | null; onClose: () => void; defaultTemplate?: boolean }) {
  const isNew = !task;
  const [f, setF] = React.useState({
    title: task?.title ?? "", description: task?.description ?? "", status: task?.status ?? "todo", priority: String(task?.priority ?? 2),
    due_at: isoToLocalInput(task?.due_at), estimated_minutes: task?.estimated_minutes ? String(task.estimated_minutes) : "",
    actual_minutes: String(task?.actual_minutes ?? 0), category: task?.category ?? "", goal_id: task?.goal_id ?? "", milestone_id: task?.milestone_id ?? "", project_id: task?.project_id ?? "",
    recurrence_rule: task?.recurrence_rule ?? "", tags: (task?.tags ?? []).join(", "), is_template: task?.is_template ?? !!defaultTemplate,
  });
  const [checklist, setChecklist] = React.useState(task?.checklist.map((c) => ({ text: c.text, done: c.done })) ?? []);
  const [newItem, setNewItem] = React.useState("");
  const [error, setError] = React.useState("");
  const [confirmDel, setConfirmDel] = React.useState(false);
  const goals = useGet<Goal[]>(["goals", "active"], "/goals?status=active");
  const projects = useGet<Project[]>(["projects", "list"], "/projects");
  const goal = useGet<GoalDetail>(["goals", f.goal_id], f.goal_id ? `/goals/${f.goal_id}` : null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const inv = { invalidate: [["tasks"], ["goals"]] };
  const save = useMut((body: Record<string, unknown>) => (isNew ? post("/tasks", body) : patch(`/tasks/${task!.id}`, body)), { ...inv, success: "Задача сохранена", onSuccess: onClose });
  const remove = useMut(() => del(`/tasks/${task!.id}`), { ...inv, success: "Задача удалена", onSuccess: onClose });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.title.trim()) return setError("Введите название");
    if (f.estimated_minutes && (Number(f.estimated_minutes) < 0 || Number.isNaN(Number(f.estimated_minutes)))) return setError("Оценка времени — неотрицательное число");
    setError("");
    save.mutate({
      title: f.title.trim(), description: f.description, status: f.status, priority: Number(f.priority),
      due_at: f.due_at ? new Date(f.due_at).toISOString() : null, estimated_minutes: f.estimated_minutes ? Number(f.estimated_minutes) : null,
      ...(isNew ? {} : { actual_minutes: Number(f.actual_minutes) || 0 }),
      category: f.category || null, goal_id: f.goal_id || null, milestone_id: f.milestone_id || null, project_id: f.project_id || null, recurrence_rule: f.recurrence_rule || null,
      tags: f.tags.split(",").map((s) => s.trim()).filter(Boolean), checklist, is_template: f.is_template,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={isNew ? "Новая задача" : "Задача"} wide>
      <Tabs defaultValue="main">
        {!isNew && <TabsList className="mb-4"><TabsTrigger value="main">Основное</TabsTrigger><TabsTrigger value="subtasks">Подзадачи</TabsTrigger>
          <TabsTrigger value="deps">Зависимости</TabsTrigger><TabsTrigger value="comments">Комментарии</TabsTrigger><TabsTrigger value="files">Файлы</TabsTrigger><TabsTrigger value="history">История</TabsTrigger></TabsList>}
        <TabsContent value="main">
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
            <Field label="Название *" className="sm:col-span-2"><Input value={f.title} onChange={set("title")} autoFocus /></Field>
            <Field label="Статус"><Select value={f.status} onChange={set("status")}>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Приоритет"><Select value={f.priority} onChange={set("priority")}>{[1, 2, 3, 4].map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</Select></Field>
            <Field label="Срок"><Input type="datetime-local" value={f.due_at} onChange={set("due_at")} /></Field>
            <Field label="Повторение"><Select value={f.recurrence_rule} onChange={set("recurrence_rule")}>{RECUR.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              {f.recurrence_rule && !RECUR.some(([v]) => v === f.recurrence_rule) && <option value={f.recurrence_rule}>{f.recurrence_rule}</option>}</Select></Field>
            <Field label="Оценка, мин"><Input type="number" min={0} value={f.estimated_minutes} onChange={set("estimated_minutes")} /></Field>
            {!isNew && <Field label="Факт, мин" hint="Учитывается автоматически по фокус-сессиям"><Input type="number" min={0} value={f.actual_minutes} onChange={set("actual_minutes")} /></Field>}
            <Field label="Цель"><Select value={f.goal_id} onChange={(e) => setF((x) => ({ ...x, goal_id: e.target.value, milestone_id: "" }))}><option value="">—</option>{goals.data?.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</Select></Field>
            <Field label="Этап цели"><Select value={f.milestone_id} onChange={set("milestone_id")} disabled={!f.goal_id}><option value="">—</option>{goal.data?.milestones.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</Select></Field>
            <Field label="Проект"><Select value={f.project_id} onChange={set("project_id")}><option value="">—</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select></Field>
            <Field label="Категория"><Input value={f.category} onChange={set("category")} placeholder="работа, дом…" /></Field>
            <Field label="Теги"><Input value={f.tags} onChange={set("tags")} placeholder="через запятую" /></Field>
            <Field label="Описание" className="sm:col-span-2"><Textarea value={f.description} onChange={set("description")} /></Field>
            <div className="sm:col-span-2">
              <div className="mb-1.5 text-xs font-medium text-muted">Чек-лист</div>
              <ul className="space-y-1">{checklist.map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={c.done} onChange={() => setChecklist((x) => x.map((y, j) => j === i ? { ...y, done: !y.done } : y))} className="accent-[var(--accent)]" />
                  <span className={c.done ? "flex-1 text-muted line-through" : "flex-1"}>{c.text}</span>
                  <button type="button" onClick={() => setChecklist((x) => x.filter((_, j) => j !== i))} aria-label="Удалить пункт"><X className="size-3.5 text-muted" /></button>
                </li>))}</ul>
              <div className="mt-1.5 flex gap-2"><Input className="h-8" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Новый пункт"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (newItem.trim()) { setChecklist((x) => [...x, { text: newItem.trim(), done: false }]); setNewItem(""); } } }} />
                <Button type="button" size="sm" variant="secondary" onClick={() => { if (newItem.trim()) { setChecklist((x) => [...x, { text: newItem.trim(), done: false }]); setNewItem(""); } }}><Plus /></Button></div>
            </div>
            <div className="sm:col-span-2"><Switch checked={f.is_template} onCheckedChange={(v) => setF((x) => ({ ...x, is_template: v }))} label="Шаблон задачи" /></div>
            {error && <p className="text-sm text-danger sm:col-span-2" role="alert">{error}</p>}
            <div className="flex justify-between gap-2 sm:col-span-2">
              {!isNew ? <Button type="button" variant="ghost" onClick={() => setConfirmDel(true)}><Trash2 />Удалить</Button> : <span />}
              <div className="flex gap-2"><Button type="button" variant="ghost" onClick={onClose}>Отмена</Button><Button type="submit" loading={save.isPending}>Сохранить</Button></div>
            </div>
          </form>
        </TabsContent>
        {task && <>
          <TabsContent value="subtasks"><Subtasks parent={task} /></TabsContent>
          <TabsContent value="deps"><Dependencies task={task} /></TabsContent>
          <TabsContent value="comments"><Comments taskId={task.id} /></TabsContent>
          <TabsContent value="files"><FileList entityType="task" entityId={task.id} /></TabsContent>
          <TabsContent value="history"><History taskId={task.id} /></TabsContent>
        </>}
      </Tabs>
      <ConfirmDialog open={confirmDel} onOpenChange={setConfirmDel} title="Удалить задачу?" onConfirm={() => remove.mutate()} loading={remove.isPending} />
    </Dialog>
  );
}

function Subtasks({ parent }: { parent: Task }) {
  const key = ["tasks", "sub", parent.id];
  const q = useGet<Page<Task>>(key, `/tasks?parent_id=${parent.id}`);
  const [title, setTitle] = React.useState("");
  const add = useMut(() => post("/tasks", { title, parent_id: parent.id, goal_id: parent.goal_id }), { invalidate: [["tasks"]], onSuccess: () => setTitle("") });
  const toggle = useMut((t: Task) => patch(`/tasks/${t.id}`, { status: t.status === "done" ? "todo" : "done" }), { invalidate: [["tasks"]] });
  return (
    <div>
      <ul className="mb-2 space-y-1">{q.data?.items.map((t) => (
        <li key={t.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={t.status === "done"} onChange={() => toggle.mutate(t)} className="accent-[var(--accent)]" />
          <span className={t.status === "done" ? "text-muted line-through" : ""}>{t.title}</span></li>))}</ul>
      {q.data?.items.length === 0 && <p className="mb-2 text-sm text-muted">Подзадач нет</p>}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (title.trim()) add.mutate(); }}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Новая подзадача" /><Button type="submit" loading={add.isPending}>Добавить</Button></form>
    </div>
  );
}

function Dependencies({ task }: { task: Task }) {
  const all = useGet<Page<Task>>(["tasks", "dep-candidates"], "/tasks?limit=500");
  const fresh = useGet<Task>(["tasks", task.id], `/tasks/${task.id}`);
  const [dep, setDep] = React.useState("");
  const inv = { invalidate: [["tasks"]] };
  const add = useMut(() => post(`/tasks/${task.id}/dependencies`, { depends_on_id: dep }), { ...inv, success: "Зависимость добавлена", onSuccess: () => setDep("") });
  const remove = useMut((id: string) => del(`/tasks/${task.id}/dependencies/${id}`), inv);
  const deps = fresh.data?.depends_on ?? task.depends_on;
  const byId = new Map(all.data?.items.map((t) => [t.id, t]));
  return (
    <div>
      <p className="mb-2 text-sm text-muted">Задача не может быть завершена, пока не выполнены зависимости. Циклы запрещены.</p>
      <ul className="mb-3 space-y-1">{deps.map((id) => (
        <li key={id} className="flex items-center gap-2 text-sm"><span className="flex-1">{byId.get(id)?.title ?? id}</span><span className="text-xs text-muted">{STATUS_LABEL[byId.get(id)?.status ?? "todo"]}</span>
          <Button size="icon-sm" variant="ghost" onClick={() => remove.mutate(id)} aria-label="Убрать"><X /></Button></li>))}</ul>
      <div className="flex gap-2"><Select value={dep} onChange={(e) => setDep(e.target.value)}><option value="">Выберите задачу…</option>
        {all.data?.items.filter((t) => t.id !== task.id && !deps.includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</Select>
        <Button disabled={!dep} onClick={() => add.mutate()} loading={add.isPending}>Добавить</Button></div>
    </div>
  );
}

function Comments({ taskId }: { taskId: string }) {
  const key = ["tasks", taskId, "comments"];
  const q = useGet<{ id: string; body: string; created_at: string }[]>(key, `/tasks/${taskId}/comments`);
  const [body, setBody] = React.useState("");
  const add = useMut(() => post(`/tasks/${taskId}/comments`, { body }), { invalidate: [key], onSuccess: () => setBody("") });
  const remove = useMut((id: string) => del(`/tasks/${taskId}/comments/${id}`), { invalidate: [key] });
  return (
    <div>
      <ul className="mb-3 space-y-2">{q.data?.map((c) => (
        <li key={c.id} className="rounded-md bg-surface-2 p-2 text-sm"><div className="flex justify-between text-xs text-muted">{fmtDateTime(c.created_at)}<button onClick={() => remove.mutate(c.id)} aria-label="Удалить"><X className="size-3" /></button></div><p className="whitespace-pre-wrap">{c.body}</p></li>))}</ul>
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Комментарий…" />
      <div className="mt-2 flex justify-end"><Button size="sm" disabled={!body.trim()} onClick={() => add.mutate()} loading={add.isPending}>Отправить</Button></div>
    </div>
  );
}

function History({ taskId }: { taskId: string }) {
  const q = useGet<{ field: string; old: string | null; new: string | null; at: string }[]>(["tasks", taskId, "history"], `/tasks/${taskId}/history`);
  if (!q.data?.length) return <p className="text-sm text-muted">Изменений пока нет</p>;
  return <ul className="space-y-1 text-sm">{q.data.map((h, i) => <li key={i} className="flex gap-3"><span className="w-32 shrink-0 text-xs text-muted">{fmtDateTime(h.at)}</span><span><b>{h.field}</b>: {h.old ?? "—"} → {h.new ?? "—"}</span></li>)}</ul>;
}
