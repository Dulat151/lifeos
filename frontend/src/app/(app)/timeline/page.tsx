"use client";
import { Award, Flag, Plus, Star, Target, Trash2 } from "lucide-react";
import * as React from "react";
import { EntityDialog, type FieldDef } from "@/components/entity";
import { Badge, Button, EmptyState, PageHeader, QueryState, Select } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { useGet, useMut } from "@/hooks/use-api";
import { del } from "@/lib/api";
import { isoDate } from "@/lib/utils";

type Item = { id: string; title: string; description: string; date: string; kind: string; source: string; editable: boolean };
const ICON: Record<string, React.ReactNode> = { goal: <Target className="size-3.5" />, milestone: <Flag className="size-3.5" />, achievement: <Award className="size-3.5" />, event: <Star className="size-3.5" /> };
const SRC: Record<string, string> = { manual: "Событие", goal: "Цель", milestone: "Этап", book: "Книга", achievement: "Достижение", bucket: "Мечта" };
const FIELDS: FieldDef[] = [
  { name: "title", label: "Событие", required: true, full: true }, { name: "occurred_on", label: "Дата", type: "date", required: true, default: isoDate() },
  { name: "kind", label: "Тип", type: "select", required: true, default: "event", options: [{ value: "event", label: "Событие" }, { value: "achievement", label: "Достижение" }, { value: "milestone", label: "Веха" }] },
  { name: "description", label: "Описание", type: "textarea" },
];

export default function TimelinePage() {
  const { locale } = useI18n();
  const q = useGet<Item[]>(["timeline"], "/timeline");
  const [open, setOpen] = React.useState(false);
  const [src, setSrc] = React.useState("");
  const remove = useMut((id: string) => del(`/timeline/events/${id}`), { invalidate: [["timeline"]] });
  const list = (q.data ?? []).filter((i) => !src || i.source === src);
  const byYear = new Map<string, Item[]>();
  for (const i of list) byYear.set(i.date.slice(0, 4), [...(byYear.get(i.date.slice(0, 4)) ?? []), i]);
  return (
    <div>
      <PageHeader title="Хронология жизни" subtitle="Важные события вручную + завершённые цели, этапы, книги и достижения автоматически"
        actions={<><Select className="w-40" value={src} onChange={(e) => setSrc(e.target.value)}><option value="">Всё</option>{Object.entries(SRC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Button onClick={() => setOpen(true)}><Plus />Событие</Button></>} />
      <QueryState q={{ ...q, data: q.data ? list : undefined }} empty={<EmptyState title="Хронология пуста" text="Добавьте важное событие или завершите цель — она появится здесь." />}>
        {() => (
          <div className="space-y-8">{[...byYear.entries()].map(([y, items]) => (
            <section key={y}><h2 className="mb-3 text-lg font-semibold">{y}</h2>
              <ol className="relative ml-2 border-l border-border pl-6">{items.map((i) => (
                <li key={i.source + i.id} className="group relative mb-5">
                  <span className="absolute -left-[33px] grid size-6 place-items-center rounded-full border border-border bg-surface text-accent">{ICON[i.kind] ?? ICON.event}</span>
                  <div className="text-xs text-muted">{new Date(i.date + "T12:00:00").toLocaleDateString(locale, { day: "numeric", month: "long" })} <Badge className="ml-1">{SRC[i.source] ?? i.source}</Badge></div>
                  <div className="font-medium">{i.title}</div>{i.description && <p className="text-sm text-muted">{i.description}</p>}
                  {i.editable && <button className="absolute right-0 top-0 opacity-0 group-hover:opacity-100" onClick={() => remove.mutate(i.id)} aria-label="Удалить"><Trash2 className="size-4 text-muted" /></button>}
                </li>))}</ol></section>))}</div>
        )}
      </QueryState>
      <EntityDialog open={open} onOpenChange={setOpen} title="Событие жизни" fields={FIELDS} endpoint="/timeline/events" invalidate={[["timeline"]]} />
    </div>
  );
}
