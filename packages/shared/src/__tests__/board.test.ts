import { describe, expect, it } from "vitest";
import {
  backlogColumnId,
  defaultBoardColumnsForProject,
  effectiveTaskColumnId,
  moveBoardTask,
  shouldCreateDefaultColumns
} from "../board";
import { createSyncQueueItem } from "../sync";

const columns = [
  { id: "backlog", name: "Backlog", position: 0 },
  { id: "todo", name: "Todo", position: 1 },
  { id: "done", name: "Done", position: 2 }
];

describe("board helpers", () => {
  it("creates standard default columns once", () => {
    expect(defaultBoardColumnsForProject("standard").map((column) => column.name)).toEqual([
      "Backlog",
      "Todo",
      "In Progress",
      "Review",
      "Done"
    ]);
    expect(shouldCreateDefaultColumns([])).toBe(true);
    expect(shouldCreateDefaultColumns(columns)).toBe(false);
  });

  it("uses Backlog for tasks without a valid column", () => {
    expect(backlogColumnId(columns)).toBe("backlog");
    expect(effectiveTaskColumnId({ id: "task-1", columnId: null }, columns)).toBe("backlog");
    expect(effectiveTaskColumnId({ id: "task-2", columnId: "missing" }, columns)).toBe("backlog");
    expect(backlogColumnId([{ id: "todo", name: "Todo", position: 1 }])).toBe("todo");
  });

  it("moves tasks within and between columns", () => {
    const tasks = [
      { id: "a", columnId: "backlog", position: 0 },
      { id: "b", columnId: "backlog", position: 1 },
      { id: "c", columnId: "todo", position: 0 }
    ];

    expect(moveBoardTask(tasks, columns, "b", "todo", 1)).toEqual([
      { taskId: "a", columnId: "backlog", position: 0 },
      { taskId: "c", columnId: "todo", position: 0 },
      { taskId: "b", columnId: "todo", position: 1 }
    ]);
  });

  it("creates queue items for board column and task move mutations", () => {
    const now = new Date("2026-05-10T00:03:00.000Z");
    expect(createSyncQueueItem("board_column", "column-1", "create", { name: "Review" }, now).entityType).toBe(
      "board_column"
    );
    expect(createSyncQueueItem("task", "task-1", "move", { taskId: "task-1", columnId: "done", position: 0 }, now).operation).toBe(
      "move"
    );
  });
});
