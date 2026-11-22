"use client";
import { Pause, Play, Square, X, Zap } from "lucide-react";
import * as React from "react";
import { BarsChart } from "@/components/charts";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, PageHeader, Select, Stat, useToast } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { useGet, useMut } from "@/hooks/use-api";
import { post } from "@/lib/api";
import type { FocusSession, Page, Subject, Task } from "@/lib/types";
import { cn, fmtDate, fmtDateTime } from "@/lib/utils";

const KINDS: Record<string, [string, number]> = { pomodoro: ["Pomodoro", 25], deep_work: ["Deep Work", 90], study: ["Учёба", 45], work: ["Работа", 50], custom: ["Свой таймер", 30], break: ["Перерыв", 5] };
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function FocusPage() {
  const { locale } = useI18n();
  const toast = useToast();
  const active = useGet<FocusSession | null>(["focus", "active"], "/focus/active");
  const stats = useGet<{ today_minutes: number; week_minutes: number; month_minutes: number; total_hours: number; completed_sessions: number; daily: { date: string; minutes: number }[]; distractions_week: number }>(["focus", "stats"], "/focus/stats");
  const history = useGet<FocusSession[]>(["focus", "history"], "/focus/history?limit=30");
  const tasks = useGet<Page<Task>>(["tasks", "open-list"], "/tasks?status=todo,in_progress,backlog&limit=200");
  const subjects = useGet<Page<Subject>>(["learning", "subjects"], "/learning/subjects");
  const [kind, setKind] = React.useState("pomodoro");
  const [minutes, setMinutes] = React.useState(25);
  const [taskId, setTaskId] = React.useState("");
  const [subjectId, setSubjectId] = React.useState("");
  const [distraction, setDistraction] = React.useState("");
  const [now, setNow] = React.useState(Date.now());
  const s = active.data;
  const inv = { invalidate: [["focus"], ["tasks"], ["learning"]] };
  const start = useMut(() => post("/focus/start", { kind, planned_minutes: minutes, task_id: taskId || null, subject_id: subjectId || null }), inv);
  const act = useMut((a: "pause" | "resume" | "finish" | "cancel") => post(`/focus/${s!.id}/${a}`), { ...inv, onSuccess: (_, a) => a === "finish" && toast("Сессия сохранена") });
  const addDistraction = useMut(() => post("/focus/distractions", { description: distraction, session_id: s?.id ?? null }), { invalidate: [["focus"]], success: "Отвлечение записано", onSuccess: () => setDistraction("") });

  // Local clock tick + server autosave (heartbeat) every 30 s so progress survives a closed tab.
  React.useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  React.useEffect(() => {
    if (s?.status !== "running") return;
    const id = setInterval(() => post(`/focus/${s.id}/heartbeat`).catch(() => {}), 30_000);
    return () => clearInterval(id);
  }, [s?.id, s?.status]);
  const fetchedAt = React.useMemo(() => Date.now(), [active.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const elapsed = s ? s.elapsed_seconds + (s.status === "running" ? (now - fetchedAt) / 1000 : 0) : 0;
  const remaining = s ? s.planned_minutes * 60 - elapsed : minutes * 60;
  const notified = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (s && s.status === "running" && remaining <= 0 && notified.current !== s.id) {
      notified.current = s.id;
      toast("Время вышло! Завершите сессию или продолжайте.", "info");
      if ("Notification" in window && Notification.permission === "granted") new Notification("LIFE OS — фокус", { body: `${KINDS[s.kind]?.[0]}: время вышло` });
    }
  }, [remaining, s, toast]);
  const pct = s ? Math.min(100, (elapsed / (s.planned_minutes * 60)) * 100) : 0;
  return (
    <div>
      <PageHeader title="Фокус" subtitle="Pomodoro, Deep Work, учебные и рабочие сессии. Время автосохраняется на сервере." />
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="p-6">
          {!s ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">{Object.entries(KINDS).map(([k, [l, m]]) => (
                <Button key={k} size="sm" variant={kind === k ? "secondary" : "ghost"} onClick={() => { setKind(k); setMinutes(m); }}>{l}</Button>))}</div>
              <div className="py-6 text-center text-6xl font-semibold tabular-nums">{fmt(minutes * 60)}</div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Минут"><Input type="number" min={1} max={600} value={minutes} onChange={(e) => setMinutes(Math.max(1, Math.min(600, Number(e.target.value) || 1)))} /></Field>
                <Field label="Задача"><Select value={taskId} onChange={(e) => setTaskId(e.target.value)}><option value="">—</option>{tasks.data?.items.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</Select></Field>
                <Field label="Предмет"><Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">—</option>{subjects.data?.items.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select></Field>
              </div>
              <Button size="lg" className="w-full" onClick={() => start.mutate()} loading={start.isPending}><Play />Старт</Button>
            </div>
          ) : (
            <div className="text-center">
              <Badge tone={s.status === "running" ? "accent" : "warning"}>{KINDS[s.kind]?.[0]} · {s.status === "running" ? "идёт" : "пауза"}</Badge>
              <div className={cn("my-6 text-7xl font-semibold tabular-nums", remaining < 0 && "text-warning")}>{remaining >= 0 ? fmt(remaining) : `+${fmt(-remaining)}`}</div>
              <div className="mx-auto mb-6 h-2 max-w-md overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div>
              <p className="mb-4 text-sm text-muted">Сфокусировано: {fmt(elapsed)}</p>
              <div className="flex justify-center gap-2">
                {s.status === "running" ? <Button variant="secondary" onClick={() => act.mutate("pause")}><Pause />Пауза</Button> : <Button variant="secondary" onClick={() => act.mutate("resume")}><Play />Продолжить</Button>}
                <Button onClick={() => act.mutate("finish")}><Square />Завершить</Button>
                <Button variant="ghost" onClick={() => act.mutate("cancel")}><X />Отменить</Button>
              </div>
              <form className="mx-auto mt-6 flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); if (distraction.trim()) addDistraction.mutate(); }}>
                <Input value={distraction} onChange={(e) => setDistraction(e.target.value)} placeholder="Что отвлекло?" /><Button variant="outline" type="submit"><Zap />Записать</Button>
              </form>
            </div>
          )}
        </Card>
        <div className="space-y-4">
          {stats.data && <div className="grid grid-cols-2 gap-3">
            <Stat label="Сегодня" value={`${stats.data.today_minutes} мин`} /><Stat label="Неделя" value={`${stats.data.week_minutes} мин`} />
            <Stat label="Месяц" value={`${stats.data.month_minutes} мин`} /><Stat label="Всего" value={`${stats.data.total_hours} ч`} hint={`${stats.data.completed_sessions} сессий · отвлечений за неделю: ${stats.data.distractions_week}`} />
          </div>}
          {stats.data && <Card><CardHeader title="Фокус по дням" /><CardBody><BarsChart data={stats.data.daily.map((d) => ({ ...d, day: fmtDate(d.date, locale) }))} x="day" series={[{ key: "minutes", label: "Минут" }]} height={150} /></CardBody></Card>}
        </div>
      </div>
      <Card className="mt-4"><CardHeader title="История" /><div className="divide-y divide-border">{history.data?.map((h) => (
        <div key={h.id} className="flex items-center gap-3 px-4 py-2 text-sm"><span className="w-36 text-xs text-muted">{fmtDateTime(h.started_at, locale)}</span><span className="w-28">{KINDS[h.kind]?.[0]}</span>
          <span className="flex-1">{Math.round(h.focused_seconds / 60)} из {h.planned_minutes} мин</span><Badge tone={h.status === "completed" ? "success" : h.status === "cancelled" ? "neutral" : "accent"}>{h.status}</Badge></div>))}
        {history.data?.length === 0 && <p className="p-4 text-sm text-muted">Сессий пока не было</p>}</div></Card>
    </div>
  );
}
