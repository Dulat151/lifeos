"use client";
import { ArrowLeft, Check, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { EntityDialog, type FieldDef } from "@/components/entity";
import { FileList } from "@/components/files";
import { Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, Input, PageHeader, Progress, QueryState, Stat } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { useGet, useMut } from "@/hooks/use-api";
import { del, post } from "@/lib/api";
import { courseFields } from "@/lib/fields";
import type { Course, Goal, Lesson, Subject } from "@/lib/types";
import { cn, fmtDateTime, fmtMinutes } from "@/lib/utils";

type Detail = { course: Course; lessons: Lesson[]; resources: { id: string; kind: string; title: string; url: string | null }[]; sessions: { id: string; started_at: string; duration_minutes: number; notes: string }[] };
const RES_FIELDS: FieldDef[] = [
  { name: "title", label: "Название", required: true }, { name: "kind", label: "Тип", type: "select", required: true, default: "link", options: [{ value: "link", label: "Ссылка" }, { value: "video", label: "Видео" }, { value: "pdf", label: "PDF" }, { value: "text", label: "Текст" }] },
  { name: "url", label: "URL", type: "url", nullable: true, full: true },
];

export default function CourseDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { locale } = useI18n();
  const q = useGet<Detail>(["learning", "course", id], `/learning/courses/${id}/detail`);
  const subjects = useGet<{ items: Subject[] }>(["learning", "subjects"], "/learning/subjects");
  const goals = useGet<Goal[]>(["goals", "active"], "/goals?status=active");
  const [lesson, setLesson] = React.useState("");
  const [editing, setEditing] = React.useState(false);
  const [addRes, setAddRes] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const inv = { invalidate: [["learning"]] };
  const addLesson = useMut(() => post("/learning/lessons", { course_id: id, title: lesson, position: q.data?.lessons.length ?? 0 }), { ...inv, onSuccess: () => setLesson("") });
  const toggle = useMut((lid: string) => post(`/learning/lessons/${lid}/toggle`), inv);
  const delLesson = useMut((lid: string) => del(`/learning/lessons/${lid}`), inv);
  const delRes = useMut((rid: string) => del(`/learning/resources/${rid}`), inv);
  const logStudy = useMut((mins: number) => post("/learning/sessions", { course_id: id, started_at: new Date(Date.now() - mins * 60000).toISOString(), duration_minutes: mins }), { ...inv, success: "Сессия записана" });
  const remove = useMut(() => del(`/learning/courses/${id}`), { ...inv, success: "Курс удалён", onSuccess: () => router.replace("/courses") });
  return (
    <QueryState q={q}>{(d) => (
      <div>
        <Link href="/courses" className="mb-3 inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft className="size-4" />Курсы</Link>
        <PageHeader title={d.course.title} subtitle={d.course.description} actions={<>
          {d.course.url && <Button variant="outline" size="sm" asChild><a href={d.course.url} target="_blank" rel="noopener noreferrer"><ExternalLink />Открыть</a></Button>}
          <Button variant="ghost" size="icon" onClick={() => setEditing(true)} aria-label="Изменить"><Pencil /></Button>
          <Button variant="ghost" size="icon" onClick={() => setConfirm(true)} aria-label="Удалить"><Trash2 /></Button></>} />
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Прогресс" value={`${d.course.progress}%`} /><Stat label="Уроки" value={`${d.course.lessons_done}/${d.course.lessons_total}`} />
          <Stat label="Время" value={fmtMinutes(d.course.minutes_studied)} /><Stat label="План" value={d.course.weekly_minutes_goal ? `${d.course.weekly_minutes_goal} мин/нед` : "—"} />
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card><CardHeader title="Уроки" /><CardBody>
            <Progress value={d.course.progress} className="mb-3" />
            <ul className="space-y-1">{d.lessons.map((l) => (
              <li key={l.id} className="group flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-surface-2">
                <button onClick={() => toggle.mutate(l.id)} aria-label="Отметить урок" className={cn("grid size-5 place-items-center rounded-full border", l.completed_at ? "border-success bg-success text-white" : "border-border")}>{l.completed_at && <Check className="size-3" />}</button>
                <span className={cn("flex-1 text-sm", l.completed_at && "text-muted line-through")}>{l.title}</span>
                <Button size="icon-sm" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={() => delLesson.mutate(l.id)} aria-label="Удалить"><Trash2 /></Button>
              </li>))}</ul>
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (lesson.trim()) addLesson.mutate(); }}>
              <Input value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="Новый урок…" /><Button type="submit" variant="secondary"><Plus /></Button></form>
          </CardBody></Card>
          <div className="space-y-4">
            <Card><CardHeader title="Учебная сессия" /><CardBody className="flex flex-wrap gap-2">
              {[15, 30, 45, 60, 90].map((m) => <Button key={m} size="sm" variant="outline" onClick={() => logStudy.mutate(m)}>+{m} мин</Button>)}
              <Button size="sm" asChild><Link href="/focus">Таймер</Link></Button></CardBody></Card>
            <Card><CardHeader title="Материалы" action={<Button size="sm" variant="ghost" onClick={() => setAddRes(true)}><Plus /></Button>} /><CardBody>
              {d.resources.length === 0 && <p className="text-sm text-muted">Ссылки, видео, PDF</p>}
              <ul className="space-y-1">{d.resources.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-sm"><Badge>{r.kind}</Badge>
                  {r.url ? <a className="flex-1 truncate text-accent" href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a> : <span className="flex-1">{r.title}</span>}
                  <Button size="icon-sm" variant="ghost" onClick={() => delRes.mutate(r.id)} aria-label="Удалить"><Trash2 /></Button></li>))}</ul></CardBody></Card>
            <FileList entityType="course" entityId={id} />
            <Card><CardHeader title="История занятий" /><CardBody>{d.sessions.length ? d.sessions.map((s) => (
              <div key={s.id} className="flex justify-between text-sm"><span className="text-muted">{fmtDateTime(s.started_at, locale)}</span><span>{s.duration_minutes} мин</span></div>)) : <p className="text-sm text-muted">Пока нет</p>}</CardBody></Card>
          </div>
        </div>
        <EntityDialog open={editing} onOpenChange={setEditing} title="Изменить курс" fields={courseFields(subjects.data?.items ?? [], goals.data ?? [])} endpoint="/learning/courses"
          initial={d.course as unknown as Record<string, unknown> & { id: string }} invalidate={[["learning"]]} />
        <EntityDialog open={addRes} onOpenChange={setAddRes} title="Материал" fields={RES_FIELDS} endpoint="/learning/resources" extra={{ course_id: id }} invalidate={[["learning"]]} />
        <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Удалить курс?" onConfirm={() => remove.mutate()} loading={remove.isPending} />
      </div>
    )}</QueryState>
  );
}
