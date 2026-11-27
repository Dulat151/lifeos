"use client";
import {
  Bell, Bot, CalendarDays, Database, Download, LogOut, Monitor, Moon, Palette, Plug, Shield, Sun, Trash2, Trophy, User,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { CalendarIntegrations, NotesImport } from "@/components/integrations";
import { ProfileForm } from "@/components/profile-form";
import { applyTheme, useI18n, useInvalidateMe, useMe } from "@/components/providers";
import { Badge, Button, Card, CardBody, CardHeader, Dialog, Field, Input, Select, Switch, useToast } from "@/components/ui";
import { useGet, useMut } from "@/hooks/use-api";
import { api, del, download, patch, post } from "@/lib/api";
import type { Reminder, Settings } from "@/lib/types";
import { cn, fmtDateTime } from "@/lib/utils";

const AI_CTX: Record<string, string> = { goals: "Цели", tasks: "Задачи", habits: "Привычки", calendar: "Календарь", learning: "Обучение", journal: "Дневник", finance: "Финансы", health: "Здоровье" };
const CH: Record<string, string> = { in_app: "В приложении", browser: "Уведомления браузера", web_push: "Web Push (когда сайт закрыт)", email: "Email" };

const SECTIONS = [
  { id: "profile", label: "Профиль", icon: User },
  { id: "appearance", label: "Внешний вид", icon: Palette },
  { id: "notifications", label: "Уведомления", icon: Bell },
  { id: "calendar", label: "Календарь", icon: CalendarDays },
  { id: "integrations", label: "Интеграции", icon: Plug },
  { id: "gamification", label: "Геймификация", icon: Trophy },
  { id: "privacy", label: "Приватность и безопасность", icon: Shield },
  { id: "data", label: "Данные", icon: Database },
  { id: "ai", label: "AI-помощник", icon: Bot },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export default function SettingsPage() {
  const me = useMe();
  const params = useSearchParams();
  const router = useRouter();
  const initial = (params.get("section") as SectionId) ?? (typeof window !== "undefined" && location.hash === "#import-notes" ? "data" : typeof window !== "undefined" && location.hash === "#integrations" ? "integrations" : "profile");
  const [section, setSection] = React.useState<SectionId>(SECTIONS.some((x) => x.id === initial) ? initial : "profile");
  const choose = (id: SectionId) => { setSection(id); router.replace(`/settings?section=${id}`, { scroll: false }); };
  const s = me.data?.settings;
  if (!s || !me.data) return null;
  return (
    <div>
      <div className="mb-6"><h1 className="text-[22px] font-semibold tracking-tight">Настройки</h1><p className="text-sm text-muted">Всё, что здесь меняется, сразу влияет на приложение</p></div>
      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <nav className="hidden md:block" aria-label="Разделы настроек">
          <ul className="sticky top-20 space-y-0.5">{SECTIONS.map((x) => (
            <li key={x.id}><button onClick={() => choose(x.id)} aria-current={section === x.id ? "page" : undefined}
              className={cn("flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-sm transition-colors", section === x.id ? "bg-accent-soft font-medium text-text" : "text-muted hover:bg-surface-2 hover:text-text")}>
              <x.icon className={cn("size-4", section === x.id && "text-accent")} />{x.label}</button></li>))}</ul>
        </nav>
        <Select className="md:hidden" value={section} onChange={(e) => choose(e.target.value as SectionId)} aria-label="Раздел настроек">
          {SECTIONS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </Select>
        <div className="min-w-0 max-w-3xl space-y-4">
          {section === "profile" && <ProfileForm />}
          {section === "appearance" && <Appearance s={s} />}
          {section === "notifications" && <Notifications s={s} />}
          {section === "calendar" && <CalendarPrefs s={s} />}
          {section === "integrations" && <><CalendarIntegrations /><Card className="p-4 text-sm">Все сервисы и их статусы — на странице <Link href="/integrations" className="text-accent hover:underline">Интеграции</Link>.</Card></>}
          {section === "gamification" && <GamificationPrefs s={s} />}
          {section === "privacy" && <Privacy s={s} />}
          {section === "data" && <Data />}
          {section === "ai" && <AiPrefs s={s} />}
        </div>
      </div>
    </div>
  );
}

function useSettingsSave() {
  const refresh = useInvalidateMe();
  return useMut((b: Partial<Settings>) => patch("/settings", b), { success: "Сохранено", onSuccess: refresh });
}

function Appearance({ s }: { s: Settings }) {
  const upd = useSettingsSave();
  return (
    <>
      <Card><CardHeader title="Тема" icon={<Palette />} subtitle="Тёмная — по умолчанию" /><CardBody className="space-y-4">
        <div className="grid grid-cols-3 gap-2">{([["dark", Moon, "Тёмная"], ["light", Sun, "Светлая"], ["system", Monitor, "Как в системе"]] as const).map(([v, I, l]) => (
          <button key={v} onClick={() => { applyTheme(v); upd.mutate({ theme: v }); }} aria-pressed={s.theme === v}
            className={cn("flex flex-col items-center gap-2 rounded-2xl border p-4 text-sm transition-all", s.theme === v ? "border-accent bg-accent-softer" : "border-border hover:border-border-strong")}>
            <I className={cn("size-5", s.theme === v ? "text-accent" : "text-muted")} />{l}</button>))}</div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 p-3 text-sm">
          <span>Акцентный цвет: {s.cosmetics?.accent ? <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-full" style={{ background: s.cosmetics.accent }} />из магазина наград</span> : "стандартный"}</span>
          <Button size="xs" variant="outline" asChild><Link href="/rewards?tab=shop">Темы в магазине</Link></Button>
        </div>
      </CardBody></Card>
      <Card><CardHeader title="Регион" /><CardBody className="grid gap-3 sm:grid-cols-2">
        <Field label="Основная валюта"><Select value={s.currency} onChange={(e) => upd.mutate({ currency: e.target.value })}>{["KZT", "USD", "EUR", "RUB", "UZS", "KGS"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Цель чтения, книг в год"><Input type="number" min={0} max={1000} defaultValue={s.reading_goal_yearly} onBlur={(e) => upd.mutate({ reading_goal_yearly: Number(e.target.value) || 0 })} /></Field>
        <p className="text-xs text-muted sm:col-span-2">Язык интерфейса и часовой пояс — в разделе «Профиль».</p>
      </CardBody></Card>
    </>
  );
}

function Notifications({ s }: { s: Settings }) {
  const upd = useSettingsSave();
  const toast = useToast();
  const channels = useGet<Record<string, boolean | string | null>>(["notifications", "channels"], "/notifications/channels");
  const [qh, setQh] = React.useState({ start: s.quiet_hours_start ?? "", end: s.quiet_hours_end ?? "" });
  const [perm, setPerm] = React.useState<string>("default");
  React.useEffect(() => { if (typeof Notification !== "undefined") setPerm(Notification.permission); }, []);
  const askBrowser = async () => {
    if (typeof Notification === "undefined") return toast("Этот браузер не поддерживает уведомления", "error");
    const p = await Notification.requestPermission();
    setPerm(p);
    toast(p === "granted" ? "Уведомления браузера включены" : "Разрешение не выдано", p === "granted" ? "success" : "error");
  };
  const subscribePush = async () => {
    try {
      const key = channels.data?.vapid_public_key as string | null;
      if (!key) return toast("Web Push не настроен на сервере (VAPID)", "error");
      if ((await Notification.requestPermission()) !== "granted") return toast("Разрешение не выдано", "error");
      const reg = await navigator.serviceWorker.ready;
      const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (key.length % 4)) % 4));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) });
      await api("/notifications/push-subscriptions", { method: "POST", body: sub.toJSON() });
      toast("Web Push подключён на этом устройстве");
    } catch (e) { toast((e as Error).message || "Не удалось подписаться", "error"); }
  };
  return (
    <>
      <Card><CardHeader title="Каналы" icon={<Bell />} subtitle="Напоминания отправляет сервер — открытая вкладка не нужна" /><CardBody className="space-y-3">
        {Object.entries(CH).map(([k, l]) => (
          <div key={k} className="flex items-center justify-between gap-3"><Switch checked={s.notification_prefs[k] !== false} onCheckedChange={(v) => upd.mutate({ notification_prefs: { ...s.notification_prefs, [k]: v } })} label={l} />
            {channels.data && !channels.data[k] && <Badge>не настроен на сервере</Badge>}</div>))}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={askBrowser} disabled={perm === "granted"}>{perm === "granted" ? "Браузер: разрешено" : "Разрешить уведомления браузера"}</Button>
          <Button size="sm" variant="outline" onClick={subscribePush} disabled={!channels.data?.web_push}>Web Push на этом устройстве</Button>
        </div>
      </CardBody></Card>
      <Card><CardHeader title="Тихие часы" subtitle="Email и Web Push откладываются до их окончания" /><CardBody>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="С"><Input type="time" value={qh.start} onChange={(e) => setQh({ ...qh, start: e.target.value })} /></Field>
          <Field label="До"><Input type="time" value={qh.end} onChange={(e) => setQh({ ...qh, end: e.target.value })} /></Field>
          <Button variant="outline" onClick={() => upd.mutate({ quiet_hours_start: qh.start || null, quiet_hours_end: qh.end || null })}>Сохранить</Button>
        </div>
      </CardBody></Card>
      <ReviewReminders />
      <Card className="p-4 text-sm text-muted">Напоминания о задачах, привычках, событиях и целях настраиваются у самих элементов. История доставки — на странице <Link href="/reminders" className="text-accent hover:underline">Напоминания</Link>.</Card>
    </>
  );
}

/** Daily and weekly review reminders (real Reminder rows, recurring via RRULE in the user's time zone). */
function ReviewReminders() {
  const me = useMe();
  const tz = me.data?.profile.timezone ?? "UTC";
  const list = useGet<Reminder[]>(["reminders"], "/reminders");
  const items = [
    { kind: "daily_review", title: "Подвести итоги дня", rule: "FREQ=DAILY", label: "Ежедневный обзор", hint: "Каждый вечер", def: "21:00" },
    { kind: "weekly_review", title: "Сделать обзор недели", rule: "FREQ=WEEKLY;BYDAY=SU", label: "Еженедельный обзор", hint: "По воскресеньям", def: "18:00" },
  ];
  const create = useMut((v: { kind: string; title: string; rule: string; time: string }) => {
    const [h, m] = v.time.split(":").map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    if (v.kind === "weekly_review") d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    if (d < new Date()) d.setDate(d.getDate() + (v.kind === "weekly_review" ? 7 : 1));
    return post("/reminders", { kind: v.kind, title: v.title, body: v.kind === "daily_review" ? "Отметьте выполненное и запишите мысли дня." : "Победы недели и фокус на следующую.",
      channels: ["in_app", "browser", "web_push"], first_fire_at: d.toISOString(), recurrence_rule: v.rule, timezone: tz });
  }, { invalidate: [["reminders"]], success: "Напоминание включено" });
  const remove = useMut((id: string) => del(`/reminders/${id}`), { invalidate: [["reminders"]], success: "Напоминание выключено" });
  const [times, setTimes] = React.useState<Record<string, string>>({});
  return (
    <Card><CardHeader title="Регулярные обзоры" subtitle="Помогают не терять нить и заполнять недельный квест" /><CardBody className="space-y-3">
      {items.map((it) => {
        const r = list.data?.find((x) => x.kind === it.kind);
        return (
          <div key={it.kind} className="flex flex-wrap items-center gap-3">
            <Switch checked={!!r} onCheckedChange={(v) => v ? create.mutate({ ...it, time: times[it.kind] ?? it.def }) : r && remove.mutate(r.id)} label={it.label} description={r?.next_fire_at ? `следующее: ${fmtDateTime(r.next_fire_at)}` : it.hint} />
            {!r && <Input type="time" className="ml-auto h-8 w-28" value={times[it.kind] ?? it.def} onChange={(e) => setTimes({ ...times, [it.kind]: e.target.value })} aria-label={`Время: ${it.label}`} />}
          </div>
        );
      })}
    </CardBody></Card>
  );
}

function CalendarPrefs({ s }: { s: Settings }) {
  const upd = useSettingsSave();
  const prefs = s.preferences ?? {};
  return (
    <Card><CardHeader title="Календарь" icon={<CalendarDays />} /><CardBody className="grid gap-3 sm:grid-cols-2">
      <Field label="Первый день недели"><Select value={s.week_start} onChange={(e) => upd.mutate({ week_start: Number(e.target.value) })}><option value={1}>Понедельник</option><option value={0}>Воскресенье</option></Select></Field>
      <Field label="Вид по умолчанию"><Select value={prefs.calendar_view ?? "week"} onChange={(e) => upd.mutate({ preferences: { calendar_view: e.target.value as "week" } })}>
        <option value="month">Месяц</option><option value="week">Неделя</option><option value="day">День</option><option value="agenda">Повестка</option></Select></Field>
      <p className="text-xs text-muted sm:col-span-2">Синхронизация с Google Calendar и Apple iCloud — в разделе «Интеграции».</p>
    </CardBody></Card>
  );
}

function GamificationPrefs({ s }: { s: Settings }) {
  const upd = useSettingsSave();
  const prefs = s.preferences ?? {};
  return (
    <Card><CardHeader title="Геймификация" icon={<Trophy />} subtitle="Опыт, уровни, квесты и монеты" /><CardBody className="space-y-4">
      <Switch checked={s.gamification_enabled} onCheckedChange={(v) => upd.mutate({ gamification_enabled: v })} label="Включить геймификацию" description="Если выключить, XP и монеты не начисляются, квесты и уровень скрыты" />
      <Switch checked={prefs.xp_animations !== false} disabled={!s.gamification_enabled} onCheckedChange={(v) => upd.mutate({ preferences: { xp_animations: v } })} label="Анимации опыта" description="Всплывающие «+XP» и экран нового уровня" />
      <Button size="sm" variant="outline" asChild><Link href="/rewards">Открыть награды и квесты</Link></Button>
    </CardBody></Card>
  );
}

function Privacy({ s }: { s: Settings }) {
  const upd = useSettingsSave();
  const me = useMe();
  const resend = useMut(() => post<{ sent: boolean; email_configured: boolean }>("/auth/resend-verification"));
  const sessions = useGet<{ id: string; user_agent: string; ip: string; created_at: string; last_used_at: string | null; current: boolean }[]>(["sessions"], "/auth/sessions");
  const revoke = useMut((id: string) => del(`/auth/sessions/${id}`), { invalidate: [["sessions"]], success: "Сессия завершена" });
  const [pw, setPw] = React.useState({ current_password: "", new_password: "" });
  const toast = useToast();
  const changePw = useMut(() => post("/auth/change-password", pw), { success: "Пароль изменён, другие сессии завершены", onSuccess: () => setPw({ current_password: "", new_password: "" }) });
  const { locale } = useI18n();
  return (
    <>
      <Card><CardHeader title="Приватность" icon={<Shield />} /><CardBody className="space-y-3">
        <Switch checked={s.social_enabled} onCheckedChange={(v) => upd.mutate({ social_enabled: v })} label="Социальные функции" description="Друзья, группы, общие цели и челленджи" />
        <p className="text-xs text-muted">Записи дневника приватны и не доступны AI, пока вы не разрешите это в разделе «AI-помощник».</p>
      </CardBody></Card>
      <Card><CardHeader title="Безопасность" /><CardBody className="space-y-4">
        {!me.data?.email_verified && <div className="flex items-center gap-3 text-sm"><Badge tone="warning">Email не подтверждён</Badge>
          <Button size="sm" variant="outline" loading={resend.isPending} onClick={() => resend.mutate(undefined, { onSuccess: (r) => toast(r.sent ? "Письмо отправлено" : r.email_configured ? "Не удалось отправить" : "SMTP на сервере не настроен", r.sent ? "success" : "error") })}>Отправить письмо</Button></div>}
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (pw.new_password.length >= 8) changePw.mutate(); else toast("Новый пароль — минимум 8 символов", "error"); }}>
          <Field label="Текущий пароль"><Input type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
          <Field label="Новый пароль"><Input type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
          <Button type="submit" variant="outline" loading={changePw.isPending}>Сменить пароль</Button>
        </form>
        <div><div className="mb-1.5 text-xs font-medium text-muted">Активные сессии</div>
          <ul className="space-y-1.5">{sessions.data?.map((x) => (
            <li key={x.id} className="flex items-center gap-2 rounded-xl bg-surface-2/60 px-3 py-2 text-sm"><span className={cn("flex-1 truncate", x.current && "font-medium")}>{x.user_agent || "Неизвестное устройство"}</span>
              <span className="hidden text-xs text-muted sm:inline">{x.ip} · {fmtDateTime(x.last_used_at ?? x.created_at, locale)}</span>
              {x.current ? <Badge tone="accent">это устройство</Badge> : <Button size="icon-sm" variant="ghost" onClick={() => revoke.mutate(x.id)} aria-label="Завершить сессию"><LogOut /></Button>}</li>))}</ul></div>
      </CardBody></Card>
    </>
  );
}

function Data() {
  const [delOpen, setDelOpen] = React.useState(false);
  return (
    <>
      <Card><CardHeader title="Экспорт" icon={<Download />} subtitle="Ваши данные принадлежат вам" /><CardBody className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => download("/exports/full", `lifeos-export-${new Date().toISOString().slice(0, 10)}.json`)}><Download />Все данные (JSON)</Button>
        <Button variant="outline" onClick={() => download("/calendar/export.ics", "lifeos.ics")}><Download />Календарь (ICS)</Button>
        <Button variant="outline" onClick={() => download("/journal/export.md", "journal.md")}><Download />Дневник (Markdown)</Button>
      </CardBody></Card>
      <NotesImport />
      <Card className="border-danger/30"><CardHeader title="Удаление аккаунта" icon={<Trash2 />} subtitle="Необратимо: удалятся все данные" /><CardBody>
        <Button variant="danger" onClick={() => setDelOpen(true)}><Trash2 />Удалить аккаунт</Button>
      </CardBody></Card>
      <DeleteAccount open={delOpen} onOpenChange={setDelOpen} />
    </>
  );
}

function AiPrefs({ s }: { s: Settings }) {
  const upd = useSettingsSave();
  const status = useGet<{ configured: boolean; provider: string }>(["ai", "status"], "/ai/status");
  return (
    <Card><CardHeader title="AI-помощник" icon={<Bot />} subtitle="Предлагает задачи и планы — создаёт только после вашего подтверждения" /><CardBody className="space-y-4">
      {status.data && <div className="flex items-center gap-2 text-sm">{status.data.configured ? <Badge tone="success">подключён: {status.data.provider}</Badge> : <Badge tone="warning">ключ AI на сервере не задан</Badge>}</div>}
      <Switch checked={s.ai_enabled} onCheckedChange={(v) => upd.mutate({ ai_enabled: v })} label="AI включён" />
      <div><div className="mb-2 text-xs font-medium text-muted">Какие данные AI может читать</div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">{Object.entries(AI_CTX).map(([k, l]) => (
          <Switch key={k} checked={!!s.ai_context[k]} disabled={!s.ai_enabled} onCheckedChange={(v) => upd.mutate({ ai_context: { ...s.ai_context, [k]: v } })} label={l} />))}</div></div>
    </CardBody></Card>
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
