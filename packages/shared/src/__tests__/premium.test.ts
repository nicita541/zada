import { describe, expect, it } from "vitest";
import { canUseFeatureOffline, canUseFeatureOnline } from "../premium";
import type { SubscriptionSnapshot } from "../types";

const base: SubscriptionSnapshot = {
  plan: "free",
  role: "user",
  status: "inactive",
  currentPeriodEnd: null,
  verifiedAt: "2026-05-09T00:00:00.000Z",
  entitlements: []
};

describe("premium gates", () => {
  it("allows manual feature entitlements", () => {
    expect(canUseFeatureOnline("code_snippets", { ...base, entitlements: ["code_snippets"] })).toMatchObject({
      allowed: true,
      reason: "entitlement"
    });
  });

  it("allows offline pro until current period end", () => {
    const decision = canUseFeatureOffline(
      "game_dev_workspace",
      { ...base, plan: "pro", status: "active", currentPeriodEnd: "2026-06-01T00:00:00.000Z" },
      new Date("2026-05-09T00:00:00.000Z")
    );

    expect(decision).toMatchObject({ allowed: true, reason: "offline_cache_valid" });
  });

  it("blocks expired offline pro", () => {
    const decision = canUseFeatureOffline(
      "game_dev_workspace",
      { ...base, plan: "pro", status: "active", currentPeriodEnd: "2026-05-01T00:00:00.000Z" },
      new Date("2026-05-09T00:00:00.000Z")
    );

    expect(decision).toMatchObject({ allowed: false, reason: "expired" });
  });
});
