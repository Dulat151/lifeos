"use client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, LogOut, Menu, Plus, Search, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { Button, Input } from "@/components/ui";
import { UserSync, useI18n, useMe } from "@/components/providers";
import { useGet, useMut } from "@/hooks/use-api";
import { get, post } from "@/lib/api";
import type { Notification } from "@/lib/types";
import { cn, fmtDateTime } from "@/lib/utils";
import { NAV } from "./nav";

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const path = usePathname();
  return (
    <nav className="flex h-full flex-col gap-4 overflow-y-auto px-3 py-4" aria-label="Основная навигация">
      <Link href="/dashboard" className="flex items-center gap-2 px-2" onClick={onNavigate}>
        <div className="grid size-8 place-items-center rounded-lg bg-accent text-sm font-bold text-accent-fg">L</div>
        <div className="leading-tight"><div className="text-sm font-semibold tracking-wide">LIFE OS</div><div className="text-[10px] text-muted">Personal Development OS</div></div>
      </Link>
      {NAV.map((g) => (
        <div key={g.key}>
          <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-muted">{t(g.key)}</div>
          {g.items.map((it) => {
            const active = path === it.href || path.startsWith(it.href + "/");
            return (
              <Link key={it.href} href={it.href} onClick={onNavigate}
                className={cn("flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                  active ? "bg-accent-soft text-accent font-medium" : "text-muted hover:bg-surface-2 hover:text-text")}>
                <it.icon className="size-4" />{t(it.key)}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function GlobalSearch() {
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const { t } = useI18n();
  React.useEffect(() => { const id = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(id); }, [q]);
  const res = useGet<{ type: string; id: string; title: string; link: string }[]>(["search", debounced], debounced ? `/dashboard/search?q=${encodeURIComponent(debounced)}` : null);
  return (
    <div className="relative hidden w-full max-w-sm md:block">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" />
      <Input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={t("common.search")} className="pl-8" aria-label="Глобальный поиск" />
      {open && debounced && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-[var(--radius-ctl)] border border-border bg-surface shadow-lg">
          {res.isLoading && <div className="px-3 py-2 text-sm text-muted">{t("common.loading")}</div>}
          {res.data?.length === 0 && <div className="px-3 py-2 text-sm text-muted">Ничего не найдено</div>}
          {res.data?.map((r) => (
            <Link key={r.type + r.id} href={r.link} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-surface-2">
              <span className="truncate">{r.title}</span><span className="ml-2 text-xs text-muted">{r.type}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Polls in-app notifications and shows system notifications for the "browser" channel. */
function Notifications() {
  const { t, locale } = useI18n();
  const count = useGet<{ count: number }>(["notifications", "count"], "/notifications/unread-count", { refetchInterval: 30_000 });
  const list = useGet<Notification[]>(["notifications", "list"], "/notifications?limit=15");
  const qc = useQueryClient();
  React.useEffect(() => {
    const tick = async () => {
      try {
        const pending = await post<Notification[]>("/notifications/browser-pending");
        if (pending.length) qc.invalidateQueries({ queryKey: ["notifications"] });
        if ("Notification" in window && Notification.permission === "granted") {
          for (const n of pending) new Notification(n.title, { body: n.body, tag: n.id, icon: "/icons/icon-192.png" });
        }
      } catch { /* offline or logged out */ }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [qc]);
  const readAll = useMut(() => post("/notifications/read-all"), { invalidate: [["notifications"]] });
  const readOne = useMut((id: string) => post(`/notifications/${id}/read`), { invalidate: [["notifications"]] });
  const n = count.data?.count ?? 0;
  return (
    <DropdownMenu.Root onOpenChange={(o) => o && list.refetch()}>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("common.notifications")} className="relative">
          <Bell />{n > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] text-white">{n > 99 ? "99+" : n}</span>}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 w-80 rounded-[var(--radius-card)] border border-border bg-surface p-2 shadow-xl">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-sm font-semibold">{t("common.notifications")}</span>
            {n > 0 && <button className="text-xs text-accent" onClick={() => readAll.mutate()}>Прочитать все</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {list.data?.length === 0 && <p className="px-2 py-4 text-center text-sm text-muted">{t("common.no_notifications")}</p>}
            {list.data?.map((x) => (
              <DropdownMenu.Item key={x.id} onSelect={() => { if (!x.read_at) readOne.mutate(x.id); if (x.link) location.assign(x.link); }}
                className={cn("cursor-pointer rounded-md px-2 py-2 text-sm outline-none hover:bg-surface-2", !x.read_at && "bg-accent-soft/50")}>
                <div className="font-medium">{x.title}</div>
                {x.body && <div className="text-xs text-muted line-clamp-2">{x.body}</div>}
                <div className="mt-0.5 text-[11px] text-muted">{fmtDateTime(x.created_at, locale)}</div>
              </DropdownMenu.Item>
            ))}
          </div>
          <Link href="/reminders" className="mt-1 block rounded-md px-2 py-1.5 text-center text-xs text-accent hover:bg-surface-2">Все напоминания и история доставки</Link>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** PWA install prompt (Chromium "beforeinstallprompt"). Hidden when unavailable or already installed. */
function InstallButton() {
  const [evt, setEvt] = React.useState<(Event & { prompt: () => Promise<void> }) | null>(null);
  React.useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e as Event & { prompt: () => Promise<void> }); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (!evt) return null;
  return <Button size="sm" variant="outline" onClick={async () => { await evt.prompt(); setEvt(null); }}>Установить</Button>;
}

function OfflineBadge() {
  const [online, setOnline] = React.useState(true);
  React.useEffect(() => {
    const u = () => setOnline(navigator.onLine);
    u();
    window.addEventListener("online", u);
    window.addEventListener("offline", u);
    return () => { window.removeEventListener("online", u); window.removeEventListener("offline", u); };
  }, []);
  if (online) return null;
  return <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">Офлайн — изменения отправятся позже</span>;
}

function QuickActions() {
  const router = useRouter();
  const items = [
    ["Задача", "/tasks?new=1"], ["Привычка", "/habits?new=1"], ["Цель", "/goals?new=1"], ["Событие", "/calendar?new=1"],
    ["Фокус-сессия", "/focus"], ["Запись в дневник", "/journal?new=1"], ["Операция", "/finance?new=1"],
  ];
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild><Button size="sm" aria-label="Быстрые действия"><Plus />Создать</Button></DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-44 rounded-[var(--radius-ctl)] border border-border bg-surface p-1 shadow-xl">
          {items.map(([l, h]) => (
            <DropdownMenu.Item key={h} onSelect={() => router.push(h)} className="cursor-pointer rounded-md px-2.5 py-1.5 text-sm outline-none hover:bg-surface-2">{l}</DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function UserMenu() {
  const { data } = useMe();
  const { t } = useI18n();
  const qc = useQueryClient();
  const logout = async () => {
    try { await post("/auth/logout"); } catch { /* already logged out */ }
    qc.clear();
    location.href = "/login";
  };
  const initials = (data?.profile.name || "?").slice(0, 1).toUpperCase();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="grid size-8 place-items-center overflow-hidden rounded-full bg-surface-2 text-sm font-semibold" aria-label="Меню профиля">
          {data?.profile.avatar_url ? <img src={data.profile.avatar_url} alt="" className="size-full object-cover" /> : initials}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-48 rounded-[var(--radius-ctl)] border border-border bg-surface p-1 shadow-xl">
          <div className="px-2.5 py-2 text-sm"><div className="font-medium">{data?.profile.name}</div><div className="text-xs text-muted">{data?.email}</div></div>
          <DropdownMenu.Item asChild><Link href="/profile" className="block rounded-md px-2.5 py-1.5 text-sm outline-none hover:bg-surface-2">{t("nav.profile")}</Link></DropdownMenu.Item>
          <DropdownMenu.Item asChild><Link href="/settings" className="block rounded-md px-2.5 py-1.5 text-sm outline-none hover:bg-surface-2">{t("nav.settings")}</Link></DropdownMenu.Item>
          <DropdownMenu.Item onSelect={logout} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-danger outline-none hover:bg-surface-2"><LogOut className="size-4" />{t("common.logout")}</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const [mobile, setMobile] = React.useState(false);
  const router = useRouter();
  React.useEffect(() => {
    if (me.error && me.error.status === 401) router.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
  }, [me.error, router]);
  if (me.isLoading || (me.error && me.error.status === 401)) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted">Загрузка LIFE OS…</div>;
  }
  if (me.error) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div><p className="mb-3">Сервер недоступен: {me.error.message}</p><Button onClick={() => me.refetch()}>Повторить</Button></div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen">
      <UserSync />
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-border bg-surface lg:block"><Sidebar /></aside>
      {mobile && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobile(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-surface">
            <button className="absolute right-2 top-2 p-2" onClick={() => setMobile(false)} aria-label="Закрыть меню"><X className="size-4" /></button>
            <Sidebar onNavigate={() => setMobile(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobile(true)} aria-label="Открыть меню"><Menu /></Button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1.5">
            <OfflineBadge />
            <InstallButton />
            <Button variant="ghost" size="icon" asChild aria-label="AI-ассистент"><Link href="/ai"><Sparkles /></Link></Button>
            <QuickActions />
            <Notifications />
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("UI error", error); }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-[var(--radius-card)] border border-danger/30 bg-danger/5 p-6 text-center" role="alert">
          <p className="mb-2 font-medium">Что-то пошло не так на этой странице</p>
          <p className="mb-4 text-sm text-muted">{this.state.error.message}</p>
          <Button variant="outline" onClick={() => this.setState({ error: null })}>Повторить</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export { get };
