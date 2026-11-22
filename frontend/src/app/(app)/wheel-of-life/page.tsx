"use client";
import { Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { WheelChart } from "@/components/charts";
import { Button, Card, CardBody, CardHeader, Dialog, EmptyState, Field, Input, PageHeader, QueryState, Select, Textarea } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { useGet, useMut } from "@/hooks/use-api";
import { del, post } from "@/lib/api";
import { fmtDate, isoDate } from "@/lib/utils";

const AREAS: Record<string, string> = { health: "Здоровье", career: "Карьера", finance: "Финансы", relationships: "Отношения", family: "Семья", growth: "Развитие", fun: "Отдых", environment: "Окружение" };
type Entry = { id: string; assessed_on: string; scores: Record<string, number>; note: string; average: number };

export default function WheelPage() {
  const { locale } = useI18n();
  const q = useGet<{ items: Entry[] }>(["wheel"], "/wheel-of-life");
  const [open, setOpen] = React.useState(false);
  const [cmp, setCmp] = React.useState("");
  const remove = useMut((id: string) => del(`/wheel-of-life/${id}`), { invalidate: [["wheel"]] });
  const list = q.data?.items ?? [];
  const latest = list[0];
  const prev = list.find((e) => e.id === cmp) ?? null;
  return (
    <div>
      <PageHeader title="Колесо баланса" subtitle="Оцените области жизни от 1 до 10 и сравнивайте с прошлыми оценками" actions={<Button onClick={() => setOpen(true)}><Plus />Новая оценка</Button>} />
      <QueryState q={{ ...q, data: q.data ? list : undefined }} empty={<EmptyState title="Оценок пока нет" action={<Button size="sm" onClick={() => setOpen(true)}>Оценить сейчас</Button>} />}>
        {() => (
          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <Card><CardHeader title={`Оценка от ${fmtDate(latest.assessed_on, locale, { day: "numeric", month: "long", year: "numeric" })} · среднее ${latest.average}`}
              action={<Select className="h-8 w-52" value={cmp} onChange={(e) => setCmp(e.target.value)}><option value="">Сравнить с…</option>{list.slice(1).map((e) => <option key={e.id} value={e.id}>{fmtDate(e.assessed_on, locale)} ({e.average})</option>)}</Select>} />
              <CardBody><WheelChart compare={!!prev} data={Object.keys({ ...AREAS, ...latest.scores }).filter((k) => latest.scores[k] !== undefined).map((k) => ({ area: AREAS[k] ?? k, value: latest.scores[k], prev: prev?.scores[k] }))} /></CardBody></Card>
            <Card><CardHeader title="История оценок" /><CardBody className="space-y-2">{list.map((e) => (
              <div key={e.id} className="group flex items-center gap-3 text-sm"><span className="w-28 text-muted">{fmtDate(e.assessed_on, locale)}</span><span className="flex-1">среднее <b>{e.average}</b></span>
                <button className="opacity-0 group-hover:opacity-100" onClick={() => remove.mutate(e.id)} aria-label="Удалить"><Trash2 className="size-4 text-muted" /></button></div>))}</CardBody></Card>
          </div>
        )}
      </QueryState>
      {open && <AssessDialog initial={latest?.scores} onClose={() => setOpen(false)} />}
    </div>
  );
}

function AssessDialog({ initial, onClose }: { initial?: Record<string, number>; onClose: () => void }) {
  const [scores, setScores] = React.useState<Record<string, number>>(() => Object.fromEntries(Object.keys(AREAS).map((k) => [k, initial?.[k] ?? 5])));
  const [date, setDate] = React.useState(isoDate());
  const [note, setNote] = React.useState("");
  const save = useMut(() => post("/wheel-of-life", { assessed_on: date, scores, note }), { invalidate: [["wheel"]], success: "Оценка сохранена", onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Оценка областей жизни" footer={<Button onClick={() => save.mutate()} loading={save.isPending}>Сохранить</Button>}>
      <div className="space-y-3">
        <Field label="Дата"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {Object.entries(AREAS).map(([k, l]) => (
          <div key={k} className="flex items-center gap-3 text-sm"><span className="w-28">{l}</span>
            <input type="range" min={1} max={10} value={scores[k]} onChange={(e) => setScores({ ...scores, [k]: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" aria-label={l} />
            <span className="w-6 text-right font-semibold tabular-nums">{scores[k]}</span></div>))}
        <Field label="Комментарий"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}
