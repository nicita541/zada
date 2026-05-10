import type { Priority, QuickAddResult, RepeatRule, TaskType } from "./types";

const validTaskTypes = new Set<TaskType>([
  "feature",
  "bug",
  "polish",
  "balance",
  "art",
  "audio",
  "ui",
  "code",
  "design",
  "research",
  "testing",
  "build",
  "release",
  "milestone"
]);

const validPriorities = new Set<Priority>(["p1", "p2", "p3", "p4"]);
const validRepeats = new Set<RepeatRule>(["daily", "weekly", "monthly", "yearly", "weekdays"]);

export function parseQuickAdd(input: string, options: { now?: Date } = {}): QuickAddResult {
  const tags = new Set<string>();
  let priority: Priority | null = null;
  let dueDate: string | null = null;
  let startDate: string | null = null;
  let time: string | null = null;
  let repeat: RepeatRule | null = null;
  let remindAt: string | null = null;
  let type: TaskType = "feature";
  let projectRef: string | null = null;
  const repeatPhrase = extractRepeatPhrase(input);
  if (repeatPhrase) {
    input = repeatPhrase.input;
    repeat = repeatPhrase.repeat;
  }

  const titleParts: string[] = [];
  for (const token of tokenize(input)) {
    const naturalDate = parseNaturalDateToken(token, options.now ?? new Date());
    if (naturalDate) {
      dueDate = naturalDate;
      continue;
    }

    if (token.startsWith("#") && token.length > 1) {
      tags.add(token.slice(1));
      continue;
    }

    if (token.startsWith("@") && token.length > 1) {
      projectRef = token.slice(1);
      continue;
    }

    if (validPriorities.has(token.toLowerCase() as Priority)) {
      priority = token.toLowerCase() as Priority;
      continue;
    }

    if (token.startsWith("due:")) {
      dueDate = token.slice(4);
      continue;
    }

    if (token.startsWith("start:")) {
      startDate = token.slice(6);
      continue;
    }

    if (token.startsWith("time:")) {
      time = token.slice(5);
      continue;
    }

    if (token.startsWith("repeat:")) {
      const value = token.slice(7).toLowerCase();
      if (validRepeats.has(value as RepeatRule)) {
        repeat = value as RepeatRule;
      }
      continue;
    }

    if (token.startsWith("remind:")) {
      remindAt = token.slice(7);
      continue;
    }

    if (token.startsWith("[") && token.endsWith("]")) {
      const rawType = token.slice(1, -1).toLowerCase();
      if (validTaskTypes.has(rawType as TaskType)) {
        type = rawType as TaskType;
        continue;
      }
    }

    titleParts.push(token);
  }

  return {
    title: titleParts.join(" ").trim(),
    tags: Array.from(tags),
    priority,
    dueDate,
    startDate,
    time,
    repeat,
    remindAt,
    type,
    projectRef
  };
}

function extractRepeatPhrase(input: string): { input: string; repeat: RepeatRule } | null {
  const patterns: Array<{ pattern: RegExp; repeat: RepeatRule }> = [
    { pattern: /\b(?:every\s+day|daily)\b/i, repeat: "daily" },
    { pattern: /\b(?:every\s+week|weekly)\b/i, repeat: "weekly" },
    { pattern: /\b(?:every\s+month|monthly)\b/i, repeat: "monthly" },
    { pattern: /\b(?:every\s+year|yearly|annually)\b/i, repeat: "yearly" },
    { pattern: /\b(?:weekdays|every\s+weekday|mon-?fri)\b/i, repeat: "weekdays" },
    { pattern: /(?:каждый\s+день|ежедневно)/iu, repeat: "daily" },
    { pattern: /(?:каждую\s+неделю|еженедельно)/iu, repeat: "weekly" },
    { pattern: /(?:каждый\s+месяц|ежемесячно)/iu, repeat: "monthly" },
    { pattern: /(?:каждый\s+год|ежегодно)/iu, repeat: "yearly" },
    { pattern: /(?:по\s+будням|будни)/iu, repeat: "weekdays" }
  ];

  for (const { pattern, repeat } of patterns) {
    if (pattern.test(input)) {
      return {
        input: input.replace(pattern, " ").replace(/\s+/g, " ").trim(),
        repeat
      };
    }
  }

  return null;
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (const char of input.trim()) {
    if ((char === '"' || char === "'") && !quote) {
      quote = char;
      continue;
    }

    if (quote === char) {
      quote = null;
      continue;
    }

    if (/\s/.test(char) && !quote) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function parseNaturalDateToken(token: string, now: Date): string | null {
  const normalized = token.trim().toLowerCase();
  const offsets: Record<string, number> = {
    today: 0,
    "сегодня": 0,
    tomorrow: 1,
    "завтра": 1,
    "послезавтра": 2
  };

  const offset = offsets[normalized];
  if (offset === undefined) {
    return null;
  }

  const date = new Date(now);
  date.setDate(date.getDate() + offset);
  return formatDateOnly(date);
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
