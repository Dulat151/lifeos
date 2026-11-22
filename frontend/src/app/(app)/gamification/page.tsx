"use client";
import { Flame, Star, Trophy } from "lucide-react";
import Link from "next/link";
import { Badge, Button, Card, CardBody, CardHeader, PageHeader, Progress, QueryState, Stat } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { useGet } from "@/hooks/use-api";
import { fmtDateTime } from "@/lib/utils";

type Summary = { xp: number; level: number; level_xp_start: number; level_xp_next: number; enabled: boolean; rules: Record<string, number>; streak: number; records: Record<string, number> };
const REASONS: Record<string, string> = { task_done: "Задача выполнена", habit_check: "Привычка отмечена", goal_completed: "Цель достигнута", milestone_completed: "Этап завершён",
  focus_session: "Фокус-сессия", learning_session: "Учебная сессия", flashcard_review: "Повторение карточек", journal_entry: "Запись в дневнике", book_completed: "Книга прочитана",
  workout: "Тренировка", achievement: "Достижение", challenge: "Челлендж", correction: "Корректировка" };
const RECORDS: Record<string, string> = { tasks_done: "Задач выполнено", habit_checks: "Отметок привычек", focus_minutes: "Минут фокуса", learning_minutes: "Минут обучения", books_completed: "Книг прочитано" };

export default function GamificationPage() {
  const { locale } = useI18n();
  const s = useGet<Summary>(["gamification", "summary"], "/gamification/summary");
  const h = useGet<{ id: string; amount: number; reason: string; at: string }[]>(["gamification", "history"], "/gamification/xp-history?limit=100");
  return (
    <div>
      <PageHeader title="Геймификация" subtitle="XP начисляется только за реальные действия и только один раз" actions={<><Button variant="outline" asChild><Link href="/achievements"><Trophy />Достижения</Link></Button><Button variant="outline" asChild><Link href="/challenges">Челленджи</Link></Button></>} />
      <QueryState q={s}>{(d) => (
        <>
          {!d.enabled && <Card className="mb-4 p-3 text-sm text-warning">Геймификация выключена в настройках — новые XP не начисляются.</Card>}
          <Card className="mb-4 p-5">
            <div className="flex flex-wrap items-center gap-6">
              <div className="grid size-20 place-items-center rounded-full bg-accent-soft text-3xl font-bold text-accent">{d.level}</div>
              <div className="min-w-64 flex-1">
                <div className="mb-1 flex justify-between text-sm"><span>Уровень {d.level}</span><span className="tabular-nums">{d.xp} / {d.level_xp_next} XP</span></div>
                <Progress className="h-2" value={((d.xp - d.level_xp_start) / Math.max(1, d.level_xp_next - d.level_xp_start)) * 100} />
                <p className="mt-1 text-xs text-muted">До уровня {d.level + 1}: {d.level_xp_next - d.xp} XP. Формула: XP(L) = 50·(L−1)·L</p>
              </div>
              <div className="flex items-center gap-2 text-2xl font-semibold"><Flame className="size-6 text-warning" />{d.streak}<span className="text-sm font-normal text-muted">дней подряд</span></div>
            </div>
          </Card>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">{Object.entries(d.records).map(([k, v]) => <Stat key={k} label={RECORDS[k]} value={v} icon={<Star className="size-4" />} />)}</div>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr]">
            <Card><CardHeader title="Правила начисления" /><CardBody><ul className="space-y-1 text-sm">{Object.entries(d.rules).map(([k, v]) => <li key={k} className="flex justify-between"><span>{REASONS[k] ?? k}</span><Badge tone="accent">+{v} XP</Badge></li>)}</ul></CardBody></Card>
            <Card><CardHeader title="История XP" /><CardBody>{h.data?.length ? <ul className="max-h-96 space-y-1 overflow-y-auto text-sm">{h.data.map((x) => (
              <li key={x.id} className="flex items-center gap-3"><span className="w-32 text-xs text-muted">{fmtDateTime(x.at, locale)}</span><span className="flex-1">{REASONS[x.reason] ?? x.reason}</span>
                <span className={x.amount > 0 ? "font-medium text-success" : "font-medium text-danger"}>{x.amount > 0 ? "+" : ""}{x.amount}</span></li>))}</ul>
              : <p className="text-sm text-muted">Выполните задачу или отметьте привычку, чтобы получить первые XP</p>}</CardBody></Card>
          </div>
        </>
      )}</QueryState>
    </div>
  );
}
