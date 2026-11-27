/** Note templates. `category` is stored on the note (weekly_review counts for the weekly quest). */
export type NoteTemplate = { id: string; title: string; description: string; icon: string; category: string; body: (date: string) => string };

const today = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: "daily", title: "Ежедневный дневник", description: "Как прошёл день и что запомнилось", icon: "book-open", category: "journal",
    body: (d) => `# Дневник — ${today(d)}\n\n## Настроение\n\n## Что произошло\n\n## За что я благодарен\n- \n\n## Что запомнилось\n`,
  },
  {
    id: "day_plan", title: "План на день", description: "Главное, задачи и время на фокус", icon: "sun", category: "planning",
    body: (d) => `# План на ${today(d)}\n\n## Главное сегодня\n- [ ] \n- [ ] \n- [ ] \n\n## Остальные дела\n- [ ] \n\n## Блоки фокуса\n| Время | Что делаю |\n|---|---|\n| 09:00 | |\n\n## Вечером отмечу\n`,
  },
  {
    id: "reflection", title: "Рефлексия", description: "Что получилось и чему научился", icon: "sparkles", category: "reflection",
    body: () => `# Рефлексия\n\n## Что получилось хорошо\n\n## Что можно сделать лучше\n\n## Чему я научился\n\n## Что сделаю по-другому\n- [ ] \n`,
  },
  {
    id: "ideas", title: "Идеи", description: "Быстрый список идей", icon: "lightbulb", category: "ideas",
    body: () => `# Идеи\n\n- \n- \n- \n\n## Лучшая идея и первый шаг\n- [ ] \n`,
  },
  {
    id: "study", title: "Учёба", description: "Конспект: тема, ключевые мысли, вопросы", icon: "graduation-cap", category: "learning",
    body: (d) => `# Конспект: тема\n\n**Дата:** ${d}  \n**Источник:** \n\n## Ключевые мысли\n- \n\n## Примеры\n\n## Вопросы\n- [ ] \n\n## Повторить\n- [ ] \n`,
  },
  {
    id: "project", title: "Проект", description: "Цель, результат, этапы, риски", icon: "folder-kanban", category: "project",
    body: () => `# Проект\n\n## Зачем\n\n## Результат (как пойму, что готово)\n\n## Этапы\n- [ ] \n- [ ] \n- [ ] \n\n## Риски\n- \n\n## Ссылки\n`,
  },
  {
    id: "goal", title: "Цель", description: "SMART-формулировка и шаги", icon: "target", category: "goal",
    body: () => `# Цель\n\n## Формулировка (конкретно, измеримо, со сроком)\n\n## Почему это важно\n\n## Шаги\n- [ ] \n- [ ] \n\n## Привычки, которые помогут\n- \n\n## Как отмечу успех\n`,
  },
  {
    id: "weekly_review", title: "Еженедельный обзор", description: "Итоги недели и план следующей", icon: "calendar-check", category: "weekly_review",
    body: (d) => `# Обзор недели (до ${today(d)})\n\n## Главные победы\n- \n\n## Что не получилось и почему\n- \n\n## Цели: прогресс\n- \n\n## Привычки: что держится\n- \n\n## Фокус на следующую неделю\n- [ ] \n- [ ] \n- [ ] \n`,
  },
];

export const TEMPLATE_BY_ID = Object.fromEntries(NOTE_TEMPLATES.map((t) => [t.id, t]));
