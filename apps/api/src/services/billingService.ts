import type { PlanCode, PremiumFeatureKey, SubscriptionSnapshot, UserRole } from "@zada/shared";
import { getEnabledFeatures, premiumFeatures } from "@zada/shared";
import { prisma } from "../prisma";

export async function getSubscriptionSnapshot(userId: string): Promise<SubscriptionSnapshot> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscriptions: { orderBy: { updatedAt: "desc" }, take: 1 },
      entitlements: true
    }
  });

  const subscription = user?.subscriptions[0];
  const snapshot: SubscriptionSnapshot = {
    plan: ((subscription?.plan ?? "free") as PlanCode),
    role: ((user?.role ?? "user") as UserRole),
    status: (subscription?.status as SubscriptionSnapshot["status"]) ?? "inactive",
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
    verifiedAt: new Date().toISOString(),
    entitlements: user?.entitlements
      .filter((entitlement) => !entitlement.expiresAt || entitlement.expiresAt > new Date())
      .map((entitlement) => entitlement.feature as PremiumFeatureKey) ?? []
  };

  return snapshot;
}

export async function getBillingStatus(userId: string) {
  const subscription = await getSubscriptionSnapshot(userId);
  return {
    subscription,
    enabledFeatures: getEnabledFeatures(subscription),
    availableFeatures: premiumFeatures
  };
}
