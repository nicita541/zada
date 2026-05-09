import { Router } from "express";
import { requireAuth, currentUserId } from "../auth/middleware";
import { asyncHandler } from "../http";
import { getBillingStatus } from "../services/billingService";

const router = Router();

router.get(
  "/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getBillingStatus(currentUserId(req)));
  })
);

router.get(
  "/features",
  requireAuth,
  asyncHandler(async (req, res) => {
    const status = await getBillingStatus(currentUserId(req));
    res.json({ features: status.availableFeatures, enabledFeatures: status.enabledFeatures });
  })
);

router.post("/checkout", requireAuth, (_req, res) => {
  res.json({
    available: false,
    message: "Subscription purchase is not available yet."
  });
});

router.post(
  "/refresh",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getBillingStatus(currentUserId(req)));
  })
);

export default router;
