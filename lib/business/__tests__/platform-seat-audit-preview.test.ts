import { describe, expect, it, vi } from "vitest";
import type { AccountEntitlementContext } from "@/lib/business/platform-entitlement";
import {
  formatSeatAuditBillingExplanation,
  formatSeatAuditBillingModeLabel,
  formatSeatAuditKnownGapNote,
  formatSeatAuditPendingInviteLabel,
  formatSeatAuditSeatLimitLabel,
  resolvePlatformSeatAuditPreviewCounts,
} from "@/lib/business/platform-seat-audit-preview";

function makeEntitlement(overrides: Partial<AccountEntitlementContext> = {}): AccountEntitlementContext {
  return {
    planKey: "starter",
    entitlementStatus: "active",
    isEntitlementActive: true,
    isInternalComped: false,
    internalCompedSignal: "none",
    seatLimit: null,
    activeSeatCount: 1,
    trialEndsAt: null,
    entitlementValidUntil: null,
    billingCustomerLinked: false,
    billingSubscriptionLinked: false,
    billingSubscriptionStatus: null,
    billingCurrentPeriodEnd: null,
    billingCancelAtPeriodEnd: false,
    ...overrides,
  };
}

function makeSupabase(opts: {
  inactiveInternalUsersCount?: number;
  contractorsCount?: number;
  inactiveInternalUsersError?: { message: string } | null;
  contractorsError?: { message: string } | null;
} = {}) {
  const inactiveInternalUsersCount = opts.inactiveInternalUsersCount ?? 0;
  const contractorsCount = opts.contractorsCount ?? 0;
  const inactiveInternalUsersError = opts.inactiveInternalUsersError ?? null;
  const contractorsError = opts.contractorsError ?? null;

  return {
    from: vi.fn((table: string) => {
      if (table === "internal_users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: null,
                count: inactiveInternalUsersCount,
                error: inactiveInternalUsersError,
              })),
            })),
          })),
        };
      }

      if (table === "contractors") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: null,
              count: contractorsCount,
              error: contractorsError,
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  } as any;
}

describe("platform-seat-audit-preview", () => {
  it("derives read-only seat preview counts from existing tables", async () => {
    const supabase = makeSupabase({
      inactiveInternalUsersCount: 2,
      contractorsCount: 3,
    });

    const preview = await resolvePlatformSeatAuditPreviewCounts({
      accountOwnerUserId: "owner-1",
      supabase,
    });

    expect(preview.inactiveInternalUserCount).toBe(2);
    expect(preview.contractorDirectoryCount).toBe(3);
    expect(preview.pendingInviteCount).toBeNull();
  });

  it("formats comped and unlimited billing labels without implying live Stripe quantity changes", () => {
    expect(
      formatSeatAuditSeatLimitLabel(
        makeEntitlement({
          isInternalComped: true,
          seatLimit: null,
        }),
      ),
    ).toBe("Comped");

    expect(
      formatSeatAuditSeatLimitLabel(
        makeEntitlement({
          isInternalComped: false,
          seatLimit: null,
        }),
      ),
    ).toBe("Unlimited");

    expect(
      formatSeatAuditBillingModeLabel(
        makeEntitlement({
          isInternalComped: true,
          seatLimit: null,
        }),
      ),
    ).toBe("Comped internal account");

    expect(
      formatSeatAuditBillingModeLabel(
        makeEntitlement({
          isInternalComped: false,
          seatLimit: null,
        }),
      ),
    ).toBe("Flat subscription billing / unlimited");

    expect(formatSeatAuditBillingExplanation()).toContain("read-only");
    expect(formatSeatAuditBillingExplanation()).toContain("customer invoice payment collection");
    expect(formatSeatAuditBillingExplanation()).toContain("Stripe quantity");
  });

  it("uses explicit copy for pending invites and the known modeling gap", () => {
    expect(formatSeatAuditPendingInviteLabel()).toContain("Not separately modeled");
    expect(formatSeatAuditKnownGapNote()).toContain("hidden/system/platform-owner active internal users still count here");
  });
});
