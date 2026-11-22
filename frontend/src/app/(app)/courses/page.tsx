"use client";
import { Plus } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { EntityDialog } from "@/components/entity";
import { Badge, Button, Card, EmptyState, PageHeader, Progress, QueryState, Select } from "@/components/ui";
import { useGet } from "@/hooks/use-api";
import { courseFields } from "@/lib/fields";
import type { Course, Goal, Subject } from "@/lib/types";
import { fmtMinutes } from "@/lib/utils";

const ST: Record<string, string> = { planned: "Запланирован", active: "Активный", completed: "Завершён", paused: "На паузе" };

export default function CoursesPage() {
  const [status, setStatus] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const q = useGet<Course[]>(["learning", "courses", status], `/learning/courses${status ? `?status=${status}` : ""}`);
  const subjects = useGet<{ items: Subject[] }>(["learning", "subjects"], "/learning/subjects");
  const goals = useGet<Goal[]>(["goals", "active"], "/goals?status=active");
  const fields = courseFields(subjects.data?.items ?? [], goals.data ?? []);
  return (
    <div>
      <PageHeader title="Курсы" actions={<><Select className="w-40" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Все</option>{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Button onClick={() => setCreating(true)}><Plus />Курс</Button></>} />
      <QueryState q={q} empty={<EmptyState title="Курсов нет" text="Добавьте курс, разбейте его на уроки и отмечайте прогресс." action={<Button size="sm" onClick={() => setCreating(true)}><Plus />Добавить курс</Button>} />}>
        {(list) => (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{list.map((c) => (
            <Link key={c.id} href={`/courses/${c.id}`}><Card className="h-full p-4 hover:border-accent/50">
              <div className="mb-1 flex items-start justify-between gap-2"><span className="font-medium">{c.title}</span><Badge tone={c.status === "completed" ? "success" : c.status === "active" ? "accent" : "neutral"}>{ST[c.status]}</Badge></div>
              <div className="mb-3 text-xs text-muted">{subjects.data?.items.find((s) => s.id === c.subject_id)?.title ?? "Без предмета"}{c.provider && ` · ${c.provider}`}</div>
              <Progress value={c.progress} />
              <div className="mt-1.5 flex justify-between text-xs text-muted"><span>{c.lessons_done}/{c.lessons_total} уроков</span><span>{fmtMinutes(c.minutes_studied)}</span></div>
            </Card></Link>))}</div>
        )}
      </QueryState>
      <EntityDialog open={creating} onOpenChange={setCreating} title="Новый курс" fields={fields} endpoint="/learning/courses" invalidate={[["learning"]]} />
    </div>
  );
}
