"use client";
import { Dumbbell, Plus, Trash2, X } from "lucide-react";
import * as React from "react";
import { LinesChart } from "@/components/charts";
import { EntityList, type FieldDef } from "@/components/entity";
import { Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, Field, Input, PageHeader, QueryState, Select, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { useGet, useMut } from "@/hooks/use-api";
import { del, patch, post } from "@/lib/api";
import { cn, fmtDate, isoDate } from "@/lib/utils";

type Exercise = { id: string; name: string; muscle_group: string; kind: string; notes: string };
type SetT = { exercise_id: string; set_number: number; reps: number | null; weight_kg: number | null; duration_seconds: number | null; distance_km: number | null };
type Workout = { id: string; title: string; performed_on: string; duration_minutes: number; is_rest_day: boolean; notes: string; plan_id: string | null; sets: (SetT & { id: string })[] };
type Plan = { id: string; title: string; description: string; weekdays: number[] };
const EX_FIELDS: FieldDef[] = [
  { name: "name", label: "Название", required: true }, { name: "muscle_group", label: "Группа мышц" },
  { name: "kind", label: "Тип", type: "select", required: true, default: "strength", options: [{ value: "strength", label: "Силовое" }, { value: "cardio", label: "Кардио" }, { value: "mobility", label: "Мобильность" }, { value: "other", label: "Другое" }] },
  { name: "notes", label: "Заметки", type: "textarea" },
];

export default function FitnessPage() {
  const { locale } = useI18n();
  const workouts = useGet<Workout[]>(["fitness", "workouts"], "/health/workouts");
  const exercises = useGet<{ items: Exercise[] }>(["fitness", "exercises"], "/health/exercises?limit=500");
  const plans = useGet<{ items: Plan[] }>(["fitness", "plans"], "/health/plans");
  const [editing, setEditing] = React.useState<Workout | "new" | null>(null);
  const [progressEx, setProgressEx] = React.useState("");
  const prog = useGet<{ date: string; max_weight: number | null; total_reps: number | null }[]>(["fitness", "progress", progressEx], progressEx ? `/health/exercises/${progressEx}/progress` : null);
  const exName = new Map(exercises.data?.items.map((e) => [e.id, e.name]));
  const planFields: FieldDef[] = [{ name: "title", label: "Название", required: true, full: true }, { name: "description", label: "Описание / упражнения программы", type: "textarea" }];
  // training calendar: last 5 weeks
  const days = Array.from({ length: 35 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 34 + i); return isoDate(d); });
  const byDay = new Map(workouts.data?.map((w) => [w.performed_on, w]));
  return (
    <div>
      <PageHeader title="Фитнес" subtitle="Свои упражнения, программы, тренировки, подходы и прогресс" actions={<Button onClick={() => setEditing("new")}><Plus />Тренировка</Button>} />
      <Tabs defaultValue="workouts">
        <TabsList className="mb-4"><TabsTrigger value="workouts">Тренировки</TabsTrigger><TabsTrigger value="exercises">Упражнения</TabsTrigger><TabsTrigger value="plans">Программы</TabsTrigger><TabsTrigger value="progress">Прогресс</TabsTrigger></TabsList>
        <TabsContent value="workouts">
          <Card className="mb-4 p-3"><div className="mb-2 text-xs text-muted">Календарь тренировок (5 недель)</div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px]">{days.map((d) => { const w = byDay.get(d); return (
              <div key={d} title={d} className={cn("rounded py-1.5", w ? (w.is_rest_day ? "bg-surface-2 text-muted" : "bg-accent text-accent-fg") : "bg-surface-2/40 text-muted")}>{d.slice(8)}</div>); })}</div></Card>
          <QueryState q={workouts} empty={<EmptyState icon={<Dumbbell className="size-8" />} title="Тренировок пока нет" action={<Button size="sm" onClick={() => setEditing("new")}><Plus />Записать тренировку</Button>} />}>
            {(list) => (
              <Card className="divide-y divide-border">{list.map((w) => (
                <button key={w.id} onClick={() => setEditing(w)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
                  <span className="w-24 text-xs text-muted">{fmtDate(w.performed_on, locale, { day: "numeric", month: "short", year: "2-digit" })}</span>
                  <span className="flex-1 text-sm font-medium">{w.title}</span>
                  {w.is_rest_day ? <Badge>День отдыха</Badge> : <><span className="text-xs text-muted">{w.sets.length} подходов</span><span className="text-xs">{w.duration_minutes} мин</span></>}
                </button>))}</Card>
            )}
          </QueryState>
        </TabsContent>
        <TabsContent value="exercises">
          <EntityList<Exercise> endpoint="/health/exercises" queryKey={["fitness", "exercises"]} fields={EX_FIELDS} title="Мои упражнения" grid emptyTitle="Упражнений нет"
            render={(e) => <div className="pr-14"><div className="font-medium">{e.name}</div><div className="text-xs text-muted">{e.muscle_group || "—"} · {e.kind}</div></div>} />
        </TabsContent>
        <TabsContent value="plans">
          <EntityList<Plan> endpoint="/health/plans" queryKey={["fitness", "plans"]} fields={planFields} title="Программы тренировок" emptyTitle="Программ нет"
            render={(p) => <div className="pr-14"><div className="font-medium">{p.title}</div><div className="whitespace-pre-wrap text-xs text-muted">{p.description}</div></div>} />
        </TabsContent>
        <TabsContent value="progress">
          <Select className="mb-3 w-64" value={progressEx} onChange={(e) => setProgressEx(e.target.value)}><option value="">Выберите упражнение…</option>{exercises.data?.items.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select>
          {prog.data && (prog.data.length ? <Card className="p-4"><LinesChart data={prog.data.map((p) => ({ ...p, day: fmtDate(p.date, locale) }))} x="day" series={[{ key: "max_weight", label: "Макс. вес, кг" }, { key: "total_reps", label: "Повторений" }]} /></Card>
            : <EmptyState title="Нет данных по упражнению" />)}
        </TabsContent>
      </Tabs>
      {editing && <WorkoutDialog w={editing === "new" ? null : editing} exercises={exercises.data?.items ?? []} plans={plans.data?.items ?? []} exName={exName} onClose={() => setEditing(null)} />}
    </div>
  );
}

function WorkoutDialog({ w, exercises, plans, onClose }: { w: Workout | null; exercises: Exercise[]; plans: Plan[]; exName: Map<string, string>; onClose: () => void }) {
  const [f, setF] = React.useState({ title: w?.title ?? "Тренировка", performed_on: w?.performed_on ?? isoDate(), duration_minutes: String(w?.duration_minutes ?? 45), is_rest_day: w?.is_rest_day ?? false, notes: w?.notes ?? "", plan_id: w?.plan_id ?? "" });
  const [sets, setSets] = React.useState<SetT[]>(w?.sets.map(({ id: _id, ...s }) => s) ?? []);
  const [err, setErr] = React.useState("");
  const [confirm, setConfirm] = React.useState(false);
  const inv = { invalidate: [["fitness"], ["health"]] };
  const save = useMut((b: Record<string, unknown>) => (w ? patch(`/health/workouts/${w.id}`, b) : post("/health/workouts", b)), { ...inv, success: "Тренировка сохранена", onSuccess: onClose });
  const remove = useMut(() => del(`/health/workouts/${w!.id}`), { ...inv, success: "Удалено", onSuccess: onClose });
  const addSet = () => { const ex = exercises[0]?.id; if (!ex) return setErr("Сначала добавьте упражнения на вкладке «Упражнения»"); setSets((s) => [...s, { exercise_id: s.at(-1)?.exercise_id ?? ex, set_number: s.length + 1, reps: 10, weight_kg: null, duration_seconds: null, distance_km: null }]); };
  const num = (v: string) => (v === "" ? null : Number(v));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.title.trim()) return setErr("Введите название");
    save.mutate({ ...f, duration_minutes: Number(f.duration_minutes) || 0, plan_id: f.plan_id || null, sets: f.is_rest_day ? [] : sets });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={w ? "Тренировка" : "Новая тренировка"} wide>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Название" className="sm:col-span-2"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Дата"><Input type="date" value={f.performed_on} onChange={(e) => setF({ ...f, performed_on: e.target.value })} /></Field>
          <Field label="Минут"><Input type="number" min={0} value={f.duration_minutes} onChange={(e) => setF({ ...f, duration_minutes: e.target.value })} /></Field>
          <Field label="Программа" className="sm:col-span-2"><Select value={f.plan_id} onChange={(e) => setF({ ...f, plan_id: e.target.value })}><option value="">—</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select></Field>
          <div className="flex items-end sm:col-span-2"><Switch checked={f.is_rest_day} onCheckedChange={(v) => setF({ ...f, is_rest_day: v })} label="День отдыха" /></div>
        </div>
        {!f.is_rest_day && (
          <div>
            <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted">Подходы<Button type="button" size="sm" variant="ghost" onClick={addSet}><Plus />Подход</Button></div>
            <div className="space-y-1.5">{sets.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_60px_70px_80px_80px_28px] items-center gap-1.5">
                <Select className="h-8" value={s.exercise_id} onChange={(e) => setSets((x) => x.map((y, j) => j === i ? { ...y, exercise_id: e.target.value } : y))}>{exercises.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}</Select>
                <Input className="h-8" type="number" min={1} value={s.set_number} onChange={(e) => setSets((x) => x.map((y, j) => j === i ? { ...y, set_number: Number(e.target.value) || 1 } : y))} aria-label="№" />
                <Input className="h-8" type="number" min={0} placeholder="повт." value={s.reps ?? ""} onChange={(e) => setSets((x) => x.map((y, j) => j === i ? { ...y, reps: num(e.target.value) } : y))} />
                <Input className="h-8" type="number" min={0} step="0.5" placeholder="кг" value={s.weight_kg ?? ""} onChange={(e) => setSets((x) => x.map((y, j) => j === i ? { ...y, weight_kg: num(e.target.value) } : y))} />
                <Input className="h-8" type="number" min={0} placeholder="сек" value={s.duration_seconds ?? ""} onChange={(e) => setSets((x) => x.map((y, j) => j === i ? { ...y, duration_seconds: num(e.target.value) } : y))} />
                <button type="button" onClick={() => setSets((x) => x.filter((_, j) => j !== i))} aria-label="Удалить подход"><X className="size-4 text-muted" /></button>
              </div>))}</div>
          </div>
        )}
        <Field label="Заметки"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        {err && <p className="text-sm text-danger" role="alert">{err}</p>}
        <div className="flex justify-between">{w ? <Button type="button" variant="ghost" onClick={() => setConfirm(true)}><Trash2 />Удалить</Button> : <span />}<Button type="submit" loading={save.isPending}>Сохранить</Button></div>
      </form>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Удалить тренировку?" onConfirm={() => remove.mutate()} loading={remove.isPending} />
    </Dialog>
  );
}

