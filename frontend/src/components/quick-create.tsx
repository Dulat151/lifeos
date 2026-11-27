"use client";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, FolderKanban, ListChecks, Repeat, StickyNote, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button, Dialog, Field, Input, Segmented, Select, useToast } from "@/components/ui";
import { useGet } from "@/hooks/use-api";
import { post } from "@/lib/api";
import { NOTE_TEMPLATES } from "@/lib/note-templates";
import type { Goal, Project } from "@/lib/types";
import { GOAL_CATEGORIES as ALL_GOAL_CATEGORIES, isoDate } from "@/lib/utils";

export type CreateKind = "task" | "note" | "habit" | "event" | "project" | "goal";
type Preset = { title?: string; goal_id?: string; project_id?: string; due?: string; date?: string };

const KINDS: { value: CreateKind; label: string; icon: React.ElementType }[] = [
  { value: "task", label: "Задача", icon: ListChecks }, { value: "note", label: "Заметка", icon: StickyNote },
  { value: "habit", label: "Привычка", icon: Repeat }, { value: "event", label: "Событие", icon: CalendarDays },
  { value: "project", label: "Проект", icon: FolderKanban }, { value: "goal", label: "Цель", icon: Target },
];
export const CREATE_KINDS = KINDS;
const CREATED: Record<CreateKind, string> = { task: "Задача создана", note: "Заметка создана", habit: "Привычка создана",
  event: "Событие создано", project: "Проект создан", goal: "Цель создана" };

const GOAL_CATEGORIES: Record<string, string> = Object.fromEntries(Object.entries(ALL_GOAL_CATEGORIES).slice(0, 7));

const Ctx = React.createContext<(kind?: CreateKind, preset?: Preset) => void>(() => {});
export const useQuickCreate = () => React.useContext(Ctx);

/** Global "create anything" dialog. Minimal fields; details are edited on the item's own page. */
export function QuickCreateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<{ open: boolean; kind: CreateKind; preset: Preset }>({ open: false, kind: "task", preset: {} });
  const open = React.useCallback((kind: CreateKind = "task", preset: Preset = {}) => setState({ open: true, kind, preset }), []);
  return (
    <Ctx.Provider value={open}>
      {children}
      {state.open && <QuickCreateDialog kind={state.kind} preset={state.preset} onKind={(k) => setState((s) => ({ ...s, kind: k }))}
        onClose={() => setState((s) => ({ ...s, open: false }))} />}
    </Ctx.Provider>
  );
}

function QuickCreateDialog({ kind, preset, onKind, onClose }: { kind: CreateKind; preset: Preset; onKind: (k: CreateKind) => void; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const today = isoDate();
  const [f, setF] = React.useState({
    title: preset.title ?? "", due: preset.due ?? "", priority: "2", goal_id: preset.goal_id ?? "", project_id: preset.project_id ?? "",
    template: "", frequency: "daily", date: preset.date ?? today, start: "09:00", end: "10:00", all_day: false,
    status: "planned", category: "personal_development", deadline: "",
  });
  const [busy, setBusy] = React.useState(false);
  const goals = useGet<Goal[]>(["goals", "active-list"], "/goals?status=active");
  const projects = useGet<Project[]>(["projects", "list"], "/projects");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tpl = NOTE_TEMPLATES.find((t) => t.id === f.template);
    const title = f.title.trim() || (kind === "note" && tpl ? tpl.title : "");
    if (!title) return toast("Введите название", "error");
    setBusy(true);
    try {
      const opt = (v: string) => v || undefined;
      let goTo: string | null = null;
      if (kind === "task") {
        await post("/tasks", { title, priority: Number(f.priority), due_at: f.due ? new Date(f.due + "T18:00:00").toISOString() : undefined,
          goal_id: opt(f.goal_id), project_id: opt(f.project_id) });
      } else if (kind === "note") {
        const n = await post<{ id: string }>("/notes", { title, content: tpl ? tpl.body(today) : "", category: tpl?.category,
          goal_id: opt(f.goal_id), project_id: opt(f.project_id) });
        goTo = `/notes/${n.id}`;
      } else if (kind === "habit") {
        await post("/habits", { title, frequency: f.frequency, goal_id: opt(f.goal_id), start_date: today });
      } else if (kind === "event") {
        const s = f.all_day ? new Date(f.date + "T00:00:00") : new Date(`${f.date}T${f.start}:00`);
        let en = f.all_day ? new Date(s.getTime() + 864e5) : new Date(`${f.date}T${f.end}:00`);
        if (en <= s) en = new Date(s.getTime() + 36e5);
        await post("/calendar/events", { title, starts_at: s.toISOString(), ends_at: en.toISOString(), all_day: f.all_day,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, goal_id: opt(f.goal_id), project_id: opt(f.project_id) });
      } else if (kind === "project") {
        const p = await post<{ id: string }>("/projects", { title, status: f.status, deadline: opt(f.deadline), goal_id: opt(f.goal_id) });
        goTo = `/projects/${p.id}`;
      } else {
        const g = await post<{ id: string }>("/goals", { title, category: f.category, deadline: opt(f.deadline) });
        goTo = `/goals/${g.id}`;
      }
      for (const k of [["tasks"], ["notes"], ["habits"], ["calendar"], ["projects"], ["goals"], ["dashboard"], ["gamification"], ["quests"]]) qc.invalidateQueries({ queryKey: k });
      toast(CREATED[kind]);
      onClose();
      if (goTo) router.push(goTo);
    } catch (err) { toast((err as Error).message, "error"); } finally { setBusy(false); }
  };

  const linkGoal = (
    <Field label="Цель"><Select value={f.goal_id} onChange={set("goal_id")}><option value="">— без цели —</option>
      {goals.data?.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</Select></Field>
  );
  const linkProject = (
    <Field label="Проект"><Select value={f.project_id} onChange={set("project_id")}><option value="">— без проекта —</option>
      {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select></Field>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Быстрое создание" description="Самое важное сейчас, детали — потом на странице элемента">
      <form onSubmit={submit} className="space-y-4">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <Segmented size="sm" value={kind} onChange={onKind} options={KINDS.map((k) => ({ value: k.value, label: <span className="flex items-center gap-1.5"><k.icon className="size-3.5" />{k.label}</span> }))} />
        </div>
        <Field label="Название"><Input autoFocus value={f.title} onChange={set("title")} maxLength={200}
          placeholder={kind === "note" ? "Можно оставить пустым — возьмём название шаблона" : "Что нужно сделать?"} /></Field>

        {kind === "task" && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Срок"><Input type="date" value={f.due} onChange={set("due")} /></Field>
          <Field label="Приоритет"><Select value={f.priority} onChange={set("priority")}>
            <option value="1">Срочно (+10 XP)</option><option value="2">Обычный</option><option value="3">Низкий</option><option value="4">Когда-нибудь</option></Select></Field>
          {linkGoal}{linkProject}
        </div>}

        {kind === "note" && <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <TemplateTile active={!f.template} title="Пустая" desc="Чистый лист" onClick={() => setF({ ...f, template: "" })} />
            {NOTE_TEMPLATES.map((t) => <TemplateTile key={t.id} active={f.template === t.id} title={t.title} desc={t.description} onClick={() => setF({ ...f, template: t.id })} />)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">{linkGoal}{linkProject}</div>
        </div>}

        {kind === "habit" && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Как часто"><Select value={f.frequency} onChange={set("frequency")}><option value="daily">Каждый день</option><option value="weekly">Раз в неделю</option></Select></Field>
          {linkGoal}
        </div>}

        {kind === "event" && <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Дата"><Input type="date" value={f.date} onChange={set("date")} required /></Field>
          {!f.all_day && <><Field label="Начало"><Input type="time" value={f.start} onChange={set("start")} /></Field>
            <Field label="Конец"><Input type="time" value={f.end} onChange={set("end")} /></Field></>}
          <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" checked={f.all_day} onChange={set("all_day")} className="accent-[var(--accent)]" />Весь день</label>
          <div className="grid gap-3 sm:col-span-3 sm:grid-cols-2">{linkGoal}{linkProject}</div>
        </div>}

        {kind === "project" && <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Статус"><Select value={f.status} onChange={set("status")}><option value="idea">Идея</option><option value="planned">Запланировано</option><option value="in_progress">В процессе</option></Select></Field>
          <Field label="Дедлайн"><Input type="date" value={f.deadline} onChange={set("deadline")} /></Field>
          {linkGoal}
        </div>}

        {kind === "goal" && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Сфера"><Select value={f.category} onChange={set("category")}>{Object.entries(GOAL_CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field label="Дедлайн"><Input type="date" value={f.deadline} onChange={set("deadline")} /></Field>
        </div>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={busy}>Создать</Button>
        </div>
      </form>
    </Dialog>
  );
}

function TemplateTile({ active, title, desc, onClick }: { active: boolean; title: string; desc: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`rounded-xl border p-2.5 text-left transition-all ${active ? "border-accent bg-accent-softer" : "border-border hover:border-border-strong hover:bg-surface-2"}`}>
      <div className="text-xs font-medium">{title}</div>
      <div className="mt-0.5 line-clamp-2 text-[11px] text-muted">{desc}</div>
    </button>
  );
}
