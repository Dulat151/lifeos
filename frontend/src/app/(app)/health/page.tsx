"use client";
import { Plus } from "lucide-react";
import * as React from "react";
import { LinesChart } from "@/components/charts";
import { EntityDialog, EntityList, type FieldDef } from "@/components/entity";
import { Badge, Button, Card, CardBody, CardHeader, PageHeader, QueryState, Select, Stat } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { useGet } from "@/hooks/use-api";
import { fmtDate, isoDate } from "@/lib/utils";

const KINDS: Record<string, { label: string; unit: string; max: number; step?: number }> = {
  sleep: { label: "Сон", unit: "ч", max: 24, step: 0.25 }, water: { label: "Вода", unit: "мл", max: 20000 }, walking: { label: "Шаги", unit: "шагов", max: 200000 },
  energy: { label: "Энергия", unit: "/10", max: 10 }, mood: { label: "Настроение", unit: "/10", max: 10 }, weight: { label: "Вес", unit: "кг", max: 500, step: 0.1 },
};
type Summary = { metrics: Record<string, { points: { date: string; value: number }[]; average: number | null }>; workouts: number; rest_days: number; workout_minutes: number };
type Log = { id: string; kind: string; log_date: string; value: number; note: string };

export default function HealthPage() {
  const { locale } = useI18n();
  const [days, setDays] = React.useState("30");
  const [kind, setKind] = React.useState<string | null>(null);
  const s = useGet<Summary>(["health", "summary", days], `/health/summary?days=${days}`);
  const fields = (k: string): FieldDef[] => [
    { name: "kind", label: "Показатель", type: "select", required: true, default: k, options: Object.entries(KINDS).map(([value, v]) => ({ value, label: v.label })) },
    { name: "log_date", label: "Дата", type: "date", required: true, default: isoDate() },
    { name: "value", label: `Значение (${KINDS[k].unit})`, type: "number", required: true, min: 0, max: KINDS[k].max, step: KINDS[k].step ?? 1 },
    { name: "note", label: "Заметка", type: "textarea" },
  ];
  return (
    <div>
      <PageHeader title="Здоровье" subtitle="Сон, вода, шаги, энергия, настроение. Это дневник, а не медицинская оценка."
        actions={<><Select className="w-36" value={days} onChange={(e) => setDays(e.target.value)}><option value="7">7 дней</option><option value="30">30 дней</option><option value="90">90 дней</option></Select>
          {Object.entries(KINDS).map(([k, v]) => <Button key={k} size="sm" variant="outline" onClick={() => setKind(k)}><Plus />{v.label}</Button>)}</>} />
      <QueryState q={s}>{(d) => (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            {Object.entries(KINDS).map(([k, v]) => <Stat key={k} label={`${v.label}, среднее`} value={d.metrics[k]?.average ?? "—"} hint={v.unit} />)}
            <Stat label="Тренировок" value={d.workouts} hint={`${d.workout_minutes} мин · отдых ${d.rest_days}`} />
          </div>
          <div className="mb-5 grid gap-4 md:grid-cols-2">
            {Object.entries(KINDS).filter(([k]) => d.metrics[k]?.points.length).map(([k, v]) => (
              <Card key={k}><CardHeader title={v.label} action={<Badge>{v.unit}</Badge>} /><CardBody>
                <LinesChart data={d.metrics[k].points.map((p) => ({ ...p, day: fmtDate(p.date, locale) }))} x="day" series={[{ key: "value", label: v.label }]} height={160} area /></CardBody></Card>
            ))}
          </div>
        </>
      )}</QueryState>
      <EntityList<Log> endpoint="/health/logs" queryKey={["health", "logs"]} fields={fields("sleep")} title="Журнал" emptyTitle="Записей нет" emptyText="Добавьте первую запись: сколько вы спали сегодня?"
        render={(l) => <div className="flex items-center gap-3 pr-14 text-sm"><span className="w-24 text-xs text-muted">{fmtDate(l.log_date, locale)}</span><Badge>{KINDS[l.kind]?.label}</Badge><span className="font-medium">{l.value} {KINDS[l.kind]?.unit}</span><span className="truncate text-muted">{l.note}</span></div>} />
      {kind && <EntityDialog open onOpenChange={(o) => !o && setKind(null)} title={KINDS[kind].label} fields={fields(kind)} endpoint="/health/logs" invalidate={[["health"]]} />}
    </div>
  );
}
