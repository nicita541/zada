import { Router } from "express";
import { z } from "zod";
import { currentUserId, requireAdmin, requireAuth } from "../auth/middleware";
import { asyncHandler } from "../http";
import { prisma } from "../prisma";

const router = Router();

const subscriptionGrantSchema = z.object({
  plan: z.enum(["free", "pro", "lifetime_dev", "admin"]),
  status: z.enum(["inactive", "active", "past_due", "canceled", "manual"]).default("manual"),
  currentPeriodEnd: z.string().datetime().nullable().optional()
});

const entitlementGrantSchema = z.object({
  feature: z.string().min(1),
  expiresAt: z.string().datetime().nullable().optional()
});

router.use(requireAuth, requireAdmin);

router.post(
  "/users/:userId/subscription/grant",
  asyncHandler(async (req, res) => {
    const userId = routeUserId(req.params.userId);
    const input = subscriptionGrantSchema.parse(req.body);
    const subscription = await prisma.subscription.create({
      data: {
        userId,
        plan: input.plan,
        status: input.status,
        source: `manual:${currentUserId(req)}`,
        currentPeriodEnd: input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : null
      }
    });

    res.status(201).json(subscription);
  })
);

router.post(
  "/users/:userId/subscription/revoke",
  asyncHandler(async (req, res) => {
    const userId = routeUserId(req.params.userId);
    await prisma.subscription.updateMany({
      where: { userId, status: { in: ["active", "manual"] } },
      data: { status: "canceled", currentPeriodEnd: new Date() }
    });
    res.json({ ok: true });
  })
);

router.post(
  "/users/:userId/entitlements/grant",
  asyncHandler(async (req, res) => {
    const userId = routeUserId(req.params.userId);
    const input = entitlementGrantSchema.parse(req.body);
    const entitlement = await prisma.premiumEntitlement.upsert({
      where: { userId_feature: { userId, feature: input.feature } },
      update: {
        grantedBy: currentUserId(req),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null
      },
      create: {
        userId,
        feature: input.feature,
        grantedBy: currentUserId(req),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null
      }
    });

    res.status(201).json(entitlement);
  })
);

router.post(
  "/users/:userId/entitlements/revoke",
  asyncHandler(async (req, res) => {
    const userId = routeUserId(req.params.userId);
    const input = z.object({ feature: z.string().min(1) }).parse(req.body);
    await prisma.premiumEntitlement.deleteMany({
      where: { userId, feature: input.feature }
    });
    res.json({ ok: true });
  })
);

function routeUserId(value: string | undefined): string {
  return z.string().uuid().parse(value);
}

export default router;
