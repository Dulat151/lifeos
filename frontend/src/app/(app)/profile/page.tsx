"use client";
import { ProfileForm } from "@/components/profile-form";
import { useI18n, useMe } from "@/components/providers";
import { PageHeader, Stat } from "@/components/ui";
import { useGet } from "@/hooks/use-api";
import { fmtDate } from "@/lib/utils";

export default function ProfilePage() {
  const me = useMe();
  const { locale } = useI18n();
  const g = useGet<{ xp: number; level: number; streak: number }>(["gamification", "summary"], "/gamification/summary");
  if (!me.data) return null;
  return (
    <div className="max-w-3xl">
      <PageHeader title="Профиль" subtitle="Как вас видит LIFE OS и ваши друзья" />
      <div className="mb-4 grid grid-cols-3 gap-3"><Stat label="Уровень" value={g.data?.level ?? "—"} /><Stat label="XP" value={g.data?.xp ?? "—"} /><Stat label="С нами с" value={fmtDate(me.data.created_at, locale, { day: "numeric", month: "long", year: "numeric" })} /></div>
      <ProfileForm />
    </div>
  );
}
