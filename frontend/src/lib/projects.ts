import type { ProjectStatus } from "@/lib/types";

export const PROJECT_COLUMNS: { status: ProjectStatus; label: string; hint: string; tone: string }[] = [
  { status: "idea", label: "Идеи", hint: "Что может стать проектом", tone: "var(--faint)" },
  { status: "planned", label: "Запланировано", hint: "Готово к старту", tone: "var(--info)" },
  { status: "in_progress", label: "В процессе", hint: "Над чем работаю сейчас", tone: "var(--accent)" },
  { status: "done", label: "Завершено", hint: "Готовые результаты", tone: "var(--success)" },
];
export const PRIORITY_LABEL: Record<number, string> = { 1: "Высокий", 2: "Средний", 3: "Низкий" };
