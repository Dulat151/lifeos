import {
  BarChart3, Bell, BookOpen, Bot, CalendarDays, CircleDot, Dumbbell, Flag, FolderKanban, Gauge, GraduationCap, HeartPulse, History,
  Image as ImageIcon, LayoutDashboard, Layers, Library, ListChecks, Network, NotebookPen, Plug, Repeat, Settings, StickyNote, Swords,
  Target, Timer, TrendingUp, Trophy, User, Users, Wallet, type LucideIcon,
} from "lucide-react";
import type { TKey } from "@/lib/i18n";

export type NavItem = { href: string; key: TKey; icon: LucideIcon };
export type NavGroup = { key: TKey | null; items: NavItem[]; collapsible?: boolean };

/** Primary navigation. Daily-use sections first; rarely used tools are folded under "More". */
export const NAV: NavGroup[] = [
  { key: null, items: [{ href: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard }] },
  { key: "group.plan", items: [
    { href: "/goals", key: "nav.goals", icon: Target },
    { href: "/projects", key: "nav.projects", icon: FolderKanban },
    { href: "/tasks", key: "nav.tasks", icon: ListChecks },
    { href: "/habits", key: "nav.habits", icon: Repeat },
    { href: "/calendar", key: "nav.calendar", icon: CalendarDays },
    { href: "/notes", key: "nav.notes", icon: StickyNote },
  ] },
  { key: "group.progress", items: [
    { href: "/progress", key: "nav.progress", icon: TrendingUp },
    { href: "/rewards", key: "nav.rewards", icon: Trophy },
    { href: "/ai", key: "nav.ai", icon: Bot },
  ] },
  { key: "group.learn", items: [
    { href: "/learning", key: "nav.learning", icon: GraduationCap },
    { href: "/courses", key: "nav.courses", icon: Library },
    { href: "/flashcards", key: "nav.flashcards", icon: Layers },
    { href: "/books", key: "nav.books", icon: BookOpen },
    { href: "/focus", key: "nav.focus", icon: Timer },
  ] },
  { key: "group.life", items: [
    { href: "/journal", key: "nav.journal", icon: NotebookPen },
    { href: "/health", key: "nav.health", icon: HeartPulse },
    { href: "/fitness", key: "nav.fitness", icon: Dumbbell },
    { href: "/finance", key: "nav.finance", icon: Wallet },
  ] },
  { key: "group.more", collapsible: true, items: [
    { href: "/reminders", key: "nav.reminders", icon: Bell },
    { href: "/integrations", key: "nav.integrations", icon: Plug },
    { href: "/analytics", key: "nav.analytics", icon: BarChart3 },
    { href: "/productivity", key: "nav.productivity", icon: Gauge },
    { href: "/knowledge-graph", key: "nav.graph", icon: Network },
    { href: "/challenges", key: "nav.challenges", icon: Swords },
    { href: "/wheel-of-life", key: "nav.wheel", icon: CircleDot },
    { href: "/bucket-list", key: "nav.bucket", icon: Flag },
    { href: "/vision-board", key: "nav.vision", icon: ImageIcon },
    { href: "/timeline", key: "nav.timeline", icon: History },
    { href: "/social", key: "nav.social", icon: Users },
    { href: "/profile", key: "nav.profile", icon: User },
  ] },
];

export const SETTINGS_ITEM: NavItem = { href: "/settings", key: "nav.settings", icon: Settings };

/** Bottom tab bar on phones. */
export const MOBILE_TABS: NavItem[] = [
  { href: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
  { href: "/tasks", key: "nav.tasks", icon: ListChecks },
  { href: "/calendar", key: "nav.calendar", icon: CalendarDays },
  { href: "/habits", key: "nav.habits", icon: Repeat },
];

export const ALL_NAV_ITEMS: NavItem[] = [...NAV.flatMap((g) => g.items), SETTINGS_ITEM];
