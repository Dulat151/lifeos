"use client";
import { Archive, ArrowLeft, Eye, Pencil, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileList } from "@/components/files";
import { Button, Card, ConfirmDialog, ErrorState, Field, Input, Select, Skeleton, Textarea } from "@/components/ui";
import { useGet, useMut } from "@/hooks/use-api";
import { del, patch } from "@/lib/api";
import type { Book, Course, Goal, Note, Page, Task } from "@/lib/types";

export default function NoteEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const q = useGet<Note>(["notes", id], `/notes/${id}`);
  const links = useGet<{ backlinks: { id: string; title: string }[]; links: { id: string; title: string }[] }>(["notes", id, "links"], `/notes/${id}/backlinks`);
  const all = useGet<Page<Note>>(["notes", "all-titles"], "/notes?limit=500");
  const folders = useGet<Page<{ id: string; name: string }>>(["notes", "folders"], "/folders");
  const goals = useGet<Goal[]>(["goals", "active"], "/goals");
  const courses = useGet<Course[]>(["learning", "courses"], "/learning/courses");
  const books = useGet<Book[]>(["books", ""], "/books");
  const tasks = useGet<Page<Task>>(["tasks", "open-list"], "/tasks?limit=200");
  const [f, setF] = React.useState<Note | null>(null);
  const [mode, setMode] = React.useState<"edit" | "preview">("edit");
  const [dirty, setDirty] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  React.useEffect(() => { if (q.data && !f) setF(q.data); }, [q.data, f]);
  const save = useMut((n: Note) => patch(`/notes/${id}`, { title: n.title, content: n.content, tags: n.tags, folder_id: n.folder_id, is_favorite: n.is_favorite, archived: n.archived,
    goal_id: n.goal_id, course_id: n.course_id, book_id: n.book_id, task_id: n.task_id, category: n.category }), { invalidate: [["notes"]], onSuccess: () => setDirty(false) });
  const remove = useMut(() => del(`/notes/${id}`), { invalidate: [["notes"]], success: "Заметка удалена", onSuccess: () => router.replace("/notes") });
  // Autosave 1.2 s after the last change
  React.useEffect(() => {
    if (!dirty || !f || !f.title.trim()) return;
    const t = setTimeout(() => save.mutate(f), 1200);
    return () => clearTimeout(t);
  }, [f, dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  if (q.isLoading || !f) return q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <Skeleton className="h-96" />;
  const upd = (p: Partial<Note>) => { setF({ ...f, ...p }); setDirty(true); };
  const titleToId = new Map(all.data?.items.map((n) => [n.title.toLowerCase(), n.id]));
  // Turn [[Title]] into links for the preview
  const rendered = f.content.replace(/\[\[([^\]\n]+)\]\]/g, (_, t: string) => { const nid = titleToId.get(t.trim().toLowerCase()); return nid ? `[${t}](/notes/${nid})` : `*${t}*`; });
  return (
    <div>
      <Link href="/notes" className="mb-3 inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft className="size-4" />Заметки</Link>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Input className="h-10 border-transparent text-lg font-semibold focus:border-border" value={f.title} onChange={(e) => upd({ title: e.target.value })} aria-label="Заголовок" />
            <span className="w-24 text-right text-xs text-muted">{save.isPending ? "Сохранение…" : dirty ? "Изменено" : "Сохранено"}</span>
            <Button size="icon" variant="ghost" onClick={() => setMode(mode === "edit" ? "preview" : "edit")} aria-label="Режим">{mode === "edit" ? <Eye /> : <Pencil />}</Button>
            <Button size="icon" variant="ghost" onClick={() => upd({ is_favorite: !f.is_favorite })} aria-label="Избранное"><Star className={f.is_favorite ? "fill-warning text-warning" : ""} /></Button>
            <Button size="icon" variant="ghost" onClick={() => upd({ archived: !f.archived })} aria-label="Архив"><Archive className={f.archived ? "text-accent" : ""} /></Button>
            <Button size="icon" variant="ghost" onClick={() => setConfirm(true)} aria-label="Удалить"><Trash2 /></Button>
          </div>
          {mode === "edit" ? (
            <Textarea className="min-h-[60vh] font-mono text-sm leading-relaxed" value={f.content} onChange={(e) => upd({ content: e.target.value })}
              placeholder={"# Заголовок\n\nТекст в **Markdown**. Ссылка на другую заметку: [[Название заметки]]"} />
          ) : (
            <div className="prose-note min-h-[60vh] text-sm"><ReactMarkdown remarkPlugins={[remarkGfm]}>{rendered || "_Пусто_"}</ReactMarkdown></div>
          )}
        </Card>
        <div className="space-y-3">
          <Card className="space-y-3 p-4">
            <Field label="Папка"><Select value={f.folder_id ?? ""} onChange={(e) => upd({ folder_id: e.target.value || null })}><option value="">—</option>{folders.data?.items.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
            <Field label="Теги"><Input value={f.tags.join(", ")} onChange={(e) => upd({ tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="через запятую" /></Field>
            <Field label="Категория"><Input value={f.category ?? ""} onChange={(e) => upd({ category: e.target.value || null })} /></Field>
            <Field label="Цель"><Select value={f.goal_id ?? ""} onChange={(e) => upd({ goal_id: e.target.value || null })}><option value="">—</option>{goals.data?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select></Field>
            <Field label="Курс"><Select value={f.course_id ?? ""} onChange={(e) => upd({ course_id: e.target.value || null })}><option value="">—</option>{courses.data?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select></Field>
            <Field label="Книга"><Select value={f.book_id ?? ""} onChange={(e) => upd({ book_id: e.target.value || null })}><option value="">—</option>{books.data?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select></Field>
            <Field label="Задача"><Select value={f.task_id ?? ""} onChange={(e) => upd({ task_id: e.target.value || null })}><option value="">—</option>{tasks.data?.items.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select></Field>
          </Card>
          <Card className="p-4 text-sm">
            <div className="mb-1 font-medium">Ссылается на</div>
            {links.data?.links.length ? links.data.links.map((l) => <Link key={l.id} href={`/notes/${l.id}`} className="block text-accent">{l.title}</Link>) : <p className="text-muted">—</p>}
            <div className="mb-1 mt-3 font-medium">Обратные ссылки</div>
            {links.data?.backlinks.length ? links.data.backlinks.map((l) => <Link key={l.id} href={`/notes/${l.id}`} className="block text-accent">{l.title}</Link>) : <p className="text-muted">—</p>}
          </Card>
          <FileList entityType="note" entityId={id} />
        </div>
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Удалить заметку?" onConfirm={() => remove.mutate()} loading={remove.isPending} />
    </div>
  );
}
