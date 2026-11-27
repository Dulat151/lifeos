"use client";
import { Archive, Plus, Target } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { EntityDialog } from "@/components/entity";
import { GOAL_FIELDS } from "@/lib/fields";
import { Badge, Button, Card, EmptyState, Input, PageHeader, ProgressRing, QueryState, Select, Stat } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { useGet } from "@/hooks/use-api";
import { qs } from "@/lib/api";
import type { Goal } from "@/lib/types";
import { cn, fmtDate, GOAL_CATEGORIES, GOAL_CATEGORY_COLOR } from "@/lib/utils";


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
      <PageHeader icon={<Target />} title="Цели" subtitle="Долгосрочные миссии: прогресс считается по реальным этапам и задачам"
        actions={<Button onClick={() => setCreating(true)}><Plus />Новая цель</Button>} />
      {stats.data && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Активные" value={stats.data.active} /><Stat label="Завершённые" value={stats.data.completed} />
          <Stat label="Просрочены" value={stats.data.overdue} /><Stat label="Средний прогресс" value={`${stats.data.average_progress}%`} />
        </div>
      )}
      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {[["", "Все сферы"], ...Object.entries(GOAL_CATEGORIES).slice(0, 7)].map(([k, v]) => (
          <button key={k} onClick={() => setCategory(k)} className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            category === k ? "border-accent bg-accent-soft text-text" : "border-border text-muted hover:text-text")}>
            {k && <span className="size-2 rounded-full" style={{ background: GOAL_CATEGORY_COLOR[k] }} />}{v}</button>))}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Поиск…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Активные и завершённые</option><option value="active">Активные</option><option value="completed">Завершённые</option><option value="archived">Архив</option>
        </Select>
      </div>
      <QueryState q={list} empty={<EmptyState icon={<Target className="size-8" />} title="Целей пока нет" text="Сформулируйте цель, разбейте её на этапы и задачи — прогресс посчитается автоматически." action={<Button size="sm" onClick={() => setCreating(true)}><Plus />Создать цель</Button>} />}>
        {(goals) => (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {goals.map((g) => (
              <Link key={g.id} href={`/goals/${g.id}`} className="block">
                <Card interactive className="relative h-full overflow-hidden p-4">
                  <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: GOAL_CATEGORY_COLOR[g.category] ?? "var(--accent)" }} />
                  <div className="flex items-start gap-3.5">
                    <ProgressRing value={g.progress} size={52} stroke={5} color={GOAL_CATEGORY_COLOR[g.category]} label="Прогресс"><span className="text-xs font-semibold">{Math.round(g.progress)}%</span></ProgressRing>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium leading-snug">{g.title}</h3>
                        {g.status === "completed" ? <Badge tone="success">Достигнута</Badge> : g.status === "archived" ? <Badge><Archive />Архив</Badge>
                          : g.priority === 1 ? <Badge tone="warning">Важная</Badge> : null}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <span>{GOAL_CATEGORIES[g.category] ?? g.category}</span>
                        {g.deadline && <span className={new Date(g.deadline) < new Date() && g.status === "active" ? "text-danger" : ""}>· до {fmtDate(g.deadline, locale, { day: "numeric", month: "short", year: "numeric" })}</span>}
                      </div>
                    </div>
                  </div>
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
