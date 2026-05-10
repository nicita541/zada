import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { currentUserId, requireAuth } from "../auth/middleware";
import { asyncHandler, HttpError } from "../http";
import { prisma } from "../prisma";

const router = Router();
router.use(requireAuth);

const syncChangeSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  workspaceId: z.string().uuid().nullable().optional(),
  operation: z.enum(["create", "update", "delete", "reorder", "move"]),
  payload: z.unknown()
});

const syncPushSchema = z.object({
  changes: z.array(syncChangeSchema)
});

type SyncChange = z.infer<typeof syncChangeSchema>;

router.get(
  "/bootstrap",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const [projects, boardColumns, tasks, tags, taskTags, subtasks, reminders, notes, settings, latestChange] = await Promise.all([
      prisma.project.findMany({ where: { userId } }),
      prisma.boardColumn.findMany({ where: { userId } }),
      prisma.task.findMany({ where: { userId }, include: { taskTags: { include: { tag: true } }, subtasks: true, reminders: true } }),
      prisma.tag.findMany({ where: { userId } }),
      prisma.taskTag.findMany({ where: { task: { userId } } }),
      prisma.subtask.findMany({ where: { userId } }),
      prisma.reminder.findMany({ where: { userId } }),
      prisma.note.findMany({ where: { userId } }),
      prisma.userSettings.findUnique({ where: { userId } }),
      prisma.changeLog.findFirst({ where: { userId }, orderBy: { revision: "desc" } })
    ]);

    res.json({
      revision: latestChange?.revision ?? 0,
      entities: { projects, boardColumns, tasks, tags, taskTags, subtasks, reminders, notes, settings }
    });
  })
);

router.post(
  "/push",
  asyncHandler(async (req, res) => {
    const input = syncPushSchema.parse(req.body);

    const userId = currentUserId(req);
    const accepted = [];
    const changes = [...input.changes].sort((left, right) => entityOrder(left.entityType) - entityOrder(right.entityType));
    for (const change of changes) {
      if (change.entityType === "subscription") {
        continue;
      }

      const payloadRecord =
        typeof change.payload === "object" && change.payload !== null
          ? (change.payload as Record<string, unknown>)
          : null;

      if (change.entityType === "note" && payloadRecord?.syncStatus === "local_only") {
        continue;
      }

      await applyChange(userId, change);

      const created = await prisma.changeLog.create({
        data: {
          userId,
          workspaceId: change.workspaceId ?? null,
          entityType: change.entityType,
          entityId: change.entityId,
          operation: change.operation,
          payload: change.payload as Prisma.InputJsonValue
        }
      });
      accepted.push(created);
    }

    res.json({ accepted });
  })
);

router.get(
  "/changes",
  asyncHandler(async (req, res) => {
    const since = Number(req.query.since ?? 0);
    const changes = await prisma.changeLog.findMany({
      where: {
        userId: currentUserId(req),
        revision: { gt: Number.isFinite(since) ? since : 0 }
      },
      orderBy: { revision: "asc" },
      take: 500
    });

    res.json({ changes });
  })
);

const projectPayloadSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().nullable().optional(),
    type: z.string().optional(),
    workspaceId: z.string().uuid().nullable().optional()
  })
  .passthrough();

const taskPayloadSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    projectId: z.string().uuid().nullable().optional(),
    columnId: z.string().uuid().nullable().optional(),
    parentId: z.string().uuid().nullable().optional(),
    status: z.string().optional(),
    type: z.string().optional(),
    priority: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    startDate: z.string().nullable().optional(),
    time: z.string().nullable().optional(),
    repeat: z.string().nullable().optional(),
    estimatedMinutes: z.number().int().nullable().optional(),
    completedAt: z.string().nullable().optional(),
    gameArea: z.string().nullable().optional(),
    severity: z.string().nullable().optional(),
    buildVersion: z.string().nullable().optional(),
    stepsToReproduce: z.string().nullable().optional(),
    expectedResult: z.string().nullable().optional(),
    actualResult: z.string().nullable().optional(),
    position: z.number().int().optional(),
    workspaceId: z.string().uuid().nullable().optional(),
    tags: z.array(z.string()).optional()
  })
  .passthrough();

const tagPayloadSchema = z
  .object({
    name: z.string().min(1),
    color: z.string().nullable().optional(),
    workspaceId: z.string().uuid().nullable().optional()
  })
  .passthrough();

const subtaskPayloadSchema = z
  .object({
    taskId: z.string().uuid(),
    title: z.string().min(1),
    completed: z.boolean().optional(),
    position: z.number().int().optional(),
    workspaceId: z.string().uuid().nullable().optional()
  })
  .passthrough();

const reminderPayloadSchema = z
  .object({
    taskId: z.string().uuid().nullable().optional(),
    remindAt: z.string(),
    type: z.string().optional(),
    dismissedAt: z.string().nullable().optional(),
    workspaceId: z.string().uuid().nullable().optional()
  })
  .passthrough();

const taskTagPayloadSchema = z
  .object({
    taskId: z.string().uuid(),
    tagId: z.string().uuid()
  })
  .passthrough();

const boardColumnPayloadSchema = z
  .object({
    projectId: z.string().uuid(),
    name: z.string().min(1),
    color: z.string().nullable().optional(),
    position: z.number().int().min(0).optional(),
    workspaceId: z.string().uuid().nullable().optional()
  })
  .passthrough();

const reorderColumnsPayloadSchema = z
  .object({
    projectId: z.string().uuid(),
    items: z.array(z.object({ id: z.string().uuid(), position: z.number().int().min(0) })).optional(),
    orderedColumnIds: z.array(z.string().uuid()).optional()
  })
  .refine((input) => Boolean(input.items?.length || input.orderedColumnIds?.length), {
    message: "No columns to reorder"
  });

const taskMovePayloadSchema = z
  .object({
    projectId: z.string().uuid().nullable().optional(),
    columnId: z.string().uuid().nullable().optional(),
    position: z.number().int().min(0).optional()
  })
  .passthrough();

async function applyChange(userId: string, change: SyncChange) {
  if (change.entityType === "project") {
    await applyProjectChange(userId, change);
    return;
  }

  if (change.entityType === "task") {
    await applyTaskChange(userId, change);
    return;
  }

  if (change.entityType === "board_column") {
    await applyBoardColumnChange(userId, change);
    return;
  }

  if (change.entityType === "tag") {
    await applyTagChange(userId, change);
    return;
  }

  if (change.entityType === "subtask") {
    await applySubtaskChange(userId, change);
    return;
  }

  if (change.entityType === "reminder") {
    await applyReminderChange(userId, change);
    return;
  }

  if (change.entityType === "task_tag") {
    await applyTaskTagChange(userId, change);
  }
}

async function applyProjectChange(userId: string, change: SyncChange) {
  if (change.operation === "delete") {
    await prisma.project.updateMany({
      where: { id: change.entityId, userId },
      data: { deletedAt: new Date() }
    });
    return;
  }

  const payload = projectPayloadSchema.parse(change.payload);
  const workspaceId = await workspaceIdFor(userId, payload.workspaceId ?? change.workspaceId);

  await prisma.project.upsert({
    where: { id: change.entityId },
    create: {
      id: change.entityId,
      userId,
      workspaceId,
      name: payload.name,
      description: payload.description ?? null,
      type: payload.type ?? "standard",
      deletedAt: null
    },
    update: {
      name: payload.name,
      description: payload.description ?? null,
      type: payload.type ?? "standard",
      deletedAt: null
    }
  });
}

async function applyTaskChange(userId: string, change: SyncChange) {
  if (change.operation === "delete") {
    await prisma.task.updateMany({
      where: { id: change.entityId, userId },
      data: { deletedAt: new Date() }
    });
    return;
  }

  if (change.operation === "move" || change.operation === "reorder") {
    await applyTaskMoveChange(userId, change);
    return;
  }

  const payload = taskPayloadSchema.parse(change.payload);
  const workspaceId = await workspaceIdFor(userId, payload.workspaceId ?? change.workspaceId);
  const projectId = payload.projectId ? await ownedProjectId(userId, payload.projectId) : null;

  const data = {
    workspaceId,
    projectId,
    columnId: payload.columnId ?? null,
    parentId: payload.parentId ?? null,
    title: payload.title,
    description: payload.description ?? null,
    status: payload.status ?? "todo",
    type: payload.type ?? "feature",
    priority: payload.priority ?? null,
    dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
    startDate: payload.startDate ? new Date(payload.startDate) : null,
    time: payload.time ?? null,
    repeat: payload.repeat ?? null,
    estimatedMinutes: payload.estimatedMinutes ?? null,
    completedAt: payload.completedAt ? new Date(payload.completedAt) : null,
    gameArea: payload.gameArea ?? null,
    severity: payload.severity ?? null,
    buildVersion: payload.buildVersion ?? null,
    stepsToReproduce: payload.stepsToReproduce ?? null,
    expectedResult: payload.expectedResult ?? null,
    actualResult: payload.actualResult ?? null,
    position: payload.position ?? 0,
    deletedAt: null
  };

  await prisma.task.upsert({
    where: { id: change.entityId },
    create: { id: change.entityId, userId, ...data },
    update: data
  });

  if (payload.tags) {
    await syncTaskTags(userId, workspaceId, change.entityId, payload.tags);
  }
}

async function applyBoardColumnChange(userId: string, change: SyncChange) {
  if (change.operation === "delete") {
    const column = await prisma.boardColumn.findFirst({
      where: { id: change.entityId, userId },
      select: { id: true, projectId: true }
    });
    if (!column) {
      return;
    }

    await prisma.$transaction([
      prisma.task.updateMany({
        where: { userId, projectId: column.projectId, columnId: column.id, deletedAt: null },
        data: { columnId: null }
      }),
      prisma.boardColumn.update({
        where: { id: column.id },
        data: { deletedAt: new Date() }
      })
    ]);
    return;
  }

  if (change.operation === "reorder") {
    const payload = reorderColumnsPayloadSchema.parse(change.payload);
    const project = await projectForUser(userId, payload.projectId);
    const items =
      payload.items ??
      payload.orderedColumnIds?.map((id, position) => ({
        id,
        position
      })) ??
      [];

    const columns = await prisma.boardColumn.findMany({
      where: { userId, projectId: project.id, id: { in: items.map((item) => item.id) }, deletedAt: null },
      select: { id: true }
    });
    const ownedIds = new Set(columns.map((column) => column.id));
    if (items.some((item) => !ownedIds.has(item.id))) {
      throw new HttpError(404, "Column not found");
    }

    await prisma.$transaction(
      items.map((item) =>
        prisma.boardColumn.update({
          where: { id: item.id },
          data: { position: item.position }
        })
      )
    );
    return;
  }

  const payload = boardColumnPayloadSchema.parse(change.payload);
  const project = await projectForUser(userId, payload.projectId);

  await prisma.boardColumn.upsert({
    where: { id: change.entityId },
    create: {
      id: change.entityId,
      userId,
      workspaceId: project.workspaceId,
      projectId: project.id,
      name: payload.name,
      color: payload.color ?? null,
      position: payload.position ?? 0,
      deletedAt: null
    },
    update: {
      name: payload.name,
      color: payload.color ?? null,
      position: payload.position ?? 0,
      deletedAt: null
    }
  });
}

async function applyTaskMoveChange(userId: string, change: SyncChange) {
  const payload = taskMovePayloadSchema.parse(change.payload);
  const task = await taskForUser(userId, change.entityId);

  if (payload.projectId && task.projectId !== payload.projectId) {
    throw new HttpError(400, "Task does not belong to project");
  }

  if (payload.columnId) {
    const column = await columnForUser(userId, payload.columnId);
    if (payload.projectId && column.projectId !== payload.projectId) {
      throw new HttpError(400, "Column does not belong to project");
    }
    if (task.projectId && column.projectId !== task.projectId) {
      throw new HttpError(400, "Column does not belong to task project");
    }
  }

  await prisma.task.update({
    where: { id: task.id },
    data: {
      columnId: payload.columnId ?? null,
      position: payload.position ?? 0
    }
  });
}

async function applyTagChange(userId: string, change: SyncChange) {
  if (change.operation === "delete") {
    await prisma.tag.updateMany({
      where: { id: change.entityId, userId },
      data: { deletedAt: new Date() }
    });
    return;
  }

  const payload = tagPayloadSchema.parse(change.payload);
  const workspaceId = await workspaceIdFor(userId, payload.workspaceId ?? change.workspaceId);

  await prisma.tag.upsert({
    where: { id: change.entityId },
    create: {
      id: change.entityId,
      userId,
      workspaceId,
      name: payload.name,
      color: payload.color ?? null,
      deletedAt: null
    },
    update: {
      name: payload.name,
      color: payload.color ?? null,
      deletedAt: null
    }
  });
}

async function applySubtaskChange(userId: string, change: SyncChange) {
  if (change.operation === "delete") {
    await prisma.subtask.updateMany({
      where: { id: change.entityId, userId },
      data: { deletedAt: new Date() }
    });
    return;
  }

  const payload = subtaskPayloadSchema.parse(change.payload);
  const task = await taskForUser(userId, payload.taskId);

  await prisma.subtask.upsert({
    where: { id: change.entityId },
    create: {
      id: change.entityId,
      userId,
      workspaceId: task.workspaceId,
      taskId: task.id,
      title: payload.title,
      completed: payload.completed ?? false,
      position: payload.position ?? 0,
      deletedAt: null
    },
    update: {
      title: payload.title,
      completed: payload.completed ?? false,
      position: payload.position ?? 0,
      deletedAt: null
    }
  });
}

async function applyReminderChange(userId: string, change: SyncChange) {
  if (change.operation === "delete") {
    await prisma.reminder.updateMany({
      where: { id: change.entityId, userId },
      data: { deletedAt: new Date() }
    });
    return;
  }

  const payload = reminderPayloadSchema.parse(change.payload);
  const task = payload.taskId ? await taskForUser(userId, payload.taskId) : null;
  const workspaceId = task?.workspaceId ?? (await workspaceIdFor(userId, payload.workspaceId ?? change.workspaceId));

  await prisma.reminder.upsert({
    where: { id: change.entityId },
    create: {
      id: change.entityId,
      userId,
      workspaceId,
      taskId: task?.id ?? null,
      type: payload.type ?? "task",
      remindAt: new Date(payload.remindAt),
      dismissedAt: payload.dismissedAt ? new Date(payload.dismissedAt) : null,
      deletedAt: null
    },
    update: {
      taskId: task?.id ?? null,
      type: payload.type ?? "task",
      remindAt: new Date(payload.remindAt),
      dismissedAt: payload.dismissedAt ? new Date(payload.dismissedAt) : null,
      deletedAt: null
    }
  });
}

async function applyTaskTagChange(userId: string, change: SyncChange) {
  const payload = taskTagPayloadSchema.parse(change.payload);
  const task = await taskForUser(userId, payload.taskId);
  const tag = await tagForUser(userId, payload.tagId);

  if (change.operation === "delete") {
    await prisma.taskTag.deleteMany({ where: { taskId: task.id, tagId: tag.id } });
    return;
  }

  await prisma.taskTag.upsert({
    where: { taskId_tagId: { taskId: task.id, tagId: tag.id } },
    create: { taskId: task.id, tagId: tag.id },
    update: {}
  });
}

async function taskForUser(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId, deletedAt: null },
    select: { id: true, workspaceId: true, projectId: true }
  });

  if (!task) {
    throw new HttpError(404, "Task not found");
  }

  return task;
}

async function projectForUser(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
    select: { id: true, workspaceId: true }
  });

  if (!project) {
    throw new HttpError(404, "Project not found");
  }

  return project;
}

async function columnForUser(userId: string, columnId: string) {
  const column = await prisma.boardColumn.findFirst({
    where: { id: columnId, userId, deletedAt: null },
    select: { id: true, workspaceId: true, projectId: true }
  });

  if (!column) {
    throw new HttpError(404, "Column not found");
  }

  return column;
}

async function tagForUser(userId: string, tagId: string) {
  const tag = await prisma.tag.findFirst({
    where: { id: tagId, userId, deletedAt: null },
    select: { id: true }
  });

  if (!tag) {
    throw new Error("Tag not found");
  }

  return tag;
}

async function ownedProjectId(userId: string, projectId: string): Promise<string | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
    select: { id: true }
  });
  return project?.id ?? null;
}

async function workspaceIdFor(userId: string, preferredId?: string | null): Promise<string> {
  if (preferredId) {
    const workspace = await prisma.workspace.findFirst({
      where: { id: preferredId, userId, deletedAt: null },
      select: { id: true }
    });

    if (workspace) {
      return workspace.id;
    }
  }

  const existing = await prisma.workspace.findFirst({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });

  if (existing) {
    return existing.id;
  }

  const workspace = await prisma.workspace.create({
    data: { userId, name: "Personal" },
    select: { id: true }
  });
  return workspace.id;
}

async function syncTaskTags(userId: string, workspaceId: string, taskId: string, rawTags: string[]) {
  const tags = Array.from(new Set(rawTags.map((tag) => tag.trim()).filter(Boolean))).slice(0, 20);

  await prisma.$transaction(async (tx) => {
    await tx.taskTag.deleteMany({ where: { taskId } });

    for (const name of tags) {
      const tag = await tx.tag.upsert({
        where: { userId_workspaceId_name: { userId, workspaceId, name } },
        update: { deletedAt: null },
        create: { userId, workspaceId, name }
      });

      await tx.taskTag.create({ data: { taskId, tagId: tag.id } });
    }
  });
}

function entityOrder(entityType: string) {
  if (entityType === "project") {
    return 0;
  }
  if (entityType === "board_column" || entityType === "tag") {
    return 1;
  }
  if (entityType === "task") {
    return 2;
  }
  if (entityType === "subtask" || entityType === "reminder" || entityType === "task_tag") {
    return 3;
  }
  return 2;
}

export default router;
