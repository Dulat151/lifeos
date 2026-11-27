"use client";
import { Archive, ArrowLeft, CalendarDays, Check, ListChecks, Plus, StickyNote, Target, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { useI18n } from "@/components/providers";
import { useQuickCreate } from "@/components/quick-create";
import {
  Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, Input, ProgressRing, QueryState, Select, Skeleton, Textarea,
} from "@/components/ui";
import { useGet, useMut } from "@/hooks/use-api";
import { del, patch, post } from "@/lib/api";
import { PRIORITY_LABEL, PROJECT_COLUMNS } from "@/lib/projects";
import type { Goal, ProjectDetail, Task } from "@/lib/types";
import { cn, fmtDate, fmtDateTime } from "@/lib/utils";

const COLORS = ["#8b7cf6", "#38bdf8", "#34d399", "#fbbf24", "#fb923c", "#f472b6", "#f87171", "#94a3b8"];

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { locale } = useI18n();
  const create = useQuickCreate();
  const q = useGet<ProjectDetail>(["projects", id], `/projects/${id}`);
  const goals = useGet<Goal[]>(["goals", "active-list"], "/goals?status=active");
  const inv = { invalidate: [["projects"]] };
  const update = useMut((b: Record<string, unknown>) => patch(`/projects/${id}`, b), inv);
  const toggleTask = useMut((t: Task) => patch(`/tasks/${t.id}`, { status: t.status === "done" ? "todo" : "done" }), inv);
  const addTask = useMut((title: string) => post("/tasks", { title, project_id: id, goal_id: q.data?.goal_id ?? undefined }), { ...inv, onSuccess: () => setNewTask("") });
  const remove = useMut(() => del(`/projects/${id}`), { ...inv, success: "Проект удалён", onSuccess: () => router.push("/projects") });
  const [newTask, setNewTask] = React.useState("");
  const [confirm, setConfirm] = React.useState(false);
  const [desc, setDesc] = React.useState<string | null>(null);

  return (
    <QueryState q={q} skeleton={<div className="space-y-4"><Skeleton className="h-28" /><div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-80 lg:col-span-2" /><Skeleton className="h-80" /></div></div>}>
      {(p) => {
        const open = p.tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
        const done = p.tasks.filter((t) => t.status === "done");
        return (
          <div className="space-y-5">
            <Link href="/projects" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><ArrowLeft className="size-4" />Все проекты</Link>

            <Card className="relative overflow-hidden p-5">
              <div className="absolute inset-y-0 left-0 w-1" style={{ background: p.color }} />
              <div className="flex flex-wrap items-start gap-5">
                <ProgressRing value={p.progress} size={76} stroke={7} color={p.color} label="Прогресс проекта"><span className="text-base font-semibold">{Math.round(p.progress)}%</span></ProgressRing>
                <div className="min-w-0 flex-1">
                  <input defaultValue={p.title} key={p.title} aria-label="Название проекта" maxLength={200}
                    onBlur={(e) => e.target.value.trim() && e.target.value !== p.title && update.mutate({ title: e.target.value.trim() })}
                    className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none focus:underline focus:decoration-accent/40" />
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <Select value={p.status} onChange={(e) => update.mutate({ status: e.target.value })} className="h-8 w-auto" aria-label="Статус">
                      {PROJECT_COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}</Select>
                    <Select value={p.priority} onChange={(e) => update.mutate({ priority: Number(e.target.value) })} className="h-8 w-auto" aria-label="Приоритет">
                      {[1, 2, 3].map((v) => <option key={v} value={v}>Приоритет: {PRIORITY_LABEL[v]}</option>)}</Select>
                    <Input type="date" value={p.deadline ?? ""} onChange={(e) => update.mutate({ deadline: e.target.value || null })} className="h-8 w-auto" aria-label="Дедлайн" />
                    <Select value={p.goal_id ?? ""} onChange={(e) => update.mutate({ goal_id: e.target.value || null })} className="h-8 w-auto max-w-56" aria-label="Цель">
                      <option value="">Без цели</option>{goals.data?.map((g) => <option key={g.id} value={g.id}>🎯 {g.title}</option>)}</Select>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {COLORS.map((c) => <button key={c} onClick={() => update.mutate({ color: c })} aria-label={`Цвет ${c}`}
                      className={cn("size-5 rounded-full transition-transform hover:scale-110", p.color === c && "ring-2 ring-text/60 ring-offset-2 ring-offset-surface")} style={{ background: c }} />)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => update.mutate({ archived: !p.archived })}><Archive />{p.archived ? "Из архива" : "В архив"}</Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => setConfirm(true)} aria-label="Удалить проект"><Trash2 /></Button>
                </div>
              </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Card>
                <CardHeader title="Задачи проекта" icon={<ListChecks />} subtitle={`${p.tasks_done} из ${p.tasks_total} выполнено`} />
                <CardBody>
                  <form onSubmit={(e) => { e.preventDefault(); if (newTask.trim()) addTask.mutate(newTask.trim()); }} className="mb-3 flex gap-2">
                    <Input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Новая задача проекта…" maxLength={300} aria-label="Новая задача" />
                    <Button type="submit" loading={addTask.isPending} disabled={!newTask.trim()}><Plus />Добавить</Button>
                  </form>
                  {p.tasks.length ? (
                    <ul className="divide-y divide-border">
                      {[...open, ...done].map((t) => (
                        <li key={t.id} className="flex items-center gap-3 py-2">
                          <button onClick={() => toggleTask.mutate(t)} aria-label={t.status === "done" ? "Вернуть" : "Выполнить"}
                            className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors", t.status === "done" ? "border-success bg-success text-white" : "border-border-strong hover:border-accent")}>
                            {t.status === "done" && <Check className="size-3" strokeWidth={3} />}</button>
                          <span className={cn("min-w-0 flex-1 truncate text-sm", t.status === "done" && "text-muted line-through")}>{t.title}</span>
                          {t.status === "in_progress" && <Badge tone="accent">в работе</Badge>}
                          {t.due_at && <span className="text-xs text-muted">{fmtDate(t.due_at, locale)}</span>}
                        </li>))}
                    </ul>) : <p className="py-6 text-center text-sm text-muted">Разбейте проект на маленькие шаги — прогресс посчитается автоматически.</p>}
                </CardBody>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader title="Описание" icon={<Target />} />
                  <CardBody>
                    <Textarea value={desc ?? p.description} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== null && desc !== p.description && update.mutate({ description: desc })}
                      placeholder="Зачем этот проект и как понять, что он готов?" className="min-h-28" aria-label="Описание" />
                    {p.goal && <Link href={`/goals/${p.goal.id}`} className="mt-3 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3"><Target className="size-4 text-accent" />Цель: {p.goal.title}</Link>}
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader title="Заметки" icon={<StickyNote />} action={<Button size="xs" variant="ghost" onClick={() => create("note", { project_id: p.id })}><Plus />Заметка</Button>} />
                  <CardBody>{p.notes.length ? <ul className="space-y-1">{p.notes.map((n) => (
                    <li key={n.id}><Link href={`/notes/${n.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2"><span className="truncate">{n.title}</span><span className="shrink-0 text-[11px] text-faint">{fmtDate(n.updated_at, locale)}</span></Link></li>))}</ul>
                    : <p className="text-sm text-muted">Идеи, решения и материалы проекта — в одном месте.</p>}</CardBody>
                </Card>
                <Card>
                  <CardHeader title="События" icon={<CalendarDays />} action={<Button size="xs" variant="ghost" onClick={() => create("event", { project_id: p.id })}><Plus />Событие</Button>} />
                  <CardBody>{p.events.length ? <ul className="space-y-2">{p.events.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 text-sm"><span className="h-6 w-1 rounded-full" style={{ background: e.color }} /><span className="flex-1 truncate">{e.title}</span><span className="text-xs text-muted">{fmtDateTime(e.starts_at, locale)}</span></li>))}</ul>
                    : <p className="text-sm text-muted">Встречи и дедлайны проекта появятся и в календаре.</p>}</CardBody>
                </Card>
              </div>
            </div>
            <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Удалить проект?" text="Задачи и заметки останутся, просто отвяжутся от проекта." onConfirm={() => remove.mutate()} loading={remove.isPending} />
          </div>
        );
      }}
    </QueryState>
  );
}
