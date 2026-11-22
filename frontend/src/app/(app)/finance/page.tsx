"use client";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { BarsChart } from "@/components/charts";
import { EntityDialog, EntityList, type FieldDef } from "@/components/entity";
import { Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, Input, PageHeader, Progress, QueryState, Select, Stat, Tabs, TabsContent, TabsList, TabsTrigger, useToast } from "@/components/ui";
import { useI18n, useMe } from "@/components/providers";
import { useGet, useMut } from "@/hooks/use-api";
import { del, post, qs } from "@/lib/api";
import type { Transaction } from "@/lib/types";
import { fmtDate, fmtMoney, isoDate } from "@/lib/utils";

type Report = { month: string; currency: string; income: string; expense: string; balance: string; savings_rate: number | null; by_category: { category: string; amount: string }[];
  budgets: { id: string; category: string; limit: string; spent: string; percent: number | null }[]; other_currencies: Record<string, { income: string; expense: string }>; trend: { month: string; income: string; expense: string }[] };
type Savings = { id: string; title: string; target_amount: string; saved_amount: string; currency: string; deadline: string | null; is_purchase_plan: boolean };
type Sub = { id: string; title: string; amount: string; currency: string; period: string; next_payment_on: string; is_active: boolean; category: string };
const CUR = ["KZT", "USD", "EUR", "RUB"].map((c) => ({ value: c, label: c }));

export default function FinancePage() {
  const { locale } = useI18n();
  const me = useMe();
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const cur = me.data?.settings.currency ?? "KZT";
  const [month, setMonth] = React.useState(() => isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [kind, setKind] = React.useState("");
  const [cat, setCat] = React.useState("");
  const [q, setQ] = React.useState("");
  const [txOpen, setTxOpen] = React.useState<Transaction | "new" | null>(params.get("new") === "1" ? "new" : null);
  const [deleting, setDeleting] = React.useState<Transaction | null>(null);
  const mEnd = (() => { const d = new Date(month + "T00:00:00"); return isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)); })();
  const report = useGet<Report>(["finance", "report", month], `/finance/report?month=${month}`);
  const txs = useGet<{ items: Transaction[]; total: number }>(["finance", "tx", month, kind, cat, q], `/finance/transactions${qs({ start: month, end: mEnd, kind, category: cat, q })}`);
  const savings = useGet<{ items: Savings[] }>(["finance", "savings"], "/finance/savings-goals");
  const cats = useGet<{ kind: string; category: string }[]>(["finance", "cats"], "/finance/categories");
  const remove = useMut((id: string) => del(`/finance/transactions/${id}`), { invalidate: [["finance"]], success: "Удалено", onSuccess: () => setDeleting(null) });
  const processSubs = useMut(() => post<{ created: number }>("/finance/subscriptions/process"), { invalidate: [["finance"]], onSuccess: (r) => toast(`Создано платежей: ${r.created}`) });
  const shift = (n: number) => { const d = new Date(month + "T00:00:00"); setMonth(isoDate(new Date(d.getFullYear(), d.getMonth() + n, 1))); };
  const txFields: FieldDef[] = [
    { name: "kind", label: "Тип", type: "select", required: true, default: "expense", options: [{ value: "expense", label: "Расход" }, { value: "income", label: "Доход" }] },
    { name: "amount", label: "Сумма", type: "number", required: true, min: 0.01, step: 0.01 },
    { name: "currency", label: "Валюта", type: "select", required: true, default: cur, options: CUR },
    { name: "occurred_on", label: "Дата", type: "date", required: true, default: isoDate() },
    { name: "category", label: "Категория", required: true, default: "other", placeholder: "еда, транспорт, зарплата…" },
    { name: "savings_goal_id", label: "В копилку", type: "select", nullable: true, options: savings.data?.items.map((s) => ({ value: s.id, label: s.title })) ?? [] },
    { name: "description", label: "Описание", full: true },
  ];
  const budgetFields: FieldDef[] = [{ name: "category", label: "Категория", required: true }, { name: "limit_amount", label: "Лимит", type: "number", required: true, min: 0 },
    { name: "currency", label: "Валюта", type: "select", required: true, default: cur, options: CUR }, { name: "month", label: "Месяц", type: "date", required: true, default: month }];
  const savingsFields: FieldDef[] = [{ name: "title", label: "Название", required: true, full: true }, { name: "target_amount", label: "Цель", type: "number", required: true, min: 0.01 },
    { name: "saved_amount", label: "Накоплено", type: "number", min: 0, default: 0 }, { name: "currency", label: "Валюта", type: "select", required: true, default: cur, options: CUR },
    { name: "deadline", label: "Срок", type: "date", nullable: true }, { name: "is_purchase_plan", label: "Планируемая покупка", type: "checkbox" }];
  const subFields: FieldDef[] = [{ name: "title", label: "Название", required: true }, { name: "amount", label: "Сумма", type: "number", required: true, min: 0.01, step: 0.01 },
    { name: "currency", label: "Валюта", type: "select", required: true, default: cur, options: CUR },
    { name: "period", label: "Период", type: "select", required: true, default: "monthly", options: [{ value: "weekly", label: "Еженедельно" }, { value: "monthly", label: "Ежемесячно" }, { value: "yearly", label: "Ежегодно" }] },
    { name: "next_payment_on", label: "Следующий платёж", type: "date", required: true, default: isoDate() }, { name: "category", label: "Категория", default: "subscriptions" },
    { name: "is_active", label: "Активна", type: "checkbox", default: true }];
  return (
    <div>
      <PageHeader title="Финансы" actions={<Button onClick={() => setTxOpen("new")}><Plus />Операция</Button>} />
      <div className="mb-4 flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => shift(-1)} aria-label="Предыдущий месяц"><ChevronLeft /></Button>
        <span className="w-40 text-center text-sm font-medium capitalize">{new Date(month + "T00:00:00").toLocaleDateString(locale, { month: "long", year: "numeric" })}</span>
        <Button size="icon" variant="ghost" onClick={() => shift(1)} aria-label="Следующий месяц"><ChevronRight /></Button>
      </div>
      <Tabs defaultValue="overview">
        <TabsList className="mb-4"><TabsTrigger value="overview">Обзор</TabsTrigger><TabsTrigger value="tx">Операции</TabsTrigger><TabsTrigger value="budgets">Бюджеты</TabsTrigger>
          <TabsTrigger value="savings">Накопления и покупки</TabsTrigger><TabsTrigger value="subs">Подписки</TabsTrigger></TabsList>
        <TabsContent value="overview">
          <QueryState q={report}>{(r) => (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Доходы" value={fmtMoney(r.income, r.currency, locale)} /><Stat label="Расходы" value={fmtMoney(r.expense, r.currency, locale)} />
                <Stat label="Баланс" value={<span className={Number(r.balance) < 0 ? "text-danger" : "text-success"}>{fmtMoney(r.balance, r.currency, locale)}</span>} />
                <Stat label="Норма сбережений" value={r.savings_rate === null ? "—" : `${r.savings_rate}%`} />
              </div>
              {Object.keys(r.other_currencies).length > 0 && <p className="mb-3 text-xs text-muted">Операции в других валютах (без конвертации): {Object.entries(r.other_currencies).map(([c, v]) => `${c}: +${v.income} / −${v.expense}`).join("; ")}</p>}
              <div className="grid gap-4 lg:grid-cols-2">
                <Card><CardHeader title="Динамика за 6 месяцев" /><CardBody><BarsChart data={r.trend.map((t) => ({ m: t.month, income: Number(t.income), expense: Number(t.expense) }))} x="m"
                  series={[{ key: "income", label: "Доходы", color: "var(--chart-2)" }, { key: "expense", label: "Расходы", color: "var(--danger)" }]} /></CardBody></Card>
                <Card><CardHeader title="Расходы по категориям" /><CardBody>
                  {r.by_category.length === 0 && <p className="text-sm text-muted">Расходов нет</p>}
                  <ul className="space-y-2">{r.by_category.map((c) => (
                    <li key={c.category}><div className="mb-1 flex justify-between text-sm"><span>{c.category}</span><span className="tabular-nums">{fmtMoney(c.amount, r.currency, locale)}</span></div>
                      <Progress value={(Number(c.amount) / Math.max(1, Number(r.expense))) * 100} /></li>))}</ul></CardBody></Card>
              </div>
            </>
          )}</QueryState>
        </TabsContent>
        <TabsContent value="tx">
          <div className="mb-3 flex flex-wrap gap-2">
            <Input className="max-w-xs" placeholder="Поиск…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select className="w-36" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Все</option><option value="income">Доходы</option><option value="expense">Расходы</option></Select>
            <Select className="w-44" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Все категории</option>{[...new Set(cats.data?.map((c) => c.category))].map((c) => <option key={c} value={c}>{c}</option>)}</Select>
          </div>
          <QueryState q={{ ...txs, data: txs.data?.items }} empty={<EmptyState title="Операций за месяц нет" action={<Button size="sm" onClick={() => setTxOpen("new")}><Plus />Добавить</Button>} />}>
            {(list) => (
              <Card className="divide-y divide-border">{list.map((t) => (
                <div key={t.id} className="group flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-20 text-xs text-muted">{fmtDate(t.occurred_on, locale)}</span>
                  <Badge>{t.category}</Badge>
                  <span className="flex-1 truncate">{t.description}{t.subscription_id && <span className="ml-1 text-xs text-muted">(подписка)</span>}</span>
                  <span className={t.kind === "income" ? "font-medium text-success" : "font-medium"}>{t.kind === "income" ? "+" : "−"}{fmtMoney(t.amount, t.currency, locale)}</span>
                  <Button size="icon-sm" variant="ghost" onClick={() => setTxOpen(t)} aria-label="Изменить"><Pencil /></Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => setDeleting(t)} aria-label="Удалить"><Trash2 /></Button>
                </div>))}</Card>
            )}
          </QueryState>
        </TabsContent>
        <TabsContent value="budgets">
          <EntityList<{ id: string; category: string; limit_amount: string; spent: string; currency: string }> endpoint="/finance/budgets" listPath={`/finance/budgets?month=${month}`} queryKey={["finance", "budgets", month]}
            fields={budgetFields} title="Бюджеты на месяц" emptyTitle="Бюджетов нет" emptyText="Задайте лимит по категории — расходы будут сравниваться автоматически." render={(b) => {
              const pct = (Number(b.spent) / Math.max(0.01, Number(b.limit_amount))) * 100;
              return <div className="pr-14"><div className="mb-1 flex justify-between text-sm"><span className="font-medium">{b.category}</span><span>{fmtMoney(b.spent, b.currency, locale)} / {fmtMoney(b.limit_amount, b.currency, locale)}</span></div>
                <Progress value={pct} color={pct > 100 ? "var(--danger)" : pct > 80 ? "var(--warning)" : undefined} /></div>;
            }} />
        </TabsContent>
        <TabsContent value="savings">
          <EntityList<Savings> endpoint="/finance/savings-goals" queryKey={["finance", "savings"]} fields={savingsFields} title="Финансовые цели" grid emptyTitle="Целей накопления нет"
            emptyText="Пополнения: создайте расход и выберите копилку в поле «В копилку»." render={(s) => (
              <div className="pr-14"><div className="flex items-center gap-2 font-medium">{s.title}{s.is_purchase_plan && <Badge tone="accent">покупка</Badge>}</div>
                <div className="my-2 text-sm">{fmtMoney(s.saved_amount, s.currency, locale)} из {fmtMoney(s.target_amount, s.currency, locale)}</div>
                <Progress value={(Number(s.saved_amount) / Number(s.target_amount)) * 100} />{s.deadline && <div className="mt-1 text-xs text-muted">до {fmtDate(s.deadline, locale)}</div>}</div>)} />
        </TabsContent>
        <TabsContent value="subs">
          <div className="mb-2 flex justify-end"><Button size="sm" variant="outline" onClick={() => processSubs.mutate()} loading={processSubs.isPending}>Провести наступившие платежи</Button></div>
          <EntityList<Sub> endpoint="/finance/subscriptions" queryKey={["finance", "subs"]} fields={subFields} title="Подписки и регулярные платежи" emptyTitle="Подписок нет"
            emptyText="Регулярные платежи автоматически создают расходы в дату списания (фоновая задача, раз в час)." render={(s) => (
              <div className="flex items-center gap-3 pr-14 text-sm"><span className="flex-1 font-medium">{s.title}</span><span>{fmtMoney(s.amount, s.currency, locale)}</span>
                <Badge>{{ weekly: "нед", monthly: "мес", yearly: "год" }[s.period]}</Badge><span className="text-xs text-muted">след.: {fmtDate(s.next_payment_on, locale)}</span>{!s.is_active && <Badge tone="warning">пауза</Badge>}</div>)} />
        </TabsContent>
      </Tabs>
      {txOpen && <EntityDialog open onOpenChange={(o) => { if (!o) { setTxOpen(null); if (params.get("new")) router.replace("/finance"); } }} title={txOpen === "new" ? "Новая операция" : "Операция"} fields={txFields}
        endpoint="/finance/transactions" initial={txOpen === "new" ? undefined : (txOpen as unknown as Record<string, unknown> & { id: string })} invalidate={[["finance"]]} />}
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Удалить операцию?" onConfirm={() => deleting && remove.mutate(deleting.id)} loading={remove.isPending} />
    </div>
  );
}
