"use client";
import * as React from "react";
import { EntityList, type FieldDef } from "@/components/entity";
import { Badge, PageHeader, Select, Stat } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { useGet } from "@/hooks/use-api";
import { fmtDate } from "@/lib/utils";

const KIND: Record<string, string> = { wish: "Желание", experience: "Опыт", dream: "Мечта", goal: "Цель" };
const STATUS: Record<string, string> = { idea: "Идея", planned: "Запланировано", in_progress: "В процессе", done: "Сбылось" };
const FIELDS: FieldDef[] = [
  { name: "title", label: "Что хочу", required: true, full: true },
  { name: "kind", label: "Тип", type: "select", required: true, default: "dream", options: Object.entries(KIND).map(([value, label]) => ({ value, label })) },
  { name: "status", label: "Статус", type: "select", required: true, default: "idea", options: Object.entries(STATUS).map(([value, label]) => ({ value, label })) },
  { name: "category", label: "Категория", placeholder: "путешествия, навыки…" }, { name: "target_date", label: "Хочу к дате", type: "date", nullable: true },
  { name: "done_on", label: "Дата исполнения", type: "date", nullable: true }, { name: "description", label: "Описание", type: "textarea" },
];
type Item = { id: string; title: string; description: string; kind: string; category: string; status: string; target_date: string | null; done_on: string | null };

export default function BucketPage() {
  const { locale } = useI18n();
  const [status, setStatus] = React.useState("");
  const all = useGet<{ items: Item[] }>(["bucket", "all"], "/bucket-list?limit=500");
  const done = all.data?.items.filter((i) => i.status === "done").length ?? 0;
  return (
    <div>
      <PageHeader title="Список желаний" subtitle="Мечты, впечатления и желания. Исполненные попадают в хронологию жизни."
        actions={<Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Все</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>} />
      <div className="mb-4 grid grid-cols-3 gap-3"><Stat label="Всего" value={all.data?.items.length ?? "—"} /><Stat label="Сбылось" value={done} /><Stat label="В процессе" value={all.data?.items.filter((i) => i.status === "in_progress").length ?? "—"} /></div>
      <EntityList<Item> endpoint="/bucket-list" listPath={`/bucket-list?limit=500${status ? `&filters=status:${status}` : ""}`} queryKey={["bucket", status]} fields={FIELDS} title="Мой список" grid
        emptyTitle="Список пуст" emptyText="Запишите то, что хотите испытать в жизни." render={(i) => (
          <div className="pr-14">
            <div className={i.status === "done" ? "font-medium text-muted line-through" : "font-medium"}>{i.title}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs"><Badge tone="accent">{KIND[i.kind]}</Badge><Badge tone={i.status === "done" ? "success" : "neutral"}>{STATUS[i.status]}</Badge>
              {i.category && <Badge>{i.category}</Badge>}{i.target_date && <span className="text-muted">к {fmtDate(i.target_date, locale)}</span>}</div>
            {i.description && <p className="mt-1.5 line-clamp-2 text-xs text-muted">{i.description}</p>}
          </div>)} />
    </div>
  );
}
