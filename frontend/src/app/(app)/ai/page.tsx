"use client";
import { Bot, Check, MessageSquarePlus, Send, Settings, Trash2, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge, Button, Card, EmptyState, PageHeader, QueryState, Textarea } from "@/components/ui";
import { useGet, useMut } from "@/hooks/use-api";
import { ApiError, del, post } from "@/lib/api";
import { cn } from "@/lib/utils";

type Msg = { id: string; role: string; content: string; created_at: string };
type Action = { id: string; message_id: string | null; tool: string; arguments: Record<string, unknown>; status: string; error: string | null; result_entity_id: string | null };
type Conv = { conversation: { id: string; title: string }; messages: Msg[]; actions: Action[] };
const MODES: Record<string, string> = { chat: "Чат", plan_day: "План дня", plan_week: "План недели", analyze_goals: "Анализ целей", decompose_goal: "Декомпозиция цели", suggest_habits: "Предложить привычки",
  analyze_tasks: "Анализ задач", study_plan: "Учебный план", flashcards: "Сгенерировать карточки", quiz: "Тест", weekly_report: "Недельный отчёт", monthly_report: "Месячный отчёт", journal_help: "Помощь с дневником" };
const TOOLS: Record<string, string> = { create_task: "Создать задачу", create_habit: "Создать привычку", create_goal: "Создать цель", create_event: "Добавить событие", create_study_plan: "Создать учебный план", create_flashcards: "Создать карточки" };

export default function AIPage() {
  const status = useGet<{ enabled: boolean; configured: boolean; provider: string }>(["ai", "status"], "/ai/status");
  const convs = useGet<{ id: string; title: string; updated_at: string }[]>(["ai", "convs"], "/ai/conversations");
  const [cid, setCid] = React.useState<string | null>(null);
  const conv = useGet<Conv>(["ai", "conv", cid], cid ? `/ai/conversations/${cid}` : null);
  const [text, setText] = React.useState("");
  const [mode, setMode] = React.useState("chat");
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const bottom = React.useRef<HTMLDivElement>(null);
  const send = useMut((m: string) => post<{ conversation_id: string }>("/ai/chat", { message: m, mode, conversation_id: cid }), {
    invalidate: [["ai"]], onSuccess: (r) => { setCid(r.conversation_id); setPending(null); setError(""); },
  });
  React.useEffect(() => { if (send.error) { setError(send.error instanceof ApiError ? send.error.message : "Ошибка"); setPending(null); } }, [send.error]);
  const confirm = useMut((id: string) => post(`/ai/actions/${id}/confirm`), { invalidate: [["ai"], ["tasks"], ["habits"], ["goals"], ["calendar"], ["learning"], ["flashcards"]], success: "Действие выполнено" });
  const reject = useMut((id: string) => post(`/ai/actions/${id}/reject`), { invalidate: [["ai"]] });
  const remove = useMut((id: string) => del(`/ai/conversations/${id}`), { invalidate: [["ai"]], onSuccess: () => setCid(null) });
  React.useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [conv.data, pending]);
  const submit = () => { const m = text.trim(); if (!m || send.isPending) return; setPending(m); setText(""); send.mutate(m); };
  const s = status.data;
  return (
    <div>
      <PageHeader title="AI-ассистент" subtitle="Видит только разрешённые вами разделы. Любые изменения — только после вашего подтверждения." actions={<Button variant="ghost" size="sm" asChild><Link href="/settings#ai"><Settings />Настройки AI</Link></Button>} />
      {s && !s.enabled && <Card className="mb-4 p-4 text-sm">AI отключён в настройках. <Link href="/settings#ai" className="text-accent">Включить</Link></Card>}
      {s && s.enabled && !s.configured && (
        <Card className="mb-4 border-warning/40 p-4 text-sm">
          <b>AI-провайдер не подключён на сервере.</b> Администратору нужно задать <code>ANTHROPIC_API_KEY</code> (или <code>AI_PROVIDER=openai</code> и <code>OPENAI_API_KEY</code>) в файле <code>.env</code> backend и перезапустить сервер. Ключи хранятся только на сервере.
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <Card className="h-fit p-2">
          <Button variant="ghost" className="mb-1 w-full justify-start" onClick={() => setCid(null)}><MessageSquarePlus />Новый диалог</Button>
          {convs.data?.map((c) => (
            <div key={c.id} className={cn("group flex items-center rounded-md", cid === c.id && "bg-surface-2")}>
              <button className="flex-1 truncate px-2 py-1.5 text-left text-sm" onClick={() => setCid(c.id)}>{c.title}</button>
              <button className="p-1 opacity-0 group-hover:opacity-100" onClick={() => remove.mutate(c.id)} aria-label="Удалить диалог"><Trash2 className="size-3.5 text-muted" /></button>
            </div>))}
        </Card>
        <Card className="flex min-h-[70vh] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {!cid && !pending && <EmptyState icon={<Bot className="size-8" />} title="Чем помочь?" text="Выберите режим ниже: план дня, декомпозиция цели, учебный план, генерация карточек, отчёт за неделю…" />}
            {cid && <QueryState q={conv}>{(d) => (
              <>{d.messages.map((m) => (
                <div key={m.id}>
                  <div className={cn("max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm", m.role === "user" ? "ml-auto bg-accent text-accent-fg" : "bg-surface-2")}>
                    {m.role === "assistant" ? <div className="prose-note"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown></div> : <p className="whitespace-pre-wrap">{m.content}</p>}
                  </div>
                  {d.actions.filter((a) => a.message_id === m.id).map((a) => <ActionCard key={a.id} a={a} onConfirm={() => confirm.mutate(a.id)} onReject={() => reject.mutate(a.id)} />)}
                </div>))}</>
            )}</QueryState>}
            {pending && <><div className="ml-auto max-w-[85%] rounded-xl bg-accent px-3.5 py-2.5 text-sm text-accent-fg">{pending}</div><div className="text-sm text-muted">AI думает…</div></>}
            {error && <p className="text-sm text-danger" role="alert">{error}</p>}
            <div ref={bottom} />
          </div>
          <div className="border-t border-border p-3">
            <div className="mb-2 flex flex-wrap gap-1">{Object.entries(MODES).map(([k, v]) => <button key={k} onClick={() => setMode(k)} className={cn("rounded-full px-2.5 py-1 text-xs", mode === k ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted hover:text-text")}>{v}</button>)}</div>
            <div className="flex gap-2">
              <Textarea className="min-h-11" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Например: «Разбей цель выучить английский до B2 на этапы»"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} disabled={!s?.enabled} />
              <Button onClick={submit} loading={send.isPending} disabled={!s?.enabled || !text.trim()} aria-label="Отправить"><Send /></Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ActionCard({ a, onConfirm, onReject }: { a: Action; onConfirm: () => void; onReject: () => void }) {
  const args = a.arguments;
  return (
    <Card className="mt-2 max-w-[85%] border-accent/40 p-3 text-sm">
      <div className="mb-1 flex items-center gap-2"><Badge tone="accent">{TOOLS[a.tool] ?? a.tool}</Badge>
        <Badge tone={a.status === "applied" ? "success" : a.status === "failed" ? "danger" : "neutral"}>{{ pending: "ожидает подтверждения", applied: "выполнено", rejected: "отклонено", failed: "ошибка" }[a.status]}</Badge></div>
      <pre className="mb-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-surface-2 p-2 text-xs">{JSON.stringify(args, null, 2)}</pre>
      {a.error && <p className="mb-2 text-xs text-danger">{a.error}</p>}
      {a.status === "pending" && <div className="flex gap-2"><Button size="sm" onClick={onConfirm}><Check />Подтвердить</Button><Button size="sm" variant="ghost" onClick={onReject}><X />Отклонить</Button></div>}
    </Card>
  );
}

