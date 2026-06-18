import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PLATFORM_APPLICATION_FEE_BASIS_POINTS,
  calculatePlatformApplicationFeeAmountCents,
  derivePlatformApplicationFeeConfig,
} from "@/lib/business/platform-application-fees";
import { getStripeServerClient } from "@/lib/business/platform-billing-stripe";

vi.mock("@/lib/business/platform-billing-stripe", () => ({
  getStripeServerClient: vi.fn(),
}));

describe("platform-application-fees", () => {
  it("defaults to 50 basis points and calculates expected common amounts", () => {
    expect(DEFAULT_PLATFORM_APPLICATION_FEE_BASIS_POINTS).toBe(50);

    const onTenDollars = calculatePlatformApplicationFeeAmountCents({
      amountCents: 1000,
      enabled: true,
    });
    const onHundredDollars = calculatePlatformApplicationFeeAmountCents({
      amountCents: 10000,
      enabled: true,
    });

    expect(onTenDollars.applicationFeeAmountCents).toBe(5);
    expect(onHundredDollars.applicationFeeAmountCents).toBe(50);
    expect(onTenDollars.skippedReason).toBeNull();
    expect(onHundredDollars.skippedReason).toBeNull();
  });

  it("rounds 1750 cents at 50 bps predictably", () => {
    const result = calculatePlatformApplicationFeeAmountCents({
      amountCents: 1750,
      feeBasisPoints: 50,
      enabled: true,
    });

    // 1750 * 50 / 10000 = 8.75 -> 9 via Math.round
    expect(result.applicationFeeAmountCents).toBe(9);
    expect(result.skippedReason).toBeNull();
  });

  it("returns zero when config is disabled", () => {
    const config = derivePlatformApplicationFeeConfig({ enabled: false });
    const result = calculatePlatformApplicationFeeAmountCents({
      amountCents: 1750,
      feeBasisPoints: config.feeBasisPoints,
      enabled: config.enabled,
    });

    expect(config.enabled).toBe(false);
    expect(config.skippedReason).toBe("platform_fee_disabled");
    expect(result.applicationFeeAmountCents).toBe(0);
    expect(result.skippedReason).toBe("platform_fee_disabled");
  });

  it("returns zero for zero or negative charge amounts", () => {
    const zeroResult = calculatePlatformApplicationFeeAmountCents({
      amountCents: 0,
      feeBasisPoints: 50,
      enabled: true,
    });
    const negativeResult = calculatePlatformApplicationFeeAmountCents({
      amountCents: -1,
      feeBasisPoints: 50,
      enabled: true,
    });

    expect(zeroResult.applicationFeeAmountCents).toBe(0);
    expect(negativeResult.applicationFeeAmountCents).toBe(0);
    expect(zeroResult.skippedReason).toBe("non_positive_amount");
    expect(negativeResult.skippedReason).toBe("non_positive_amount");
  });

  it("returns zero for zero or negative basis points", () => {
    const zeroBps = calculatePlatformApplicationFeeAmountCents({
      amountCents: 1000,
      feeBasisPoints: 0,
      enabled: true,
    });
    const negativeBps = calculatePlatformApplicationFeeAmountCents({
      amountCents: 1000,
      feeBasisPoints: -5,
      enabled: true,
    });

    expect(zeroBps.applicationFeeAmountCents).toBe(0);
    expect(negativeBps.applicationFeeAmountCents).toBe(0);
    expect(zeroBps.skippedReason).toBe("non_positive_basis_points");
    expect(negativeBps.skippedReason).toBe("non_positive_basis_points");
  });

  it("never returns a fee that equals or exceeds the charge amount", () => {
    const result = calculatePlatformApplicationFeeAmountCents({
      amountCents: 1,
      feeBasisPoints: 10000,
      enabled: true,
    });

    expect(result.applicationFeeAmountCents).toBe(0);
    expect(result.skippedReason).toBe("fee_not_less_than_charge");
  });

  it("handles very small charges that round to zero safely", () => {
    const result = calculatePlatformApplicationFeeAmountCents({
      amountCents: 1,
      feeBasisPoints: 50,
      enabled: true,
    });

    expect(result.applicationFeeAmountCents).toBe(0);
    expect(result.skippedReason).toBe("rounded_to_zero");
  });

  it("stays integer-safe for high but safe charge amounts", () => {
    const result = calculatePlatformApplicationFeeAmountCents({
      amountCents: 2_000_000_000,
      feeBasisPoints: 50,
      enabled: true,
    });

    expect(Number.isSafeInteger(result.applicationFeeAmountCents)).toBe(true);
    expect(result.applicationFeeAmountCents).toBe(10_000_000);
    expect(result.skippedReason).toBeNull();
  });

  it("remains pure business logic and performs no Stripe calls", () => {
    const spy = vi.mocked(getStripeServerClient);

    calculatePlatformApplicationFeeAmountCents({
      amountCents: 1750,
      feeBasisPoints: 50,
      enabled: true,
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it("does not mutate payment/invoice/allocation-like input state", () => {
    const payload = Object.freeze({
      amountCents: 1750,
      feeBasisPoints: 50,
      enabled: true,
      invoice: {
        id: "inv_1",
        amountPaidCents: 0,
      },
      payment: {
        id: "pay_1",
        status: "pending",
      },
      allocation: {
        id: "alloc_1",
        status: "inactive",
      },
    });

    const result = calculatePlatformApplicationFeeAmountCents({
      amountCents: payload.amountCents,
      feeBasisPoints: payload.feeBasisPoints,
      enabled: payload.enabled,
    });

    expect(result.applicationFeeAmountCents).toBe(9);
    expect(payload.invoice.amountPaidCents).toBe(0);
    expect(payload.payment.status).toBe("pending");
    expect(payload.allocation.status).toBe("inactive");
  });

  it("derives config guards for connect readiness, missing account, and comped bypass", () => {
    const notReady = derivePlatformApplicationFeeConfig({
      stripeConnectReady: false,
      connectedAccountId: "acct_1",
    });
    const missingAccount = derivePlatformApplicationFeeConfig({
      stripeConnectReady: true,
      connectedAccountId: "",
    });
    const internalComped = derivePlatformApplicationFeeConfig({
      isInternalComped: true,
      stripeConnectReady: true,
      connectedAccountId: "acct_1",
    });

    expect(notReady.enabled).toBe(false);
    expect(notReady.skippedReason).toBe("connect_not_ready");
    expect(missingAccount.enabled).toBe(false);
    expect(missingAccount.skippedReason).toBe("missing_connected_account");
    expect(internalComped.enabled).toBe(false);
    expect(internalComped.skippedReason).toBe("internal_comped_account");
  });
});
