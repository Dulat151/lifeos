"use client";
import { Download, LogOut, Monitor, Moon, Sun, Trash2 } from "lucide-react";
import * as React from "react";
import { Badge, Button, Card, CardBody, CardHeader, Dialog, Field, Input, PageHeader, Select, Switch, useToast } from "@/components/ui";
import { CalendarIntegrations, NotesImport } from "@/components/integrations";
import { applyTheme, useI18n, useInvalidateMe, useMe } from "@/components/providers";
import { useGet, useMut } from "@/hooks/use-api";
import { api, del, download, patch, post } from "@/lib/api";
import type { Settings } from "@/lib/types";
import { cn, fmtDateTime } from "@/lib/utils";

const AI_CTX: Record<string, string> = { goals: "Цели", tasks: "Задачи", habits: "Привычки", calendar: "Календарь", learning: "Обучение", journal: "Дневник", finance: "Финансы", health: "Здоровье" };
const CH: Record<string, string> = { in_app: "В приложении", browser: "Уведомления браузера", web_push: "Web Push", email: "Email" };

export default function SettingsPage() {
  const me = useMe();
  const refresh = useInvalidateMe();
  const toast = useToast();
  const { locale } = useI18n();
  const s = me.data?.settings;
  const upd = useMut((b: Partial<Settings>) => patch("/settings", b), { success: "Настройки сохранены", onSuccess: refresh });
  const sessions = useGet<{ id: string; user_agent: string; ip: string; created_at: string; last_used_at: string | null; current: boolean }[]>(["sessions"], "/auth/sessions");
  const revoke = useMut((id: string) => del(`/auth/sessions/${id}`), { invalidate: [["sessions"]], success: "Сессия завершена" });
  const channels = useGet<Record<string, boolean | string | null>>(["notifications", "channels"], "/notifications/channels");
  const resend = useMut(() => post<{ sent: boolean; email_configured: boolean }>("/auth/resend-verification"), { onSuccess: (r) => toast(r.sent ? "Письмо отправлено" : r.email_configured ? "Не удалось отправить" : "SMTP на сервере не настроен", r.sent ? "success" : "error") });
  const [pw, setPw] = React.useState({ current_password: "", new_password: "" });
  const changePw = useMut(() => post("/auth/change-password", pw), { success: "Пароль изменён, другие сессии завершены", onSuccess: () => setPw({ current_password: "", new_password: "" }) });
  const [qh, setQh] = React.useState({ start: "", end: "" });
  const [delOpen, setDelOpen] = React.useState(false);
  React.useEffect(() => { if (s) setQh({ start: s.quiet_hours_start ?? "", end: s.quiet_hours_end ?? "" }); }, [s]);
  if (!s || !me.data) return null;

  const subscribePush = async () => {
    try {
      const key = channels.data?.vapid_public_key as string | null;
      if (!key) return toast("Web Push не настроен на сервере (VAPID)", "error");
      if ((await Notification.requestPermission()) !== "granted") return toast("Разрешение не выдано", "error");
      const reg = await navigator.serviceWorker.ready;
      const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (key.length % 4)) % 4));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) });
      await api("/notifications/push-subscriptions", { method: "POST", body: sub.toJSON() });
      toast("Web Push подключён");
    } catch (e) { toast((e as Error).message || "Не удалось подписаться", "error"); }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Настройки" />
      <Card><CardHeader title="Внешний вид" /><CardBody className="space-y-3">
        <div className="flex gap-2">{([["dark", Moon, "Тёмная"], ["light", Sun, "Светлая"], ["system", Monitor, "Системная"]] as const).map(([v, I, l]) => (
          <Button key={v} variant={s.theme === v ? "secondary" : "outline"} onClick={() => { applyTheme(v); upd.mutate({ theme: v }); }}><I />{l}</Button>))}</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Основная валюта"><Select value={s.currency} onChange={(e) => upd.mutate({ currency: e.target.value })}>{["KZT", "USD", "EUR", "RUB", "UZS", "KGS"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Цель чтения, книг в год"><Input type="number" min={0} max={1000} defaultValue={s.reading_goal_yearly} onBlur={(e) => upd.mutate({ reading_goal_yearly: Number(e.target.value) || 0 })} /></Field>
          <Field label="Язык и часовой пояс"><Button variant="outline" asChild><a href="/profile">В профиле</a></Button></Field>
        </div>
      </CardBody></Card>

      <Card id="notifications"><CardHeader title="Уведомления" /><CardBody className="space-y-3">
        {Object.entries(CH).map(([k, l]) => (
          <div key={k} className="flex items-center justify-between"><Switch checked={s.notification_prefs[k] !== false} onCheckedChange={(v) => upd.mutate({ notification_prefs: { ...s.notification_prefs, [k]: v } })} label={l} />
            {channels.data && !channels.data[k] && <Badge>не настроен на сервере</Badge>}</div>))}
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Тихие часы с"><Input type="time" value={qh.start} onChange={(e) => setQh({ ...qh, start: e.target.value })} /></Field>
          <Field label="до"><Input type="time" value={qh.end} onChange={(e) => setQh({ ...qh, end: e.target.value })} /></Field>
          <Button variant="outline" onClick={() => upd.mutate({ quiet_hours_start: qh.start || null, quiet_hours_end: qh.end || null })}>Сохранить</Button>
        </div>
        <p className="text-xs text-muted">В тихие часы email и Web Push откладываются до их окончания; уведомления в приложении сохраняются сразу.</p>
        <Button variant="outline" size="sm" onClick={subscribePush} disabled={!channels.data?.web_push}>Подключить Web Push на этом устройстве</Button>
      </CardBody></Card>

      <Card id="ai"><CardHeader title="AI-ассистент" /><CardBody className="space-y-3">
        <Switch checked={s.ai_enabled} onCheckedChange={(v) => upd.mutate({ ai_enabled: v })} label="AI включён" />
        <div><div className="mb-1.5 text-xs font-medium text-muted">Какие данные AI может читать</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(AI_CTX).map(([k, l]) => (
            <Switch key={k} checked={!!s.ai_context[k]} disabled={!s.ai_enabled} onCheckedChange={(v) => upd.mutate({ ai_context: { ...s.ai_context, [k]: v } })} label={l} />))}</div></div>
      </CardBody></Card>

      <Card id="privacy"><CardHeader title="Приватность и функции" /><CardBody className="space-y-3">
        <Switch checked={s.social_enabled} onCheckedChange={(v) => upd.mutate({ social_enabled: v })} label="Социальные функции (друзья, группы, общие цели)" />
        <Switch checked={s.gamification_enabled} onCheckedChange={(v) => upd.mutate({ gamification_enabled: v })} label="Геймификация (XP, уровни)" />
        <p className="text-xs text-muted">Записи дневника приватны по умолчанию и не доступны AI, пока вы не разрешите это выше.</p>
      </CardBody></Card>

      <CalendarIntegrations />
      <NotesImport />

      <Card><CardHeader title="Безопасность" /><CardBody className="space-y-4">
        {!me.data.email_verified && <div className="flex items-center gap-3 text-sm"><Badge tone="warning">Email не подтверждён</Badge><Button size="sm" variant="outline" onClick={() => resend.mutate()} loading={resend.isPending}>Отправить письмо</Button></div>}
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (pw.new_password.length >= 8) changePw.mutate(); else toast("Новый пароль — минимум 8 символов", "error"); }}>
          <Field label="Текущий пароль"><Input type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
          <Field label="Новый пароль"><Input type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
          <Button type="submit" variant="outline" loading={changePw.isPending}>Сменить пароль</Button>
        </form>
        <div><div className="mb-1.5 text-xs font-medium text-muted">Активные сессии</div>
          <ul className="space-y-1.5">{sessions.data?.map((x) => (
            <li key={x.id} className="flex items-center gap-2 text-sm"><span className={cn("flex-1 truncate", x.current && "font-medium")}>{x.user_agent || "Неизвестное устройство"}</span>
              <span className="text-xs text-muted">{x.ip} · {fmtDateTime(x.last_used_at ?? x.created_at, locale)}</span>
              {x.current ? <Badge tone="accent">текущая</Badge> : <Button size="icon-sm" variant="ghost" onClick={() => revoke.mutate(x.id)} aria-label="Завершить"><LogOut /></Button>}</li>))}</ul></div>
      </CardBody></Card>

      <Card><CardHeader title="Данные" /><CardBody className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => download("/exports/full", `lifeos-export-${new Date().toISOString().slice(0, 10)}.json`)}><Download />Экспорт всех данных (JSON)</Button>
        <Button variant="outline" onClick={() => download("/calendar/export.ics", "lifeos.ics")}><Download />Календарь (ICS)</Button>
        <Button variant="outline" onClick={() => download("/journal/export.md", "journal.md")}><Download />Дневник (Markdown)</Button>
        <Button variant="danger" className="ml-auto" onClick={() => setDelOpen(true)}><Trash2 />Удалить аккаунт</Button>
      </CardBody></Card>
      <DeleteAccount open={delOpen} onOpenChange={setDelOpen} />
    </div>
  );
}

function DeleteAccount({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const go = async () => {
    setBusy(true); setErr("");
    try { await post("/users/me/delete", { password, confirm }); location.href = "/register"; } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Удалить аккаунт навсегда?" description="Будут безвозвратно удалены все цели, задачи, привычки, записи, файлы и история. Сначала сделайте экспорт данных."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button><Button variant="danger" disabled={confirm !== "DELETE" || !password} loading={busy} onClick={go}>Удалить навсегда</Button></>}>
      <div className="space-y-3">
        <Field label="Пароль"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Field label="Введите DELETE для подтверждения"><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        {err && <p className="text-sm text-danger">{err}</p>}
      </div>
    </Dialog>
  );
}
