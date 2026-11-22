"use client";
import { ArrowLeft, Pencil, Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import * as React from "react";
import { BarsChart } from "@/components/charts";
import { EntityDialog, type FieldDef } from "@/components/entity";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, PageHeader, QueryState, Select, Stat } from "@/components/ui";
import { useI18n } from "@/components/providers";
import { useGet, useMut } from "@/hooks/use-api";
import { del, post } from "@/lib/api";
import type { Card as FCard, Deck } from "@/lib/types";
import { cn, fmtDate } from "@/lib/utils";

const DECK_FIELDS: FieldDef[] = [
  { name: "title", label: "Название", required: true, full: true }, { name: "new_cards_per_day", label: "Новых карточек в день", type: "number", min: 0, max: 1000, default: 20 },
  { name: "description", label: "Описание", type: "textarea" },
];
const CARD_FIELDS: FieldDef[] = [
  { name: "front", label: "Вопрос (лицевая сторона)", type: "textarea", required: true }, { name: "back", label: "Ответ (обратная сторона)", type: "textarea", required: true },
  { name: "tags", label: "Теги", type: "tags" },
];
const STAGE: Record<string, [string, "neutral" | "accent" | "warning" | "success"]> = { new: ["Новая", "neutral"], learning: ["Изучается", "warning"], review: ["Повторение", "accent"], mastered: ["Выучена", "success"] };
const GRADES = [[0, "Не помню"], [2, "С трудом"], [3, "Трудно"], [4, "Хорошо"], [5, "Легко"]] as const;

export default function FlashcardsPage() {
  const decks = useGet<Deck[]>(["flashcards", "decks"], "/flashcards/decks");
  const stats = useGet<{ reviews_30d: number; retention_30d: number; daily: { date: string; reviews: number; correct: number }[] }>(["flashcards", "stats"], "/flashcards/stats");
  const [deck, setDeck] = React.useState<Deck | null>(null);
  const [study, setStudy] = React.useState<string | "all" | null>(null);
  const [creating, setCreating] = React.useState(false);
  const { locale } = useI18n();
  if (study) return <StudyMode deckId={study === "all" ? null : study} onExit={() => setStudy(null)} />;
  if (deck) return <DeckView deck={deck} onBack={() => setDeck(null)} onStudy={() => setStudy(deck.id)} />;
  const totalDue = decks.data?.reduce((a, d) => a + d.due_today, 0) ?? 0;
  return (
    <div>
      <PageHeader title="Карточки" subtitle="Интервальное повторение по алгоритму SM-2" actions={<>
        <Button variant="outline" disabled={!decks.data?.length} onClick={() => setStudy("all")}><Play />Повторить всё{totalDue ? ` (${totalDue})` : ""}</Button>
        <Button onClick={() => setCreating(true)}><Plus />Колода</Button></>} />
      {stats.data && (
        <div className="mb-5 grid gap-3 md:grid-cols-[1fr_1fr_2fr]">
          <Stat label="Повторений за 30 дней" value={stats.data.reviews_30d} /><Stat label="Удержание (оценка ≥3)" value={`${stats.data.retention_30d}%`} />
          <Card className="p-3"><BarsChart data={stats.data.daily.map((d) => ({ ...d, day: fmtDate(d.date, locale) }))} x="day" series={[{ key: "reviews", label: "Повторений" }, { key: "correct", label: "Верно" }]} height={110} /></Card>
        </div>
      )}
      <QueryState q={decks} empty={<EmptyState title="Колод нет" text="Создайте колоду или попросите AI-ассистента сгенерировать карточки по теме." action={<Button size="sm" onClick={() => setCreating(true)}><Plus />Создать колоду</Button>} />}>
        {(list) => (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{list.map((d) => (
            <Card key={d.id} className="cursor-pointer p-4 hover:border-accent/50" onClick={() => setDeck(d)}>
              <div className="mb-2 flex justify-between"><span className="font-medium">{d.title}</span><span className="text-xs text-muted">{d.total} карт.</span></div>
              <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
                <Badge tone="danger">К повтору: {d.due_today}</Badge><Badge>Новые: {d.new}</Badge><Badge tone="warning">Изучаются: {d.learning}</Badge>
                <Badge tone="accent">Повторение: {d.review}</Badge><Badge tone="success">Выучены: {d.mastered}</Badge>
              </div>
              <Button size="sm" className="w-full" onClick={(e) => { e.stopPropagation(); setStudy(d.id); }} disabled={!d.total}><Play />Учить</Button>
            </Card>))}</div>
        )}
      </QueryState>
      <EntityDialog open={creating} onOpenChange={setCreating} title="Новая колода" fields={DECK_FIELDS} endpoint="/flashcards/decks" invalidate={[["flashcards"]]} />
    </div>
  );
}

function DeckView({ deck, onBack, onStudy }: { deck: Deck; onBack: () => void; onStudy: () => void }) {
  const [stage, setStage] = React.useState("");
  const [q, setQ] = React.useState("");
  const key = ["flashcards", "cards", deck.id, stage, q];
  const cards = useGet<FCard[]>(key, `/flashcards/cards?deck_id=${deck.id}${stage ? `&stage=${stage}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<FCard | null>(null);
  const [editDeck, setEditDeck] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const removeCard = useMut((id: string) => del(`/flashcards/cards/${id}`), { invalidate: [["flashcards"]] });
  const removeDeck = useMut(() => del(`/flashcards/decks/${deck.id}`), { invalidate: [["flashcards"]], success: "Колода удалена", onSuccess: onBack });
  return (
    <div>
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft className="size-4" />Все колоды</button>
      <PageHeader title={deck.title} subtitle={deck.description} actions={<>
        <Button variant="ghost" size="icon" onClick={() => setEditDeck(true)} aria-label="Изменить колоду"><Pencil /></Button>
        <Button variant="ghost" size="icon" onClick={() => setConfirm(true)} aria-label="Удалить колоду"><Trash2 /></Button>
        <Button variant="outline" onClick={() => setAdding(true)}><Plus />Карточка</Button><Button onClick={onStudy}><Play />Учить</Button></>} />
      <div className="mb-3 flex gap-2"><Input className="max-w-xs" placeholder="Поиск…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select className="w-40" value={stage} onChange={(e) => setStage(e.target.value)}><option value="">Все</option>{Object.entries(STAGE).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></div>
      <QueryState q={cards} empty={<EmptyState title="Карточек нет" action={<Button size="sm" onClick={() => setAdding(true)}><Plus />Добавить</Button>} />}>
        {(list) => (
          <Card className="divide-y divide-border">{list.map((c) => (
            <div key={c.id} className="group flex items-center gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{c.front}</div><div className="truncate text-muted">{c.back}</div></div>
              <Badge tone={STAGE[c.stage][1]}>{STAGE[c.stage][0]}</Badge>
              <span className="w-24 text-right text-xs text-muted">{c.due_date ? `→ ${fmtDate(c.due_date)}` : "—"}</span>
              <Button size="icon-sm" variant="ghost" onClick={() => setEditing(c)} aria-label="Изменить"><Pencil /></Button>
              <Button size="icon-sm" variant="ghost" onClick={() => removeCard.mutate(c.id)} aria-label="Удалить"><Trash2 /></Button>
            </div>))}</Card>
        )}
      </QueryState>
      <EntityDialog open={adding} onOpenChange={setAdding} title="Новая карточка" fields={CARD_FIELDS} endpoint="/flashcards/cards" extra={{ deck_id: deck.id }} invalidate={[["flashcards"]]} />
      <EntityDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Карточка" fields={CARD_FIELDS} endpoint="/flashcards/cards" initial={editing as unknown as Record<string, unknown> & { id: string }} invalidate={[["flashcards"]]} />
      <EntityDialog open={editDeck} onOpenChange={setEditDeck} title="Колода" fields={DECK_FIELDS} endpoint="/flashcards/decks" initial={deck as unknown as Record<string, unknown> & { id: string }} invalidate={[["flashcards"]]} />
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Удалить колоду?" text="Карточки и история повторений будут удалены." onConfirm={() => removeDeck.mutate()} loading={removeDeck.isPending} />
    </div>
  );
}

function StudyMode({ deckId, onExit }: { deckId: string | null; onExit: () => void }) {
  const queue = useGet<FCard[]>(["flashcards", "study", deckId], `/flashcards/study${deckId ? `?deck_id=${deckId}` : ""}`);
  const [idx, setIdx] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const [done, setDone] = React.useState(0);
  const review = useMut((v: { id: string; grade: number }) => post(`/flashcards/cards/${v.id}/review`, { grade: v.grade }), {
    invalidate: [["flashcards", "decks"], ["flashcards", "stats"]], onSuccess: () => { setFlipped(false); setIdx((i) => i + 1); setDone((d) => d + 1); },
  });
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const card = queue.data?.[idx];
      if (!card) return;
      if (e.code === "Space") { e.preventDefault(); setFlipped(true); }
      if (flipped && ["1", "2", "3", "4", "5"].includes(e.key)) review.mutate({ id: card.id, grade: GRADES[Number(e.key) - 1][0] });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [queue.data, idx, flipped, review]);
  const card = queue.data?.[idx];
  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={onExit} className="mb-4 inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft className="size-4" />Завершить</button>
      <QueryState q={queue}>{(list) => !card ? (
        <EmptyState title={done ? `Готово! Повторено карточек: ${done}` : "На сегодня всё повторено"} text="Следующие повторения запланированы алгоритмом SM-2."
          action={<div className="flex gap-2"><Button variant="outline" onClick={() => { setIdx(0); setDone(0); queue.refetch(); }}><RotateCcw />Обновить</Button><Button onClick={onExit}>К колодам</Button></div>} />
      ) : (
        <div>
          <div className="mb-2 flex justify-between text-xs text-muted"><span>{idx + 1} / {list.length}</span><Badge tone={STAGE[card.stage][1]}>{STAGE[card.stage][0]}</Badge></div>
          <Card className={cn("grid min-h-64 cursor-pointer place-items-center p-8 text-center", flipped && "border-accent/50")} onClick={() => setFlipped(true)}>
            <div>
              <div className="whitespace-pre-wrap text-lg">{card.front}</div>
              {flipped && <><hr className="my-5 border-border" /><div className="whitespace-pre-wrap text-lg text-accent">{card.back}</div></>}
              {!flipped && <p className="mt-6 text-xs text-muted">Нажмите или Пробел, чтобы показать ответ</p>}
            </div>
          </Card>
          {flipped && (
            <div className="mt-4 grid grid-cols-5 gap-2">{GRADES.map(([g, l], i) => (
              <Button key={g} variant={g < 3 ? "outline" : "secondary"} onClick={() => review.mutate({ id: card.id, grade: g })} disabled={review.isPending}>
                <span className="flex flex-col"><span>{l}</span><span className="text-[10px] text-muted">{i + 1}</span></span></Button>))}</div>
          )}
        </div>
      )}</QueryState>
    </div>
  );
}
