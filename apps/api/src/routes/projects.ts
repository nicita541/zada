import { Router } from "express";
import { z } from "zod";
import { currentUserId, requireAuth } from "../auth/middleware";
import { asyncHandler } from "../http";
import { prisma } from "../prisma";

const router = Router();
router.use(requireAuth);

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
        name: z.string().min(1),
        description: z.string().optional(),
        workspaceId: z.string().uuid().optional(),
        type: z.string().default("standard")
      })
      .parse(req.body);

    const project = await prisma.project.create({
      data: {
        userId,
        workspaceId: await workspaceIdFor(userId, input.workspaceId),
        name: input.name,
        description: input.description,
        type: input.type
      }
    });

    res.status(201).json(project);
  })
);

router.patch(
  "/projects/:id",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const input = z.object({ name: z.string().min(1).optional(), description: z.string().nullable().optional() }).parse(req.body);
    const project = await prisma.project.update({
      where: { id: req.params.id, userId },
      data: input
    });
    res.json(project);
  })
);

router.delete(
  "/projects/:id",
  asyncHandler(async (req, res) => {
    await prisma.project.update({
      where: { id: req.params.id, userId: currentUserId(req) },
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
    const tasks = await prisma.task.findMany({
      where: { userId: currentUserId(req), deletedAt: null },
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
      include: { taskTags: { include: { tag: true } }, subtasks: true }
    });

    res.json({ tasks });
  })
);

router.post(
  "/tasks",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const input = taskInputSchema.parse(req.body);
    const task = await prisma.task.create({
      data: {
        userId,
        workspaceId: await workspaceIdFor(userId, input.workspaceId),
        projectId: input.projectId,
        columnId: input.columnId,
        parentId: input.parentId,
        title: input.title,
        description: input.description,
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
        dueDate: input.dueDate ? new Date(input.dueDate) : null
      }
    });

    res.status(201).json(task);
  })
);

router.patch(
  "/tasks/:id",
  asyncHandler(async (req, res) => {
    const input = taskInputSchema.partial().parse(req.body);
    const task = await prisma.task.update({
      where: { id: req.params.id, userId: currentUserId(req) },
      data: {
        ...input,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined
      }
    });
    res.json(task);
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
  title: z.string().min(1),
  description: z.string().optional(),
  projectId: z.string().uuid().optional(),
  columnId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  type: z.string().default("feature"),
  gameArea: z.string().optional(),
  engine: z.string().optional(),
  platform: z.string().optional(),
  severity: z.string().optional(),
  buildVersion: z.string().optional(),
  stepsToReproduce: z.string().optional(),
  expectedResult: z.string().optional(),
  actualResult: z.string().optional(),
  priority: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional()
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
    return preferredId;
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

export default router;
