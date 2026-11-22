/** Interface dictionaries. Russian is the default and the source of truth; missing keys fall back to ru. */
export type Lang = "ru" | "kk" | "en";

const ru = {
  slogan: "Build yourself. Master your time. Design your future.",
  "nav.dashboard": "Главная", "nav.goals": "Цели", "nav.tasks": "Задачи", "nav.habits": "Привычки", "nav.calendar": "Календарь",
  "nav.reminders": "Напоминания", "nav.learning": "Обучение", "nav.courses": "Курсы", "nav.flashcards": "Карточки", "nav.books": "Книги",
  "nav.health": "Здоровье", "nav.fitness": "Фитнес", "nav.finance": "Финансы", "nav.journal": "Дневник", "nav.notes": "Заметки",
  "nav.focus": "Фокус", "nav.productivity": "Продуктивность", "nav.analytics": "Аналитика", "nav.gamification": "Геймификация",
  "nav.achievements": "Достижения", "nav.ai": "AI-ассистент", "nav.wheel": "Колесо баланса", "nav.bucket": "Список желаний",
  "nav.vision": "Доска визуализации", "nav.graph": "Граф знаний", "nav.timeline": "Хронология жизни", "nav.challenges": "Челленджи",
  "nav.social": "Друзья", "nav.profile": "Профиль", "nav.settings": "Настройки",
  "group.plan": "Планирование", "group.learn": "Обучение", "group.life": "Жизнь", "group.insight": "Аналитика", "group.grow": "Развитие", "group.account": "Аккаунт",
  "common.add": "Добавить", "common.save": "Сохранить", "common.cancel": "Отмена", "common.delete": "Удалить", "common.edit": "Изменить",
  "common.search": "Поиск…", "common.loading": "Загрузка…", "common.empty": "Пока пусто", "common.error": "Не удалось загрузить данные",
  "common.retry": "Повторить", "common.close": "Закрыть", "common.confirm": "Подтвердить", "common.today": "Сегодня", "common.all": "Все",
  "common.archive": "Архив", "common.title": "Название", "common.description": "Описание", "common.date": "Дата", "common.status": "Статус",
  "common.priority": "Приоритет", "common.category": "Категория", "common.deadline": "Дедлайн", "common.export": "Экспорт", "common.saved": "Сохранено",
  "common.deleted": "Удалено", "common.logout": "Выйти", "common.notifications": "Уведомления", "common.no_notifications": "Нет уведомлений",
  "auth.login": "Вход", "auth.register": "Регистрация", "auth.email": "Email", "auth.password": "Пароль", "auth.name": "Имя",
  "auth.no_account": "Нет аккаунта?", "auth.have_account": "Уже есть аккаунт?", "auth.forgot": "Забыли пароль?", "auth.reset": "Сбросить пароль",
  "auth.new_password": "Новый пароль",
  "dash.hello": "Здравствуйте", "dash.start_day": "Начать день", "dash.end_day": "Завершить день", "dash.today_tasks": "Задачи на сегодня",
  "dash.priorities": "Топ-3 приоритета", "dash.habits": "Привычки сегодня", "dash.events": "Ближайшие события", "dash.goals": "Прогресс целей",
  "dash.learning": "Обучение", "dash.focus": "Фокус", "dash.stats": "Статистика", "dash.weekly": "Неделя", "dash.quote": "Цитата дня",
  "dash.ai": "Рекомендации", "dash.customize": "Настроить виджеты", "dash.streak": "Серия", "dash.level": "Уровень",
};
type Dict = Partial<Record<keyof typeof ru, string>>;

const en: Dict = {
  "nav.dashboard": "Dashboard", "nav.goals": "Goals", "nav.tasks": "Tasks", "nav.habits": "Habits", "nav.calendar": "Calendar",
  "nav.reminders": "Reminders", "nav.learning": "Learning Center", "nav.courses": "Courses", "nav.flashcards": "Flashcards", "nav.books": "Books",
  "nav.health": "Health", "nav.fitness": "Fitness", "nav.finance": "Finance", "nav.journal": "Journal", "nav.notes": "Notes",
  "nav.focus": "Focus", "nav.productivity": "Productivity", "nav.analytics": "Analytics", "nav.gamification": "Gamification",
  "nav.achievements": "Achievements", "nav.ai": "AI Assistant", "nav.wheel": "Wheel of Life", "nav.bucket": "Bucket List",
  "nav.vision": "Vision Board", "nav.graph": "Knowledge Graph", "nav.timeline": "Life Timeline", "nav.challenges": "Challenges",
  "nav.social": "Social", "nav.profile": "Profile", "nav.settings": "Settings",
  "group.plan": "Planning", "group.learn": "Learning", "group.life": "Life", "group.insight": "Insights", "group.grow": "Growth", "group.account": "Account",
  "common.add": "Add", "common.save": "Save", "common.cancel": "Cancel", "common.delete": "Delete", "common.edit": "Edit",
  "common.search": "Search…", "common.loading": "Loading…", "common.empty": "Nothing here yet", "common.error": "Failed to load data",
  "common.retry": "Retry", "common.close": "Close", "common.confirm": "Confirm", "common.today": "Today", "common.all": "All",
  "common.archive": "Archive", "common.title": "Title", "common.description": "Description", "common.date": "Date", "common.status": "Status",
  "common.priority": "Priority", "common.category": "Category", "common.deadline": "Deadline", "common.export": "Export", "common.saved": "Saved",
  "common.deleted": "Deleted", "common.logout": "Log out", "common.notifications": "Notifications", "common.no_notifications": "No notifications",
  "auth.login": "Log in", "auth.register": "Sign up", "auth.email": "Email", "auth.password": "Password", "auth.name": "Name",
  "auth.no_account": "No account?", "auth.have_account": "Already have an account?", "auth.forgot": "Forgot password?", "auth.reset": "Reset password",
  "auth.new_password": "New password",
  "dash.hello": "Hello", "dash.start_day": "Start my day", "dash.end_day": "End my day", "dash.today_tasks": "Today's tasks",
  "dash.priorities": "Top 3 priorities", "dash.habits": "Today's habits", "dash.events": "Upcoming events", "dash.goals": "Goal progress",
  "dash.learning": "Learning", "dash.focus": "Focus", "dash.stats": "Statistics", "dash.weekly": "This week", "dash.quote": "Daily quote",
  "dash.ai": "Recommendations", "dash.customize": "Customize widgets", "dash.streak": "Streak", "dash.level": "Level",
};

const kk: Dict = {
  "nav.dashboard": "Басты бет", "nav.goals": "Мақсаттар", "nav.tasks": "Тапсырмалар", "nav.habits": "Әдеттер", "nav.calendar": "Күнтізбе",
  "nav.reminders": "Еске салғыштар", "nav.learning": "Оқу орталығы", "nav.courses": "Курстар", "nav.flashcards": "Карточкалар", "nav.books": "Кітаптар",
  "nav.health": "Денсаулық", "nav.fitness": "Фитнес", "nav.finance": "Қаржы", "nav.journal": "Күнделік", "nav.notes": "Жазбалар",
  "nav.focus": "Фокус", "nav.productivity": "Өнімділік", "nav.analytics": "Аналитика", "nav.gamification": "Геймификация",
  "nav.achievements": "Жетістіктер", "nav.ai": "AI көмекші", "nav.wheel": "Өмір дөңгелегі", "nav.bucket": "Арман тізімі",
  "nav.vision": "Визуализация тақтасы", "nav.graph": "Білім графы", "nav.timeline": "Өмір хронологиясы", "nav.challenges": "Челлендждер",
  "nav.social": "Достар", "nav.profile": "Профиль", "nav.settings": "Баптаулар",
  "group.plan": "Жоспарлау", "group.learn": "Оқу", "group.life": "Өмір", "group.insight": "Аналитика", "group.grow": "Даму", "group.account": "Аккаунт",
  "common.add": "Қосу", "common.save": "Сақтау", "common.cancel": "Болдырмау", "common.delete": "Жою", "common.edit": "Өзгерту",
  "common.search": "Іздеу…", "common.loading": "Жүктелуде…", "common.empty": "Әзірге бос", "common.error": "Деректерді жүктеу мүмкін болмады",
  "common.retry": "Қайталау", "common.close": "Жабу", "common.confirm": "Растау", "common.today": "Бүгін", "common.all": "Барлығы",
  "common.archive": "Мұрағат", "common.title": "Атауы", "common.description": "Сипаттама", "common.date": "Күні", "common.status": "Күйі",
  "common.priority": "Басымдық", "common.category": "Санат", "common.deadline": "Мерзімі", "common.export": "Экспорт", "common.saved": "Сақталды",
  "common.deleted": "Жойылды", "common.logout": "Шығу", "common.notifications": "Хабарламалар", "common.no_notifications": "Хабарлама жоқ",
  "auth.login": "Кіру", "auth.register": "Тіркелу", "auth.email": "Email", "auth.password": "Құпиясөз", "auth.name": "Аты",
  "auth.no_account": "Аккаунт жоқ па?", "auth.have_account": "Аккаунтыңыз бар ма?", "auth.forgot": "Құпиясөзді ұмыттыңыз ба?",
  "auth.reset": "Құпиясөзді қалпына келтіру", "auth.new_password": "Жаңа құпиясөз",
  "dash.hello": "Сәлеметсіз бе", "dash.start_day": "Күнді бастау", "dash.end_day": "Күнді аяқтау", "dash.today_tasks": "Бүгінгі тапсырмалар",
  "dash.priorities": "Басты 3 басымдық", "dash.habits": "Бүгінгі әдеттер", "dash.events": "Жақын оқиғалар", "dash.goals": "Мақсаттар барысы",
  "dash.learning": "Оқу", "dash.focus": "Фокус", "dash.stats": "Статистика", "dash.weekly": "Апта", "dash.quote": "Күн дәйексөзі",
  "dash.ai": "Ұсыныстар", "dash.customize": "Виджеттерді баптау", "dash.streak": "Серия", "dash.level": "Деңгей",
};

const dicts: Record<Lang, Dict> = { ru, en, kk };
export type TKey = keyof typeof ru;

export function translate(lang: Lang, key: TKey): string {
  return dicts[lang]?.[key] ?? ru[key] ?? key;
}

export const LOCALES: Record<Lang, string> = { ru: "ru-RU", kk: "kk-KZ", en: "en-US" };
