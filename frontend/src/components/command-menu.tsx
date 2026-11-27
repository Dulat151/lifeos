"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, CornerDownLeft, FileText, FolderKanban, ListChecks, Plus, Repeat, Search, StickyNote, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useI18n } from "@/components/providers";
import { CREATE_KINDS, type CreateKind, useQuickCreate } from "@/components/quick-create";
import { Kbd, useToast } from "@/components/ui";
import { useGet } from "@/hooks/use-api";
import { post } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ALL_NAV_ITEMS } from "./layout/nav";

type Hit = { type: string; id: string; title: string; link: string };
type Item = { id: string; group: string; label: string; hint?: string; icon: React.ElementType; run: () => void | Promise<void> };

const TYPE_META: Record<string, { label: string; icon: React.ElementType }> = {
  task: { label: "Задача", icon: ListChecks }, goal: { label: "Цель", icon: Target }, habit: { label: "Привычка", icon: Repeat },
  note: { label: "Заметка", icon: StickyNote }, project: { label: "Проект", icon: FolderKanban }, event: { label: "Событие", icon: CalendarDays },
  book: { label: "Книга", icon: FileText }, course: { label: "Курс", icon: FileText }, journal: { label: "Дневник", icon: FileText },
};

const Ctx = React.createContext<() => void>(() => {});
export const useCommandMenu = () => React.useContext(Ctx);

/** ⌘K / Ctrl+K palette: global search, navigation and quick creation. */
export function CommandMenuProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.key === "k" || e.key === "K" || e.key === "л") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "/" && !typing) { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const show = React.useCallback(() => setOpen(true), []);
  return <Ctx.Provider value={show}>{children}{open && <Palette onClose={() => setOpen(false)} />}</Ctx.Provider>;
}

function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const quickCreate = useQuickCreate();
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { const id = setTimeout(() => setDebounced(q.trim()), 200); return () => clearTimeout(id); }, [q]);
  const search = useGet<Hit[]>(["search", debounced], debounced ? `/dashboard/search?q=${encodeURIComponent(debounced)}` : null);

  const go = (href: string) => { onClose(); router.push(href); };
  const quick = async (kind: "task" | "note", title: string) => {
    try {
      const r = await post<{ id: string }>(kind === "task" ? "/tasks" : "/notes", { title });
      for (const k of [["tasks"], ["notes"], ["dashboard"]]) qc.invalidateQueries({ queryKey: k });
      toast(kind === "task" ? `Задача «${title}» создана` : "Заметка создана");
      onClose();
      if (kind === "note") router.push(`/notes/${r.id}`);
    } catch (e) { toast((e as Error).message, "error"); }
  };

  const items: Item[] = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out: Item[] = [];
    if (needle) {
      out.push({ id: "qt", group: "Быстро", label: `Создать задачу «${q.trim()}»`, hint: "Enter", icon: Plus, run: () => quick("task", q.trim()) });
      out.push({ id: "qn", group: "Быстро", label: `Создать заметку «${q.trim()}»`, icon: StickyNote, run: () => quick("note", q.trim()) });
    }
    for (const h of search.data ?? []) {
      const m = TYPE_META[h.type] ?? { label: h.type, icon: FileText };
      out.push({ id: `s-${h.type}-${h.id}`, group: "Найдено", label: h.title, hint: m.label, icon: m.icon, run: () => go(h.link) });
    }
    for (const k of CREATE_KINDS) {
      const label = `Создать: ${k.label.toLowerCase()}`;
      if (!needle || label.toLowerCase().includes(needle) || k.label.toLowerCase().includes(needle))
        out.push({ id: `c-${k.value}`, group: "Создать", label, icon: k.icon, run: () => { onClose(); quickCreate(k.value as CreateKind, { title: q.trim() }); } });
    }
    for (const n of ALL_NAV_ITEMS) {
      const label = t(n.key);
      if (!needle || label.toLowerCase().includes(needle))
        out.push({ id: `n-${n.href}`, group: "Перейти", label, icon: n.icon, run: () => go(n.href) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, search.data]);

  React.useEffect(() => setActive(0), [q, search.data]);
  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); items[active]?.run(); }
  };

  let lastGroup = "";
  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]" />
        <DialogPrimitive.Content onKeyDown={onKey} aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-1.5rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-[20px] border border-border bg-surface shadow-[var(--shadow-lg)] focus:outline-none">
          <DialogPrimitive.Title className="sr-only">{t("common.command")}</DialogPrimitive.Title>
          <div className="animate-pop">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-4 text-muted" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти задачу, заметку, цель… или ввести команду"
                aria-label="Поиск и команды" className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint focus-visible:outline-none" />
              <Kbd>Esc</Kbd>
            </div>
            <div ref={listRef} className="max-h-[min(60vh,440px)] overflow-y-auto p-2" role="listbox">
              {search.isFetching && debounced && !search.data && <p className="px-3 py-2 text-xs text-muted">Ищем…</p>}
              {items.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted">Ничего не найдено</p>}
              {items.map((it, i) => {
                const header = it.group !== lastGroup ? it.group : null;
                lastGroup = it.group;
                return (
                  <React.Fragment key={it.id}>
                    {header && <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">{header}</div>}
                    <button data-idx={i} role="option" aria-selected={i === active} onMouseMove={() => setActive(i)} onClick={() => it.run()}
                      className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors", i === active ? "bg-accent-soft text-text" : "text-text/90")}>
                      <it.icon className={cn("size-4 shrink-0", i === active ? "text-accent" : "text-muted")} />
                      <span className="flex-1 truncate">{it.label}</span>
                      {it.hint && <span className="text-xs text-muted">{it.hint}</span>}
                      {i === active && (it.group === "Перейти" || it.group === "Найдено" ? <ArrowRight className="size-3.5 text-muted" /> : <CornerDownLeft className="size-3.5 text-muted" />)}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
            <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted">
              <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd>выбрать</span>
              <span className="flex items-center gap-1"><Kbd>Enter</Kbd>открыть</span>
              <span className="ml-auto flex items-center gap-1"><Kbd>⌘K</Kbd>открыть меню</span>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
