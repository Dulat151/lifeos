"use client";
import {
  Archive, ArrowLeft, Bold, CheckSquare, Columns2, Eye, Heading2, Italic, Link2, List, Pencil, Pin, Star, Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileList } from "@/components/files";
import { Button, Card, ConfirmDialog, ErrorState, Field, Input, Segmented, Select, Skeleton } from "@/components/ui";
import { useGet, useMut } from "@/hooks/use-api";
import { del, patch } from "@/lib/api";
import type { Book, Course, Goal, Habit, Note, Page, Project, Task } from "@/lib/types";
import { cn } from "@/lib/utils";

type Mode = "edit" | "split" | "preview";

/** Toggle the n-th Markdown checkbox ("- [ ]" / "- [x]") in the text. */
function toggleCheckbox(md: string, index: number): string {
  let i = -1;
  return md.replace(/^(\s*[-*+]\s+)\[([ xX])\]/gm, (m, pre: string, mark: string) => {
    i += 1;
    return i === index ? `${pre}[${mark.trim() ? " " : "x"}]` : m;
  });
}

export default function NoteEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const q = useGet<Note>(["notes", id], `/notes/${id}`);
  const links = useGet<{ backlinks: { id: string; title: string }[]; links: { id: string; title: string }[] }>(["notes", id, "links"], `/notes/${id}/backlinks`);
  const all = useGet<Page<Note>>(["notes", "all-titles"], "/notes?limit=500");
  const folders = useGet<Page<{ id: string; name: string }>>(["notes", "folders"], "/folders");
  const goals = useGet<Goal[]>(["goals", "active-list"], "/goals?status=active");
  const projects = useGet<Project[]>(["projects", "list"], "/projects");
  const habits = useGet<Habit[]>(["habits", "list-for-links"], "/habits");
  const courses = useGet<Course[]>(["learning", "courses"], "/learning/courses");
  const books = useGet<Book[]>(["books", ""], "/books");
  const tasks = useGet<Page<Task>>(["tasks", "open-list"], "/tasks?limit=200");
  const [f, setF] = React.useState<Note | null>(null);
  const [mode, setMode] = React.useState<Mode>("edit");
  const [dirty, setDirty] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [tagDraft, setTagDraft] = React.useState("");
  const area = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    if (q.data && !f) {
      setF(q.data);
      setMode(q.data.content.trim() ? "preview" : "edit");
    }
  }, [q.data, f]);
  const save = useMut((n: Note) => patch(`/notes/${id}`, {
    title: n.title, content: n.content, tags: n.tags, folder_id: n.folder_id, is_favorite: n.is_favorite, is_pinned: n.is_pinned, archived: n.archived,
    goal_id: n.goal_id, course_id: n.course_id, book_id: n.book_id, task_id: n.task_id, project_id: n.project_id, habit_id: n.habit_id, category: n.category,
  }), { invalidate: [["notes"]], onSuccess: () => setDirty(false) });
  const remove = useMut(() => del(`/notes/${id}`), { invalidate: [["notes"]], success: "Заметка удалена", onSuccess: () => router.replace("/notes") });

  // Autosave 1 s after the last change; Ctrl/⌘+S saves immediately
  React.useEffect(() => {
    if (!dirty || !f || !f.title.trim()) return;
    const t = setTimeout(() => save.mutate(f), 1000);
    return () => clearTimeout(t);
  }, [f, dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (f && dirty) save.mutate(f); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [f, dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (q.isLoading || !f) return q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <Skeleton className="h-[70vh]" />;
  const upd = (p: Partial<Note>) => { setF({ ...f, ...p }); setDirty(true); };
  const titleToId = new Map(all.data?.items.map((n) => [n.title.toLowerCase(), n.id]));
  const rendered = f.content.replace(/\[\[([^\]\n]+)\]\]/g, (_, t: string) => { const nid = titleToId.get(t.trim().toLowerCase()); return nid ? `[${t}](/notes/${nid})` : `*${t}*`; });
  const cbCount = (f.content.match(/^(\s*[-*+]\s+)\[[ xX]\]/gm) ?? []).length;
  const cbDone = (f.content.match(/^(\s*[-*+]\s+)\[[xX]\]/gm) ?? []).length;

  /** Wrap the selection or insert a line prefix at the cursor. */
  const insert = (kind: "h2" | "bold" | "italic" | "list" | "check" | "link") => {
    const el = area.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    const sel = value.slice(a, b);
    const lineStart = value.lastIndexOf("\n", a - 1) + 1;
    let next = value, cursor = b;
    const wrap = (l: string, r: string, ph: string) => { const t = sel || ph; next = value.slice(0, a) + l + t + r + value.slice(b); cursor = a + l.length + t.length; };
    const prefix = (p: string) => { next = value.slice(0, lineStart) + p + value.slice(lineStart); cursor = b + p.length; };
    if (kind === "bold") wrap("**", "**", "жирный");
    else if (kind === "italic") wrap("*", "*", "курсив");
    else if (kind === "link") wrap("[[", "]]", "Название заметки");
    else if (kind === "h2") prefix("## ");
    else if (kind === "list") prefix("- ");
    else prefix("- [ ] ");
    upd({ content: next });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(cursor, cursor); });
  };

  let cbIndex = -1;
  const previewEl = (
    <div className="prose-note min-h-[55vh] text-[15px]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
        input: ({ checked, type }) => {
          if (type !== "checkbox") return null;
          cbIndex += 1;
          const idx = cbIndex;
          return <input type="checkbox" checked={!!checked} onChange={() => upd({ content: toggleCheckbox(f.content, idx) })} className="cursor-pointer" aria-label="Пункт чек-листа" />;
        },
      }}>{rendered || "_Пустая заметка — переключитесь в режим редактирования._"}</ReactMarkdown>
    </div>
  );
  const editorEl = (
    <textarea ref={area} className="min-h-[55vh] w-full resize-y bg-transparent font-mono text-[14px] leading-relaxed outline-none placeholder:text-faint"
      value={f.content} onChange={(e) => upd({ content: e.target.value })} aria-label="Текст заметки"
      placeholder={"# Заголовок\n\nПишите в Markdown.\n- [ ] пункт чек-листа\nСсылка на заметку: [[Название]]"} />
  );
  const status = save.isPending ? "Сохранение…" : dirty ? "Есть изменения" : "Сохранено";

  return (
    <div>
      <Link href="/notes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><ArrowLeft className="size-4" />Все заметки</Link>
      <div className="grid gap-4 lg:grid-cols-[1fr_290px]">
        <Card className="min-w-0 p-4 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input className="min-w-0 flex-1 bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-faint" value={f.title}
              onChange={(e) => upd({ title: e.target.value })} aria-label="Заголовок" placeholder="Без названия" maxLength={300} />
            <span className={cn("text-xs", dirty ? "text-warning" : "text-faint")} aria-live="polite">{status}</span>
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-1.5 border-b border-border pb-3">
            <Segmented size="sm" value={mode} onChange={setMode} options={[
              { value: "edit", label: <span className="flex items-center gap-1"><Pencil className="size-3.5" />Текст</span> },
              { value: "split", label: <span className="flex items-center gap-1"><Columns2 className="size-3.5" />Рядом</span> },
              { value: "preview", label: <span className="flex items-center gap-1"><Eye className="size-3.5" />Просмотр</span> }]} />
            {mode !== "preview" && <div className="flex items-center gap-0.5">
              {([["h2", Heading2, "Заголовок"], ["bold", Bold, "Жирный"], ["italic", Italic, "Курсив"], ["list", List, "Список"], ["check", CheckSquare, "Чек-лист"], ["link", Link2, "Ссылка на заметку"]] as const).map(([k, I, l]) => (
                <Button key={k} size="icon-sm" variant="ghost" onClick={() => insert(k)} aria-label={l} title={l}><I /></Button>))}
            </div>}
            {cbCount > 0 && <span className={cn("ml-auto rounded-full px-2 py-0.5 text-xs", cbDone === cbCount ? "bg-success/12 text-success" : "bg-surface-2 text-muted")}>Чек-лист {cbDone}/{cbCount}</span>}
            <div className={cn("flex items-center", cbCount === 0 && "ml-auto")}>
              <Button size="icon-sm" variant="ghost" onClick={() => upd({ is_pinned: !f.is_pinned })} aria-label={f.is_pinned ? "Открепить" : "Закрепить"} title="Закрепить"><Pin className={f.is_pinned ? "fill-accent text-accent" : ""} /></Button>
              <Button size="icon-sm" variant="ghost" onClick={() => upd({ is_favorite: !f.is_favorite })} aria-label="Избранное" title="Избранное"><Star className={f.is_favorite ? "fill-warning text-warning" : ""} /></Button>
              <Button size="icon-sm" variant="ghost" onClick={() => upd({ archived: !f.archived })} aria-label={f.archived ? "Вернуть из архива" : "В архив"} title="Архив"><Archive className={f.archived ? "text-accent" : ""} /></Button>
              <Button size="icon-sm" variant="ghost" onClick={() => setConfirm(true)} aria-label="Удалить" title="Удалить"><Trash2 /></Button>
            </div>
          </div>
          {mode === "edit" && editorEl}
          {mode === "preview" && <div onDoubleClick={() => setMode("edit")}>{previewEl}</div>}
          {mode === "split" && <div className="grid gap-6 md:grid-cols-2"><div>{editorEl}</div><div className="border-l border-border pl-6">{previewEl}</div></div>}
        </Card>

        <div className="space-y-3">
          <Card className="space-y-3 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-faint">Связи</div>
            <Field label="Проект"><Select value={f.project_id ?? ""} onChange={(e) => upd({ project_id: e.target.value || null })}><option value="">—</option>{projects.data?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select></Field>
            <Field label="Цель"><Select value={f.goal_id ?? ""} onChange={(e) => upd({ goal_id: e.target.value || null })}><option value="">—</option>{goals.data?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select></Field>
            <Field label="Привычка"><Select value={f.habit_id ?? ""} onChange={(e) => upd({ habit_id: e.target.value || null })}><option value="">—</option>{habits.data?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select></Field>
            <Field label="Задача"><Select value={f.task_id ?? ""} onChange={(e) => upd({ task_id: e.target.value || null })}><option value="">—</option>{tasks.data?.items.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select></Field>
            <details className="group">
              <summary className="cursor-pointer text-xs text-muted hover:text-text">Курс, книга, папка, категория</summary>
              <div className="mt-3 space-y-3">
                <Field label="Папка"><Select value={f.folder_id ?? ""} onChange={(e) => upd({ folder_id: e.target.value || null })}><option value="">—</option>{folders.data?.items.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
                <Field label="Курс"><Select value={f.course_id ?? ""} onChange={(e) => upd({ course_id: e.target.value || null })}><option value="">—</option>{courses.data?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select></Field>
                <Field label="Книга"><Select value={f.book_id ?? ""} onChange={(e) => upd({ book_id: e.target.value || null })}><option value="">—</option>{books.data?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select></Field>
                <Field label="Категория"><Input value={f.category ?? ""} onChange={(e) => upd({ category: e.target.value || null })} maxLength={60} /></Field>
              </div>
            </details>
          </Card>
          <Card className="p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-faint">Теги</div>
            <div className="flex flex-wrap gap-1.5">
              {f.tags.map((t) => <button key={t} onClick={() => upd({ tags: f.tags.filter((x) => x !== t) })} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs hover:bg-danger/12 hover:text-danger" title="Убрать тег">#{t} ×</button>)}
              <form onSubmit={(e) => { e.preventDefault(); const t = tagDraft.trim().replace(/^#/, ""); if (t && !f.tags.includes(t)) upd({ tags: [...f.tags, t] }); setTagDraft(""); }}>
                <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder="+ тег" maxLength={60} aria-label="Новый тег" className="w-20 bg-transparent px-1 text-xs outline-none placeholder:text-faint" />
              </form>
            </div>
          </Card>
          <Card className="p-4 text-sm">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-faint">Ссылается на</div>
            {links.data?.links.length ? links.data.links.map((l) => <Link key={l.id} href={`/notes/${l.id}`} className="block truncate py-0.5 text-accent">{l.title}</Link>) : <p className="text-muted">Пишите [[Название]], чтобы связать заметки</p>}
            <div className="mb-1.5 mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-faint">Обратные ссылки</div>
            {links.data?.backlinks.length ? links.data.backlinks.map((l) => <Link key={l.id} href={`/notes/${l.id}`} className="block truncate py-0.5 text-accent">{l.title}</Link>) : <p className="text-muted">—</p>}
          </Card>
          <FileList entityType="note" entityId={id} />
        </div>
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Удалить заметку?" onConfirm={() => remove.mutate()} loading={remove.isPending} />
    </div>
  );
}
