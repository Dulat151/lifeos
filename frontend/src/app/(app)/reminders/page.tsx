"use client";
import { AlarmClock, BellRing, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import * as React from "react";
import { Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, Field, Input, PageHeader, QueryState, Select, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from "@/components/ui";
import { useI18n, useMe } from "@/components/providers";
import { useGet, useMut } from "@/hooks/use-api";
import { del, patch, post } from "@/lib/api";
import type { Delivery, Reminder } from "@/lib/types";
import { fmtDateTime, isoToLocalInput } from "@/lib/utils";

const KINDS: Record<string, string> = { task: "Задача", habit: "Привычка", goal: "Цель", event: "Событие", learning: "Обучение", workout: "Тренировка", payment: "Платёж", daily_review: "Дневной обзор", weekly_review: "Недельный обзор", custom: "Своё" };
const CH: Record<string, string> = { in_app: "В приложении", browser: "Браузер", web_push: "Web Push", email: "Email" };
const RECUR = [["", "Однократно"], ["FREQ=DAILY", "Ежедневно"], ["FREQ=WEEKLY", "Еженедельно"], ["FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "По будням"], ["FREQ=MONTHLY", "Ежемесячно"]];

export default function RemindersPage() {
  const { locale } = useI18n();
  const q = useGet<Reminder[]>(["reminders"], "/reminders");
  const deliveries = useGet<Delivery[]>(["notifications", "deliveries"], "/notifications/deliveries?limit=200");
  const channels = useGet<Record<string, boolean>>(["notifications", "channels"], "/notifications/channels");
  const [editing, setEditing] = React.useState<Reminder | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<Reminder | null>(null);
  const inv = { invalidate: [["reminders"], ["notifications"]] };
  const snooze = useMut((v: { id: string; minutes: number }) => post(`/reminders/${v.id}/snooze`, { minutes: v.minutes }), { ...inv, success: "Отложено" });
  const toggle = useMut((r: Reminder) => patch(`/reminders/${r.id}`, { is_active: !r.is_active }), inv);
  const remove = useMut((id: string) => del(`/reminders/${id}`), { ...inv, success: "Удалено", onSuccess: () => setDeleting(null) });
  const retry = useMut((id: string) => post(`/notifications/deliveries/${id}/retry`), { ...inv, success: "Поставлено в очередь" });
  const [perm, setPerm] = React.useState<string>("default");
  React.useEffect(() => { if ("Notification" in window) setPerm(Notification.permission); }, []);
  return (
    <div>
      <PageHeader title="Напоминания" subtitle="Планируются и доставляются сервером — не зависят от открытой вкладки"
        actions={<Button onClick={() => setEditing("new")}><Plus />Напоминание</Button>} />
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3 text-sm">
        <span className="text-muted">Каналы:</span>
        {channels.data && Object.entries(CH).map(([k, l]) => <Badge key={k} tone={channels.data[k] ? "success" : "neutral"}>{l}{!channels.data[k] && " — не настроен"}</Badge>)}
        {perm !== "granted" && "Notification" in globalThis && <Button size="sm" variant="outline" className="ml-auto" onClick={async () => setPerm(await Notification.requestPermission())}><BellRing />Разрешить уведомления браузера</Button>}
      </Card>
      <Tabs defaultValue="list">
        <TabsList className="mb-3"><TabsTrigger value="list">Напоминания</TabsTrigger><TabsTrigger value="history">История доставки</TabsTrigger></TabsList>
        <TabsContent value="list">
          <QueryState q={q} empty={<EmptyState title="Напоминаний нет" text="Создайте напоминание или добавьте его к событию/привычке." />}>
            {(list) => (
              <Card className="divide-y divide-border">{list.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Switch checked={r.is_active} onCheckedChange={() => toggle.mutate(r)} label="" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{r.title}</div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted">
                      <Badge>{KINDS[r.kind] ?? r.kind}</Badge>
                      <span>{r.next_fire_at ? `следующее: ${fmtDateTime(r.next_fire_at, locale)}` : r.last_fired_at ? `сработало ${fmtDateTime(r.last_fired_at, locale)}` : "неактивно"}</span>
                      {r.recurrence_rule && <span>↻ {RECUR.find(([v]) => v === r.recurrence_rule)?.[1] ?? r.recurrence_rule}</span>}
                      <span>{r.channels.map((c) => CH[c]).join(", ")}</span>
                    </div>
                  </div>
                  <Select className="h-8 w-32" value="" onChange={(e) => e.target.value && snooze.mutate({ id: r.id, minutes: Number(e.target.value) })} aria-label="Отложить">
                    <option value="">Отложить…</option><option value="10">10 мин</option><option value="60">1 час</option><option value="1440">1 день</option>
                  </Select>
                  <Button size="icon-sm" variant="ghost" onClick={() => setEditing(r)} aria-label="Изменить"><Pencil /></Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => setDeleting(r)} aria-label="Удалить"><Trash2 /></Button>
                </div>))}</Card>
            )}
          </QueryState>
        </TabsContent>
        <TabsContent value="history">
          <QueryState q={deliveries} empty={<EmptyState icon={<AlarmClock className="size-8" />} title="Доставок пока не было" />}>
            {(list) => (
              <Card className="divide-y divide-border">{list.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="w-36 text-xs text-muted">{fmtDateTime(d.created_at, locale)}</span>
                  <span className="w-28">{CH[d.channel]}</span>
                  <Badge tone={d.status === "sent" ? "success" : d.status === "failed" ? "danger" : "neutral"}>{d.status}</Badge>
                  <span className="flex-1 truncate text-xs text-muted">{d.last_error}</span>
                  <span className="text-xs text-muted">попыток: {d.attempts}</span>
                  {d.status === "failed" && <Button size="sm" variant="ghost" onClick={() => retry.mutate(d.id)}><RotateCcw />Повторить</Button>}
                </div>))}</Card>
            )}
          </QueryState>
        </TabsContent>
      </Tabs>
      {editing && <ReminderDialog r={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Удалить напоминание?" onConfirm={() => deleting && remove.mutate(deleting.id)} loading={remove.isPending} />
    </div>
  );
}

function ReminderDialog({ r, onClose }: { r: Reminder | null; onClose: () => void }) {
  const me = useMe();
  const def = new Date(Date.now() + 3_600_000); def.setMinutes(0, 0, 0);
  const [f, setF] = React.useState({ title: r?.title ?? "", body: r?.body ?? "", kind: r?.kind ?? "custom", first_fire_at: isoToLocalInput(r?.next_fire_at ?? r?.first_fire_at ?? def.toISOString()),
    recurrence_rule: r?.recurrence_rule ?? "", channels: r?.channels ?? ["in_app", "browser"] });
  const [err, setErr] = React.useState("");
  const save = useMut((b: Record<string, unknown>) => (r ? patch(`/reminders/${r.id}`, b) : post("/reminders", b)), { invalidate: [["reminders"]], success: "Сохранено", onSuccess: onClose });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.title.trim()) return setErr("Введите заголовок");
    if (!f.channels.length) return setErr("Выберите хотя бы один канал");
    save.mutate({ title: f.title, body: f.body, kind: f.kind, first_fire_at: new Date(f.first_fire_at).toISOString(), recurrence_rule: f.recurrence_rule || null,
      channels: f.channels, timezone: me.data?.profile.timezone ?? "UTC", is_active: true });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={r ? "Изменить напоминание" : "Новое напоминание"}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <Field label="Заголовок *"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Текст"><Textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Тип"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Повторение"><Select value={f.recurrence_rule} onChange={(e) => setF({ ...f, recurrence_rule: e.target.value })}>{RECUR.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        </div>
        <Field label="Когда"><Input type="datetime-local" value={f.first_fire_at} onChange={(e) => setF({ ...f, first_fire_at: e.target.value })} /></Field>
        <Field label="Каналы"><div className="flex flex-wrap gap-3">{Object.entries(CH).map(([k, l]) => (
          <label key={k} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="accent-[var(--accent)]" checked={f.channels.includes(k)}
            onChange={() => setF({ ...f, channels: f.channels.includes(k) ? f.channels.filter((c) => c !== k) : [...f.channels, k] })} />{l}</label>))}</div></Field>
        {err && <p className="text-sm text-danger" role="alert">{err}</p>}
        <div className="flex justify-end"><Button type="submit" loading={save.isPending}>Сохранить</Button></div>
      </form>
    </Dialog>
  );
}
