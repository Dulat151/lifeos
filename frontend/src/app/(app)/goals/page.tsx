"use client";
import { Archive, Plus, Target } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { EntityDialog } from "@/components/entity";
import { GOAL_FIELDS } from "@/lib/fields";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Progress, QueryState, Select, Stat } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { useGet } from "@/hooks/use-api";
import { qs } from "@/lib/api";
import type { Goal } from "@/lib/types";
import { fmtDate, GOAL_CATEGORIES } from "@/lib/utils";


export default function GoalsPage() {
  const { locale } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [q, setQ] = React.useState("");
  const [creating, setCreating] = React.useState(params.get("new") === "1");
  const list = useGet<Goal[]>(["goals", status, category, q], `/goals${qs({ status, category, q })}`);
  const stats = useGet<{ total: number; active: number; completed: number; overdue: number; average_progress: number }>(["goals", "stats"], "/goals/stats");
  return (
    <div>
      <PageHeader title="Цели" subtitle="Прогресс считается по реальному выполнению этапов и задач"
        actions={<Button onClick={() => setCreating(true)}><Plus />Новая цель</Button>} />
      {stats.data && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Активные" value={stats.data.active} /><Stat label="Завершённые" value={stats.data.completed} />
          <Stat label="Просрочены" value={stats.data.overdue} /><Stat label="Средний прогресс" value={`${stats.data.average_progress}%`} />
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Поиск…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Активные и завершённые</option><option value="active">Активные</option><option value="completed">Завершённые</option><option value="archived">Архив</option>
        </Select>
        <Select className="w-44" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Все категории</option>{Object.entries(GOAL_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>
      <QueryState q={list} empty={<EmptyState icon={<Target className="size-8" />} title="Целей пока нет" text="Сформулируйте цель, разбейте её на этапы и задачи — прогресс посчитается автоматически." action={<Button size="sm" onClick={() => setCreating(true)}><Plus />Создать цель</Button>} />}>
        {(goals) => (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {goals.map((g) => (
              <Link key={g.id} href={`/goals/${g.id}`}>
                <Card className="h-full p-4 transition-colors hover:border-accent/50">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="font-medium leading-snug">{g.title}</h3>
                    {g.status === "completed" ? <Badge tone="success">Готово</Badge> : g.status === "archived" ? <Badge><Archive className="size-3" />Архив</Badge>
                      : g.priority === 1 ? <Badge tone="warning">Высокий</Badge> : null}
                  </div>
                  <div className="mb-3 flex flex-wrap gap-1.5 text-xs text-muted">
                    <Badge tone="accent">{GOAL_CATEGORIES[g.category] ?? g.category}</Badge>
                    {g.deadline && <span className={new Date(g.deadline) < new Date() && g.status === "active" ? "text-danger" : ""}>до {fmtDate(g.deadline, locale, { day: "numeric", month: "short", year: "numeric" })}</span>}
                  </div>
                  <div className="flex items-center gap-2"><Progress value={g.progress} /><span className="w-10 text-right text-xs tabular-nums text-muted">{g.progress}%</span></div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </QueryState>
      <EntityDialog open={creating} onOpenChange={(o) => { setCreating(o); if (!o && params.get("new")) router.replace("/goals"); }}
        title="Новая цель" fields={GOAL_FIELDS} endpoint="/goals" invalidate={[["goals"]]}
        onSaved={(r) => router.push(`/goals/${(r as Goal).id}`)} />
    </div>
  );
}
