"use client";
import {
  Archive, BookOpen, CalendarCheck, Folder, FolderKanban, FolderPlus, GraduationCap, Lightbulb, Network, Pin, Plus, Sparkles, Star, StickyNote, Sun, Target, Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useI18n } from "@/components/providers";
import { Button, Card, EmptyState, Input, PageHeader, QueryState, Skeleton } from "@/components/ui";
import { useGet, useMut } from "@/hooks/use-api";
import { post } from "@/lib/api";
import { NOTE_TEMPLATES, type NoteTemplate } from "@/lib/note-templates";
import type { Note, Page } from "@/lib/types";
import { cn, fmtDate, isoDate } from "@/lib/utils";

const TPL_ICON: Record<string, React.ElementType> = {
  "book-open": BookOpen, sun: Sun, sparkles: Sparkles, lightbulb: Lightbulb, "graduation-cap": GraduationCap, "folder-kanban": FolderKanban, target: Target, "calendar-check": CalendarCheck,
};

function preview(md: string) {
  return md.replace(/^#+\s.*$/m, "").replace(/- \[[ x]\] /g, "• ").replace(/[#*`>\[\]_|]/g, "").replace(/\n{2,}/g, "\n").trim().slice(0, 180);
}
function checklist(md: string) {
  const all = md.match(/- \[[ xX]\]/g) ?? [];
  return all.length ? { done: all.filter((x) => /x/i.test(x)).length, total: all.length } : null;
}

export default function NotesPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const [q, setQ] = React.useState("");
  const [folder, setFolder] = React.useState("");
  const [fav, setFav] = React.useState(false);
  const [archived, setArchived] = React.useState(false);
  const [tag, setTag] = React.useState("");
  const filters = [folder && `folder_id:${folder}`, fav && "is_favorite:true"].filter(Boolean).join(",");
  const notes = useGet<Page<Note>>(["notes", q, folder, fav, archived], `/notes?limit=500${q ? `&q=${encodeURIComponent(q)}` : ""}${filters ? `&filters=${filters}` : ""}${archived ? "&include_archived=true" : ""}`);
  const folders = useGet<Page<{ id: string; name: string; parent_id: string | null }>>(["notes", "folders"], "/folders");
  const [newFolder, setNewFolder] = React.useState("");
  const addFolder = useMut(() => post("/folders", { name: newFolder }), { invalidate: [["notes"]], onSuccess: () => setNewFolder("") });
  const create = useMut((tpl?: NoteTemplate) => post<Note>("/notes", {
    title: tpl ? tpl.title : "Новая заметка", content: tpl ? tpl.body(isoDate()) : "", category: tpl?.category, folder_id: folder || null,
  }), { invalidate: [["notes"]], onSuccess: (n) => router.push(`/notes/${n.id}`) });
  const all = (notes.data?.items ?? []).filter((n) => (archived ? n.archived : !n.archived));
  const tags = [...new Set(all.flatMap((n) => n.tags))].sort();
  const items = tag ? all.filter((n) => n.tags.includes(tag)) : all;
  const pinned = items.filter((n) => n.is_pinned);
  const rest = items.filter((n) => !n.is_pinned);

  const NoteCard = ({ n }: { n: Note }) => {
    const cl = checklist(n.content);
    return (
      <Link href={`/notes/${n.id}`} className="block">
        <Card interactive className="flex h-full flex-col p-4">
          <div className="mb-1.5 flex items-start gap-2">
            <span className="min-w-0 flex-1 font-medium leading-snug">{n.title}</span>
            {n.is_pinned && <Pin className="size-3.5 shrink-0 fill-accent text-accent" />}
            {n.is_favorite && <Star className="size-3.5 shrink-0 fill-warning text-warning" />}
          </div>
          <p className="line-clamp-3 flex-1 whitespace-pre-line text-[13px] leading-relaxed text-muted">{preview(n.content) || "Пустая заметка"}</p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
            {cl && <span className={cn("rounded-full px-1.5 py-0.5", cl.done === cl.total ? "bg-success/12 text-success" : "bg-surface-2 text-muted")}>✓ {cl.done}/{cl.total}</span>}
            {n.project_id && <FolderKanban className="size-3" />}{n.goal_id && <Target className="size-3" />}
            {n.tags.slice(0, 3).map((t) => <span key={t} className="text-muted">#{t}</span>)}
            <span className="ml-auto">{fmtDate(n.updated_at, locale)}</span>
          </div>
        </Card>
      </Link>
    );
  };

  return (
    <div>
      <PageHeader icon={<StickyNote />} title="Заметки" subtitle="Markdown, чек-листы, шаблоны и ссылки [[Название]] между заметками" actions={<>
        <Button variant="ghost" size="sm" asChild><Link href="/settings#import-notes"><Upload />Импорт</Link></Button>
        <Button variant="ghost" size="sm" asChild><Link href="/knowledge-graph"><Network />Граф знаний</Link></Button>
        <Button onClick={() => create.mutate(undefined)} loading={create.isPending && !create.variables}><Plus />Заметка</Button></>} />

      {!archived && !q && (
        <div className="mb-6">
          <div className="mb-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-faint">Начать с шаблона</div>
          <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-4 md:px-0 xl:grid-cols-8">
            {NOTE_TEMPLATES.map((t) => {
              const I = TPL_ICON[t.icon] ?? StickyNote;
              return (
                <button key={t.id} onClick={() => create.mutate(t)} disabled={create.isPending} title={t.description}
                  className="group flex w-36 shrink-0 flex-col items-start gap-2 rounded-2xl border border-border bg-surface p-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent/50 md:w-auto">
                  <span className="grid size-8 place-items-center rounded-xl bg-accent-softer text-accent transition-colors group-hover:bg-accent group-hover:text-accent-fg"><I className="size-4" /></span>
                  <span className="text-[13px] font-medium leading-tight">{t.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-[210px_1fr]">
        <aside className="space-y-1 md:sticky md:top-20 md:h-fit">
          <button onClick={() => setFolder("")} className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm", !folder ? "bg-surface-2 font-medium" : "text-muted hover:text-text")}><Folder className="size-4" />Все заметки</button>
          {folders.data?.items.map((f) => (
            <button key={f.id} onClick={() => setFolder(f.id)} className={cn("flex w-full items-center gap-2 truncate rounded-lg px-2.5 py-1.5 text-sm", folder === f.id ? "bg-surface-2 font-medium" : "text-muted hover:text-text", f.parent_id && "pl-7")}><Folder className="size-4 shrink-0" /><span className="truncate">{f.name}</span></button>
          ))}
          <form className="flex gap-1 pt-1" onSubmit={(e) => { e.preventDefault(); if (newFolder.trim()) addFolder.mutate(); }}>
            <Input className="h-8" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="Новая папка" aria-label="Новая папка" />
            <Button size="icon-sm" variant="ghost" type="submit" aria-label="Создать папку" className="h-8 w-8"><FolderPlus /></Button>
          </form>
        </aside>
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input className="max-w-xs" placeholder="Поиск по заголовку и тексту…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск заметок" />
            <Button size="sm" variant={fav ? "soft" : "ghost"} onClick={() => setFav(!fav)}><Star />Избранное</Button>
            <Button size="sm" variant={archived ? "soft" : "ghost"} onClick={() => setArchived(!archived)}><Archive />Архив</Button>
          </div>
          {tags.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {tags.map((t) => <button key={t} onClick={() => setTag(tag === t ? "" : t)} className={cn("rounded-full border px-2.5 py-0.5 text-xs", tag === t ? "border-accent bg-accent-soft" : "border-border text-muted hover:text-text")}>#{t}</button>)}
            </div>
          )}
          <QueryState q={{ ...notes, data: notes.data ? items : undefined }}
            skeleton={<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-36" />)}</div>}
            empty={<EmptyState icon={<StickyNote />} title={q || tag || fav ? "Ничего не найдено" : archived ? "Архив пуст" : "Заметок пока нет"}
              text={q || tag || fav ? "Попробуйте изменить поиск или фильтры" : "Начните с шаблона выше или с чистого листа — сохраняется автоматически."}
              action={!q && !archived ? <Button size="sm" onClick={() => create.mutate(undefined)}><Plus />Создать заметку</Button> : undefined} />}>
            {() => (
              <div className="space-y-6">
                {pinned.length > 0 && (
                  <section><div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-faint"><Pin className="size-3" />Закреплённые</div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{pinned.map((n) => <NoteCard key={n.id} n={n} />)}</div></section>
                )}
                {rest.length > 0 && (
                  <section>{pinned.length > 0 && <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-faint">Остальные</div>}
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rest.map((n) => <NoteCard key={n.id} n={n} />)}</div></section>
                )}
              </div>
            )}
          </QueryState>
        </div>
      </div>
    </div>
  );
}
