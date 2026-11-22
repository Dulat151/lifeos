"use client";
import { useGet } from "@/hooks/use-api";
import { qs } from "@/lib/api";

export type Overview = {
  period: { start: string; end: string; days: number }; task_completion_rate: number | null; tasks_considered: number; tasks_done: number;
  habit_completion_rate: number | null; habit_days_evaluated: number; habit_days_done: number; goal_progress: number | null; active_goals: number;
  learning_hours: number; focus_hours: number; focus_sessions: number; reading_pages: number; reading_minutes: number; workouts: number; workout_minutes: number;
  finance: { currency: string; income: string; expense: string; balance: string }; productivity_score: number | null;
  series: { date: string; tasks_done: number; habit_checks: number; focus_minutes: number; learning_minutes: number }[];
  previous?: Omit<Overview, "series" | "previous">;
};

export function useOverview(period: string, start: string, end: string, category = "") {
  const custom = period === "custom" && start && end;
  return useGet<Overview>(["analytics", period, start, end, category], `/analytics/overview${qs(custom ? { start, end, category } : { period: period === "custom" ? "last30" : period, category })}`);
}
