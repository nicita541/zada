import type { RepeatRule } from "./types";

const repeatRules = new Set<RepeatRule>(["daily", "weekly", "monthly", "yearly", "weekdays"]);

export function isRepeatRule(value: unknown): value is RepeatRule {
  return typeof value === "string" && repeatRules.has(value as RepeatRule);
}

export function normalizeRepeatRule(value: unknown): RepeatRule | null {
  return isRepeatRule(value) ? value : null;
}

export function getNextDueDate(
  dueDate: string | null | undefined,
  repeat: RepeatRule | string | null | undefined,
  completedAt: Date | string = new Date()
): string | null {
  const rule = normalizeRepeatRule(repeat);
  const base = parseDateOnly(dueDate);

  if (!rule || !base) {
    return null;
  }

  const reference = dateOnlyFrom(completedAt);
  let next = advance(base, rule);

  while (compareDateOnly(next, reference) <= 0) {
    next = advance(next, rule);
  }

  return formatDateOnly(next);
}

function advance(date: Date, repeat: RepeatRule): Date {
  switch (repeat) {
    case "daily":
      return addDays(date, 1);
    case "weekly":
      return addDays(date, 7);
    case "monthly":
      return addMonths(date, 1);
    case "yearly":
      return addYears(date, 1);
    case "weekdays":
      return nextWeekday(date);
  }
}

function nextWeekday(date: Date): Date {
  let next = addDays(date, 1);
  while (next.getUTCDay() === 0 || next.getUTCDay() === 6) {
    next = addDays(next, 1);
  }
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const lastDay = daysInMonthUtc(year, month);
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

function addYears(date: Date, years: number): Date {
  const year = date.getUTCFullYear() + years;
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const lastDay = daysInMonthUtc(year, month);
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

function daysInMonthUtc(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parts = value.split("-").map(Number);
  const [year, month, day] = parts;
  if (year === undefined || month === undefined || day === undefined) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function dateOnlyFrom(value: Date | string): Date {
  if (typeof value === "string") {
    const parsed = parseDateOnly(value);
    if (parsed) {
      return parsed;
    }
    return dateOnlyFrom(new Date(value));
  }

  return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
}

function compareDateOnly(left: Date, right: Date): number {
  return left.getTime() - right.getTime();
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
