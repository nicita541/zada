import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { currentUserId, requireAuth } from "../auth/middleware";
import { asyncHandler, HttpError } from "../http";
import { prisma } from "../prisma";

const router = Router();
router.use(requireAuth);
const defaultBoardColumns = ["Backlog", "Todo", "In Progress", "Done"];

router.get(
  "/projects",
  asyncHandler(async (req, res) => {
    const projects = await prisma.project.findMany({
      where: { userId: currentUserId(req), deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: { columns: { orderBy: { position: "asc" } } }
    });
    res.json({ projects });
  })
);

router.post(
  "/projects",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const input = z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1),
        description: z.string().optional(),
        workspaceId: z.string().uuid().optional(),
        type: z.string().default("standard")
      })
      .parse(req.body);
    const workspaceId = await workspaceIdFor(userId, input.workspaceId);

    const project = await prisma.project.create({
      data: {
        id: input.id,
        userId,
        workspaceId,
        name: input.name,
        description: input.description,
        type: input.type,
        columns: {
          create: defaultBoardColumns.map((name, position) => ({
            userId,
            workspaceId,
            name,
            position
          }))
        }
      },
      include: { columns: { orderBy: { position: "asc" } } }
    });

    res.status(201).json(project);
  })
);

router.get(
  "/projects/:id",
  asyncHandler(async (req, res) => {
    const projectId = routeId(req.params.id);
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: currentUserId(req), deletedAt: null },
      include: {
        columns: { orderBy: { position: "asc" } },
        tasks: { where: { deletedAt: null }, orderBy: [{ position: "asc" }, { updatedAt: "desc" }] }
      }
    });

    if (!project) {
      throw new HttpError(404, "Project not found");
    }

    res.json(project);
  })
);

router.patch(
  "/projects/:id",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const projectId = routeId(req.params.id);
    const input = z.object({ name: z.string().min(1).optional(), description: z.string().nullable().optional() }).parse(req.body);
    const project = await prisma.project.update({
      where: { id: projectId, userId },
      data: input
    });
    res.json(project);
  })
);

router.delete(
  "/projects/:id",
  asyncHandler(async (req, res) => {
    const projectId = routeId(req.params.id);
    await prisma.project.update({
      where: { id: projectId, userId: currentUserId(req) },
      data: { deletedAt: new Date() }
    });
    res.status(204).end();
  })
);

router.get(
  "/board-columns",
  asyncHandler(async (req, res) => {
    const columns = await prisma.boardColumn.findMany({
      where: { userId: currentUserId(req), deletedAt: null },
      orderBy: [{ projectId: "asc" }, { position: "asc" }]
    });
    res.json({ columns });
  })
);

router.post(
  "/board-columns",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const input = z
      .object({
        projectId: z.string().uuid(),
        name: z.string().min(1),
        position: z.number().int().default(0),
        workspaceId: z.string().uuid().optional()
      })
      .parse(req.body);

    const column = await prisma.boardColumn.create({
      data: {
        userId,
        workspaceId: await workspaceIdFor(userId, input.workspaceId),
        projectId: input.projectId,
        name: input.name,
        position: input.position
      }
    });
    res.status(201).json(column);
  })
);

router.get(
  "/tasks",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const filters = z
      .object({
        projectId: z.string().uuid().optional(),
        status: z.string().optional(),
        priority: z.string().optional(),
        dueFrom: z.string().optional(),
        dueTo: z.string().optional(),
        tag: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(100),
        offset: z.coerce.number().int().min(0).default(0)
      })
      .parse(req.query);
    const where: Prisma.TaskWhereInput = {
      userId,
      deletedAt: null,
      projectId: filters.projectId,
      status: filters.status,
      priority: filters.priority
    };

    if (filters.dueFrom || filters.dueTo) {
      where.dueDate = {
        gte: filters.dueFrom ? new Date(filters.dueFrom) : undefined,
        lte: filters.dueTo ? new Date(filters.dueTo) : undefined
      };
    }

    if (filters.tag) {
      where.taskTags = {
        some: {
          tag: {
            userId,
            deletedAt: null,
            name: filters.tag
          }
        }
      };
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
      skip: filters.offset,
      take: filters.limit,
      include: taskInclude
    });

    res.json({ tasks });
  })
);

router.post(
  "/tasks",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const input = taskInputSchema.parse(req.body);
    const workspaceId = await workspaceIdFor(userId, input.workspaceId);
    const task = await prisma.task.create({
      data: {
        id: input.id,
        userId,
        workspaceId,
        projectId: input.projectId,
        columnId: input.columnId,
        parentId: input.parentId,
        title: input.title,
        description: input.description,
        status: input.status,
        type: input.type,
        gameArea: input.gameArea,
        engine: input.engine,
        platform: input.platform,
        severity: input.severity,
        buildVersion: input.buildVersion,
        stepsToReproduce: input.stepsToReproduce,
        expectedResult: input.expectedResult,
        actualResult: input.actualResult,
        priority: input.priority,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        time: input.time,
        repeat: input.repeat,
        position: input.position
      }
    });

    if (input.tags?.length) {
      await syncTaskTags(userId, workspaceId, task.id, input.tags);
    }

    res.status(201).json(await taskForUser(userId, task.id));
  })
);

router.get(
  "/tasks/:id",
  asyncHandler(async (req, res) => {
    res.json(await taskForUser(currentUserId(req), routeId(req.params.id)));
  })
);

router.patch(
  "/tasks/:id",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const taskId = routeId(req.params.id);
    const input = taskInputSchema.partial().parse(req.body);
    const existing = await taskForUser(userId, taskId);
    const workspaceId = input.workspaceId ?? existing.workspaceId;

    await prisma.task.update({
      where: { id: taskId, userId },
      data: taskUpdateData(input)
    });

    if (input.tags) {
      await syncTaskTags(userId, workspaceId, taskId, input.tags);
    }

    res.json(await taskForUser(userId, taskId));
  })
);

router.post(
  "/tasks/reorder",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const input = z
      .object({
        items: z.array(
          z.object({
            id: z.string().uuid(),
            position: z.number().int().min(0),
            columnId: z.string().uuid().nullable().optional()
          })
        )
      })
      .parse(req.body);

    await prisma.$transaction(
      input.items.map((item) =>
        prisma.task.update({
          where: { id: item.id, userId },
          data: { position: item.position, columnId: item.columnId }
        })
      )
    );

    res.json({ ok: true });
  })
);

router.post(
  "/tasks/:id/complete",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const taskId = routeId(req.params.id);
    await prisma.task.update({
      where: { id: taskId, userId },
      data: { status: "done" }
    });
    res.json(await taskForUser(userId, taskId));
  })
);

router.post(
  "/tasks/:id/uncomplete",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const taskId = routeId(req.params.id);
    await prisma.task.update({
      where: { id: taskId, userId },
      data: { status: "todo" }
    });
    res.json(await taskForUser(userId, taskId));
  })
);

router.post(
  "/tasks/:id/duplicate",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const source = await taskForUser(userId, routeId(req.params.id));
    const task = await prisma.task.create({
      data: {
        userId,
        workspaceId: source.workspaceId,
        projectId: source.projectId,
        columnId: source.columnId,
        parentId: source.parentId,
        title: `${source.title} copy`,
        description: source.description,
        status: "todo",
        type: source.type,
        gameArea: source.gameArea,
        engine: source.engine,
        platform: source.platform,
        severity: source.severity,
        buildVersion: source.buildVersion,
        stepsToReproduce: source.stepsToReproduce,
        expectedResult: source.expectedResult,
        actualResult: source.actualResult,
        priority: source.priority,
        dueDate: source.dueDate,
        startDate: source.startDate,
        time: source.time,
        repeat: source.repeat,
        position: source.position + 1
      }
    });

    await syncTaskTags(
      userId,
      source.workspaceId,
      task.id,
      source.taskTags.map((taskTag) => taskTag.tag.name)
    );

    res.status(201).json(await taskForUser(userId, task.id));
  })
);

router.delete(
  "/tasks/:id",
  asyncHandler(async (req, res) => {
    await prisma.task.update({
      where: { id: req.params.id, userId: currentUserId(req) },
      data: { deletedAt: new Date() }
    });
    res.status(204).end();
  })
);

router.get(
  "/tags",
  asyncHandler(async (req, res) => {
    const tags = await prisma.tag.findMany({
      where: { userId: currentUserId(req), deletedAt: null },
      orderBy: { name: "asc" }
    });
    res.json({ tags });
  })
);

router.post(
  "/tags",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const input = z.object({ name: z.string().min(1), color: z.string().optional(), workspaceId: z.string().uuid().optional() }).parse(req.body);
    const workspaceId = await workspaceIdFor(userId, input.workspaceId);
    const tag = await prisma.tag.upsert({
      where: { userId_workspaceId_name: { userId, workspaceId, name: input.name } },
      update: { color: input.color },
      create: { userId, workspaceId, name: input.name, color: input.color }
    });
    res.status(201).json(tag);
  })
);

router.patch(
  "/tags/:id",
  asyncHandler(async (req, res) => {
    const input = z.object({ name: z.string().min(1).optional(), color: z.string().nullable().optional() }).parse(req.body);
    const tag = await prisma.tag.update({
      where: { id: req.params.id, userId: currentUserId(req) },
      data: input
    });
    res.json(tag);
  })
);

router.delete(
  "/tags/:id",
  asyncHandler(async (req, res) => {
    await prisma.tag.update({
      where: { id: req.params.id, userId: currentUserId(req) },
      data: { deletedAt: new Date() }
    });
    res.status(204).end();
  })
);

router.get(
  "/notes",
  asyncHandler(async (req, res) => {
    const notes = await prisma.note.findMany({
      where: { userId: currentUserId(req), deletedAt: null },
      orderBy: { updatedAt: "desc" }
    });
    res.json({ notes });
  })
);

router.post(
  "/notes",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const input = noteInputSchema.parse(req.body);
    const note = await prisma.note.create({
      data: {
        userId,
        workspaceId: await workspaceIdFor(userId, input.workspaceId),
        projectId: input.projectId,
        title: input.title,
        content: input.content,
        tags: input.tags,
        localOnly: input.localOnly,
        syncEnabled: input.syncEnabled,
        syncStatus: input.localOnly || !input.syncEnabled ? "local_only" : "pending"
      }
    });
    res.status(201).json(note);
  })
);

router.patch(
  "/notes/:id",
  asyncHandler(async (req, res) => {
    const input = noteInputSchema.partial().parse(req.body);
    const note = await prisma.note.update({
      where: { id: req.params.id, userId: currentUserId(req) },
      data: {
        ...input,
        syncStatus: input.localOnly === true || input.syncEnabled === false ? "local_only" : input.syncStatus
      }
    });
    res.json(note);
  })
);

router.delete(
  "/notes/:id",
  asyncHandler(async (req, res) => {
    await prisma.note.update({
      where: { id: req.params.id, userId: currentUserId(req) },
      data: { deletedAt: new Date() }
    });
    res.status(204).end();
  })
);

router.get(
  "/references",
  asyncHandler(async (req, res) => {
    const references = await prisma.reference.findMany({
      where: { userId: currentUserId(req), deletedAt: null },
      orderBy: { updatedAt: "desc" }
    });
    res.json({ references });
  })
);

router.post(
  "/references",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const input = z
      .object({
        title: z.string().min(1),
        url: z.string().url().optional(),
        localPath: z.string().optional(),
        kind: z.string().default("external"),
        notes: z.string().optional(),
        projectId: z.string().uuid().optional(),
        workspaceId: z.string().uuid().optional()
      })
      .parse(req.body);
    const reference = await prisma.reference.create({
      data: { ...input, userId, workspaceId: await workspaceIdFor(userId, input.workspaceId) }
    });
    res.status(201).json(reference);
  })
);

router.get(
  "/code-snippets",
  asyncHandler(async (req, res) => {
    const snippets = await prisma.codeSnippet.findMany({
      where: { userId: currentUserId(req), deletedAt: null },
      orderBy: { updatedAt: "desc" }
    });
    res.json({ snippets });
  })
);

router.post(
  "/code-snippets",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const input = z
      .object({
        title: z.string().min(1),
        description: z.string().optional(),
        language: z.string().min(1),
        code: z.string().min(1),
        tags: z.array(z.string()).default([]),
        linkedTaskId: z.string().uuid().optional(),
        linkedNoteId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
        workspaceId: z.string().uuid().optional()
      })
      .parse(req.body);
    const snippet = await prisma.codeSnippet.create({
      data: { ...input, userId, workspaceId: await workspaceIdFor(userId, input.workspaceId) }
    });
    res.status(201).json(snippet);
  })
);

router.get(
  "/milestones",
  asyncHandler(async (req, res) => {
    const milestones = await prisma.milestone.findMany({
      where: { userId: currentUserId(req), deletedAt: null },
      orderBy: { updatedAt: "desc" }
    });
    res.json({ milestones });
  })
);

router.post(
  "/milestones",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const input = z
      .object({
        name: z.string().min(1),
        status: z.string().default("planned"),
        progress: z.number().int().min(0).max(100).default(0),
        dueDate: z.string().nullable().optional(),
        projectId: z.string().uuid().optional(),
        workspaceId: z.string().uuid().optional()
      })
      .parse(req.body);
    const milestone = await prisma.milestone.create({
      data: {
        userId,
        workspaceId: await workspaceIdFor(userId, input.workspaceId),
        projectId: input.projectId,
        name: input.name,
        status: input.status,
        progress: input.progress,
        dueDate: input.dueDate ? new Date(input.dueDate) : null
      }
    });
    res.status(201).json(milestone);
  })
);

const taskInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  columnId: z.string().uuid().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  workspaceId: z.string().uuid().optional(),
  status: z.string().default("todo"),
  type: z.string().default("feature"),
  gameArea: z.string().nullable().optional(),
  engine: z.string().nullable().optional(),
  platform: z.string().nullable().optional(),
  severity: z.string().nullable().optional(),
  buildVersion: z.string().nullable().optional(),
  stepsToReproduce: z.string().nullable().optional(),
  expectedResult: z.string().nullable().optional(),
  actualResult: z.string().nullable().optional(),
  priority: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  time: z.string().nullable().optional(),
  repeat: z.string().nullable().optional(),
  position: z.number().int().min(0).default(0),
  tags: z.array(z.string()).default([])
});

const noteInputSchema = z.object({
  title: z.string().min(1),
  content: z.string().default(""),
  tags: z.array(z.string()).default([]),
  projectId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  localOnly: z.boolean().default(false),
  syncEnabled: z.boolean().default(true),
  syncStatus: z.enum(["local_only", "pending", "synced", "error"]).optional()
});

async function workspaceIdFor(userId: string, preferredId?: string): Promise<string> {
  if (preferredId) {
    const workspace = await prisma.workspace.findFirst({
      where: { id: preferredId, userId, deletedAt: null }
    });
    if (!workspace) {
      throw new HttpError(404, "Workspace not found");
    }
    return workspace.id;
  }

  const existing = await prisma.workspace.findFirst({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "asc" }
  });

  if (existing) {
    return existing.id;
  }

  const workspace = await prisma.workspace.create({
    data: { userId, name: "Personal" }
  });
  return workspace.id;
}

const taskInclude = {
  taskTags: { include: { tag: true } },
  subtasks: { where: { deletedAt: null }, orderBy: { position: "asc" } }
} satisfies Prisma.TaskInclude;

async function taskForUser(userId: string, id: string) {
  const task = await prisma.task.findFirst({
    where: { id, userId, deletedAt: null },
    include: taskInclude
  });

  if (!task) {
    throw new HttpError(404, "Task not found");
  }

  return task;
}

function taskUpdateData(input: Partial<z.infer<typeof taskInputSchema>>): Prisma.TaskUncheckedUpdateInput {
  return {
    projectId: input.projectId,
    columnId: input.columnId,
    parentId: input.parentId,
    title: input.title,
    description: input.description,
    status: input.status,
    type: input.type,
    gameArea: input.gameArea,
    engine: input.engine,
    platform: input.platform,
    severity: input.severity,
    buildVersion: input.buildVersion,
    stepsToReproduce: input.stepsToReproduce,
    expectedResult: input.expectedResult,
    actualResult: input.actualResult,
    priority: input.priority,
    dueDate: input.dueDate !== undefined ? (input.dueDate ? new Date(input.dueDate) : null) : undefined,
    startDate: input.startDate !== undefined ? (input.startDate ? new Date(input.startDate) : null) : undefined,
    time: input.time,
    repeat: input.repeat,
    position: input.position
  };
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

export default router;
