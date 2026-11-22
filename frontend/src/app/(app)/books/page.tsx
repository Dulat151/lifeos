"use client";
import { BookOpen, Pencil, Plus, Quote, Star, Trash2 } from "lucide-react";
import * as React from "react";
import { BarsChart } from "@/components/charts";
import { EntityDialog, type FieldDef } from "@/components/entity";
import { Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, Field, Input, PageHeader, Progress, QueryState, Select, Stat, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from "@/components/ui";
import { useGet, useMut } from "@/hooks/use-api";
import { del, post } from "@/lib/api";
import type { Book } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

const ST: Record<string, string> = { want_to_read: "Хочу прочитать", reading: "Читаю", paused: "На паузе", completed: "Прочитано" };
const FIELDS: FieldDef[] = [
  { name: "title", label: "Название", required: true, full: true }, { name: "author", label: "Автор" },
  { name: "status", label: "Статус", type: "select", required: true, default: "want_to_read", options: Object.entries(ST).map(([value, label]) => ({ value, label })) },
  { name: "total_pages", label: "Страниц", type: "number", min: 1, nullable: true }, { name: "current_page", label: "Текущая страница", type: "number", min: 0, default: 0 },
  { name: "rating", label: "Оценка", type: "select", nullable: true, options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: "★".repeat(n) })) },
  { name: "cover_url", label: "Обложка (URL)", type: "url", nullable: true },
  { name: "started_on", label: "Начал", type: "date", nullable: true }, { name: "finished_on", label: "Закончил", type: "date", nullable: true },
  { name: "description", label: "Описание", type: "textarea" },
];

export default function BooksPage() {
  const [status, setStatus] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [open, setOpen] = React.useState<Book | null>(null);
  const q = useGet<Book[]>(["books", status], `/books${status ? `?status=${status}` : ""}`);
  const stats = useGet<{ year: number; books_completed: number; pages_read: number; reading_minutes: number; yearly_goal: number; monthly: { month: number; pages: number; books: number }[] }>(["books", "stats"], "/books/stats");
  return (
    <div>
      <PageHeader title="Книги" actions={<><Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Все</option>{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Button onClick={() => setCreating(true)}><Plus />Книга</Button></>} />
      {stats.data && (
        <div className="mb-5 grid gap-3 md:grid-cols-[repeat(4,1fr)_2fr]">
          <Stat label={`Прочитано за ${stats.data.year}`} value={stats.data.books_completed} hint={`цель: ${stats.data.yearly_goal}`} />
          <Stat label="Страниц" value={stats.data.pages_read} /><Stat label="Время чтения" value={`${Math.round(stats.data.reading_minutes / 60)} ч`} />
          <Card className="p-4"><div className="text-xs text-muted">Годовая цель</div><div className="mt-1.5 text-2xl font-semibold">{stats.data.yearly_goal ? Math.round((stats.data.books_completed / stats.data.yearly_goal) * 100) : 0}%</div>
            <Progress className="mt-2" value={stats.data.yearly_goal ? (stats.data.books_completed / stats.data.yearly_goal) * 100 : 0} /></Card>
          <Card className="p-3"><BarsChart data={stats.data.monthly.map((m) => ({ ...m, m: String(m.month) }))} x="m" series={[{ key: "pages", label: "Страниц" }]} height={110} /></Card>
        </div>
      )}
      <QueryState q={q} empty={<EmptyState icon={<BookOpen className="size-8" />} title="Книг нет" action={<Button size="sm" onClick={() => setCreating(true)}><Plus />Добавить книгу</Button>} />}>
        {(list) => (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{list.map((b) => (
            <Card key={b.id} className="flex cursor-pointer gap-3 p-3 hover:border-accent/50" onClick={() => setOpen(b)}>
              <div className="grid h-24 w-16 shrink-0 place-items-center overflow-hidden rounded-md bg-surface-2">{b.cover_url ? <img src={b.cover_url} alt="" className="size-full object-cover" /> : <BookOpen className="size-6 text-muted" />}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{b.title}</div><div className="truncate text-xs text-muted">{b.author}</div>
                <div className="my-2 flex items-center gap-1.5"><Badge tone={b.status === "completed" ? "success" : b.status === "reading" ? "accent" : "neutral"}>{ST[b.status]}</Badge>
                  {b.rating && <span className="text-xs text-warning">{"★".repeat(b.rating)}</span>}</div>
                <Progress value={b.progress} /><div className="mt-1 text-xs text-muted">{b.current_page}{b.total_pages ? ` / ${b.total_pages}` : ""} стр.</div>
              </div>
            </Card>))}</div>
        )}
      </QueryState>
      <EntityDialog open={creating} onOpenChange={setCreating} title="Новая книга" fields={FIELDS} endpoint="/books" invalidate={[["books"]]} />
      {open && <BookDialog book={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function BookDialog({ book, onClose }: { book: Book; onClose: () => void }) {
  const b = useGet<Book>(["books", "one", book.id], `/books/${book.id}`).data ?? book;
  const sessions = useGet<{ id: string; read_on: string; pages: number; minutes: number }[]>(["books", book.id, "sessions"], `/books/${book.id}/sessions`);
  const notes = useGet<{ id: string; kind: string; text: string; page: number | null }[]>(["books", book.id, "notes"], `/books/${book.id}/notes`);
  const [endPage, setEndPage] = React.useState("");
  const [minutes, setMinutes] = React.useState("");
  const [note, setNote] = React.useState({ kind: "note", text: "", page: "" });
  const [editing, setEditing] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const inv = { invalidate: [["books"]] };
  const log = useMut(() => post(`/books/${book.id}/sessions`, { end_page: endPage ? Number(endPage) : null, minutes: Number(minutes) || 0 }), { ...inv, success: "Сессия чтения записана", onSuccess: () => { setEndPage(""); setMinutes(""); } });
  const addNote = useMut(() => post(`/books/${book.id}/notes`, { kind: note.kind, text: note.text, page: note.page ? Number(note.page) : null }), { ...inv, onSuccess: () => setNote({ kind: "note", text: "", page: "" }) });
  const delNote = useMut((id: string) => del(`/books/${book.id}/notes/${id}`), inv);
  const remove = useMut(() => del(`/books/${book.id}`), { ...inv, success: "Удалено", onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={b.title} description={b.author} wide>
      <div className="mb-3 flex items-center gap-3"><Progress value={b.progress} /><span className="text-sm tabular-nums">{b.progress}%</span>
        <Button size="icon-sm" variant="ghost" onClick={() => setEditing(true)} aria-label="Изменить"><Pencil /></Button>
        <Button size="icon-sm" variant="ghost" onClick={() => setConfirm(true)} aria-label="Удалить"><Trash2 /></Button></div>
      <Tabs defaultValue="read">
        <TabsList className="mb-3"><TabsTrigger value="read">Чтение</TabsTrigger><TabsTrigger value="notes">Заметки и цитаты</TabsTrigger></TabsList>
        <TabsContent value="read">
          <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (endPage) log.mutate(); }}>
            <Field label={`Дочитал до страницы (сейчас ${b.current_page})`}><Input type="number" min={b.current_page} max={b.total_pages ?? undefined} value={endPage} onChange={(e) => setEndPage(e.target.value)} className="w-40" /></Field>
            <Field label="Минут"><Input type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="w-24" /></Field>
            <Button type="submit" loading={log.isPending}>Записать</Button>
          </form>
          <ul className="space-y-1 text-sm">{sessions.data?.map((s) => <li key={s.id} className="flex justify-between"><span className="text-muted">{fmtDate(s.read_on)}</span><span>{s.pages} стр. · {s.minutes} мин</span></li>)}</ul>
          {sessions.data?.length === 0 && <p className="text-sm text-muted">Сессий чтения пока нет</p>}
        </TabsContent>
        <TabsContent value="notes">
          <div className="mb-3 grid gap-2 sm:grid-cols-[120px_1fr_90px_auto]">
            <Select value={note.kind} onChange={(e) => setNote({ ...note, kind: e.target.value })}><option value="note">Заметка</option><option value="quote">Цитата</option></Select>
            <Textarea className="min-h-9" value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} placeholder="Текст…" />
            <Input type="number" placeholder="стр." value={note.page} onChange={(e) => setNote({ ...note, page: e.target.value })} />
            <Button disabled={!note.text.trim()} onClick={() => addNote.mutate()}>Добавить</Button>
          </div>
          <ul className="space-y-2">{notes.data?.map((n) => (
            <li key={n.id} className="group flex gap-2 rounded-md bg-surface-2 p-2 text-sm">{n.kind === "quote" ? <Quote className="size-4 shrink-0 text-muted" /> : <Star className="size-4 shrink-0 text-muted" />}
              <span className="flex-1 whitespace-pre-wrap">{n.text}{n.page !== null && <span className="text-muted"> — с. {n.page}</span>}</span>
              <button onClick={() => delNote.mutate(n.id)} className="opacity-0 group-hover:opacity-100" aria-label="Удалить"><Trash2 className="size-3.5" /></button></li>))}</ul>
        </TabsContent>
      </Tabs>
      <EntityDialog open={editing} onOpenChange={setEditing} title="Изменить книгу" fields={FIELDS} endpoint="/books" initial={{ ...b, rating: b.rating ? String(b.rating) : "" } as unknown as Record<string, unknown> & { id: string }} invalidate={[["books"]]} />
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Удалить книгу?" onConfirm={() => remove.mutate()} loading={remove.isPending} />
    </Dialog>
  );
}
