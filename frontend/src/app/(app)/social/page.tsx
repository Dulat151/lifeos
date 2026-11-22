"use client";
import { Ban, Check, Plus, Share2, UserMinus, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Badge, Button, Card, CardBody, CardHeader, Dialog, EmptyState, Field, Input, PageHeader, Progress, Select, Textarea, useToast } from "@/components/ui";
import { useI18n, useMe } from "@/components/providers";
import { useGet, useMut } from "@/hooks/use-api";
import { del, post } from "@/lib/api";
import type { Goal } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

type Friend = { id: string; user_id: string; name: string; status: string; direction: string };

export default function SocialPage() {
  const me = useMe();
  const enabled = me.data?.settings.social_enabled;
  if (me.data && !enabled) {
    return (
      <div>
        <PageHeader title="Друзья" />
        <EmptyState icon={<Users className="size-8" />} title="Социальные функции выключены" text="Друзья, совместные цели, групповые челленджи и публичные достижения. Включаются в настройках приватности."
          action={<Button asChild><Link href="/settings#privacy">Открыть настройки</Link></Button>} />
      </div>
    );
  }
  return <SocialInner />;
}

function SocialInner() {
  const { locale } = useI18n();
  const toast = useToast();
  const friends = useGet<Friend[]>(["social", "friends"], "/social/friends");
  const groups = useGet<{ id: string; name: string; description: string; role: string; members: number }[]>(["social", "groups"], "/social/groups");
  const shared = useGet<{ id: string; title: string; progress: number; owner: string }[]>(["social", "shared"], "/social/goals/shared-with-me");
  const feed = useGet<{ name: string; achievement: string; at: string }[]>(["social", "feed"], "/social/feed");
  const goals = useGet<Goal[]>(["goals", "active"], "/goals?status=active");
  const [email, setEmail] = React.useState("");
  const [groupOpen, setGroupOpen] = React.useState(false);
  const [g, setG] = React.useState({ name: "", description: "" });
  const [share, setShare] = React.useState<Friend | null>(null);
  const [shareGoal, setShareGoal] = React.useState("");
  const [addTo, setAddTo] = React.useState<Record<string, string>>({});
  const inv = { invalidate: [["social"]] };
  const request = useMut(() => post("/social/friends/request", { email }), { ...inv, onSuccess: () => { setEmail(""); toast("Если пользователь существует и открыт для друзей, он получит запрос"); } });
  const accept = useMut((id: string) => post(`/social/friends/${id}/accept`), { ...inv, success: "Запрос принят" });
  const block = useMut((id: string) => post(`/social/friends/${id}/block`), { ...inv, success: "Пользователь заблокирован" });
  const remove = useMut((id: string) => del(`/social/friends/${id}`), inv);
  const createGroup = useMut(() => post("/social/groups", g), { ...inv, success: "Группа создана", onSuccess: () => { setGroupOpen(false); setG({ name: "", description: "" }); } });
  const addMember = useMut((v: { gid: string; uid: string }) => post(`/social/groups/${v.gid}/members`, { user_id: v.uid }), { ...inv, success: "Участник добавлен" });
  const leave = useMut((gid: string) => del(`/social/groups/${gid}/members/me`), inv);
  const doShare = useMut(() => post(`/social/goals/${shareGoal}/share`, { user_id: share!.user_id }), { ...inv, success: "Цель открыта другу", onSuccess: () => setShare(null) });
  const accepted = friends.data?.filter((f) => f.status === "accepted") ?? [];
  return (
    <div>
      <PageHeader title="Друзья" subtitle="Делитесь только тем, чем решили поделиться: публичными достижениями и выбранными целями" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="Друзья и запросы" /><CardBody>
          <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (email.includes("@")) request.mutate(); }}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email друга" /><Button type="submit" loading={request.isPending}><UserPlus />Добавить</Button></form>
          {friends.data?.length === 0 && <p className="text-sm text-muted">Пока никого</p>}
          <ul className="space-y-2">{friends.data?.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-sm">
              {f.status === "accepted" ? <Link href={`/social/${f.user_id}`} className="flex-1 text-accent">{f.name}</Link> : <span className="flex-1">{f.name}</span>}
              {f.status === "pending" && <Badge>{f.direction === "incoming" ? "входящий" : "отправлен"}</Badge>}{f.status === "blocked" && <Badge tone="danger">заблокирован</Badge>}
              {f.status === "pending" && f.direction === "incoming" && <Button size="sm" variant="secondary" onClick={() => accept.mutate(f.id)}><Check />Принять</Button>}
              {f.status === "accepted" && <Button size="icon-sm" variant="ghost" onClick={() => setShare(f)} aria-label="Поделиться целью"><Share2 /></Button>}
              {f.status !== "blocked" && <Button size="icon-sm" variant="ghost" onClick={() => block.mutate(f.id)} aria-label="Заблокировать"><Ban /></Button>}
              <Button size="icon-sm" variant="ghost" onClick={() => remove.mutate(f.id)} aria-label="Удалить"><UserMinus /></Button>
            </li>))}</ul>
        </CardBody></Card>
        <Card><CardHeader title="Группы" action={<Button size="sm" variant="ghost" onClick={() => setGroupOpen(true)}><Plus />Группа</Button>} /><CardBody>
          {groups.data?.length === 0 && <p className="text-sm text-muted">Группы нужны для групповых челленджей и командных привычек</p>}
          <ul className="space-y-3">{groups.data?.map((gr) => (
            <li key={gr.id} className="text-sm"><div className="flex items-center gap-2"><span className="flex-1 font-medium">{gr.name}</span><Badge>{gr.members} уч.</Badge>
              {gr.role !== "owner" && <Button size="sm" variant="ghost" onClick={() => leave.mutate(gr.id)}>Выйти</Button>}</div>
              {gr.role === "owner" && accepted.length > 0 && <div className="mt-1 flex gap-2"><Select className="h-8" value={addTo[gr.id] ?? ""} onChange={(e) => setAddTo({ ...addTo, [gr.id]: e.target.value })}>
                <option value="">Добавить друга…</option>{accepted.map((f) => <option key={f.user_id} value={f.user_id}>{f.name}</option>)}</Select>
                <Button size="sm" variant="secondary" disabled={!addTo[gr.id]} onClick={() => addMember.mutate({ gid: gr.id, uid: addTo[gr.id] })}>Добавить</Button></div>}
            </li>))}</ul>
          <p className="mt-3 text-xs text-muted">Групповой челлендж создаётся на странице <Link href="/challenges" className="text-accent">Челленджи</Link>.</p>
        </CardBody></Card>
        <Card><CardHeader title="Цели, которыми поделились со мной" /><CardBody>
          {shared.data?.length === 0 && <p className="text-sm text-muted">Пока нет</p>}
          {shared.data?.map((s) => <div key={s.id} className="mb-3"><div className="mb-1 flex justify-between text-sm"><span>{s.title} <span className="text-muted">· {s.owner}</span></span><span>{s.progress}%</span></div><Progress value={s.progress} /></div>)}
        </CardBody></Card>
        <Card><CardHeader title="Лента достижений друзей" /><CardBody>
          {feed.data?.length === 0 && <p className="text-sm text-muted">Друзья ещё не открыли достижения</p>}
          <ul className="space-y-1 text-sm">{feed.data?.map((f, i) => <li key={i}><b>{f.name}</b> получил(а) «{f.achievement}» <span className="text-xs text-muted">{fmtDate(f.at, locale)}</span></li>)}</ul>
        </CardBody></Card>
      </div>
      <Dialog open={groupOpen} onOpenChange={setGroupOpen} title="Новая группа" footer={<Button disabled={!g.name.trim()} onClick={() => createGroup.mutate()} loading={createGroup.isPending}>Создать</Button>}>
        <div className="space-y-3"><Field label="Название"><Input value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} /></Field>
          <Field label="Описание"><Textarea value={g.description} onChange={(e) => setG({ ...g, description: e.target.value })} /></Field></div>
      </Dialog>
      <Dialog open={!!share} onOpenChange={(o) => !o && setShare(null)} title={`Поделиться целью с ${share?.name ?? ""}`} description="Друг увидит название и прогресс цели." footer={<Button disabled={!shareGoal} onClick={() => doShare.mutate()} loading={doShare.isPending}>Поделиться</Button>}>
        <Select value={shareGoal} onChange={(e) => setShareGoal(e.target.value)}><option value="">Выберите цель…</option>{goals.data?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select>
      </Dialog>
    </div>
  );
}
