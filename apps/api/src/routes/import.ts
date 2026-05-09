import { Router } from "express";
import { z } from "zod";
import { requireAuth, currentUserId } from "../auth/middleware";
import { asyncHandler } from "../http";
import { confirmTaskOutlineImport, createGameDevProject, previewTaskOutline } from "../services/importService";

const router = Router();
const outlineSchema = z.object({ source: z.string().min(1) });

router.post(
  "/preview",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = outlineSchema.parse(req.body);
    res.json(previewTaskOutline(input.source));
  })
);

router.post(
  "/confirm",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = outlineSchema.parse(req.body);
    res.json(await confirmTaskOutlineImport(currentUserId(req), input.source));
  })
);

router.post(
  "/tasks-outline",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = outlineSchema.parse(req.body);
    res.json(await confirmTaskOutlineImport(currentUserId(req), input.source));
  })
);

router.post(
  "/game-dev-outline",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = z.object({ projectName: z.string().min(1).optional() }).parse(req.body ?? {});
    res.status(201).json(await createGameDevProject(currentUserId(req), input.projectName));
  })
);

export default router;
