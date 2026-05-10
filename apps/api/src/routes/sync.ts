import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { currentUserId, requireAuth } from "../auth/middleware";
import { asyncHandler } from "../http";
import { prisma } from "../prisma";

const router = Router();
router.use(requireAuth);

const syncChangeSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  workspaceId: z.string().uuid().nullable().optional(),
  operation: z.enum(["create", "update", "delete"]),
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
    const [projects, tasks, notes, settings, latestChange] = await Promise.all([
      prisma.project.findMany({ where: { userId } }),
      prisma.task.findMany({ where: { userId } }),
      prisma.note.findMany({ where: { userId } }),
      prisma.userSettings.findUnique({ where: { userId } }),
      prisma.changeLog.findFirst({ where: { userId }, orderBy: { revision: "desc" } })
    ]);

    res.json({
      revision: latestChange?.revision ?? 0,
      entities: { projects, tasks, notes, settings }
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

async function applyChange(userId: string, change: SyncChange) {
  if (change.entityType === "project") {
    await applyProjectChange(userId, change);
    return;
  }

  if (change.entityType === "task") {
    await applyTaskChange(userId, change);
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
  if (entityType === "task") {
    return 1;
  }
  return 2;
}

export default router;
