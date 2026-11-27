"use client";
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, CalendarClock, FolderKanban, LayoutGrid, Lightbulb, List, ListChecks, Plus, StickyNote } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useI18n } from "@/components/providers";
import { useQuickCreate } from "@/components/quick-create";
import { Badge, Button, Card, EmptyState, Progress, QueryState, Segmented, Skeleton, useToast } from "@/components/ui";
import { useGet } from "@/hooks/use-api";
import { patch } from "@/lib/api";
import { PROJECT_COLUMNS } from "@/lib/projects";
import type { Project, ProjectStatus } from "@/lib/types";
import { cn, fmtDate } from "@/lib/utils";

export default function ProjectsPage() {
  const [view, setView] = React.useState<"board" | "list">("board");
  const [archived, setArchived] = React.useState(false);
  const create = useQuickCreate();
  const q = useGet<Project[]>(["projects", "list", archived], `/projects${archived ? "?include_archived=true" : ""}`);
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="hidden size-10 place-items-center rounded-2xl bg-accent-soft text-accent sm:grid"><FolderKanban className="size-5" /></span>
          <div><h1 className="text-[22px] font-semibold tracking-tight">Проекты</h1>
            <p className="text-sm text-muted">Личные проекты: от идеи до результата. Перетаскивайте карточки между колонками.</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented size="sm" value={view} onChange={setView} options={[{ value: "board", label: <span className="flex items-center gap-1"><LayoutGrid className="size-3.5" />Доска</span> }, { value: "list", label: <span className="flex items-center gap-1"><List className="size-3.5" />Список</span> }]} />
          <Button size="sm" variant={archived ? "soft" : "ghost"} onClick={() => setArchived(!archived)}><Archive />Архив</Button>
          <Button size="sm" onClick={() => create("project")}><Plus />Проект</Button>
        </div>
      </div>
      <QueryState q={q} skeleton={<div className="grid gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72" />)}</div>}
        empty={<EmptyState icon={<Lightbulb />} title="Пока нет проектов" text="Проект объединяет задачи, заметки и события вокруг одного результата: сайт, курс, ремонт, книга."
          action={<Button onClick={() => create("project")}><Plus />Создать проект</Button>} />}>
        {(items) => view === "board" ? <Board items={items} /> : <ListView items={items} />}
      </QueryState>
    </div>
  );
}

/** Set right after a drop so the click that ends the drag does not open the card. */
const justDragged = { current: false };

function Board({ items }: { items: Project[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const create = useQuickCreate();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }));
  const onDragEnd = async (e: DragEndEvent) => {
    justDragged.current = true;
    setTimeout(() => { justDragged.current = false; }, 250);
    const id = String(e.active.id);
    const to = e.over?.id as ProjectStatus | undefined;
    const p = items.find((x) => x.id === id);
    if (!p || !to || p.status === to) return;
    const key = ["projects", "list", false];
    qc.setQueryData<Project[]>(key, (old) => old?.map((x) => (x.id === id ? { ...x, status: to } : x)));
    try {
      await patch(`/projects/${id}`, { status: to });
      if (to === "done") toast(`«${p.title}» завершён`);
    } catch (err) { toast((err as Error).message, "error"); }
    for (const k of [["projects"], ["dashboard"], ["gamification"]]) qc.invalidateQueries({ queryKey: k });
  };
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-4">
        {PROJECT_COLUMNS.map((c) => (
          <Column key={c.status} col={c} items={items.filter((p) => p.status === c.status)} onAdd={() => create("project")} />
        ))}
      </div>
    </DndContext>
  );
}

function Column({ col, items, onAdd }: { col: (typeof PROJECT_COLUMNS)[number]; items: Project[]; onAdd: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.status });
  return (
    <div ref={setNodeRef} className={cn("flex w-[82vw] max-w-sm shrink-0 snap-start flex-col rounded-[var(--radius-card)] border border-border bg-surface-2/40 p-2.5 transition-colors md:w-auto md:max-w-none",
      isOver && "border-accent bg-accent-softer")}>
      <div className="mb-2 flex items-center gap-2 px-1.5 pt-1">
        <span className="size-2 rounded-full" style={{ background: col.tone }} />
        <span className="text-sm font-semibold">{col.label}</span>
        <span className="rounded-full bg-surface-3 px-1.5 text-[11px] font-medium text-muted">{items.length}</span>
        {col.status === "idea" && <button onClick={onAdd} className="ml-auto rounded-md p-1 text-muted hover:bg-surface-3 hover:text-text" aria-label="Новая идея"><Plus className="size-4" /></button>}
      </div>
      <p className="mb-2 px-1.5 text-[11px] text-faint">{col.hint}</p>
      <div className="flex min-h-24 flex-1 flex-col gap-2">
        {items.map((p) => <ProjectCard key={p.id} p={p} />)}
        {!items.length && <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-border py-6 text-xs text-faint">Перетащите сюда</div>}
      </div>
    </div>
  );
}

function ProjectCard({ p }: { p: Project }) {
  const { locale } = useI18n();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: p.id });
  const overdue = p.deadline && p.status !== "done" && new Date(p.deadline + "T23:59:59") < new Date();
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn("touch-none", isDragging && "z-50 opacity-90")}>
      <Link href={`/projects/${p.id}`} draggable={false} onClick={(e) => { if (isDragging || justDragged.current) e.preventDefault(); }}
        className={cn("block rounded-xl border border-border bg-surface p-3 shadow-[var(--shadow)] transition-[border,box-shadow] hover:border-border-strong", isDragging && "shadow-[var(--shadow-lg)] ring-2 ring-accent/40")}>
        <div className="flex items-start gap-2">
          <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
          <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{p.title}</span>
          {p.priority === 1 && <Badge tone="warning">важно</Badge>}
        </div>
        {p.description && <p className="mt-1 line-clamp-2 pl-[18px] text-xs text-muted">{p.description}</p>}
        {p.tasks_total > 0 && <div className="mt-3 pl-[18px]"><Progress value={p.progress} size="xs" color={p.color} /></div>}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[18px] text-[11px] text-muted">
          <span className="flex items-center gap-1"><ListChecks className="size-3" />{p.tasks_done}/{p.tasks_total}</span>
          {p.notes_count > 0 && <span className="flex items-center gap-1"><StickyNote className="size-3" />{p.notes_count}</span>}
          {p.deadline && <span className={cn("flex items-center gap-1", overdue && "text-danger")}><CalendarClock className="size-3" />{fmtDate(p.deadline, locale)}</span>}
        </div>
      </Link>
    </div>
  );
}

function ListView({ items }: { items: Project[] }) {
  const { locale } = useI18n();
  return (
    <Card className="divide-y divide-border">
      {items.map((p) => (
        <Link key={p.id} href={`/projects/${p.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60">
          <span className="size-2.5 rounded-full" style={{ background: p.color }} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.title}{p.archived && <Badge className="ml-2">в архиве</Badge>}</span>
          <Badge tone={p.status === "done" ? "success" : p.status === "in_progress" ? "accent" : "neutral"}>{PROJECT_COLUMNS.find((c) => c.status === p.status)?.label}</Badge>
          <div className="hidden w-32 items-center gap-2 sm:flex"><Progress value={p.progress} size="xs" color={p.color} /><span className="w-9 text-right text-xs tabular-nums text-muted">{Math.round(p.progress)}%</span></div>
          <span className="w-20 text-right text-xs text-muted">{p.deadline ? fmtDate(p.deadline, locale) : "—"}</span>
        </Link>
      ))}
    </Card>
  );
}
