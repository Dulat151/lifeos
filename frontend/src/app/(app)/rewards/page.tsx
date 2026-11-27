"use client";
import {
  Award, BookOpen, CalendarCheck, Check, CheckCircle2, Coins, Crown, Dumbbell, Flame, FolderCheck, Gem, Layers, ListChecks, Lock, Medal, Palette,
  Repeat, Rocket, ShoppingBag, Snowflake, Sparkles, Sprout, Swords, Target, Timer, Trophy, Zap,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { useI18n, useMe } from "@/components/providers";
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, PageHeader, Progress, ProgressRing, QueryState, Skeleton, Switch, Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui";
import { useGet, useMut } from "@/hooks/use-api";
import { post } from "@/lib/api";
import type { Achievement, GamSummary, Quest, ShopItem, Streaks } from "@/lib/types";
import { cn, fmtDate, fmtDateTime } from "@/lib/utils";

const ACH_ICON: Record<string, React.ElementType> = {
  "check-circle": CheckCircle2, "list-checks": ListChecks, repeat: Repeat, flame: Flame, target: Target, timer: Timer, "graduation-cap": BookOpen,
  layers: Layers, "book-open": BookOpen, book: BookOpen, dumbbell: Dumbbell, zap: Zap, medal: Medal, "calendar-check": CalendarCheck, "folder-check": FolderCheck,
};
const BADGE_ICON: Record<string, React.ElementType> = { sprout: Sprout, flame: Flame, rocket: Rocket, crown: Crown };
const REASON: Record<string, string> = {
  task_done: "Задача", habit_check: "Привычка", goal_completed: "Цель достигнута", milestone_completed: "Этап цели", focus_session: "Фокус-сессия",
  learning_session: "Обучение", flashcard_review: "Карточки", journal_entry: "Дневник", book_completed: "Книга прочитана", workout: "Тренировка",
  achievement: "Достижение", correction: "Отмена действия", quest: "Квест", challenge: "Челлендж", project_completed: "Проект завершён",
  daily_plan: "План дня", event_done: "Событие выполнено",
};

export default function RewardsPage() {
  const params = useSearchParams();
  const me = useMe();
  const summary = useGet<GamSummary>(["gamification", "summary"], "/gamification/summary");
  const [tab, setTab] = React.useState(params.get("tab") ?? "quests");
  if (me.data?.settings.gamification_enabled === false) {
    return (
      <div>
        <PageHeader icon={<Trophy />} title="Награды и квесты" />
        <EmptyState icon={<Trophy />} title="Геймификация выключена" text="XP, уровни, квесты и монеты не начисляются. Включить можно в настройках."
          action={<Button asChild><Link href="/settings?section=gamification">Открыть настройки</Link></Button>} />
      </div>
    );
  }
  const s = summary.data;
  const pct = s ? ((s.xp - s.level_xp_start) / Math.max(1, s.level_xp_next - s.level_xp_start)) * 100 : 0;
  return (
    <div>
      <PageHeader icon={<Trophy />} title="Награды и квесты" subtitle="Опыт и монеты — только за реальные действия. Без платежей и случайных наград." />
      {s ? (
        <Card className="relative mb-6 overflow-hidden p-5">
          <div className="pointer-events-none absolute -left-10 -top-20 size-60 rounded-full bg-accent/15 blur-3xl" />
          <div className="relative flex flex-wrap items-center gap-6">
            <ProgressRing value={pct} size={88} stroke={8} label="Прогресс уровня"><div><div className="text-[10px] uppercase tracking-wider text-muted">ур.</div><div className="text-2xl font-bold leading-none">{s.level}</div></div></ProgressRing>
            <div className="min-w-48 flex-1">
              <div className="text-lg font-semibold">Уровень {s.level}</div>
              <div className="text-sm text-muted">{s.xp} XP всего · ещё {s.level_xp_next - s.xp} XP до уровня {s.level + 1}</div>
              <Progress className="mt-3 max-w-md" value={pct} size="md" />
              <p className="mt-2 text-xs text-faint">Каждый следующий уровень требует больше опыта: 100, 300, 600, 1000 XP…</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-surface-2 px-4 py-3 text-center"><Coins className="mx-auto size-5 text-warning" /><div className="mt-1 text-xl font-semibold tabular-nums">{s.coins}</div><div className="text-[11px] text-muted">монет</div></div>
              <div className="rounded-2xl bg-surface-2 px-4 py-3 text-center"><Flame className="mx-auto size-5 text-warning" /><div className="mt-1 text-xl font-semibold tabular-nums">{s.streak}</div><div className="text-[11px] text-muted">дней серии</div></div>
            </div>
          </div>
        </Card>
      ) : <Skeleton className="mb-6 h-36" />}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-5">
          <TabsTrigger value="quests"><Swords className="mr-1.5 inline size-3.5" />Квесты</TabsTrigger>
          <TabsTrigger value="streaks"><Flame className="mr-1.5 inline size-3.5" />Серии</TabsTrigger>
          <TabsTrigger value="shop"><ShoppingBag className="mr-1.5 inline size-3.5" />Магазин</TabsTrigger>
          <TabsTrigger value="achievements"><Award className="mr-1.5 inline size-3.5" />Достижения</TabsTrigger>
          <TabsTrigger value="history">История</TabsTrigger>
        </TabsList>
        <TabsContent value="quests"><QuestsTab /></TabsContent>
        <TabsContent value="streaks"><StreaksTab /></TabsContent>
        <TabsContent value="shop"><ShopTab /></TabsContent>
        <TabsContent value="achievements"><AchievementsTab /></TabsContent>
        <TabsContent value="history"><HistoryTab rules={s?.rules} bonus={s?.task_bonus} /></TabsContent>
      </Tabs>
    </div>
  );
}

function QuestsTab() {
  const { locale } = useI18n();
  const q = useGet<{ quests: Quest[] }>(["quests"], "/quests");
  const challenges = useGet<{ id: string; title: string; metric: string; target: number; value: number; end_date: string; completed_at: string | null; xp_reward: number }[]>(["challenges"], "/challenges");
  const claim = useMut((code: string) => post<{ xp: number; coins: number; title: string }>(`/quests/${code}/claim`), { invalidate: [["quests"]], success: "Награда получена" });
  const Row = ({ qq }: { qq: Quest }) => (
    <Card className={cn("flex items-center gap-4 p-4", qq.claimed && "opacity-60")}>
      <div className={cn("grid size-10 shrink-0 place-items-center rounded-xl", qq.completed ? "bg-success/15 text-success" : "bg-surface-2 text-muted")}>
        {qq.claimed ? <Check className="size-5" /> : <Swords className="size-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{qq.title}</span><Badge>{qq.category_label}</Badge></div>
        <div className="mt-2 flex items-center gap-3"><Progress value={(qq.progress / qq.target) * 100} size="xs" color={qq.completed ? "var(--success)" : undefined} className="max-w-56" /><span className="text-xs tabular-nums text-muted">{qq.progress}/{qq.target}</span></div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="flex items-center gap-2 text-xs font-medium"><span className="text-accent">+{qq.xp} XP</span><span className="flex items-center gap-0.5 text-warning"><Coins className="size-3" />{qq.coins}</span></div>
        {qq.completed && !qq.claimed ? <Button size="xs" onClick={() => claim.mutate(qq.code)} loading={claim.isPending && claim.variables === qq.code}>Забрать</Button>
          : <span className="text-[11px] text-faint">{qq.claimed ? "получено" : `до ${fmtDate(qq.resets_on, locale, { weekday: "short", day: "numeric", month: "short" })}`}</span>}
      </div>
    </Card>
  );
  return (
    <QueryState q={q} skeleton={<div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>}>
      {(d) => (
        <div className="grid gap-6 xl:grid-cols-2">
          <section><h2 className="mb-1 font-semibold">Ежедневные</h2><p className="mb-3 text-xs text-muted">Обновляются каждый день. Прогресс считается автоматически.</p>
            <div className="space-y-2.5">{d.quests.filter((x) => x.period === "daily").map((qq) => <Row key={qq.code} qq={qq} />)}</div></section>
          <section><h2 className="mb-1 font-semibold">Еженедельные</h2><p className="mb-3 text-xs text-muted">С понедельника по воскресенье.</p>
            <div className="space-y-2.5">{d.quests.filter((x) => x.period === "weekly").map((qq) => <Row key={qq.code} qq={qq} />)}</div>
            <h2 className="mb-1 mt-6 font-semibold">Личные квесты</h2><p className="mb-3 text-xs text-muted">Свои челленджи с целью и сроком — например, «10 тренировок за месяц».</p>
            {challenges.data?.length ? <div className="space-y-2.5">{challenges.data.slice(0, 5).map((c) => (
              <Card key={c.id} className="p-4"><div className="flex items-center justify-between gap-2"><span className="font-medium">{c.title}</span>{c.completed_at ? <Badge tone="success">выполнен</Badge> : <span className="text-xs text-muted">до {fmtDate(c.end_date, locale)}</span>}</div>
                <div className="mt-2 flex items-center gap-3"><Progress value={(c.value / c.target) * 100} size="xs" className="max-w-56" /><span className="text-xs tabular-nums text-muted">{c.value}/{c.target} · +{c.xp_reward} XP</span></div></Card>))}</div>
              : <Card className="p-4 text-sm text-muted">Пока нет. <Link href="/challenges" className="text-accent hover:underline">Создать личный квест</Link></Card>}
          </section>
        </div>
      )}
    </QueryState>
  );
}

function StreaksTab() {
  const { locale } = useI18n();
  const q = useGet<Streaks>(["streaks"], "/streaks");
  const restore = useMut(() => post("/streaks/restore"), { invalidate: [["streaks"]], success: "Серия сохранена" });
  return (
    <QueryState q={q} skeleton={<Skeleton className="h-80" />}>
      {(s) => {
        const set = new Set(s.calendar);
        const frozen = new Set(s.frozen_days);
        const today = new Date();
        const days = Array.from({ length: 7 * 26 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() - (7 * 26 - 1 - i)); return d; });
        const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const kinds = [
          { k: "daily", label: "Активные дни", hint: "Хотя бы одна задача, привычка или фокус-сессия", icon: Flame, data: s.daily },
          { k: "habits", label: "Привычки", hint: "Дни с выполненной привычкой", icon: Repeat, data: s.habits },
          { k: "productive", label: "Продуктивные дни", hint: "3+ задачи, или 60+ мин фокуса, или 30+ мин учёбы", icon: Zap, data: s.productive },
          { k: "weeks", label: "Успешные недели", hint: "Недели с 4+ активными днями", icon: CalendarCheck, data: s.weeks },
        ];
        return (
          <div className="space-y-5">
            {s.restore?.missed_yesterday && (
              <Card className="flex flex-wrap items-center gap-3 border-info/30 bg-info/5 p-4">
                <Snowflake className="size-5 text-info" />
                <div className="flex-1 text-sm">Вчерашний день пропущен. {s.restore.free_available ? "Бесплатное восстановление доступно (раз в неделю)." : s.restore.freezes ? `Есть заморозок: ${s.restore.freezes}.` : "Заморозку можно купить в магазине."}</div>
                <Button size="sm" variant="outline" disabled={!s.restore.free_available && !s.restore.freezes} loading={restore.isPending} onClick={() => restore.mutate()}>Сохранить серию</Button>
              </Card>
            )}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {kinds.map(({ k, label, hint, icon: I, data }) => (
                <Card key={k} className="p-4">
                  <div className="flex items-center gap-2 text-sm font-medium"><I className={cn("size-4", data.current ? "text-warning" : "text-faint")} />{label}</div>
                  <div className="mt-2 flex items-baseline gap-1.5"><span className="text-3xl font-semibold tabular-nums">{data.current}</span><span className="text-xs text-muted">{k === "weeks" ? "нед." : "дн."} сейчас</span></div>
                  <div className="mt-1 text-xs text-muted">Рекорд: {data.best}</div>
                  <p className="mt-2 text-[11px] text-faint">{hint}</p>
                </Card>
              ))}
            </div>
            <Card>
              <CardHeader title="Активность за полгода" icon={<Flame />} subtitle={s.today_active ? "Сегодня уже есть активность" : "Сегодня активности пока нет"} />
              <CardBody>
                <div className="overflow-x-auto pb-1">
                  <div className="grid w-max grid-flow-col grid-rows-7 gap-[3px]">
                    {days.map((d) => {
                      const k = iso(d);
                      return <div key={k} title={`${fmtDate(k, locale, { day: "numeric", month: "short" })}${frozen.has(k) ? " — заморозка" : set.has(k) ? " — активный день" : ""}`}
                        className={cn("size-3 rounded-[3px]", frozen.has(k) ? "bg-info/70" : set.has(k) ? "bg-accent" : "bg-surface-3/70")} />;
                    })}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-4 text-[11px] text-muted">
                  <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-surface-3" />нет активности</span>
                  <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-accent" />активный день</span>
                  <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-info/70" />заморозка</span>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="История серий" icon={<Medal />} />
              <CardBody>{s.history.length ? <ul className="divide-y divide-border">{s.history.map((h) => (
                <li key={h.start} className="flex items-center justify-between py-2 text-sm"><span>{fmtDate(h.start, locale, { day: "numeric", month: "short" })} — {fmtDate(h.end, locale, { day: "numeric", month: "short", year: "numeric" })}</span>
                  <span className="flex items-center gap-1 font-medium"><Flame className="size-3.5 text-warning" />{h.length} дн.</span></li>))}</ul>
                : <p className="text-sm text-muted">Серии от двух дней подряд появятся здесь.</p>}</CardBody>
            </Card>
          </div>
        );
      }}
    </QueryState>
  );
}

function ShopTab() {
  const q = useGet<{ coins: number; items: ShopItem[] }>(["shop"], "/shop");
  const buy = useMut((code: string) => post(`/shop/${code}/buy`), { invalidate: [["shop"], ["me"], ["streaks"]], success: "Куплено!" });
  const equip = useMut((v: { kind: string; code: string | null }) => post("/shop/equip", v), { invalidate: [["shop"], ["me"]] });
  const groups: { kind: ShopItem["kind"]; title: string; hint: string }[] = [
    { kind: "theme", title: "Темы оформления", hint: "Меняют акцентный цвет всего интерфейса" },
    { kind: "badge", title: "Значки профиля", hint: "Показываются рядом с вашим именем" },
    { kind: "frame", title: "Рамки аватара", hint: "Косметика для профиля" },
    { kind: "consumable", title: "Полезное", hint: "Помогают не терять серию" },
  ];
  return (
    <QueryState q={q} skeleton={<Skeleton className="h-96" />}>
      {(d) => (
        <div className="space-y-7">
          <p className="flex items-center gap-2 text-sm text-muted"><Coins className="size-4 text-warning" />У вас <b className="text-text">{d.coins}</b> монет. Монеты начисляются вместе с XP (1 монета за 5 XP) и за квесты.</p>
          {groups.map((g) => (
            <section key={g.kind}>
              <h2 className="font-semibold">{g.title}</h2><p className="mb-3 text-xs text-muted">{g.hint}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {d.items.filter((i) => i.kind === g.kind).map((it) => {
                  const Icon = it.kind === "badge" ? BADGE_ICON[it.value ?? ""] ?? Gem : it.kind === "theme" ? Palette : it.kind === "frame" ? Sparkles : Snowflake;
                  const owned = it.owned > 0;
                  const canBuy = it.kind === "consumable" ? it.owned < (it.max ?? 99) : !owned;
                  return (
                    <Card key={it.code} className={cn("flex flex-col p-4", it.equipped && "border-accent ring-1 ring-accent/40")}>
                      <div className="flex items-start gap-3">
                        <span className="grid size-11 shrink-0 place-items-center rounded-2xl" style={{ background: it.kind === "theme" ? `color-mix(in srgb, ${it.value} 20%, transparent)` : "var(--surface-2)", color: it.kind === "theme" ? it.value ?? undefined : undefined }}>
                          {it.kind === "theme" ? <span className="size-5 rounded-full" style={{ background: it.value ?? undefined }} /> : <Icon className={cn("size-5", it.kind === "frame" && it.value === "gradient" && "text-accent")} />}
                        </span>
                        <div className="min-w-0"><div className="text-sm font-medium">{it.title}</div><div className="text-xs text-muted">{it.description}</div></div>
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1 text-sm font-semibold text-warning"><Coins className="size-4" />{it.price}</span>
                        {it.kind === "consumable" ? (
                          <div className="flex items-center gap-2"><span className="text-xs text-muted">есть: {it.owned}</span>
                            <Button size="xs" disabled={!canBuy || d.coins < it.price} onClick={() => buy.mutate(it.code)} loading={buy.isPending && buy.variables === it.code}>Купить</Button></div>
                        ) : owned ? (
                          it.equipped ? <Button size="xs" variant="outline" onClick={() => equip.mutate({ kind: it.kind, code: null })}>Снять</Button>
                            : <Button size="xs" variant="soft" onClick={() => equip.mutate({ kind: it.kind, code: it.code })}>Применить</Button>
                        ) : (
                          <Button size="xs" disabled={d.coins < it.price} onClick={() => buy.mutate(it.code)} loading={buy.isPending && buy.variables === it.code}>
                            {d.coins < it.price ? <><Lock />Мало монет</> : "Купить"}</Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </QueryState>
  );
}

function AchievementsTab() {
  const { locale, lang } = useI18n();
  const me = useMe();
  const q = useGet<(Achievement & { title_en: string })[]>(["gamification", "achievements"], "/achievements");
  const vis = useMut((v: { code: string; is_public: boolean }) => post(`/achievements/${v.code}/visibility`, { is_public: v.is_public }), { invalidate: [["gamification"]] });
  return (
    <QueryState q={q} skeleton={<Skeleton className="h-96" />}>
      {(list) => {
        const unlocked = list.filter((a) => a.unlocked_at).length;
        const sorted = [...list].sort((a, b) => Number(!!b.unlocked_at) - Number(!!a.unlocked_at) || b.progress / b.target - a.progress / a.target);
        return (
          <div>
            <p className="mb-4 text-sm text-muted">Получено {unlocked} из {list.length}. Условия проверяются автоматически по вашим данным, награда — XP и монеты.</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{sorted.map((a) => {
              const I = ACH_ICON[a.icon] ?? Award;
              return (
                <Card key={a.id} className={cn("p-4", !a.unlocked_at && "opacity-75")}>
                  <div className="flex items-start gap-3">
                    <div className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", a.unlocked_at ? "bg-accent text-accent-fg shadow-[var(--glow)]" : "bg-surface-2 text-faint")}>{a.unlocked_at ? <I className="size-5" /> : <Lock className="size-5" />}</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{lang === "en" ? a.title_en : a.title}</div>
                      <div className="text-xs text-muted">{a.description}</div>
                      <div className="mt-1 text-xs"><span className="text-accent">+{a.xp_reward} XP</span> <span className="text-warning">· +{Math.max(1, Math.floor(a.xp_reward / 5))} монет</span></div>
                      {!a.unlocked_at && <><Progress className="mt-2" value={(a.progress / a.target) * 100} size="xs" /><div className="mt-1 text-[11px] tabular-nums text-muted">{a.progress} / {a.target}</div></>}
                      {a.unlocked_at && <div className="mt-1 text-[11px] text-success">Получено {fmtDate(a.unlocked_at, locale)}</div>}
                      {a.unlocked_at && me.data?.settings.social_enabled && <div className="mt-2"><Switch checked={a.is_public} onCheckedChange={(v) => vis.mutate({ code: a.code, is_public: v })} label="Показывать друзьям" /></div>}
                    </div>
                  </div>
                </Card>
              );
            })}</div>
          </div>
        );
      }}
    </QueryState>
  );
}

function HistoryTab({ rules, bonus }: { rules?: Record<string, number>; bonus?: Record<string, number> }) {
  const { locale } = useI18n();
  const q = useGet<{ id: string; amount: number; reason: string; at: string }[]>(["gamification", "xp-history"], "/gamification/xp-history?limit=100");
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <Card>
        <CardHeader title="История опыта" icon={<Sparkles />} />
        <CardBody>
          <QueryState q={q} empty={<p className="py-6 text-center text-sm text-muted">Опыт появится после первой выполненной задачи или привычки.</p>}>
            {(rows) => <ul className="divide-y divide-border">{rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm"><span>{REASON[r.reason] ?? r.reason}</span>
                <span className="flex items-center gap-3"><span className="text-xs text-muted">{fmtDateTime(r.at, locale)}</span><span className={cn("w-14 text-right font-medium tabular-nums", r.amount > 0 ? "text-accent" : "text-danger")}>{r.amount > 0 ? "+" : ""}{r.amount}</span></span></li>))}</ul>}
          </QueryState>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Сколько опыта за что" icon={<Trophy />} />
        <CardBody className="space-y-1.5 text-sm">
          {rules && Object.entries(rules).map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-muted">{REASON[k] ?? k}</span><span className="font-medium">+{v}</span></div>)}
          {bonus && <div className="mt-3 rounded-xl bg-surface-2 p-3 text-xs text-muted">Бонусы за сложные задачи: срочный приоритет +{bonus.priority_1} XP, оценка от 2 часов +{bonus.long_task} XP.</div>}
        </CardBody>
      </Card>
    </div>
  );
}
