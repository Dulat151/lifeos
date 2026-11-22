import type { FieldDef } from "@/components/entity";
import { GOAL_CATEGORIES } from "@/lib/utils";

export const GOAL_FIELDS: FieldDef[] = [
  { name: "title", label: "Название", required: true, full: true },
  { name: "category", label: "Категория", type: "select", required: true, default: "personal_development", options: Object.entries(GOAL_CATEGORIES).map(([value, label]) => ({ value, label })) },
  { name: "priority", label: "Приоритет", type: "select", required: true, default: "2", options: [{ value: "1", label: "Высокий" }, { value: "2", label: "Средний" }, { value: "3", label: "Низкий" }] },
  { name: "start_date", label: "Дата начала", type: "date", nullable: true },
  { name: "deadline", label: "Дедлайн", type: "date", nullable: true },
  { name: "metric_name", label: "Измеримый показатель", placeholder: "например, слов в словаре", nullable: true },
  { name: "metric_target", label: "Целевое значение", type: "number", nullable: true },
  { name: "metric_current", label: "Текущее значение", type: "number", nullable: true },
  { name: "description", label: "Описание", type: "textarea" },
];

export function courseFields(subjects: { id: string; title: string }[], goals: { id: string; title: string }[]): FieldDef[] {
  return [
    { name: "title", label: "Название", required: true, full: true },
    { name: "subject_id", label: "Предмет", type: "select", nullable: true, options: subjects.map((s) => ({ value: s.id, label: s.title })) },
    { name: "goal_id", label: "Цель", type: "select", nullable: true, options: goals.map((g) => ({ value: g.id, label: g.title })) },
    { name: "status", label: "Статус", type: "select", required: true, default: "active", options: [
      { value: "planned", label: "Запланирован" }, { value: "active", label: "Активный" }, { value: "paused", label: "На паузе" }, { value: "completed", label: "Завершён" }] },
    { name: "provider", label: "Платформа / автор" },
    { name: "url", label: "Ссылка", type: "url", nullable: true },
    { name: "target_date", label: "Завершить к", type: "date", nullable: true },
    { name: "weekly_minutes_goal", label: "План, минут в неделю", type: "number", min: 0, nullable: true },
    { name: "path_position", label: "Порядок в учебном пути", type: "number", default: 0 },
    { name: "description", label: "Описание", type: "textarea" },
  ];
}
