export type UUID = string;

export interface Profile { name: string; avatar_url: string | null; bio: string; timezone: string; language: "ru" | "kk" | "en"; is_public: boolean }
export interface Settings {
  theme: "dark" | "light" | "system"; currency: string; week_start: number; dashboard_layout: { widgets?: { id: string; visible: boolean }[]; priorities?: Record<string, string[]> };
  notification_prefs: Record<string, boolean>; quiet_hours_start: string | null; quiet_hours_end: string | null;
  ai_enabled: boolean; ai_context: Record<string, boolean>; social_enabled: boolean; gamification_enabled: boolean;
  reading_goal_yearly: number; categories: Record<string, unknown>;
}
export interface Me { id: UUID; email: string; email_verified: boolean; created_at: string; profile: Profile; settings: Settings }
export interface Page<T> { items: T[]; total: number }

export interface Milestone { id: UUID; goal_id: UUID; title: string; due_date: string | null; position: number; completed_at: string | null; tasks_total: number; tasks_done: number; progress: number }
export interface Goal {
  id: UUID; title: string; description: string; category: string; priority: number; status: "active" | "completed" | "archived";
  start_date: string | null; deadline: string | null; metric_name: string | null; metric_target: number | null; metric_current: number | null;
  notes: string; completed_at: string | null; progress: number; created_at: string;
}
export interface GoalDetail extends Goal {
  milestones: Milestone[]; habits: { id: string; title: string; color: string }[]; events: { id: string; title: string; starts_at: string }[];
  notes_linked: { id: string; title: string }[]; tasks: { id: string; title: string; status: string; milestone_id: string | null; due_at: string | null }[];
  history: { field: string; old: string | null; new: string | null; at: string }[];
}
export type TaskStatus = "backlog" | "todo" | "in_progress" | "done" | "cancelled";
export interface Task {
  id: UUID; title: string; description: string; status: TaskStatus; priority: number; category: string | null; due_at: string | null;
  estimated_minutes: number | null; actual_minutes: number; position: number; recurrence_rule: string | null; parent_id: UUID | null;
  goal_id: UUID | null; milestone_id: UUID | null; is_template: boolean; archived: boolean; completed_at: string | null; tags: string[];
  checklist: { id: UUID; text: string; done: boolean; position: number }[]; depends_on: UUID[]; blocked: boolean; subtasks_total: number; subtasks_done: number; created_at: string;
}
export interface Habit {
  id: UUID; title: string; description: string; category: string | null; icon: string; color: string; kind: "boolean" | "numeric" | "duration";
  frequency: "daily" | "weekly" | "selected_days" | "monthly" | "custom"; schedule: { weekdays?: number[]; times_per_period?: number; interval_days?: number };
  target: number; unit: string | null; allow_multiple_per_day: boolean; reminder_time: string | null; start_date: string; end_date: string | null;
  is_active: boolean; goal_id: UUID | null; today_value: number; today_status: string | null; scheduled_today: boolean; current_streak: number;
}
export interface HabitStats { current_streak: number; best_streak: number; completion_rate: number; weekly_completion: number; monthly_completion: number; yearly_completion: number; missed: number; total_completions: number }
export interface Occurrence { event_id: UUID; title: string; starts_at: string; ends_at: string; all_day: boolean; color: string; category: string; is_recurring: boolean; is_time_block: boolean; task_id: UUID | null; goal_id: UUID | null; habit_id: UUID | null }
export interface CalEvent { id: UUID; title: string; description: string; location: string; category: string; color: string; starts_at: string; ends_at: string; all_day: boolean; timezone: string; recurrence_rule: string | null; is_time_block: boolean; task_id: UUID | null; goal_id: UUID | null; habit_id: UUID | null }
export interface Reminder { id: UUID; kind: string; title: string; body: string; channels: string[]; first_fire_at: string; next_fire_at: string | null; recurrence_rule: string | null; timezone: string; is_active: boolean; last_fired_at: string | null; entity_type: string | null; entity_id: UUID | null }
export interface Notification { id: UUID; title: string; body: string; link: string | null; read_at: string | null; created_at: string }
export interface Delivery { id: UUID; notification_id: UUID; channel: string; status: string; attempts: number; last_error: string | null; sent_at: string | null; created_at: string }
export interface FocusSession { id: UUID; kind: string; status: string; planned_minutes: number; started_at: string; focused_seconds: number; elapsed_seconds: number; ended_at: string | null; task_id: UUID | null; subject_id: UUID | null; note: string }
export interface Course { id: UUID; subject_id: UUID | null; goal_id: UUID | null; title: string; description: string; provider: string; url: string | null; status: string; target_date: string | null; weekly_minutes_goal: number | null; lessons_total: number; lessons_done: number; progress: number; minutes_studied: number }
export interface Subject { id: UUID; title: string; description: string; color: string; area: string }
export interface Lesson { id: UUID; course_id: UUID; title: string; content: string; position: number; duration_minutes: number | null; completed_at: string | null }
export interface Deck { id: UUID; title: string; description: string; total: number; due_today: number; new: number; learning: number; review: number; mastered: number; new_cards_per_day: number }
export interface Card { id: UUID; deck_id: UUID; front: string; back: string; tags: string[]; stage: string; due_date: string | null; interval_days: number; ease_factor: number; repetitions: number }
export interface Book { id: UUID; title: string; author: string; cover_url: string | null; description: string; total_pages: number | null; current_page: number; status: string; rating: number | null; progress: number; started_on: string | null; finished_on: string | null }
export interface Transaction { id: UUID; kind: "income" | "expense"; amount: string; currency: string; category: string; description: string; occurred_on: string; savings_goal_id: UUID | null; subscription_id: UUID | null }
export interface Note { id: UUID; title: string; content: string; folder_id: UUID | null; category: string | null; tags: string[]; is_favorite: boolean; archived: boolean; goal_id: UUID | null; course_id: UUID | null; book_id: UUID | null; task_id: UUID | null; updated_at: string }
export interface JournalEntry { id: UUID; kind: string; title: string; body: string; entry_date: string; mood: number | null; tags: string[]; is_private: boolean; archived: boolean }
export interface Achievement { id: UUID; code: string; title: string; description: string; icon: string; xp_reward: number; progress: number; target: number; unlocked_at: string | null; is_public: boolean }
