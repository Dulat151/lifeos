"use client";
import { Clock, Layers, Plus } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { BarsChart } from "@/components/charts";
import { EntityDialog, EntityList, type FieldDef } from "@/components/entity";
import { Button, Card, CardBody, CardHeader, PageHeader, Progress, QueryState, Stat, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { useGet } from "@/hooks/use-api";
import type { Course, Subject } from "@/lib/types";
import { fmtDate, fmtDateTime, fmtMinutes } from "@/lib/utils";

type LDash = { minutes_today: number; minutes_week: number; minutes_total: number; sessions_total: number; daily: { date: string; minutes: number }[]; active_courses: Course[]; cards_due: number };
type Session = { id: string; started_at: string; duration_minutes: number; notes: string; course_id: string | null; subject_id: string | null; source: string };

const SUBJECT_FIELDS: FieldDef[] = [
  { name: "title", label: "Название", required: true }, { name: "area", label: "Направление", placeholder: "IT, языки, наука…" },
  { name: "color", label: "Цвет", type: "color", default: "#0ea5e9" }, { name: "description", label: "Описание", type: "textarea" },
];

export default function LearningPage() {
  const { locale } = useI18n();
  const dash = useGet<LDash>(["learning", "dashboard"], "/learning/dashboard");
  const subjects = useGet<{ items: Subject[] }>(["learning", "subjects"], "/learning/subjects");
  const courses = useGet<Course[]>(["learning", "courses"], "/learning/courses");
  const sessions = useGet<{ items: Session[] }>(["learning", "sessions"], "/learning/sessions?limit=50");
  const [logOpen, setLogOpen] = React.useState(false);
  const sessionFields: FieldDef[] = React.useMemo(() => [
    { name: "started_at", label: "Начало", type: "datetime", required: true, default: new Date().toISOString() },
    { name: "duration_minutes", label: "Длительность, мин", type: "number", required: true, min: 1, max: 1440, default: 30 },
    { name: "course_id", label: "Курс", type: "select", nullable: true, options: courses.data?.map((c) => ({ value: c.id, label: c.title })) ?? [] },
    { name: "subject_id", label: "Предмет", type: "select", nullable: true, options: subjects.data?.items.map((s) => ({ value: s.id, label: s.title })) ?? [] },
    { name: "notes", label: "Заметки", type: "textarea" },
  ], [courses.data, subjects.data]);
  return (
    <div>
      <PageHeader title="Обучение" subtitle="Предметы, курсы, уроки, учебные сессии" actions={<>
        <Button variant="outline" asChild><Link href="/focus"><Clock />Учебная сессия с таймером</Link></Button>
        <Button onClick={() => setLogOpen(true)}><Plus />Записать сессию</Button></>} />
      <QueryState q={dash}>{(d) => (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Сегодня" value={fmtMinutes(d.minutes_today)} /><Stat label="За неделю" value={fmtMinutes(d.minutes_week)} />
            <Stat label="Всего" value={fmtMinutes(d.minutes_total)} /><Stat label="Сессий" value={d.sessions_total} />
            <Link href="/flashcards"><Stat label="Карточек к повтору" value={d.cards_due} icon={<Layers className="size-4" />} /></Link>
          </div>
          <Card className="mb-5"><CardHeader title="Учебное время, 14 дней" /><CardBody>
            <BarsChart data={d.daily.map((x) => ({ ...x, day: fmtDate(x.date, locale) }))} x="day" series={[{ key: "minutes", label: "Минут" }]} height={180} /></CardBody></Card>
          {d.active_courses.length > 0 && <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{d.active_courses.map((c) => (
            <Link key={c.id} href={`/courses/${c.id}`}><Card className="p-4 hover:border-accent/50"><div className="mb-1 font-medium">{c.title}</div>
              <div className="mb-2 text-xs text-muted">{c.lessons_done}/{c.lessons_total} уроков · {fmtMinutes(c.minutes_studied)}{c.weekly_minutes_goal ? ` · план ${c.weekly_minutes_goal} мин/нед` : ""}</div>
              <Progress value={c.progress} /></Card></Link>))}</div>}
        </>
      )}</QueryState>
      <Tabs defaultValue="subjects">
        <TabsList className="mb-3"><TabsTrigger value="subjects">Предметы</TabsTrigger><TabsTrigger value="history">История занятий</TabsTrigger></TabsList>
        <TabsContent value="subjects">
          <EntityList<Subject> endpoint="/learning/subjects" queryKey={["learning", "subjects"]} fields={SUBJECT_FIELDS} title="Предметы и направления" grid
            emptyTitle="Предметов пока нет" emptyText="Создайте предмет, затем добавьте в него курсы." render={(s) => (
              <Link href={`/learning/subjects/${s.id}`} className="block pr-14">
                <div className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: s.color }} /><span className="font-medium">{s.title}</span></div>
                <div className="mt-1 text-xs text-muted">{s.area || "—"} · курсов: {courses.data?.filter((c) => c.subject_id === s.id).length ?? 0}</div>
              </Link>)} />
        </TabsContent>
        <TabsContent value="history">
          <QueryState q={{ ...sessions, data: sessions.data?.items }}>{(list) => (
            <Card className="divide-y divide-border">{list.length === 0 && <p className="p-4 text-sm text-muted">Занятий пока не было</p>}
              {list.map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="w-36 text-xs text-muted">{fmtDateTime(s.started_at, locale)}</span>
                  <span className="w-20 font-medium">{s.duration_minutes} мин</span>
                  <span className="flex-1 truncate">{courses.data?.find((c) => c.id === s.course_id)?.title ?? subjects.data?.items.find((x) => x.id === s.subject_id)?.title ?? "—"}</span>
                  <span className="text-xs text-muted">{s.source === "focus" ? "таймер" : "вручную"}</span>
                </div>))}</Card>)}</QueryState>
        </TabsContent>
      </Tabs>
      <EntityDialog open={logOpen} onOpenChange={setLogOpen} title="Учебная сессия" fields={sessionFields} endpoint="/learning/sessions" invalidate={[["learning"]]} />
    </div>
  );
}
