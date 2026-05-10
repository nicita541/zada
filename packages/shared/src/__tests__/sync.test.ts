import { describe, expect, it } from "vitest";
import { createSyncQueueItem } from "../sync";

describe("createSyncQueueItem", () => {
  it("creates a queue item for a local-first project mutation", () => {
    const timestamp = new Date("2026-05-10T00:00:00.000Z");
    const payload = { id: "project-1", name: "MVP", updatedAt: timestamp.toISOString() };

    expect(createSyncQueueItem("project", payload.id, "create", payload, timestamp)).toEqual({
      id: "project-project-1-1778371200000",
      entityType: "project",
      entityId: "project-1",
      operation: "create",
      payload,
      createdAt: "2026-05-10T00:00:00.000Z",
      retryCount: 0,
      lastError: null
    });
  });

  it("creates a queue item for a local-first task update", () => {
    const timestamp = new Date("2026-05-10T00:01:00.000Z");
    const payload = { id: "task-1", title: "Edit task", completed: true };

    const item = createSyncQueueItem("task", payload.id, "update", payload, timestamp);

    expect(item.entityType).toBe("task");
    expect(item.operation).toBe("update");
    expect(item.payload).toBe(payload);
  });

  it("supports task-detail entity queue types", () => {
    const timestamp = new Date("2026-05-10T00:02:00.000Z");
    const subtask = createSyncQueueItem("subtask", "subtask-1", "create", { taskId: "task-1", title: "Step" }, timestamp);
    const reminder = createSyncQueueItem("reminder", "reminder-1", "create", { taskId: "task-1", remindAt: timestamp.toISOString() }, timestamp);
    const tag = createSyncQueueItem("tag", "tag-1", "create", { name: "combat" }, timestamp);
    const taskTag = createSyncQueueItem("task_tag", "task-1:tag-1", "create", { taskId: "task-1", tagId: "tag-1" }, timestamp);

    expect([subtask.entityType, reminder.entityType, tag.entityType, taskTag.entityType]).toEqual([
      "subtask",
      "reminder",
      "tag",
      "task_tag"
    ]);
  });
});
