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
});
