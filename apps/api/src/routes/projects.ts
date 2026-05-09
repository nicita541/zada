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
    const input = z
      .object({
        name: z.string().min(1),
        description: z.string().optional(),
        workspaceId: z.string().uuid().optional()
      })
      .parse(req.body);

    const workspace =
      input.workspaceId ??
      (
        await prisma.workspace.findFirstOrThrow({
          where: { userId: currentUserId(req), deletedAt: null },
          orderBy: { createdAt: "asc" }
        })
      ).id;

    const project = await prisma.project.create({
      data: {
        userId: currentUserId(req),
        workspaceId: workspace,
        name: input.name,
        description: input.description
      }
    });

    res.status(201).json(project);
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
    const input = z
      .object({
        title: z.string().min(1),
        description: z.string().optional(),
        projectId: z.string().uuid().optional(),
        workspaceId: z.string().uuid().optional(),
        type: z.string().default("feature"),
        priority: z.string().nullable().optional(),
        dueDate: z.string().datetime().nullable().optional()
      })
      .parse(req.body);

    const workspaceId =
      input.workspaceId ??
      (
        await prisma.workspace.findFirstOrThrow({
          where: { userId: currentUserId(req), deletedAt: null },
          orderBy: { createdAt: "asc" }
        })
      ).id;

    const task = await prisma.task.create({
      data: {
        userId: currentUserId(req),
        workspaceId,
        projectId: input.projectId,
        title: input.title,
        description: input.description,
        type: input.type,
        priority: input.priority,
        dueDate: input.dueDate ? new Date(input.dueDate) : null
      }
    });

    res.status(201).json(task);
  })
);

export default router;
