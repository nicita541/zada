import type { Prisma } from "@prisma/client";
import { defaultBoardColumnsForProject, getNextDueDate, inferBoardColumnKind } from "@zada/shared";
import { Router } from "express";
import { z } from "zod";
import { currentUserId, requireAuth } from "../auth/middleware";
import { asyncHandler, HttpError } from "../http";
import { prisma } from "../prisma";

const router = Router();
router.use(requireAuth);

router.get(
  "/projects",
  asyncHandler(async (req, res) => {
    const projects = await prisma.project.findMany({
      where: { userId: currentUserId(req), deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: { columns: { where: { deletedAt: null }, orderBy: { position: "asc" } } }
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
          create: defaultBoardColumnsForProject(input.type).map((column, position) => ({
            userId,
            workspaceId,
            name: column.name,
            kind: column.kind,
            color: column.color,
            position
          }))
        }
      },
      include: { columns: { where: { deletedAt: null }, orderBy: { position: "asc" } } }
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
        columns: { where: { deletedAt: null }, orderBy: { position: "asc" } },
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
        kind: boardColumnKindSchema.optional(),
        color: z.string().nullable().optional(),
        position: z.number().int().default(0),
        workspaceId: z.string().uuid().optional()
      })
      .parse(req.body);
    const project = await projectForUser(userId, input.projectId);

    const column = await prisma.boardColumn.create({
      data: {
        userId,
        workspaceId: project.workspaceId,
        projectId: project.id,
        name: input.name,
        kind: inferBoardColumnKind(input.name, input.kind),
        color: input.color ?? null,
        position: input.position
      }
    });
    res.status(201).json(column);
  })
);

router.get(
  "/projects/:projectId/columns",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const project = await projectForUser(userId, routeId(req.params.projectId));
    const columns = await prisma.boardColumn.findMany({
      where: { userId, projectId: project.id, deletedAt: null },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }]
    });
    res.json({ columns });
  })
);

router.post(
  "/projects/:projectId/columns",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const project = await projectForUser(userId, routeId(req.params.projectId));
    const input = columnInputSchema.parse(req.body);
    const column = await prisma.boardColumn.create({
      data: {
        id: input.id,
        userId,
        workspaceId: project.workspaceId,
        projectId: project.id,
        name: input.name,
        kind: inferBoardColumnKind(input.name, input.kind),
        color: input.color ?? null,
        position: input.position
      }
    });
    res.status(201).json(column);
  })
);

router.post(
  "/columns/reorder",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const input = reorderColumnsSchema.parse(req.body);
    const project = await projectForUser(userId, input.projectId);
    const items =
      input.items ??
      input.orderedColumnIds?.map((id, position) => ({
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

    const updated = await prisma.boardColumn.findMany({
      where: { userId, projectId: project.id, deletedAt: null },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }]
    });
    res.json({ columns: updated });
  })
);

router.patch(
  "/columns/:id",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const column = await columnForUser(userId, routeId(req.params.id));
    const input = columnInputSchema.partial().parse(req.body);
    const name = input.name ?? column.name;
    const updated = await prisma.boardColumn.update({
      where: { id: column.id },
      data: {
        name: input.name,
        kind: input.name !== undefined || input.kind !== undefined ? inferBoardColumnKind(name, input.kind ?? column.kind) : undefined,
        color: input.color,
        position: input.position
      }
    });
    res.json(updated);
  })
);

router.delete(
  "/columns/:id",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const column = await columnForUser(userId, routeId(req.params.id));
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
    res.status(204).end();
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
        completed: z.enum(["true", "false"]).optional(),
        dueFrom: z.string().optional(),
        dueTo: z.string().optional(),
        search: z.string().trim().optional(),
        type: z.string().optional(),
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
      type: filters.type,
      priority: filters.priority
    };

    if (!filters.status && filters.completed) {
      where.status = filters.completed === "true" ? "done" : { not: "done" };
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } }
      ];
    }

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
        estimatedMinutes: input.estimatedMinutes,
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
        projectId: z.string().uuid().optional(),
        moves: z
          .array(
            z.object({
              taskId: z.string().uuid(),
              columnId: z.string().uuid().nullable(),
              position: z.number().int().min(0)
            })
          )
          .optional(),
        items: z
          .array(
          z.object({
            id: z.string().uuid(),
            position: z.number().int().min(0),
            columnId: z.string().uuid().nullable().optional()
          })
          )
          .optional()
      })
      .parse(req.body);
    const moves =
      input.moves?.map((move) => ({ id: move.taskId, columnId: move.columnId, position: move.position })) ??
      input.items ??
      [];

    if (moves.length === 0) {
      throw new HttpError(400, "No tasks to reorder");
    }

    const tasks = await prisma.task.findMany({
      where: { id: { in: moves.map((move) => move.id) }, userId, deletedAt: null },
      select: { id: true, projectId: true }
    });
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    if (moves.some((move) => !taskById.has(move.id))) {
      throw new HttpError(404, "Task not found");
    }

    const projectId = input.projectId ?? tasks[0]?.projectId ?? null;
    if (input.projectId) {
      await projectForUser(userId, input.projectId);
      if (tasks.some((task) => task.projectId !== input.projectId)) {
        throw new HttpError(400, "Task does not belong to project");
      }
    }

    const columnIds = Array.from(new Set(moves.map((move) => move.columnId).filter((id): id is string => Boolean(id))));
    if (columnIds.length > 0) {
      const columns = await prisma.boardColumn.findMany({
        where: {
          id: { in: columnIds },
          userId,
          deletedAt: null,
          projectId: projectId ?? undefined
        },
        select: { id: true, projectId: true }
      });
      const ownedColumnIds = new Set(columns.map((column) => column.id));
      if (columnIds.some((columnId) => !ownedColumnIds.has(columnId))) {
        throw new HttpError(404, "Column not found");
      }
    }

    await prisma.$transaction(
      moves.map((item) =>
        prisma.task.update({
          where: { id: item.id, userId },
          data: { position: item.position, columnId: item.columnId }
        })
      )
    );

    const updated = await prisma.task.findMany({
      where: { id: { in: moves.map((move) => move.id) }, userId },
      orderBy: [{ columnId: "asc" }, { position: "asc" }],
      include: taskInclude
    });
    res.json({ tasks: updated });
  })
);

router.post(
  "/tasks/:id/complete",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const taskId = routeId(req.params.id);
    const task = await taskForUser(userId, taskId);
    const completedAt = new Date();
    const nextDueDate = getNextDueDate(formatDateOnly(task.dueDate), task.repeat, completedAt);

    await prisma.task.update({
      where: { id: taskId, userId },
      data: nextDueDate
        ? { dueDate: new Date(`${nextDueDate}T00:00:00.000Z`), status: "todo", completedAt: null }
        : { status: "done", completedAt }
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
      data: { status: "todo", completedAt: null }
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
        estimatedMinutes: source.estimatedMinutes,
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
    const taskId = routeId(req.params.id);
    await prisma.task.update({
      where: { id: taskId, userId: currentUserId(req) },
      data: { deletedAt: new Date() }
    });
    res.status(204).end();
  })
);

router.get(
  "/tasks/:taskId/subtasks",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const task = await taskForUser(userId, routeId(req.params.taskId));
    const subtasks = await prisma.subtask.findMany({
      where: { userId, taskId: task.id, deletedAt: null },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }]
    });
    res.json({ subtasks });
  })
);

router.post(
  "/tasks/:taskId/subtasks",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const task = await taskForUser(userId, routeId(req.params.taskId));
    const input = subtaskInputSchema.parse(req.body);
    const subtask = await prisma.subtask.create({
      data: {
        id: input.id,
        userId,
        workspaceId: task.workspaceId,
        taskId: task.id,
        title: input.title,
        completed: input.completed,
        position: input.position
      }
    });
    res.status(201).json(subtask);
  })
);

router.patch(
  "/subtasks/:id",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const subtaskId = routeId(req.params.id);
    await subtaskForUser(userId, subtaskId);
    const input = subtaskInputSchema.partial().parse(req.body);
    await prisma.subtask.update({
      where: { id: subtaskId },
      data: {
        title: input.title,
        completed: input.completed,
        position: input.position
      }
    });
    res.json(await subtaskForUser(userId, subtaskId));
  })
);

router.delete(
  "/subtasks/:id",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const subtaskId = routeId(req.params.id);
    await subtaskForUser(userId, subtaskId);
    await prisma.subtask.update({
      where: { id: subtaskId },
      data: { deletedAt: new Date() }
    });
    res.status(204).end();
  })
);

router.post(
  "/subtasks/reorder",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const input = z
      .object({
        items: z.array(z.object({ id: z.string().uuid(), position: z.number().int().min(0) }))
      })
      .parse(req.body);

    for (const item of input.items) {
      await subtaskForUser(userId, item.id);
    }

    await prisma.$transaction(
      input.items.map((item) =>
        prisma.subtask.update({
          where: { id: item.id },
          data: { position: item.position }
        })
      )
    );

    res.json({ ok: true });
  })
);

router.get(
  "/tasks/:taskId/reminders",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const task = await taskForUser(userId, routeId(req.params.taskId));
    const reminders = await prisma.reminder.findMany({
      where: { userId, taskId: task.id, deletedAt: null },
      orderBy: { remindAt: "asc" }
    });
    res.json({ reminders });
  })
);

router.post(
  "/tasks/:taskId/reminders",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const task = await taskForUser(userId, routeId(req.params.taskId));
    const input = reminderInputSchema.parse(req.body);
    const reminder = await prisma.reminder.create({
      data: {
        id: input.id,
        userId,
        workspaceId: task.workspaceId,
        taskId: task.id,
        type: input.type,
        remindAt: new Date(input.remindAt),
        dismissedAt: input.dismissedAt ? new Date(input.dismissedAt) : null
      }
    });
    res.status(201).json(reminder);
  })
);

router.get(
  "/reminders/due",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const now = new Date(String(req.query.now ?? new Date().toISOString()));
    const reminders = await prisma.reminder.findMany({
      where: {
        userId,
        deletedAt: null,
        dismissedAt: null,
        remindAt: { lte: Number.isNaN(now.getTime()) ? new Date() : now }
      },
      include: { task: true },
      orderBy: { remindAt: "asc" },
      take: 20
    });
    res.json({ reminders });
  })
);

router.patch(
  "/reminders/:id",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const reminderId = routeId(req.params.id);
    await reminderForUser(userId, reminderId);
    const input = reminderInputSchema.partial().parse(req.body);
    await prisma.reminder.update({
      where: { id: reminderId },
      data: {
        remindAt: input.remindAt ? new Date(input.remindAt) : undefined,
        type: input.type,
        dismissedAt:
          input.dismissedAt === undefined ? undefined : input.dismissedAt ? new Date(input.dismissedAt) : null
      }
    });
    res.json(await reminderForUser(userId, reminderId));
  })
);

router.delete(
  "/reminders/:id",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const reminderId = routeId(req.params.id);
    await reminderForUser(userId, reminderId);
    await prisma.reminder.update({
      where: { id: reminderId },
      data: { deletedAt: new Date() }
    });
    res.status(204).end();
  })
);

router.post(
  "/reminders/:id/dismiss",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const reminderId = routeId(req.params.id);
    await reminderForUser(userId, reminderId);
    await prisma.reminder.update({
      where: { id: reminderId },
      data: { dismissedAt: new Date() }
    });
    res.json(await reminderForUser(userId, reminderId));
  })
);

router.post(
  "/tasks/:taskId/tags/:tagId",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const task = await taskForUser(userId, routeId(req.params.taskId));
    const tag = await tagForUser(userId, routeId(req.params.tagId));

    await prisma.taskTag.upsert({
      where: { taskId_tagId: { taskId: task.id, tagId: tag.id } },
      update: {},
      create: { taskId: task.id, tagId: tag.id }
    });

    res.status(201).json(await taskForUser(userId, task.id));
  })
);

router.delete(
  "/tasks/:taskId/tags/:tagId",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const task = await taskForUser(userId, routeId(req.params.taskId));
    const tag = await tagForUser(userId, routeId(req.params.tagId));
    await prisma.taskTag.deleteMany({ where: { taskId: task.id, tagId: tag.id } });
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
    const input = z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1),
        color: z.string().optional(),
        workspaceId: z.string().uuid().optional()
      })
      .parse(req.body);
    const workspaceId = await workspaceIdFor(userId, input.workspaceId);
    const existing = await prisma.tag.findFirst({
      where: { userId, workspaceId, name: { equals: input.name, mode: "insensitive" } }
    });
    const tag = existing
      ? await prisma.tag.update({ where: { id: existing.id }, data: { color: input.color, deletedAt: null } })
      : await prisma.tag.create({ data: { id: input.id, userId, workspaceId, name: input.name, color: input.color } });
    res.status(201).json(tag);
  })
);

router.patch(
  "/tags/:id",
  asyncHandler(async (req, res) => {
    const tagId = routeId(req.params.id);
    const input = z.object({ name: z.string().min(1).optional(), color: z.string().nullable().optional() }).parse(req.body);
    const tag = await prisma.tag.update({
      where: { id: tagId, userId: currentUserId(req) },
      data: input
    });
    res.json(tag);
  })
);

router.delete(
  "/tags/:id",
  asyncHandler(async (req, res) => {
    const tagId = routeId(req.params.id);
    await prisma.tag.update({
      where: { id: tagId, userId: currentUserId(req) },
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
    const noteId = routeId(req.params.id);
    const input = noteInputSchema.partial().parse(req.body);
    const note = await prisma.note.update({
      where: { id: noteId, userId: currentUserId(req) },
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
    const noteId = routeId(req.params.id);
    await prisma.note.update({
      where: { id: noteId, userId: currentUserId(req) },
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

const boardColumnKindSchema = z.enum(["backlog", "todo", "in_progress", "review", "done", "custom"]);

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
  estimatedMinutes: z.number().int().min(0).nullable().optional(),
  position: z.number().int().min(0).default(0),
  tags: z.array(z.string()).default([])
});

const columnInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  kind: boardColumnKindSchema.optional(),
  color: z.string().nullable().optional(),
  position: z.number().int().min(0).default(0)
});

const reorderColumnsSchema = z
  .object({
    projectId: z.string().uuid(),
    items: z.array(z.object({ id: z.string().uuid(), position: z.number().int().min(0) })).optional(),
    orderedColumnIds: z.array(z.string().uuid()).optional()
  })
  .refine((input) => Boolean(input.items?.length || input.orderedColumnIds?.length), {
    message: "No columns to reorder"
  });

const subtaskInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1),
  completed: z.boolean().default(false),
  position: z.number().int().min(0).default(0)
});

const reminderInputSchema = z.object({
  id: z.string().uuid().optional(),
  remindAt: z.string().datetime(),
  type: z.string().default("task"),
  dismissedAt: z.string().datetime().nullable().optional()
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
  subtasks: { where: { deletedAt: null }, orderBy: { position: "asc" } },
  reminders: { where: { deletedAt: null }, orderBy: { remindAt: "asc" } }
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

async function projectForUser(userId: string, id: string) {
  const project = await prisma.project.findFirst({
    where: { id, userId, deletedAt: null },
    select: { id: true, workspaceId: true, type: true }
  });

  if (!project) {
    throw new HttpError(404, "Project not found");
  }

  return project;
}

async function columnForUser(userId: string, id: string) {
  const column = await prisma.boardColumn.findFirst({
    where: { id, userId, deletedAt: null },
    select: { id: true, workspaceId: true, projectId: true, name: true, kind: true }
  });

  if (!column) {
    throw new HttpError(404, "Column not found");
  }

  return column;
}

async function subtaskForUser(userId: string, id: string) {
  const subtask = await prisma.subtask.findFirst({
    where: { id, userId, deletedAt: null }
  });

  if (!subtask) {
    throw new HttpError(404, "Subtask not found");
  }

  return subtask;
}

async function reminderForUser(userId: string, id: string) {
  const reminder = await prisma.reminder.findFirst({
    where: { id, userId, deletedAt: null }
  });

  if (!reminder) {
    throw new HttpError(404, "Reminder not found");
  }

  return reminder;
}

async function tagForUser(userId: string, id: string) {
  const tag = await prisma.tag.findFirst({
    where: { id, userId, deletedAt: null }
  });

  if (!tag) {
    throw new HttpError(404, "Tag not found");
  }

  return tag;
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
    estimatedMinutes: input.estimatedMinutes,
    position: input.position
  };
}

async function syncTaskTags(userId: string, workspaceId: string, taskId: string, rawTags: string[]) {
  const seen = new Set<string>();
  const tags = rawTags
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (!tag || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 20);

  await prisma.$transaction(async (tx) => {
    await tx.taskTag.deleteMany({ where: { taskId } });

    for (const name of tags) {
      const existing = await tx.tag.findFirst({
        where: { userId, workspaceId, name: { equals: name, mode: "insensitive" } }
      });
      const tag = existing
        ? await tx.tag.update({ where: { id: existing.id }, data: { deletedAt: null } })
        : await tx.tag.create({ data: { userId, workspaceId, name } });

      await tx.taskTag.create({ data: { taskId, tagId: tag.id } });
    }
  });
}

function routeId(value: string | undefined): string {
  return z.string().uuid().parse(value);
}

function formatDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export default router;
