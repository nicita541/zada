import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, resolveLocale, translate } from "./index";

describe("i18n", () => {
  it("uses Russian as the default locale", () => {
    expect(DEFAULT_LOCALE).toBe("ru");
  });

  it("falls back to Russian for unknown locales", () => {
    expect(resolveLocale("de")).toBe("ru");
  });

  it("returns Russian text for a known key", () => {
    expect(translate("ru", "nav.settings")).toBe("Настройки");
  });

  it("returns English text for English locale", () => {
    expect(translate("en", "nav.settings")).toBe("Settings");
  });

  it("contains auth, project, and task-detail keys added for the MVP flow", () => {
    expect(translate("ru", "auth.loginTitle")).not.toBe("auth.loginTitle");
    expect(translate("ru", "projects.createProject")).not.toBe("projects.createProject");
    expect(translate("ru", "taskDetail.buildVersion")).not.toBe("taskDetail.buildVersion");
    expect(translate("en", "auth.loginTitle")).toBe("Sign in");
    expect(translate("en", "projects.createProject")).toBe("Create project");
    expect(translate("en", "taskDetail.buildVersion")).toBe("Build version");
  });

  it("contains required Russian polish strings for completed MVP modules", () => {
    expect(translate("ru", "board.listView")).toBe("Список");
    expect(translate("ru", "board.boardView")).toBe("Доска");
    expect(translate("ru", "projects.columns.backlog")).toBe("Бэклог");
    expect(translate("ru", "projects.columns.todo")).toBe("К выполнению");
    expect(translate("ru", "projects.columns.inProgress")).toBe("В работе");
    expect(translate("ru", "projects.columns.review")).toBe("На проверке");
    expect(translate("ru", "taskDetail.emptySubtasks")).toBe("Подзадач пока нет");
    expect(translate("ru", "taskDetail.emptyReminders")).toBe("Напоминаний пока нет");
    expect(translate("ru", "taskDetail.emptyTags")).toBe("Тегов пока нет");
  });

  it("returns the key for a missing key", () => {
    expect(translate("ru", "missing.key" as never)).toBe("missing.key");
  });
});
