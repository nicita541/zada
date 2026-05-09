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
const validRepeats = new Set<RepeatRule>(["daily", "weekly", "monthly"]);

export function parseQuickAdd(input: string): QuickAddResult {
  const tags = new Set<string>();
  let priority: Priority | null = null;
  let dueDate: string | null = null;
  let startDate: string | null = null;
  let time: string | null = null;
  let repeat: RepeatRule | null = null;
  let remindAt: string | null = null;
  let type: TaskType = "feature";
  let projectRef: string | null = null;

  const titleParts: string[] = [];
  for (const token of tokenize(input)) {
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
      repeat = validRepeats.has(value as RepeatRule) ? (value as RepeatRule) : null;
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
