import { describe, expect, it } from "vitest";
import { getNextDueDate, isRepeatRule } from "../recurrence";

describe("recurrence", () => {
  it("advances daily, weekly, monthly, and yearly tasks", () => {
    expect(getNextDueDate("2026-05-10", "daily", "2026-05-10")).toBe("2026-05-11");
    expect(getNextDueDate("2026-05-10", "weekly", "2026-05-10")).toBe("2026-05-17");
    expect(getNextDueDate("2026-01-31", "monthly", "2026-01-31")).toBe("2026-02-28");
    expect(getNextDueDate("2024-02-29", "yearly", "2024-03-01")).toBe("2025-02-28");
  });

  it("keeps overdue repeats moving past the completion date", () => {
    expect(getNextDueDate("2026-05-01", "daily", "2026-05-10")).toBe("2026-05-11");
    expect(getNextDueDate("2026-05-01", "weekly", "2026-05-10")).toBe("2026-05-15");
  });

  it("skips weekends for weekday repeats", () => {
    expect(getNextDueDate("2026-05-08", "weekdays", "2026-05-08")).toBe("2026-05-11");
    expect(getNextDueDate("2026-05-11", "weekdays", "2026-05-11")).toBe("2026-05-12");
  });

  it("validates supported repeat rules", () => {
    expect(isRepeatRule("monthly")).toBe(true);
    expect(isRepeatRule("none")).toBe(false);
  });
});
