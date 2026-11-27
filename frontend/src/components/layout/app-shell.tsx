"use client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, ChevronDown, Coins, LogOut, Menu, Plus, Search, Sparkles, Trophy, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { CommandMenuProvider, useCommandMenu } from "@/components/command-menu";
import { CREATE_KINDS, QuickCreateProvider, useQuickCreate } from "@/components/quick-create";
import { Button, Kbd, Progress } from "@/components/ui";
import { XpFeedback } from "@/components/xp-feedback";
import { UserSync, useI18n, useMe } from "@/components/providers";
import { useGet, useMut } from "@/hooks/use-api";
import { get, post } from "@/lib/api";
import type { GamSummary, Notification } from "@/lib/types";
import { cn, fmtDateTime } from "@/lib/utils";
import { MOBILE_TABS, NAV, type NavItem, SETTINGS_ITEM } from "./nav";

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const path = usePathname();
  const [moreOpen, setMoreOpen] = React.useState(false);
  React.useEffect(() => {
    try { setMoreOpen(localStorage.getItem("lifeos_nav_more") === "1"); } catch { /* ignore */ }
  }, []);
  const toggleMore = () => setMoreOpen((o) => { try { localStorage.setItem("lifeos_nav_more", o ? "0" : "1"); } catch { /* ignore */ } return !o; });
  const isActive = (href: string) => path === href || path.startsWith(href + "/");
  const link = (it: NavItem) => (
    <Link key={it.href} href={it.href} onClick={onNavigate} aria-current={isActive(it.href) ? "page" : undefined}
      className={cn("group flex items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-[13.5px] transition-colors",
        isActive(it.href) ? "bg-accent-soft font-medium text-text" : "text-muted hover:bg-surface-2 hover:text-text")}>
      <it.icon className={cn("size-[17px] shrink-0 transition-colors", isActive(it.href) ? "text-accent" : "text-faint group-hover:text-muted")} />
      <span className="truncate">{t(it.key)}</span>
    </Link>
  );
  return (
    <nav className="flex h-full flex-col" aria-label="Основная навигация">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-5 pt-5 pb-4" onClick={onNavigate}>
        <div className="grid size-8 place-items-center rounded-xl bg-accent text-sm font-bold text-accent-fg shadow-[var(--glow)]">L</div>
        <div className="leading-tight"><div className="text-sm font-semibold tracking-wide">LIFE OS</div><div className="text-[10.5px] text-faint">Система саморазвития</div></div>
      </Link>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV.map((g, i) => {
          const hidden = g.collapsible && !moreOpen && !g.items.some((it) => isActive(it.href));
          return (
            <div key={g.key ?? i}>
              {g.key && (g.collapsible
                ? <button onClick={toggleMore} className="mb-1 flex w-full items-center justify-between px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint hover:text-muted" aria-expanded={!hidden}>
                    {t(g.key)}<ChevronDown className={cn("size-3.5 transition-transform", !hidden && "rotate-180")} /></button>
                : <div className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{t(g.key)}</div>)}
              {!hidden && <div className="space-y-0.5">{g.items.map(link)}</div>}
            </div>
          );
        })}
      </div>
      <div className="space-y-2 border-t border-border p-3">
        <LevelCard onNavigate={onNavigate} />
        {link(SETTINGS_ITEM)}
      </div>
    </nav>
  );
}

/** Level, XP to next level and coins — always visible, links to rewards. */
function LevelCard({ onNavigate }: { onNavigate?: () => void }) {
  const me = useMe();
  const g = useGet<GamSummary>(["gamification", "summary"], "/gamification/summary");
  if (me.data?.settings.gamification_enabled === false || !g.data) return null;
  const d = g.data;
  const pct = ((d.xp - d.level_xp_start) / Math.max(1, d.level_xp_next - d.level_xp_start)) * 100;
  return (
    <Link href="/rewards" onClick={onNavigate} className="block rounded-xl border border-border bg-surface-2/60 p-3 transition-colors hover:border-border-strong">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-semibold"><Trophy className="size-3.5 text-accent" />Уровень {d.level}</span>
        <span className="flex items-center gap-1 font-medium text-warning"><Coins className="size-3.5" />{d.coins}</span>
      </div>
      <Progress className="mt-2" value={pct} size="xs" />
      <div className="mt-1.5 text-[10.5px] text-faint">{d.level_xp_next - d.xp} XP до уровня {d.level + 1}</div>
    </Link>
  );
}

function CommandTrigger() {
  const open = useCommandMenu();
  const { t } = useI18n();
  return (
    <button onClick={open} aria-label={t("common.command")}
      className="hidden h-9 w-full max-w-sm items-center gap-2.5 rounded-[var(--radius-ctl)] border border-border bg-surface px-3 text-sm text-faint transition-colors hover:border-border-strong hover:text-muted md:flex">
      <Search className="size-4" /><span className="flex-1 text-left">Поиск и команды…</span><Kbd>⌘K</Kbd>
    </button>
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
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 w-[min(22rem,calc(100vw-1.5rem))] animate-pop rounded-2xl border border-border bg-surface p-2 shadow-[var(--shadow-lg)]">
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
  const create = useQuickCreate();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild><Button size="sm" aria-label="Создать" className="hidden sm:inline-flex"><Plus />Создать</Button></DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-48 animate-pop rounded-2xl border border-border bg-surface p-1.5 shadow-[var(--shadow-lg)]">
          {CREATE_KINDS.map((k) => (
            <DropdownMenu.Item key={k.value} onSelect={() => create(k.value)} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-2">
              <k.icon className="size-4 text-muted" />{k.label}</DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MobileTabBar({ onMenu }: { onMenu: () => void }) {
  const { t } = useI18n();
  const path = usePathname();
  const create = useQuickCreate();
  const tab = (it: NavItem) => {
    const active = path === it.href || path.startsWith(it.href + "/");
    return (
      <Link key={it.href} href={it.href} className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px]", active ? "text-accent" : "text-muted")}>
        <it.icon className="size-5" /><span className="truncate">{t(it.key)}</span>
      </Link>
    );
  };
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-surface/90 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden" aria-label="Нижняя навигация">
      {MOBILE_TABS.slice(0, 2).map(tab)}
      <div className="flex flex-1 items-center justify-center">
        <button onClick={() => create("task")} aria-label="Создать" className="-mt-5 grid size-12 place-items-center rounded-2xl bg-accent text-accent-fg shadow-[var(--glow)] active:scale-95"><Plus className="size-6" /></button>
      </div>
      {MOBILE_TABS.slice(2).map(tab)}
      <button onClick={onMenu} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] text-muted"><Menu className="size-5" /><span>Меню</span></button>
    </nav>
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
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-52 animate-pop rounded-2xl border border-border bg-surface p-1.5 shadow-[var(--shadow-lg)]">
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
  const path = usePathname();
  React.useEffect(() => {
    if (me.error && me.error.status === 401) router.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
  }, [me.error, router]);
  if (me.isLoading || (me.error && me.error.status === 401)) {
    return (
      <div className="grid min-h-screen place-items-center" aria-busy="true">
        <div className="flex flex-col items-center gap-3 text-sm text-muted">
          <div className="grid size-11 animate-pulse place-items-center rounded-2xl bg-accent text-base font-bold text-accent-fg shadow-[var(--glow)]">L</div>
          Загрузка LIFE OS…
        </div>
      </div>
    );
  }
  if (me.error) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div><p className="mb-3">Сервер недоступен: {me.error.message}</p><Button onClick={() => me.refetch()}>Повторить</Button></div>
      </div>
    );
  }
  return (
    <QuickCreateProvider>
      <CommandMenuProvider>
        <div className="flex min-h-screen">
          <UserSync />
          <XpFeedback />
          <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 border-r border-border bg-surface/60 lg:block"><Sidebar /></aside>
          {mobile && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={() => setMobile(false)} />
              <aside className="absolute left-0 top-0 h-full w-[280px] animate-[fade-up_0.2s_both] border-r border-border bg-surface">
                <button className="absolute right-3 top-4 rounded-lg p-2 text-muted hover:bg-surface-2" onClick={() => setMobile(false)} aria-label="Закрыть меню"><X className="size-4" /></button>
                <Sidebar onNavigate={() => setMobile(false)} />
              </aside>
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-bg/80 px-3 backdrop-blur-lg sm:px-4 md:px-6">
              <Link href="/dashboard" className="grid size-8 place-items-center rounded-xl bg-accent text-sm font-bold text-accent-fg lg:hidden" aria-label="LIFE OS">L</Link>
              <CommandTrigger />
              <MobileSearch />
              <div className="ml-auto flex items-center gap-1">
                <OfflineBadge />
                <InstallButton />
                <Button variant="ghost" size="icon" asChild aria-label="AI-ассистент"><Link href="/ai"><Sparkles /></Link></Button>
                <QuickActions />
                <Notifications />
                <UserMenu />
              </div>
            </header>
            <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pt-6 pb-28 md:px-6 lg:px-8 lg:pb-10">
              <ErrorBoundary key={path}><div className="page-enter">{children}</div></ErrorBoundary>
            </main>
          </div>
          <MobileTabBar onMenu={() => setMobile(true)} />
        </div>
      </CommandMenuProvider>
    </QuickCreateProvider>
  );
}

function MobileSearch() {
  const open = useCommandMenu();
  return <Button variant="ghost" size="icon" className="md:hidden" onClick={open} aria-label="Поиск"><Search /></Button>;
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
