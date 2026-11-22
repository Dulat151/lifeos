"use client";
import { Award, Lock } from "lucide-react";
import { Card, PageHeader, Progress, QueryState, Switch } from "@/components/ui";
import { useI18n, useMe } from "@/components/providers";
import { useGet, useMut } from "@/hooks/use-api";
import { post } from "@/lib/api";
import type { Achievement } from "@/lib/types";
import { cn, fmtDate } from "@/lib/utils";

export default function AchievementsPage() {
  const { locale, lang } = useI18n();
  const me = useMe();
  const q = useGet<(Achievement & { title_en: string })[]>(["gamification", "achievements"], "/achievements");
  const vis = useMut((v: { code: string; is_public: boolean }) => post(`/achievements/${v.code}/visibility`, { is_public: v.is_public }), { invalidate: [["gamification"]] });
  const unlocked = q.data?.filter((a) => a.unlocked_at).length ?? 0;
  return (
    <div>
      <PageHeader title="Достижения" subtitle={q.data ? `Получено ${unlocked} из ${q.data.length}. Условия проверяются по реальным данным.` : undefined} />
      <QueryState q={q}>{(list) => (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{list.map((a) => (
          <Card key={a.id} className={cn("p-4", !a.unlocked_at && "opacity-70")}>
            <div className="flex items-start gap-3">
              <div className={cn("grid size-11 shrink-0 place-items-center rounded-xl", a.unlocked_at ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted")}>{a.unlocked_at ? <Award className="size-5" /> : <Lock className="size-5" />}</div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{lang === "en" ? a.title_en : a.title}</div>
                <div className="text-xs text-muted">{a.description} · +{a.xp_reward} XP</div>
                <Progress className="mt-2" value={(a.progress / a.target) * 100} />
                <div className="mt-1 flex items-center justify-between text-xs text-muted"><span>{a.progress} / {a.target}</span>{a.unlocked_at && <span>{fmtDate(a.unlocked_at, locale)}</span>}</div>
                {a.unlocked_at && me.data?.settings.social_enabled && <div className="mt-2"><Switch checked={a.is_public} onCheckedChange={(v) => vis.mutate({ code: a.code, is_public: v })} label="Показывать друзьям" /></div>}
              </div>
            </div>
          </Card>))}</div>
      )}</QueryState>
    </div>
  );
}
