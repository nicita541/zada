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
});
