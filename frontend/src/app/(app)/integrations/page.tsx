"use client";
import { Bell, CalendarDays, CheckSquare, FileText, HardDrive, Plug, StickyNote } from "lucide-react";
import * as React from "react";
import { CalendarIntegrations, NotesImport } from "@/components/integrations";
import { Badge, Card, PageHeader, QueryState, Skeleton } from "@/components/ui";
import { useGet } from "@/hooks/use-api";
import { cn } from "@/lib/utils";

type Entry = { id: string; name: string; category: string; status: "available" | "import" | "planned"; description: string; connected: boolean; configured: boolean };

const LOGO: Record<string, { bg: string; fg: string; icon: React.ElementType; letter: string }> = {
  google_calendar: { bg: "#e8f0fe", fg: "#1a73e8", icon: CalendarDays, letter: "G" },
  apple_calendar: { bg: "#f1f1f4", fg: "#111318", icon: CalendarDays, letter: "" },
  google_keep: { bg: "#fef7e0", fg: "#f4b400", icon: StickyNote, letter: "K" },
  apple_notes: { bg: "#fff8db", fg: "#d4a017", icon: StickyNote, letter: "" },
  google_tasks: { bg: "#e8f0fe", fg: "#1a73e8", icon: CheckSquare, letter: "T" },
  google_drive: { bg: "#e6f4ea", fg: "#188038", icon: HardDrive, letter: "D" },
  notion: { bg: "#f4f4f4", fg: "#111111", icon: FileText, letter: "N" },
  todoist: { bg: "#fdecea", fg: "#db4c3f", icon: CheckSquare, letter: "T" },
  telegram: { bg: "#e3f2fd", fg: "#229ed9", icon: Bell, letter: "" },
};

function Logo({ id }: { id: string }) {
  const l = LOGO[id] ?? { bg: "var(--surface-2)", fg: "var(--muted)", icon: Plug, letter: "" };
  const I = l.icon;
  return (
    <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl" style={{ background: l.bg, color: l.fg }}>
      <I className="size-5" />
      {l.letter && <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-md bg-surface text-[9px] font-bold shadow" style={{ color: l.fg }}>{l.letter}</span>}
    </span>
  );
}

function StatusBadge({ e }: { e: Entry }) {
  const cls = "whitespace-normal text-left leading-snug";
  if (e.status === "planned") return <Badge className={cls}>Не подключено · пока недоступно</Badge>;
  if (e.status === "import") return <Badge tone="info" className={cls}>Импорт файлов</Badge>;
  if (e.connected) return <Badge tone="success" className={cls}>Подключено</Badge>;
  if (!e.configured) return <Badge tone="warning" className={cls}>Нужна настройка сервера</Badge>;
  return <Badge className={cls}>Не подключено</Badge>;
}

export default function IntegrationsPage() {
  const q = useGet<Entry[]>(["integrations", "catalog"], "/integrations/catalog");
  const go = (id: string) => document.getElementById(id === "google_calendar" || id === "apple_calendar" ? "integrations" : "import-notes")?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className="max-w-5xl">
      <PageHeader icon={<Plug />} title="Интеграции" subtitle="Подключайте внешние сервисы. Статусы честные: нерабочие кнопки здесь не показываются." />
      <QueryState q={q} skeleton={<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36" />)}</div>}>
        {(list) => (
          <div className="space-y-8">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((e) => {
                const actionable = e.status !== "planned";
                return (
                  <Card key={e.id} interactive={actionable} onClick={() => actionable && go(e.id)} role={actionable ? "button" : undefined} tabIndex={actionable ? 0 : undefined}
                    onKeyDown={(ev) => { if (actionable && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); go(e.id); } }}
                    className={cn("flex flex-col gap-3 p-4", actionable ? "cursor-pointer" : "opacity-70")}>
                    <div className="flex items-start gap-3"><Logo id={e.id} /><div className="min-w-0"><div className="font-medium">{e.name}</div><div className="mt-1"><StatusBadge e={e} /></div></div></div>
                    <p className="text-xs leading-relaxed text-muted">{e.description}</p>
                  </Card>
                );
              })}
            </div>
            <CalendarIntegrations />
            <NotesImport />
            <Card className="p-4 text-sm text-muted">
              <b className="text-text">Как добавляются новые интеграции.</b> Каждая запись выше приходит с сервера из реестра интеграций. Чтобы подключить новый сервис, достаточно
              добавить его в реестр и реализовать подключение — эта страница покажет его автоматически. Ключи сервисов хранятся только на сервере, токены — в зашифрованном виде.
            </Card>
          </div>
        )}
      </QueryState>
    </div>
  );
}
