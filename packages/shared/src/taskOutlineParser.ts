import type {
  EntityId,
  Priority,
  RepeatRule,
  TaskOutlineItem,
  TaskOutlineParseResult,
  TaskOutlineTreeItem,
  TaskType
} from "./types";

const numberedPattern = /^(\d+(?:\.\d+)*)(?:[.)])?\s+(.+)$/;
const bulletPattern = /^[-*]\s+(?:\[( |x|X)\]\s+)?(.+)$/;
const checkboxPattern = /^\[( |x|X)\]\s+(.+)$/;
const projectPattern = /^#\s*(?:Project|Проект):\s*(.+)$/i;
const metadataPattern = /\s+(#[-\p{L}\p{N}_]+|@[-\p{L}\p{N}_]+|p[1-4]|due:\d{4}-\d{2}-\d{2}|start:\d{4}-\d{2}-\d{2}|time:\d{2}:\d{2}|repeat:(?:daily|weekly|monthly)|remind:\S+|\[(?:feature|bug|design|code|art|audio|ui|balance|polish|research|testing|build|release|milestone)\])/giu;
const descriptionPattern = /\(([^()]*)\)\s*$/;

const taskTypes = new Set<TaskType>([
  "feature",
  "bug",
  "design",
  "code",
  "art",
  "audio",
  "ui",
  "balance",
  "polish",
  "research",
  "testing",
  "build",
  "release",
  "milestone"
]);

export function parseTaskOutline(source: string): TaskOutlineParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const items: TaskOutlineItem[] = [];
  const parentByDepth = new Map<number, TaskOutlineItem>();
  let projectName: string | null = null;

  const lines = source.replace(/\r\n/g, "\n").split("\n");
  lines.forEach((rawLine, index) => {
    const sourceLine = index + 1;
    const trimmedRight = rawLine.trimEnd();
    const trimmed = trimmedRight.trim();

    if (!trimmed) {
      return;
    }

    const projectMatch = trimmed.match(projectPattern);
    if (projectMatch) {
      projectName = projectMatch[1]?.trim() || null;
      return;
    }

    if (trimmed.startsWith("#")) {
      return;
    }

    const indent = rawLine.match(/^\s*/)?.[0].length ?? 0;
    const parsedLine = parseTaskLine(trimmed);
    if (!parsedLine) {
      warnings.push(`Line ${sourceLine}: skipped unsupported task syntax.`);
      return;
    }

    const depth = parsedLine.outline
      ? parsedLine.outline.split(".").length - 1
      : Math.floor(indent / 2);

    const parent = depth > 0 ? findParent(parentByDepth, depth) : null;
    const item: TaskOutlineItem = {
      id: stableOutlineId(parsedLine.outline, sourceLine, parsedLine.title),
      parentId: parent?.id ?? null,
      outline: parsedLine.outline,
      depth,
      title: parsedLine.title,
      description: parsedLine.description,
      completed: parsedLine.completed,
      tags: parsedLine.tags,
      priority: parsedLine.priority,
      dueDate: parsedLine.dueDate,
      startDate: parsedLine.startDate,
      time: parsedLine.time,
      repeat: parsedLine.repeat,
      remindAt: parsedLine.remindAt,
      type: parsedLine.type,
      projectRef: parsedLine.projectRef,
      sourceLine
    };

    if (depth > 0 && !parent) {
      warnings.push(`Line ${sourceLine}: parent task was not found, item will be imported at root level.`);
    }

    items.push(item);
    parentByDepth.set(depth, item);
    for (const trackedDepth of Array.from(parentByDepth.keys())) {
      if (trackedDepth > depth) {
        parentByDepth.delete(trackedDepth);
      }
    }
  });

  if (items.length === 0) {
    errors.push("No importable tasks were found.");
  }

  return {
    projectName,
    items,
    tree: buildTaskTree(items),
    warnings,
    errors
  };
}

function parseTaskLine(line: string): Omit<TaskOutlineItem, "id" | "parentId" | "depth" | "sourceLine"> | null {
  let outline: string | null = null;
  let content = line;
  let completed = false;

  const numbered = line.match(numberedPattern);
  if (numbered) {
    outline = numbered[1] ?? null;
    content = numbered[2] ?? "";
  } else {
    const bullet = line.match(bulletPattern);
    if (bullet) {
      completed = bullet[1]?.toLowerCase() === "x";
      content = bullet[2] ?? "";
    } else {
      const checkbox = line.match(checkboxPattern);
      if (!checkbox) {
        return null;
      }
      completed = checkbox[1]?.toLowerCase() === "x";
      content = checkbox[2] ?? "";
    }
  }

  const metadata = extractMetadata(content);
  const cleanedContent = metadata.cleaned.trim();
  const descriptionMatch = cleanedContent.match(descriptionPattern);
  const description = descriptionMatch?.[1]?.trim() || null;
  const title = (descriptionMatch ? cleanedContent.slice(0, descriptionMatch.index).trim() : cleanedContent).trim();

  if (!title) {
    return null;
  }

  return {
    outline,
    title,
    description,
    completed,
    tags: metadata.tags,
    priority: metadata.priority,
    dueDate: metadata.dueDate,
    startDate: metadata.startDate,
    time: metadata.time,
    repeat: metadata.repeat,
    remindAt: metadata.remindAt,
    type: metadata.type,
    projectRef: metadata.projectRef
  };
}

function extractMetadata(content: string): {
  cleaned: string;
  tags: string[];
  priority: Priority | null;
  dueDate: string | null;
  startDate: string | null;
  time: string | null;
  repeat: RepeatRule | null;
  remindAt: string | null;
  type: TaskType;
  projectRef: string | null;
} {
  const tags = new Set<string>();
  let priority: Priority | null = null;
  let dueDate: string | null = null;
  let startDate: string | null = null;
  let time: string | null = null;
  let repeat: RepeatRule | null = null;
  let remindAt: string | null = null;
  let type: TaskType = "feature";
  let projectRef: string | null = null;

  const cleaned = content.replace(metadataPattern, (raw) => {
    const token = raw.trim();
    if (token.startsWith("#")) {
      tags.add(token.slice(1));
    } else if (token.startsWith("@")) {
      projectRef = token.slice(1);
    } else if (/^p[1-4]$/i.test(token)) {
      priority = token.toLowerCase() as Priority;
    } else if (token.startsWith("due:")) {
      dueDate = token.slice(4);
    } else if (token.startsWith("start:")) {
      startDate = token.slice(6);
    } else if (token.startsWith("time:")) {
      time = token.slice(5);
    } else if (token.startsWith("repeat:")) {
      repeat = token.slice(7) as RepeatRule;
    } else if (token.startsWith("remind:")) {
      remindAt = token.slice(7);
    } else if (token.startsWith("[") && token.endsWith("]")) {
      const rawType = token.slice(1, -1).toLowerCase();
      if (taskTypes.has(rawType as TaskType)) {
        type = rawType as TaskType;
      }
    }

    return "";
  });

  return {
    cleaned,
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

function findParent(parentByDepth: Map<number, TaskOutlineItem>, depth: number): TaskOutlineItem | null {
  for (let cursor = depth - 1; cursor >= 0; cursor -= 1) {
    const parent = parentByDepth.get(cursor);
    if (parent) {
      return parent;
    }
  }

  return null;
}

function buildTaskTree(items: TaskOutlineItem[]): TaskOutlineTreeItem[] {
  const byId = new Map<EntityId, TaskOutlineTreeItem>();
  const roots: TaskOutlineTreeItem[] = [];

  for (const item of items) {
    byId.set(item.id, { ...item, children: [] });
  }

  for (const item of items) {
    const treeItem = byId.get(item.id);
    if (!treeItem) {
      continue;
    }

    if (item.parentId && byId.has(item.parentId)) {
      byId.get(item.parentId)?.children.push(treeItem);
    } else {
      roots.push(treeItem);
    }
  }

  return roots;
}

function stableOutlineId(outline: string | null, sourceLine: number, title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `import-${outline ?? sourceLine}-${slug || "task"}`;
}
