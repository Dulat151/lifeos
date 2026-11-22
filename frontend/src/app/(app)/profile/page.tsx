"use client";
import * as React from "react";
import { Button, Card, Field, Input, PageHeader, Select, Stat, Switch, Textarea } from "@/components/ui";
import { useI18n, useInvalidateMe, useMe } from "@/components/providers";
import { useGet, useMut } from "@/hooks/use-api";
import { patch } from "@/lib/api";
import type { Lang } from "@/lib/i18n";
import { fmtDate } from "@/lib/utils";

const TZS = typeof Intl !== "undefined" && "supportedValuesOf" in Intl ? (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone") : ["UTC", "Asia/Almaty", "Europe/Moscow"];

export default function ProfilePage() {
  const me = useMe();
  const { setLang, locale } = useI18n();
  const refresh = useInvalidateMe();
  const g = useGet<{ xp: number; level: number; streak: number }>(["gamification", "summary"], "/gamification/summary");
  const [f, setF] = React.useState({ name: "", bio: "", avatar_url: "", timezone: "UTC", language: "ru", is_public: false });
  const [err, setErr] = React.useState("");
  React.useEffect(() => { if (me.data) { const p = me.data.profile; setF({ name: p.name, bio: p.bio, avatar_url: p.avatar_url ?? "", timezone: p.timezone, language: p.language, is_public: p.is_public }); } }, [me.data]);
  const save = useMut(() => patch("/profiles/me", { ...f, avatar_url: f.avatar_url || null }), { success: "Профиль сохранён", onSuccess: () => { setLang(f.language as Lang); refresh(); } });
  if (!me.data) return null;
  return (
    <div className="max-w-3xl">
      <PageHeader title="Профиль" />
      <div className="mb-4 grid grid-cols-3 gap-3"><Stat label="Уровень" value={g.data?.level ?? "—"} /><Stat label="XP" value={g.data?.xp ?? "—"} /><Stat label="С нами с" value={fmtDate(me.data.created_at, locale, { day: "numeric", month: "long", year: "numeric" })} /></div>
      <Card className="p-5">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (!f.name.trim()) return setErr("Введите имя"); if (f.avatar_url && !/^https?:\/\//.test(f.avatar_url)) return setErr("URL аватара должен начинаться с http(s)://"); setErr(""); save.mutate(); }}>
          <div className="flex items-center gap-4 sm:col-span-2">
            <div className="grid size-16 place-items-center overflow-hidden rounded-full bg-surface-2 text-xl font-semibold">{f.avatar_url ? <img src={f.avatar_url} alt="" className="size-full object-cover" /> : f.name.slice(0, 1).toUpperCase()}</div>
            <div className="text-sm"><div className="font-medium">{me.data.email}</div><div className="text-muted">{me.data.email_verified ? "Email подтверждён" : "Email не подтверждён"}</div></div>
          </div>
          <Field label="Имя"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Аватар (URL)"><Input value={f.avatar_url} onChange={(e) => setF({ ...f, avatar_url: e.target.value })} placeholder="https://…" /></Field>
          <Field label="Часовой пояс"><Select value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>{TZS.map((t) => <option key={t} value={t}>{t}</option>)}</Select></Field>
          <Field label="Язык"><Select value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}><option value="ru">Русский</option><option value="kk">Қазақша</option><option value="en">English</option></Select></Field>
          <Field label="О себе" className="sm:col-span-2"><Textarea value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Switch checked={f.is_public} onCheckedChange={(v) => setF({ ...f, is_public: v })} label="Публичный профиль (виден не только друзьям, при включённых социальных функциях)" /></div>
          {err && <p className="text-sm text-danger sm:col-span-2">{err}</p>}
          <div className="sm:col-span-2"><Button type="submit" loading={save.isPending}>Сохранить</Button></div>
        </form>
      </Card>
    </div>
  );
}
