"use client";
import { ArrowLeft, Award } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, PageHeader, QueryState } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { useGet } from "@/hooks/use-api";
import { fmtDate } from "@/lib/utils";

export default function PublicProfile() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useI18n();
  const q = useGet<{ name: string; bio: string; avatar_url: string | null; level: number; achievements: { title: string; at: string }[] }>(["social", "profile", id], `/social/users/${id}/profile`);
  return (
    <div>
      <Link href="/social" className="mb-3 inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft className="size-4" />Друзья</Link>
      <QueryState q={q}>{(p) => (
        <>
          <PageHeader title={p.name} subtitle={`Уровень ${p.level}${p.bio ? ` · ${p.bio}` : ""}`} />
          <h2 className="mb-2 text-sm font-semibold">Публичные достижения</h2>
          {p.achievements.length === 0 && <p className="text-sm text-muted">Нет публичных достижений</p>}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{p.achievements.map((a) => <Card key={a.title} className="flex items-center gap-3 p-3"><Award className="size-5 text-accent" /><span className="flex-1 text-sm">{a.title}</span><span className="text-xs text-muted">{fmtDate(a.at, locale)}</span></Card>)}</div>
        </>
      )}</QueryState>
    </div>
  );
}
