"use client";
import { Plus, Trash2, Trophy, Users } from "lucide-react";
import * as React from "react";
import { EntityDialog, type FieldDef } from "@/components/entity";
import { Badge, Button, Card, Dialog, EmptyState, PageHeader, Progress, QueryState } from "@/components/ui";
import { useI18n, useMe } from "@/components/providers";
import { useGet, useMut } from "@/hooks/use-api";
import { del } from "@/lib/api";
import { fmtDate, isoDate } from "@/lib/utils";

const METRIC: Record<string, string> = { tasks_done: "Выполнить задач", habit_checks: "Отметок привычек", focus_minutes: "Минут фокуса", learning_minutes: "Минут обучения", pages: "Прочитать страниц", workouts: "Тренировок" };
type Ch = { id: string; title: string; description: string; metric: string; target: number; start_date: string; end_date: string; group_id: string | null; xp_reward: number; value: number; completed_at: string | null; is_owner: boolean };

export default function ChallengesPage() {
  const { locale } = useI18n();
  const me = useMe();
  const q = useGet<Ch[]>(["challenges"], "/challenges");
  const groups = useGet<{ id: string; name: string }[]>(["social", "groups"], me.data?.settings.social_enabled ? "/social/groups" : null);
  const [open, setOpen] = React.useState(false);
  const [board, setBoard] = React.useState<string | null>(null);
  const lb = useGet<{ target: number; rows: { user_id: string; name: string; value: number }[] }>(["challenges", "lb", board], board ? `/challenges/${board}/leaderboard` : null);
  const remove = useMut((id: string) => del(`/challenges/${id}`), { invalidate: [["challenges"]] });
  const end = new Date(); end.setDate(end.getDate() + 29);
  const fields: FieldDef[] = [
    { name: "title", label: "Название", required: true, full: true },
    { name: "metric", label: "Что считаем", type: "select", required: true, default: "habit_checks", options: Object.entries(METRIC).map(([value, label]) => ({ value, label })) },
    { name: "target", label: "Цель", type: "number", required: true, min: 1, default: 30 },
    { name: "start_date", label: "Начало", type: "date", required: true, default: isoDate() }, { name: "end_date", label: "Окончание", type: "date", required: true, default: isoDate(end) },
    { name: "xp_reward", label: "Награда, XP", type: "number", min: 0, max: 1000, default: 100 },
    ...(groups.data?.length ? [{ name: "group_id", label: "Групповой (группа)", type: "select" as const, nullable: true, options: groups.data.map((g) => ({ value: g.id, label: g.name })) }] : []),
    { name: "description", label: "Описание", type: "textarea" },
  ];
  return (
    <div>
      <PageHeader title="Челленджи" subtitle="Прогресс считается автоматически по вашим реальным действиям за период" actions={<Button onClick={() => setOpen(true)}><Plus />Челлендж</Button>} />
      <QueryState q={q} empty={<EmptyState icon={<Trophy className="size-8" />} title="Челленджей нет" text="Например: «30 дней медитации» или «10 часов фокуса за месяц»." action={<Button size="sm" onClick={() => setOpen(true)}>Создать</Button>} />}>
        {(list) => (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{list.map((c) => (
            <Card key={c.id} className="group relative p-4">
              <div className="mb-1 flex items-start justify-between gap-2"><span className="font-medium">{c.title}</span>{c.completed_at ? <Badge tone="success">Выполнен</Badge> : new Date(c.end_date) < new Date() ? <Badge>Завершён</Badge> : <Badge tone="accent">Активен</Badge>}</div>
              <div className="mb-3 text-xs text-muted">{METRIC[c.metric]}: {c.target} · {fmtDate(c.start_date, locale)} — {fmtDate(c.end_date, locale)} · +{c.xp_reward} XP{c.group_id && " · групповой"}</div>
              <Progress value={(c.value / c.target) * 100} /><div className="mt-1 text-xs tabular-nums text-muted">{c.value} / {c.target}</div>
              <div className="mt-2 flex gap-2">{c.group_id && <Button size="sm" variant="outline" onClick={() => setBoard(c.id)}><Users />Рейтинг</Button>}
                {c.is_owner && <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={() => remove.mutate(c.id)}><Trash2 />Удалить</Button>}</div>
            </Card>))}</div>
        )}
      </QueryState>
      <EntityDialog open={open} onOpenChange={setOpen} title="Новый челлендж" fields={fields} endpoint="/challenges" invalidate={[["challenges"]]} />
      <Dialog open={!!board} onOpenChange={(o) => !o && setBoard(null)} title="Рейтинг участников">
        <ol className="space-y-1.5">{lb.data?.rows.map((r, i) => <li key={r.user_id} className="flex items-center gap-3 text-sm"><span className="w-5 text-muted">{i + 1}</span><span className="flex-1">{r.name}</span><span className="tabular-nums">{r.value} / {lb.data!.target}</span></li>)}</ol>
      </Dialog>
    </div>
  );
}
