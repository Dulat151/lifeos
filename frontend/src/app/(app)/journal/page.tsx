"use client";
import { Download, Lock, Plus, Unlock } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, Field, Input, PageHeader, QueryState, Select, Switch, Textarea } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { useGet, useMut } from "@/hooks/use-api";
import { del, download, patch, post, qs } from "@/lib/api";
import type { JournalEntry } from "@/lib/types";
import { cn, fmtDate, isoDate } from "@/lib/utils";

const KINDS: Record<string, string> = { daily: "Ежедневная", gratitude: "Благодарность", mood: "Настроение", achievement: "Достижение", learning: "Обучение", ideas: "Идеи", reflection: "Рефлексия",
  morning: "Утренняя", evening: "Вечерняя", weekly_review: "Недельный обзор", monthly_review: "Месячный обзор" };
type Template = { id: string; title: string; kind: string; prompts: string[] };

export default function JournalPage() {
  const { locale } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [kind, setKind] = React.useState("");
  const [archived, setArchived] = React.useState(false);
  const [month, setMonth] = React.useState(() => new Date());
  const [day, setDay] = React.useState("");
  const [editing, setEditing] = React.useState<JournalEntry | "new" | null>(params.get("new") === "1" ? "new" : null);
  const filters = [kind && `kind:${kind}`, day && `entry_date:${day}`].filter(Boolean).join(",");
  const list = useGet<{ items: JournalEntry[] }>(["journal", q, kind, archived, day], `/journal/entries${qs({ q, filters, include_archived: archived, limit: 200 })}`);
  const cal = useGet<{ date: string; count: number; mood: number | null }[]>(["journal", "cal", month.getFullYear(), month.getMonth()], `/journal/calendar?year=${month.getFullYear()}&month=${month.getMonth() + 1}`);
  const templates = useGet<Template[]>(["journal", "templates"], "/journal/templates");
  const [tpl, setTpl] = React.useState<Template | null>(null);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const pad = (first.getDay() + 6) % 7;
  const dim = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const byDay = new Map(cal.data?.map((c) => [c.date, c]));
  const items = (list.data?.items ?? []).filter((e) => (archived ? e.archived : !e.archived));
  return (
    <div>
      <PageHeader title="Дневник" subtitle="Записи приватны по умолчанию" actions={<>
        <Button variant="outline" size="sm" onClick={() => download("/journal/export.md", "journal.md")}><Download />Экспорт</Button>
        <Select className="w-52" value="" onChange={(e) => { const t = templates.data?.find((x) => x.id === e.target.value); if (t) { setTpl(t); setEditing("new"); } }}>
          <option value="">Из шаблона…</option>{templates.data?.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</Select>
        <Button onClick={() => { setTpl(null); setEditing("new"); }}><Plus />Запись</Button></>} />
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Назад">‹</button>
            <span className="capitalize">{month.toLocaleDateString(locale, { month: "long", year: "numeric" })}</span>
            <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Вперёд">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => <div key={d} className="text-muted">{d}</div>)}
            {Array.from({ length: pad }).map((_, i) => <div key={"p" + i} />)}
            {Array.from({ length: dim }, (_, i) => { const d = isoDate(new Date(month.getFullYear(), month.getMonth(), i + 1)); const c = byDay.get(d); return (
              <button key={d} onClick={() => setDay(day === d ? "" : d)} className={cn("rounded py-1", c && "bg-accent-soft font-semibold text-accent", day === d && "ring-1 ring-accent")} title={c ? `${c.count} записей${c.mood ? `, настроение ${c.mood}` : ""}` : undefined}>{i + 1}</button>); })}
          </div>
          {day && <button className="mt-2 text-xs text-accent" onClick={() => setDay("")}>Сбросить фильтр дня</button>}
        </Card>
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Input className="max-w-xs" placeholder="Поиск…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select className="w-48" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Все типы</option>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            <Button size="sm" variant={archived ? "secondary" : "ghost"} onClick={() => setArchived(!archived)}>Архив</Button>
          </div>
          <QueryState q={{ ...list, data: list.data ? items : undefined }} empty={<EmptyState title="Записей нет" text="Начните с короткой записи: что сегодня было хорошего?" />}>
            {(entries) => (
              <div className="space-y-2">{entries.map((e) => (
                <Card key={e.id} className="cursor-pointer p-4 hover:border-accent/50" onClick={() => setEditing(e)}>
                  <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                    <span>{fmtDate(e.entry_date, locale, { weekday: "short", day: "numeric", month: "long" })}</span><Badge>{KINDS[e.kind] ?? e.kind}</Badge>
                    {e.mood && <span>настроение {e.mood}/10</span>}{e.is_private ? <Lock className="ml-auto size-3" /> : <Unlock className="ml-auto size-3" />}
                  </div>
                  {e.title && <div className="font-medium">{e.title}</div>}
                  <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted">{e.body}</p>
                  {e.tags.length > 0 && <div className="mt-1 flex gap-1.5 text-xs text-muted">{e.tags.map((t) => <span key={t}>#{t}</span>)}</div>}
                </Card>))}</div>
            )}
          </QueryState>
        </div>
      </div>
      {editing && <EntryDialog e={editing === "new" ? null : editing} tpl={tpl} onClose={() => { setEditing(null); setTpl(null); if (params.get("new")) router.replace("/journal"); }} />}
    </div>
  );
}

function EntryDialog({ e, tpl, onClose }: { e: JournalEntry | null; tpl: Template | null; onClose: () => void }) {
  const [f, setF] = React.useState({ kind: e?.kind ?? tpl?.kind ?? "daily", title: e?.title ?? tpl?.title ?? "", body: e?.body ?? (tpl ? tpl.prompts.map((p) => `**${p}**\n\n`).join("\n") : ""),
    entry_date: e?.entry_date ?? isoDate(), mood: e?.mood ? String(e.mood) : "", tags: (e?.tags ?? []).join(", "), is_private: e?.is_private ?? true, archived: e?.archived ?? false });
  const [confirm, setConfirm] = React.useState(false);
  const save = useMut((b: Record<string, unknown>) => (e ? patch(`/journal/entries/${e.id}`, b) : post("/journal/entries", b)), { invalidate: [["journal"]], success: "Запись сохранена", onSuccess: onClose });
  const remove = useMut(() => del(`/journal/entries/${e!.id}`), { invalidate: [["journal"]], success: "Удалено", onSuccess: onClose });
  const submit = (ev: React.FormEvent) => { ev.preventDefault(); save.mutate({ ...f, mood: f.mood ? Number(f.mood) : null, tags: f.tags.split(",").map((s) => s.trim()).filter(Boolean), ...(tpl && !e ? { template_id: tpl.id } : {}) }); };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={e ? "Запись" : "Новая запись"} wide>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3" noValidate>
        <Field label="Тип"><Select value={f.kind} onChange={(x) => setF({ ...f, kind: x.target.value })}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Дата"><Input type="date" value={f.entry_date} onChange={(x) => setF({ ...f, entry_date: x.target.value })} /></Field>
        <Field label="Настроение"><Select value={f.mood} onChange={(x) => setF({ ...f, mood: x.target.value })}><option value="">—</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</Select></Field>
        <Field label="Заголовок" className="sm:col-span-3"><Input value={f.title} onChange={(x) => setF({ ...f, title: x.target.value })} /></Field>
        <Field label="Текст" className="sm:col-span-3"><Textarea className="min-h-64" value={f.body} onChange={(x) => setF({ ...f, body: x.target.value })} /></Field>
        <Field label="Теги" className="sm:col-span-3"><Input value={f.tags} onChange={(x) => setF({ ...f, tags: x.target.value })} placeholder="через запятую" /></Field>
        <div className="flex gap-4 sm:col-span-3"><Switch checked={f.is_private} onCheckedChange={(v) => setF({ ...f, is_private: v })} label="Приватная" /><Switch checked={f.archived} onCheckedChange={(v) => setF({ ...f, archived: v })} label="В архиве" /></div>
        <div className="flex justify-between sm:col-span-3">{e ? <Button type="button" variant="ghost" onClick={() => setConfirm(true)}>Удалить</Button> : <span />}<Button type="submit" loading={save.isPending}>Сохранить</Button></div>
      </form>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Удалить запись?" onConfirm={() => remove.mutate()} loading={remove.isPending} />
    </Dialog>
  );
}
