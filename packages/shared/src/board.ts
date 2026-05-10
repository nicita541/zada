export interface BoardColumnTemplate {
  name: string;
  color?: string | null;
}

export interface BoardColumnLike {
  id: string;
  name: string;
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

export const standardBoardColumns: BoardColumnTemplate[] = [
  { name: "Backlog", color: "#64748b" },
  { name: "Todo", color: "#6366f1" },
  { name: "In Progress", color: "#3b82f6" },
  { name: "Review", color: "#f59e0b" },
  { name: "Done", color: "#22c55e" }
];

export const gameDevBoardColumns: BoardColumnTemplate[] = [
  { name: "Ideas", color: "#64748b" },
  { name: "Backlog", color: "#6366f1" },
  { name: "Todo", color: "#3b82f6" },
  { name: "In Progress", color: "#f59e0b" },
  { name: "Testing", color: "#ef4444" },
  { name: "Done", color: "#22c55e" }
];

export function defaultBoardColumnsForProject(type?: string | null): BoardColumnTemplate[] {
  return type === "game-dev" || type === "game_dev" ? gameDevBoardColumns : standardBoardColumns;
}

export function shouldCreateDefaultColumns(columns: Array<Pick<BoardColumnLike, "deletedAt">>): boolean {
  return columns.filter((column) => !column.deletedAt).length === 0;
}

export function backlogColumnId(columns: BoardColumnLike[]): string | null {
  const activeColumns = columns.filter((column) => !column.deletedAt).sort((left, right) => left.position - right.position);
  return activeColumns.find((column) => column.name.toLowerCase() === "backlog")?.id ?? activeColumns[0]?.id ?? null;
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
