"use client";
import { ExternalLink, Pencil, Plus, Target, Trash2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { EntityDialog, type FieldDef } from "@/components/entity";
import { Button, Card, ConfirmDialog, EmptyState, PageHeader, QueryState, Select } from "@/components/ui";
import { useGet, useMut } from "@/hooks/use-api";
import { del } from "@/lib/api";
import type { Goal } from "@/lib/types";

type Board = { id: string; title: string; description: string };
type Item = { id: string; board_id: string; kind: string; content: string; image_url: string | null; url: string | null; goal_id: string | null; group_label: string; position: number };

export default function VisionPage() {
  const boards = useGet<{ items: Board[] }>(["vision", "boards"], "/vision-boards");
  const goals = useGet<Goal[]>(["goals", "all"], "/goals");
  const [boardId, setBoardId] = React.useState("");
  const board = boards.data?.items.find((b) => b.id === boardId) ?? boards.data?.items[0];
  const items = useGet<{ items: Item[] }>(["vision", "items", board?.id], board ? `/vision-items?limit=500&filters=board_id:${board.id}` : null);
  const [newBoard, setNewBoard] = React.useState(false);
  const [editBoard, setEditBoard] = React.useState(false);
  const [item, setItem] = React.useState<Item | "new" | null>(null);
  const [confirm, setConfirm] = React.useState(false);
  const removeItem = useMut((id: string) => del(`/vision-items/${id}`), { invalidate: [["vision"]] });
  const removeBoard = useMut(() => del(`/vision-boards/${board!.id}`), { invalidate: [["vision"]], onSuccess: () => { setBoardId(""); setConfirm(false); } });
  const boardFields: FieldDef[] = [{ name: "title", label: "Название", required: true, full: true }, { name: "description", label: "Описание", type: "textarea" }];
  const itemFields: FieldDef[] = [
    { name: "kind", label: "Тип", type: "select", required: true, default: "text", options: [{ value: "text", label: "Текст" }, { value: "image", label: "Изображение" }, { value: "link", label: "Ссылка" }, { value: "goal", label: "Цель" }] },
    { name: "group_label", label: "Группа", placeholder: "Карьера, Дом…" }, { name: "content", label: "Текст / подпись", type: "textarea" },
    { name: "image_url", label: "URL изображения", type: "url", nullable: true }, { name: "url", label: "Ссылка", type: "url", nullable: true },
    { name: "goal_id", label: "Цель", type: "select", nullable: true, options: goals.data?.map((g) => ({ value: g.id, label: g.title })) ?? [] },
    { name: "position", label: "Порядок", type: "number", default: 0 },
  ];
  const groups = new Map<string, Item[]>();
  for (const it of items.data?.items ?? []) groups.set(it.group_label || "Без группы", [...(groups.get(it.group_label || "Без группы") ?? []), it]);
  const goalById = new Map(goals.data?.map((g) => [g.id, g]));
  return (
    <div>
      <PageHeader title="Доска визуализации" actions={<>
        {boards.data && boards.data.items.length > 0 && <Select className="w-48" value={board?.id ?? ""} onChange={(e) => setBoardId(e.target.value)}>{boards.data.items.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</Select>}
        {board && <><Button size="icon" variant="ghost" onClick={() => setEditBoard(true)} aria-label="Изменить доску"><Pencil /></Button><Button size="icon" variant="ghost" onClick={() => setConfirm(true)} aria-label="Удалить доску"><Trash2 /></Button>
          <Button variant="outline" onClick={() => setItem("new")}><Plus />Элемент</Button></>}
        <Button onClick={() => setNewBoard(true)}><Plus />Доска</Button></>} />
      <QueryState q={{ ...boards, data: boards.data?.items }} empty={<EmptyState title="Досок нет" text="Создайте доску и добавьте изображения, цитаты, цели и ссылки." action={<Button size="sm" onClick={() => setNewBoard(true)}>Создать доску</Button>} />}>
        {() => (
          <div>
            {board?.description && <p className="mb-4 text-sm text-muted">{board.description}</p>}
            {groups.size === 0 && <EmptyState title="Доска пуста" action={<Button size="sm" onClick={() => setItem("new")}><Plus />Добавить элемент</Button>} />}
            {[...groups.entries()].map(([g, list]) => (
              <section key={g} className="mb-6">
                <h2 className="mb-2 text-sm font-semibold text-muted">{g}</h2>
                <div className="columns-1 gap-3 sm:columns-2 lg:columns-3">{list.map((it) => (
                  <Card key={it.id} className="group relative mb-3 break-inside-avoid overflow-hidden">
                    {it.image_url && <img src={it.image_url} alt={it.content || ""} className="w-full object-cover" referrerPolicy="no-referrer" />}
                    <div className="p-3">
                      {it.content && <p className="whitespace-pre-wrap text-sm">{it.content}</p>}
                      {it.goal_id && goalById.get(it.goal_id) && <Link href={`/goals/${it.goal_id}`} className="mt-1 flex items-center gap-1 text-sm text-accent"><Target className="size-4" />{goalById.get(it.goal_id)!.title} · {goalById.get(it.goal_id)!.progress}%</Link>}
                      {it.url && <a href={it.url} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 truncate text-xs text-accent"><ExternalLink className="size-3" />{it.url}</a>}
                    </div>
                    <div className="absolute right-2 top-2 flex gap-1 rounded-md bg-surface/90 opacity-0 group-hover:opacity-100">
                      <Button size="icon-sm" variant="ghost" onClick={() => setItem(it)} aria-label="Изменить"><Pencil /></Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => removeItem.mutate(it.id)} aria-label="Удалить"><Trash2 /></Button>
                    </div>
                  </Card>))}</div>
              </section>))}
          </div>
        )}
      </QueryState>
      <EntityDialog open={newBoard} onOpenChange={setNewBoard} title="Новая доска" fields={boardFields} endpoint="/vision-boards" invalidate={[["vision"]]} onSaved={(r) => setBoardId((r as Board).id)} />
      {board && <EntityDialog open={editBoard} onOpenChange={setEditBoard} title="Доска" fields={boardFields} endpoint="/vision-boards" initial={board as unknown as Record<string, unknown> & { id: string }} invalidate={[["vision"]]} />}
      {item && board && <EntityDialog open onOpenChange={(o) => !o && setItem(null)} title="Элемент доски" fields={itemFields} endpoint="/vision-items" extra={{ board_id: board.id }}
        initial={item === "new" ? undefined : (item as unknown as Record<string, unknown> & { id: string })} invalidate={[["vision"]]} />}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Удалить доску?" text="Все элементы доски будут удалены." onConfirm={() => removeBoard.mutate()} loading={removeBoard.isPending} />
    </div>
  );
}
