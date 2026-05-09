import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { currentUserId, requireAuth } from "../auth/middleware";
import { asyncHandler } from "../http";
import { prisma } from "../prisma";

const router = Router();
router.use(requireAuth);

router.get(
  "/bootstrap",
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const [projects, tasks, notes, settings, latestChange] = await Promise.all([
      prisma.project.findMany({ where: { userId } }),
      prisma.task.findMany({ where: { userId } }),
      prisma.note.findMany({ where: { userId } }),
      prisma.userSettings.findUnique({ where: { userId } }),
      prisma.syncChangeLog.findFirst({ where: { userId }, orderBy: { revision: "desc" } })
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
    const input = z
      .object({
        changes: z.array(
          z.object({
            entityType: z.string().min(1),
            entityId: z.string().min(1),
            workspaceId: z.string().uuid().nullable().optional(),
            operation: z.enum(["create", "update", "delete"]),
            payload: z.unknown()
          })
        )
      })
      .parse(req.body);

    const userId = currentUserId(req);
    const accepted = [];
    for (const change of input.changes) {
      if (change.entityType === "subscription") {
        continue;
      }

      const created = await prisma.syncChangeLog.create({
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
    const changes = await prisma.syncChangeLog.findMany({
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

export default router;
