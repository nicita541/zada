import type {
  OfflinePremiumDecision,
  PlanCode,
  PremiumFeatureKey,
  SubscriptionSnapshot
} from "./types";

export const premiumFeatures: Record<PremiumFeatureKey, { label: string; minimumPlan: PlanCode }> = {
  unlimited_projects: { label: "Unlimited projects", minimumPlan: "pro" },
  advanced_stats: { label: "Advanced statistics", minimumPlan: "pro" },
  saved_filters: { label: "Saved filters", minimumPlan: "pro" },
  advanced_reminders: { label: "Advanced reminders", minimumPlan: "pro" },
  custom_themes: { label: "Custom themes", minimumPlan: "pro" },
  csv_export: { label: "CSV export", minimumPlan: "pro" },
  advanced_import: { label: "Advanced import", minimumPlan: "pro" },
  game_dev_workspace: { label: "Game Dev Workspace", minimumPlan: "pro" },
  gdd_documents: { label: "GDD documents", minimumPlan: "pro" },
  game_concept_documents: { label: "Game concept documents", minimumPlan: "pro" },
  code_snippets: { label: "Code snippets", minimumPlan: "pro" },
  local_file_references: { label: "Local file references", minimumPlan: "pro" },
  game_dev_dashboard: { label: "Game dev dashboard", minimumPlan: "pro" },
  bug_tracker_advanced: { label: "Advanced bug tracker", minimumPlan: "pro" },
  milestones_advanced: { label: "Advanced milestones", minimumPlan: "pro" }
};

const planRank: Record<PlanCode, number> = {
  free: 0,
  pro: 1,
  lifetime_dev: 2,
  admin: 3
};

export function isPremiumPlan(plan: PlanCode): boolean {
  return planRank[plan] >= planRank.pro;
}

export function canUseFeatureOnline(
  feature: PremiumFeatureKey,
  subscription: SubscriptionSnapshot
): OfflinePremiumDecision {
  if (subscription.entitlements.includes(feature)) {
    return { allowed: true, reason: "entitlement" };
  }

  if (subscription.role === "admin" || subscription.plan === "admin") {
    return { allowed: true, reason: "active_plan" };
  }

  if (subscription.role === "developer" || subscription.plan === "lifetime_dev") {
    return { allowed: true, reason: "active_plan" };
  }

  if (subscription.status === "active" && isPremiumPlan(subscription.plan)) {
    return { allowed: true, reason: "active_plan" };
  }

  return { allowed: false, reason: "missing" };
}

export function canUseFeatureOffline(
  feature: PremiumFeatureKey,
  subscription: SubscriptionSnapshot,
  now = new Date()
): OfflinePremiumDecision {
  const onlineDecision = canUseFeatureOnline(feature, subscription);
  if (onlineDecision.allowed) {
    if (subscription.plan === "lifetime_dev" || subscription.plan === "admin") {
      return onlineDecision;
    }

    if (!subscription.currentPeriodEnd) {
      return { allowed: false, reason: "missing" };
    }

    const periodEnd = new Date(subscription.currentPeriodEnd);
    if (Number.isNaN(periodEnd.getTime())) {
      return { allowed: false, reason: "missing" };
    }

    return periodEnd >= now
      ? { allowed: true, reason: "offline_cache_valid" }
      : { allowed: false, reason: "expired" };
  }

  return onlineDecision;
}

export function getEnabledFeatures(subscription: SubscriptionSnapshot): PremiumFeatureKey[] {
  return (Object.keys(premiumFeatures) as PremiumFeatureKey[]).filter(
    (feature) => canUseFeatureOnline(feature, subscription).allowed
  );
}
