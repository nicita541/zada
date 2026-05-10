export type BoardColumnKind = "backlog" | "todo" | "in_progress" | "review" | "done" | "custom";

export interface BoardColumnTemplate {
  name: string;
  kind: BoardColumnKind;
  color?: string | null;
}

export interface BoardColumnLike {
  id: string;
  name: string;
  kind?: string | null;
  position: number;
  deletedAt?: string | null;
}

export interface BoardTaskLike {
  id: string;
  projectId?: string | null;
  columnId?: string | null;
  position?: number;
}

export interface BoardTaskMove {
  taskId: string;
  columnId: string | null;
  position: number;
}

export interface BoardColumnDeduplication<TColumn extends BoardColumnLike = BoardColumnLike> {
  columns: Array<TColumn & { kind: BoardColumnKind }>;
  duplicateColumnIds: string[];
  duplicateToPrimaryColumnId: Record<string, string>;
  taskMoves: BoardTaskMove[];
}

const defaultKindOrder: Record<Exclude<BoardColumnKind, "custom">, number> = {
  backlog: 0,
  todo: 1,
  in_progress: 2,
  review: 3,
  done: 4
};

export const standardBoardColumns: BoardColumnTemplate[] = [
  { name: "Backlog", kind: "backlog", color: "#64748b" },
  { name: "Todo", kind: "todo", color: "#6366f1" },
  { name: "In Progress", kind: "in_progress", color: "#3b82f6" },
  { name: "Review", kind: "review", color: "#f59e0b" },
  { name: "Done", kind: "done", color: "#22c55e" }
];

export const gameDevBoardColumns: BoardColumnTemplate[] = [
  { name: "Ideas", kind: "custom", color: "#64748b" },
  { name: "Backlog", kind: "backlog", color: "#6366f1" },
  { name: "Todo", kind: "todo", color: "#3b82f6" },
  { name: "In Progress", kind: "in_progress", color: "#f59e0b" },
  { name: "Testing", kind: "custom", color: "#ef4444" },
  { name: "Done", kind: "done", color: "#22c55e" }
];

export function defaultBoardColumnsForProject(type?: string | null): BoardColumnTemplate[] {
  return type === "game-dev" || type === "game_dev" ? gameDevBoardColumns : standardBoardColumns;
}

export function shouldCreateDefaultColumns(columns: Array<Pick<BoardColumnLike, "deletedAt">>): boolean {
  return columns.filter((column) => !column.deletedAt).length === 0;
}

export function inferBoardColumnKind(name: string, kind?: string | null): BoardColumnKind {
  if (isBoardColumnKind(kind)) {
    return kind;
  }

  const normalized = normalizeColumnName(name);
  if (["backlog", "\u0431\u044d\u043a\u043b\u043e\u0433"].includes(normalized)) {
    return "backlog";
  }
  if (["todo", "to do", "\u043a \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u044e"].includes(normalized)) {
    return "todo";
  }
  if (["in progress", "\u0432 \u0440\u0430\u0431\u043e\u0442\u0435"].includes(normalized)) {
    return "in_progress";
  }
  if (["review", "\u043d\u0430 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0435"].includes(normalized)) {
    return "review";
  }
  if (["done", "\u0433\u043e\u0442\u043e\u0432\u043e"].includes(normalized)) {
    return "done";
  }
  return "custom";
}

export function boardColumnKindOrder(kind: BoardColumnKind): number {
  return kind === "custom" ? 100 : defaultKindOrder[kind];
}

export function isDefaultBoardColumnKind(kind: BoardColumnKind): kind is Exclude<BoardColumnKind, "custom"> {
  return kind !== "custom";
}

export function missingDefaultBoardColumns(
  columns: BoardColumnLike[],
  template: BoardColumnTemplate[]
): BoardColumnTemplate[] {
  const activeColumns = columns.filter((column) => !column.deletedAt);
  const existingDefaultKinds = new Set(
    activeColumns.map((column) => inferBoardColumnKind(column.name, column.kind)).filter(isDefaultBoardColumnKind)
  );
  const existingCustomNames = new Set(
    activeColumns
      .filter((column) => inferBoardColumnKind(column.name, column.kind) === "custom")
      .map((column) => normalizeColumnName(column.name))
  );

  return template.filter((column) =>
    isDefaultBoardColumnKind(column.kind)
      ? !existingDefaultKinds.has(column.kind)
      : !existingCustomNames.has(normalizeColumnName(column.name))
  );
}

export function dedupeBoardColumns<TColumn extends BoardColumnLike>(
  columns: TColumn[],
  tasks: BoardTaskLike[] = []
): BoardColumnDeduplication<TColumn> {
  const activeColumns = columns
    .filter((column) => !column.deletedAt)
    .map((column) => ({ ...column, kind: inferBoardColumnKind(column.name, column.kind) }))
    .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name));
  const primaryByKind = new Map<Exclude<BoardColumnKind, "custom">, string>();
  const keptColumns: Array<TColumn & { kind: BoardColumnKind }> = [];
  const duplicateColumnIds: string[] = [];
  const duplicateToPrimaryColumnId: Record<string, string> = {};

  for (const column of activeColumns) {
    if (!isDefaultBoardColumnKind(column.kind)) {
      keptColumns.push(column);
      continue;
    }

    const primaryId = primaryByKind.get(column.kind);
    if (primaryId) {
      duplicateColumnIds.push(column.id);
      duplicateToPrimaryColumnId[column.id] = primaryId;
      continue;
    }

    primaryByKind.set(column.kind, column.id);
    keptColumns.push(column);
  }

  const normalizedColumns =
    duplicateColumnIds.length > 0
      ? [...keptColumns]
          .sort(compareColumnsForDefaultOrder)
          .map((column, position) => ({ ...column, position }))
      : keptColumns;

  return {
    columns: normalizedColumns,
    duplicateColumnIds,
    duplicateToPrimaryColumnId,
    taskMoves: taskMovesForDuplicateColumns(tasks, duplicateToPrimaryColumnId)
  };
}

export function backlogColumnId(columns: BoardColumnLike[]): string | null {
  const activeColumns = columns.filter((column) => !column.deletedAt).sort((left, right) => left.position - right.position);
  return activeColumns.find((column) => inferBoardColumnKind(column.name, column.kind) === "backlog")?.id ?? activeColumns[0]?.id ?? null;
}

export function effectiveTaskColumnId(task: BoardTaskLike, columns: BoardColumnLike[]): string | null {
  const activeIds = new Set(columns.filter((column) => !column.deletedAt).map((column) => column.id));
  if (task.columnId && activeIds.has(task.columnId)) {
    return task.columnId;
  }
  return backlogColumnId(columns);
}

export function moveBoardTask(
  tasks: BoardTaskLike[],
  columns: BoardColumnLike[],
  taskId: string,
  targetColumnId: string | null,
  targetPosition: number
): BoardTaskMove[] {
  const task = tasks.find((candidate) => candidate.id === taskId);
  if (!task) {
    return [];
  }

  const sourceColumnId = effectiveTaskColumnId(task, columns);
  const normalizedTargetColumnId = targetColumnId ?? backlogColumnId(columns);
  const affectedColumnIds = new Set([sourceColumnId, normalizedTargetColumnId]);
  const tasksByColumn = new Map<string | null, BoardTaskLike[]>();

  for (const columnId of affectedColumnIds) {
    tasksByColumn.set(
      columnId ?? null,
      tasks
        .filter((candidate) => candidate.id !== taskId && effectiveTaskColumnId(candidate, columns) === columnId)
        .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
    );
  }

  const targetTasks = tasksByColumn.get(normalizedTargetColumnId ?? null) ?? [];
  const insertAt = Math.max(0, Math.min(targetPosition, targetTasks.length));
  targetTasks.splice(insertAt, 0, { ...task, columnId: normalizedTargetColumnId });
  tasksByColumn.set(normalizedTargetColumnId ?? null, targetTasks);

  return Array.from(tasksByColumn.entries()).flatMap(([columnId, columnTasks]) =>
    columnTasks.map((columnTask, position) => ({
      taskId: columnTask.id,
      columnId,
      position
    }))
  );
}

export function detachTasksFromDeletedColumn(tasks: BoardTaskLike[], deletedColumnId: string): BoardTaskMove[] {
  return tasks
    .filter((task) => task.columnId === deletedColumnId)
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0) || left.id.localeCompare(right.id))
    .map((task, position) => ({
      taskId: task.id,
      columnId: null,
      position
    }));
}

function isBoardColumnKind(kind: string | null | undefined): kind is BoardColumnKind {
  return ["backlog", "todo", "in_progress", "review", "done", "custom"].includes(kind ?? "");
}

function normalizeColumnName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function compareColumnsForDefaultOrder(left: BoardColumnLike, right: BoardColumnLike): number {
  const leftKind = inferBoardColumnKind(left.name, left.kind);
  const rightKind = inferBoardColumnKind(right.name, right.kind);
  return (
    boardColumnKindOrder(leftKind) - boardColumnKindOrder(rightKind) ||
    left.position - right.position ||
    left.name.localeCompare(right.name)
  );
}

function taskMovesForDuplicateColumns(
  tasks: BoardTaskLike[],
  duplicateToPrimaryColumnId: Record<string, string>
): BoardTaskMove[] {
  const duplicateIds = new Set(Object.keys(duplicateToPrimaryColumnId));
  if (duplicateIds.size === 0) {
    return [];
  }

  const affectedPrimaryIds = new Set(Object.values(duplicateToPrimaryColumnId));
  const normalizedTasks = tasks.map((task) => ({
    ...task,
    columnId: task.columnId && duplicateToPrimaryColumnId[task.columnId] ? duplicateToPrimaryColumnId[task.columnId] : task.columnId ?? null
  }));

  return Array.from(affectedPrimaryIds).flatMap((columnId) =>
    normalizedTasks
      .filter((task) => task.columnId === columnId)
      .sort((left, right) => (left.position ?? 0) - (right.position ?? 0) || left.id.localeCompare(right.id))
      .map((task, position) => ({ taskId: task.id, columnId, position }))
  );
}
