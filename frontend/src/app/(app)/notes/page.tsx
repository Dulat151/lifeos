"use client";
import { Folder, FolderPlus, Plus, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button, Card, EmptyState, Input, PageHeader, QueryState, Select } from "@/components/ui";
import { useGet, useMut } from "@/hooks/use-api";
import { post } from "@/lib/api";
import type { Note, Page } from "@/lib/types";
import { cn, fmtDate } from "@/lib/utils";

export default function NotesPage() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [folder, setFolder] = React.useState("");
  const [fav, setFav] = React.useState(false);
  const [archived, setArchived] = React.useState(false);
  const filters = [folder && `folder_id:${folder}`, fav && "is_favorite:true"].filter(Boolean).join(",");
  const notes = useGet<Page<Note>>(["notes", q, folder, fav, archived], `/notes?limit=500${q ? `&q=${encodeURIComponent(q)}` : ""}${filters ? `&filters=${filters}` : ""}${archived ? "&include_archived=true" : ""}`);
  const folders = useGet<Page<{ id: string; name: string; parent_id: string | null }>>(["notes", "folders"], "/folders");
  const [newFolder, setNewFolder] = React.useState("");
  const addFolder = useMut(() => post("/folders", { name: newFolder }), { invalidate: [["notes"]], onSuccess: () => setNewFolder("") });
  const create = useMut(() => post<Note>("/notes", { title: "Новая заметка", content: "", folder_id: folder || null }), { invalidate: [["notes"]], onSuccess: (n) => router.push(`/notes/${n.id}`) });
  const items = (notes.data?.items ?? []).filter((n) => archived ? n.archived : !n.archived);
  return (
    <div>
      <PageHeader title="Заметки" subtitle="Markdown, папки, теги и внутренние ссылки [[Название]]" actions={<>
        <Button variant="outline" asChild><Link href="/settings#import-notes">Импорт из Keep / Apple</Link></Button>
        <Button variant="outline" asChild><Link href="/knowledge-graph">Граф знаний</Link></Button>
        <Button onClick={() => create.mutate()} loading={create.isPending}><Plus />Заметка</Button></>} />
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <Card className="h-fit p-2">
          <button onClick={() => setFolder("")} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm", !folder && "bg-surface-2 font-medium")}><Folder className="size-4" />Все заметки</button>
          {folders.data?.items.map((f) => (
            <button key={f.id} onClick={() => setFolder(f.id)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm", folder === f.id && "bg-surface-2 font-medium", f.parent_id && "pl-6")}><Folder className="size-4" />{f.name}</button>
          ))}
          <form className="mt-2 flex gap-1" onSubmit={(e) => { e.preventDefault(); if (newFolder.trim()) addFolder.mutate(); }}>
            <Input className="h-8" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="Новая папка" /><Button size="icon-sm" variant="ghost" type="submit" aria-label="Создать папку"><FolderPlus /></Button>
          </form>
        </Card>
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Input className="max-w-xs" placeholder="Поиск по заголовку и тексту…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button size="sm" variant={fav ? "secondary" : "ghost"} onClick={() => setFav(!fav)}><Star />Избранное</Button>
            <Button size="sm" variant={archived ? "secondary" : "ghost"} onClick={() => setArchived(!archived)}>Архив</Button>
          </div>
          <QueryState q={{ ...notes, data: notes.data ? items : undefined }} empty={<EmptyState title="Заметок нет" action={<Button size="sm" onClick={() => create.mutate()}><Plus />Создать</Button>} />}>
            {(list) => (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{list.map((n) => (
                <Link key={n.id} href={`/notes/${n.id}`}><Card className="h-full p-4 hover:border-accent/50">
                  <div className="mb-1 flex items-start justify-between gap-2"><span className="font-medium">{n.title}</span>{n.is_favorite && <Star className="size-4 shrink-0 fill-warning text-warning" />}</div>
                  <p className="line-clamp-3 text-sm text-muted">{n.content.replace(/[#*`>\[\]]/g, "").slice(0, 200) || "Пусто"}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted">{n.tags.map((t) => <span key={t}>#{t}</span>)}<span className="ml-auto">{fmtDate(n.updated_at)}</span></div>
                </Card></Link>))}</div>
            )}
          </QueryState>
        </div>
      </div>
    </div>
  );
}
