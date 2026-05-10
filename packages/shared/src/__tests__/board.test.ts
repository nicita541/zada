import { describe, expect, it } from "vitest";
import {
  backlogColumnId,
  dedupeBoardColumns,
  defaultBoardColumnsForProject,
  effectiveTaskColumnId,
  inferBoardColumnKind,
  missingDefaultBoardColumns,
  moveBoardTask,
  shouldCreateDefaultColumns
} from "../board";
import { createSyncQueueItem } from "../sync";

const columns = [
  { id: "backlog", name: "Backlog", kind: "backlog", position: 0 },
  { id: "todo", name: "Todo", kind: "todo", position: 1 },
  { id: "done", name: "Done", kind: "done", position: 2 }
];

describe("board helpers", () => {
  it("creates standard default columns once and in stable order", () => {
    expect(defaultBoardColumnsForProject("standard").map((column) => [column.kind, column.name])).toEqual([
      ["backlog", "Backlog"],
      ["todo", "Todo"],
      ["in_progress", "In Progress"],
      ["review", "Review"],
      ["done", "Done"]
    ]);
    expect(shouldCreateDefaultColumns([])).toBe(true);
    expect(shouldCreateDefaultColumns(columns)).toBe(false);
  });

  it("infers default column kind from old English and Russian names", () => {
    expect(inferBoardColumnKind("Backlog")).toBe("backlog");
    expect(inferBoardColumnKind("\u0411\u044d\u043a\u043b\u043e\u0433")).toBe("backlog");
    expect(inferBoardColumnKind("Todo")).toBe("todo");
    expect(inferBoardColumnKind("\u041a \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u044e")).toBe("todo");
    expect(inferBoardColumnKind("In Progress")).toBe("in_progress");
    expect(inferBoardColumnKind("\u0412 \u0440\u0430\u0431\u043e\u0442\u0435")).toBe("in_progress");
    expect(inferBoardColumnKind("Review")).toBe("review");
    expect(inferBoardColumnKind("\u041d\u0430 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0435")).toBe("review");
    expect(inferBoardColumnKind("Done")).toBe("done");
    expect(inferBoardColumnKind("\u0413\u043e\u0442\u043e\u0432\u043e")).toBe("done");
    expect(inferBoardColumnKind("QA")).toBe("custom");
  });

  it("does not ask for defaults when old English columns already exist", () => {
    expect(missingDefaultBoardColumns(columns, defaultBoardColumnsForProject("standard")).map((column) => column.kind)).toEqual([
      "in_progress",
      "review"
    ]);
    expect(missingDefaultBoardColumns(defaultBoardColumnsForProject("standard").map((column, position) => ({ id: column.kind, ...column, position })), defaultBoardColumnsForProject("standard"))).toEqual([]);
  });

  it("dedupes repeated default columns and keeps primary columns in default order", () => {
    const result = dedupeBoardColumns([
      { id: "todo-1", name: "Todo", position: 1 },
      { id: "backlog-1", name: "Backlog", position: 0 },
      { id: "backlog-2", name: "\u0411\u044d\u043a\u043b\u043e\u0433", position: 2 },
      { id: "todo-2", name: "\u041a \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u044e", position: 3 },
      { id: "done-1", name: "Done", position: 4 }
    ]);

    expect(result.duplicateColumnIds).toEqual(["backlog-2", "todo-2"]);
    expect(result.columns.map((column) => [column.id, column.kind, column.position])).toEqual([
      ["backlog-1", "backlog", 0],
      ["todo-1", "todo", 1],
      ["done-1", "done", 2]
    ]);
  });

  it("moves tasks from duplicate columns to primary columns", () => {
    const result = dedupeBoardColumns(
      [
        { id: "backlog-1", name: "Backlog", position: 0 },
        { id: "backlog-2", name: "\u0411\u044d\u043a\u043b\u043e\u0433", position: 1 }
      ],
      [
        { id: "a", columnId: "backlog-1", position: 0 },
        { id: "b", columnId: "backlog-2", position: 0 }
      ]
    );

    expect(result.duplicateToPrimaryColumnId).toEqual({ "backlog-2": "backlog-1" });
    expect(result.taskMoves).toEqual([
      { taskId: "a", columnId: "backlog-1", position: 0 },
      { taskId: "b", columnId: "backlog-1", position: 1 }
    ]);
  });

  it("keeps ensure-default inputs idempotent after defaults exist", () => {
    const existing = defaultBoardColumnsForProject("standard").map((column, position) => ({
      id: column.kind,
      name: column.name,
      kind: column.kind,
      position
    }));

    expect(missingDefaultBoardColumns(existing, defaultBoardColumnsForProject("standard"))).toEqual([]);
    expect(dedupeBoardColumns(existing).duplicateColumnIds).toEqual([]);
  });

  it("uses Backlog for tasks without a valid column", () => {
    expect(backlogColumnId(columns)).toBe("backlog");
    expect(effectiveTaskColumnId({ id: "task-1", columnId: null }, columns)).toBe("backlog");
    expect(effectiveTaskColumnId({ id: "task-2", columnId: "missing" }, columns)).toBe("backlog");
    expect(backlogColumnId([{ id: "todo", name: "Todo", position: 1 }])).toBe("todo");
    expect(backlogColumnId([{ id: "ru-backlog", name: "\u0411\u044d\u043a\u043b\u043e\u0433", position: 0 }])).toBe("ru-backlog");
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
    expect(
      createSyncQueueItem("task", "task-1", "move", { taskId: "task-1", columnId: "done", position: 0 }, now).operation
    ).toBe("move");
  });
});
