import {
  Award, BookOpen, Bot, Brain, CalendarDays, ChartColumn, CircleDot, Dumbbell, Flag, Gauge, GraduationCap, HeartPulse, History,
  Image as ImageIcon, LayoutDashboard, Layers, Library, ListChecks, Network, NotebookPen, Repeat, Settings, StickyNote, Target,
  Timer, Trophy, User, Users, Wallet, Bell, type LucideIcon,
} from "lucide-react";
import type { TKey } from "@/lib/i18n";

export type NavItem = { href: string; key: TKey; icon: LucideIcon };
export type NavGroup = { key: TKey; items: NavItem[] };

export const NAV: NavGroup[] = [
  { key: "group.plan", items: [
    { href: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
    { href: "/goals", key: "nav.goals", icon: Target },
    { href: "/tasks", key: "nav.tasks", icon: ListChecks },
    { href: "/habits", key: "nav.habits", icon: Repeat },
    { href: "/calendar", key: "nav.calendar", icon: CalendarDays },
    { href: "/reminders", key: "nav.reminders", icon: Bell },
  ] },
  { key: "group.learn", items: [
    { href: "/learning", key: "nav.learning", icon: GraduationCap },
    { href: "/courses", key: "nav.courses", icon: Library },
    { href: "/flashcards", key: "nav.flashcards", icon: Layers },
    { href: "/books", key: "nav.books", icon: BookOpen },
    { href: "/notes", key: "nav.notes", icon: StickyNote },
    { href: "/knowledge-graph", key: "nav.graph", icon: Network },
  ] },
  { key: "group.life", items: [
    { href: "/health", key: "nav.health", icon: HeartPulse },
    { href: "/fitness", key: "nav.fitness", icon: Dumbbell },
    { href: "/finance", key: "nav.finance", icon: Wallet },
    { href: "/journal", key: "nav.journal", icon: NotebookPen },
    { href: "/focus", key: "nav.focus", icon: Timer },
  ] },
  { key: "group.insight", items: [
    { href: "/productivity", key: "nav.productivity", icon: Gauge },
    { href: "/analytics", key: "nav.analytics", icon: ChartColumn },
    { href: "/gamification", key: "nav.gamification", icon: Trophy },
    { href: "/achievements", key: "nav.achievements", icon: Award },
    { href: "/ai", key: "nav.ai", icon: Bot },
  ] },
  { key: "group.grow", items: [
    { href: "/wheel-of-life", key: "nav.wheel", icon: CircleDot },
    { href: "/bucket-list", key: "nav.bucket", icon: Flag },
    { href: "/vision-board", key: "nav.vision", icon: ImageIcon },
    { href: "/timeline", key: "nav.timeline", icon: History },
    { href: "/challenges", key: "nav.challenges", icon: Brain },
    { href: "/social", key: "nav.social", icon: Users },
  ] },
  { key: "group.account", items: [
    { href: "/profile", key: "nav.profile", icon: User },
    { href: "/settings", key: "nav.settings", icon: Settings },
  ] },
];
