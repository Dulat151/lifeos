"use client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, PageHeader, Progress, QueryState, Stat } from "@/components/ui";
import { useGet } from "@/hooks/use-api";
import type { Course, Subject } from "@/lib/types";
import { fmtMinutes } from "@/lib/utils";

export default function SubjectDetail() {
  const { id } = useParams<{ id: string }>();
  const q = useGet<{ subject: Subject; courses: Course[]; minutes_total: number }>(["learning", "subject", id], `/learning/subjects/${id}/detail`);
  return (
    <QueryState q={q}>{(d) => (
      <div>
        <Link href="/learning" className="mb-3 inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft className="size-4" />Обучение</Link>
        <PageHeader title={d.subject.title} subtitle={d.subject.description || d.subject.area} />
        <div className="mb-5 grid grid-cols-3 gap-3">
          <Stat label="Курсов" value={d.courses.length} /><Stat label="Учебное время" value={fmtMinutes(d.minutes_total)} />
          <Stat label="Средний прогресс" value={`${d.courses.length ? Math.round(d.courses.reduce((a, c) => a + c.progress, 0) / d.courses.length) : 0}%`} />
        </div>
        <h2 className="mb-2 text-sm font-semibold">Учебный путь</h2>
        <div className="space-y-2">{d.courses.length === 0 && <p className="text-sm text-muted">Добавьте курсы этому предмету на странице «Курсы».</p>}
          {d.courses.map((c, i) => (
            <Link key={c.id} href={`/courses/${c.id}`}><Card className="flex items-center gap-4 p-3 hover:border-accent/50">
              <span className="grid size-7 place-items-center rounded-full bg-surface-2 text-xs">{i + 1}</span>
              <div className="flex-1"><div className="text-sm font-medium">{c.title}</div><Progress value={c.progress} className="mt-1.5" /></div>
              <span className="text-xs text-muted">{c.progress}%</span></Card></Link>))}</div>
      </div>
    )}</QueryState>
  );
}
