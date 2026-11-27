import { expect, test, type Page } from "@playwright/test";

const email = `e2e-${Date.now()}@example.com`;
const password = "secret123";

const PAGES = ["/dashboard", "/goals", "/tasks", "/habits", "/calendar", "/reminders", "/learning", "/courses", "/flashcards", "/books",
  "/health", "/fitness", "/finance", "/journal", "/notes", "/focus", "/productivity", "/analytics", "/gamification", "/achievements",
  "/ai", "/wheel-of-life", "/bucket-list", "/vision-board", "/knowledge-graph", "/timeline", "/challenges", "/social", "/profile", "/settings",
  "/projects", "/progress", "/rewards", "/integrations", "/settings?section=notifications", "/settings?section=data", "/rewards?tab=shop",
  "/rewards?tab=streaks"];

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("Failed to load resource")) errors.push(`console: ${m.text()}`); });
  page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  return errors;
}

test.describe.serial("LIFE OS main user flows", () => {
  let page: Page;
  let errors: string[];
  test.beforeAll(async ({ browser }) => { page = await browser.newPage(); errors = trackErrors(page); });
  test.afterEach(() => { expect(errors, errors.join("\n")).toEqual([]); });

  test("1-2. register and see the dashboard", async () => {
    await page.goto("/register");
    await page.getByLabel("Имя").fill("Айгерим");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Пароль").fill(password);
    await page.getByRole("button", { name: "Регистрация" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /Айгерим/ })).toBeVisible();
  });

  test("3-6. goal → milestone → task linked to goal, progress updates", async () => {
    await page.goto("/goals?new=1");
    await page.getByLabel("Название *").fill("Выучить английский");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByRole("heading", { name: "Выучить английский" })).toBeVisible();
    await page.getByRole("tab", { name: "Этапы и задачи" }).click();
    await page.getByPlaceholder("Новый этап (milestone)…").fill("Уровень A2");
    await page.getByRole("button", { name: "Этап", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Уровень A2" })).toBeVisible();
    const add = page.getByPlaceholder("Новая задача…").first();
    await add.fill("Пройти урок 1");
    await add.press("Enter");
    await expect(page.getByText("Пройти урок 1")).toBeVisible();
    await page.getByRole("button", { name: "Переключить" }).first().click();
    await expect(page.getByText("100%").first()).toBeVisible();
  });

  test("tasks: quick add, kanban view", async () => {
    await page.goto("/tasks");
    await page.getByLabel("Быстрое добавление задачи").fill("Позвонить маме #семья !1 сегодня");
    await page.getByRole("button", { name: "Добавить", exact: true }).click();
    await expect(page.getByText("Позвонить маме")).toBeVisible();
    await page.getByRole("tab", { name: /Kanban/ }).click();
    await expect(page.getByText("В работе")).toBeVisible();
  });

  test("7-8. create and complete a habit", async () => {
    await page.goto("/habits?new=1");
    await page.getByLabel("Название *").fill("Медитация");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await page.getByRole("button", { name: "Отметить", exact: true }).first().click();
    await expect(page.getByRole("button", { name: "Снять отметку" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Снять отметку" })).toBeVisible(); // persisted
  });

  test("9. create a calendar event", async () => {
    await page.goto("/calendar?new=1");
    await page.getByLabel("Название *").fill("Встреча с ментором");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await page.getByRole("tab", { name: "Повестка" }).click();
    await expect(page.getByText("Встреча с ментором")).toBeVisible();
  });

  test("13. journal entry", async () => {
    await page.goto("/journal?new=1");
    await page.getByLabel("Текст").fill("Сегодня был продуктивный день");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Сегодня был продуктивный день")).toBeVisible();
  });

  test("14. focus timer start / pause / finish", async () => {
    await page.goto("/focus");
    await page.getByRole("button", { name: "Старт" }).click();
    await page.getByRole("button", { name: "Пауза" }).click();
    await page.getByRole("button", { name: "Продолжить" }).click();
    await page.getByRole("button", { name: "Завершить" }).click();
    await expect(page.getByRole("button", { name: "Старт" })).toBeVisible();
  });

  test("15. finance transaction", async () => {
    await page.goto("/finance?new=1");
    await page.getByLabel("Сумма *").fill("15000");
    await page.getByLabel("Категория *").fill("еда");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("еда").first()).toBeVisible();
  });

  test("16-17. analytics and XP reflect real actions", async () => {
    await page.goto("/gamification"); // redirects to the merged rewards page
    await expect(page).toHaveURL(/\/rewards/);
    await page.getByRole("tab", { name: "История" }).click();
    await expect(page.getByText("История опыта")).toBeVisible();
    await expect(page.getByText("Задача", { exact: true }).first()).toBeVisible();
    await page.goto("/analytics");
    await expect(page.getByText("Выполнение привычек")).toBeVisible();
  });

  test("18. AI page reports missing provider honestly", async () => {
    await page.goto("/ai");
    await expect(page.getByText("AI-провайдер не подключён на сервере.")).toBeVisible();
  });

  test("projects: create, link a task, move on the board", async () => {
    await page.goto("/projects");
    await page.getByRole("button", { name: "Проект", exact: true }).click();
    await page.getByLabel("Название").fill("Сайт-портфолио");
    await page.getByRole("button", { name: "Создать" }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+/);
    await page.getByLabel("Новая задача").fill("Купить домен");
    await page.getByRole("button", { name: "Добавить" }).click();
    await expect(page.getByText("Купить домен")).toBeVisible();
    await page.getByRole("button", { name: "Выполнить" }).click();
    await expect(page.getByText("1 из 1 выполнено")).toBeVisible();
    await page.getByLabel("Статус").selectOption("done");
    await page.goto("/projects");
    await expect(page.getByText("Сайт-портфолио")).toBeVisible();
  });

  test("notes: template, autosave, checklist toggle, pin", async () => {
    await page.goto("/notes");
    await page.getByRole("button", { name: "План на день" }).click();
    await expect(page).toHaveURL(/\/notes\/[0-9a-f-]+/);
    await page.getByRole("radio", { name: /Текст/ }).click();
    await page.getByLabel("Текст заметки").fill("# План\n\n- [ ] Пробежка\n- [ ] Чтение");
    await expect(page.getByText("Сохранено")).toBeVisible({ timeout: 8000 });
    await page.getByRole("radio", { name: /Просмотр/ }).click();
    await page.getByLabel("Пункт чек-листа").first().click(); // re-rendered from Markdown after the click
    await expect(page.getByText("Чек-лист 1/2")).toBeVisible();
    await page.getByRole("button", { name: "Закрепить" }).click();
    await expect(page.getByText("Сохранено")).toBeVisible({ timeout: 8000 });
    await page.goto("/notes");
    await expect(page.getByText("Закреплённые")).toBeVisible();
  });

  test("quests and command menu", async () => {
    await page.goto("/rewards");
    await expect(page.getByText("Ежедневные")).toBeVisible();
    await expect(page.getByText("Выполнить 3 задачи")).toBeVisible();
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Поиск и команды" }).click();
    await page.getByRole("textbox", { name: "Поиск и команды" }).fill("Сайт");
    await expect(page.getByRole("option", { name: /Сайт-портфолио/ })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("every section renders without runtime errors", async () => {
    for (const p of PAGES) {
      await page.goto(p);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.getByText("Что-то пошло не так на этой странице")).toHaveCount(0);
    }
  });

  test("2. logout and login again", async () => {
    await page.getByRole("button", { name: "Меню профиля" }).click();
    await page.getByRole("menuitem", { name: "Выйти" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Пароль").fill(password);
    await page.getByRole("button", { name: "Вход" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
