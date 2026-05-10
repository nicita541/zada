import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "../quickAdd";

describe("parseQuickAdd", () => {
  it("extracts metadata and leaves a clean title", () => {
    expect(parseQuickAdd("Fix enemy spawn #combat @rpg p1 due:2026-05-12 [bug]")).toEqual({
      title: "Fix enemy spawn",
      tags: ["combat"],
      priority: "p1",
      dueDate: "2026-05-12",
      startDate: null,
      time: null,
      repeat: null,
      remindAt: null,
      type: "bug",
      projectRef: "rpg"
    });
  });

  it("parses Russian natural dates", () => {
    const base = new Date("2026-05-09T10:00:00+07:00");

    expect(parseQuickAdd("Сделать билд сегодня", { now: base }).dueDate).toBe("2026-05-09");
    expect(parseQuickAdd("Проверить баг завтра", { now: base }).dueDate).toBe("2026-05-10");
    expect(parseQuickAdd("Написать GDD послезавтра", { now: base }).dueDate).toBe("2026-05-11");
  });

  it("parses repeat phrases and repeat tokens", () => {
    expect(parseQuickAdd("Standup every day p2")).toMatchObject({
      title: "Standup",
      repeat: "daily",
      priority: "p2"
    });

    expect(parseQuickAdd("Plan build repeat:weekdays")).toMatchObject({
      title: "Plan build",
      repeat: "weekdays"
    });
  });
});
