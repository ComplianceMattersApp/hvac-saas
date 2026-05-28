import { describe, expect, it, vi } from "vitest";
import {
  buildScheduledAutopayIdempotencyKey,
  createScheduledAutopayAttemptsFromEligibility,
} from "@/lib/business/scheduled-autopay-attempt-creation";
import type { ScheduledAutopayDryRunResult } from "@/lib/business/scheduled-autopay-eligibility";

const OWNER_ID = "owner-1";
const INVOICE_ID = "inv-1";

function makeEligibleDryRun(): ScheduledAutopayDryRunResult {
  return {
    accountOwnerUserId: OWNER_ID,
    evaluatedAt: "2026-05-28T00:00:00.000Z",
    dryRun: {
      mode: "dry_run",
      marker: "scheduled_autopay_eligibility_dry_run",
      noWrites: true,
      noStripeCalls: true,
      mutationInstructions: [],
    },
    invoicesEvaluatedCount: 1,
    eligibleInvoicesCount: 1,
    blockedInvoicesCount: 0,
    blockedReasonCounts: {
      invoice_not_issued: 0,
      invoice_void: 0,
      invoice_no_balance_due: 0,
      invoice_already_paid: 0,
      missing_customer: 0,
      missing_payment_profile: 0,
      payment_profile_inactive: 0,
      missing_saved_payment_method: 0,
      saved_payment_method_inactive: 0,
      missing_autopay_consent: 0,
      autopay_not_enabled: 0,
      autopay_paused_or_revoked: 0,
      amount_exceeds_consent_max: 0,
      connected_account_not_ready: 0,
      connected_account_mismatch: 0,
      billing_period_cancelled: 0,
      maintenance_agreement_not_eligible: 0,
      in_flight_attempt_exists: 0,
      unsupported_invoice_context: 0,
    },
    invoicesEvaluated: [
      {
        invoiceId: INVOICE_ID,
        customerId: "cust-1",
        eligibility: "eligible",
        blockedReasonCodes: [],
        snapshots: {
          invoice: {
            id: INVOICE_ID,
            status: "issued",
            customerId: "cust-1",
            invoiceTotalCents: 5000,
            amountPaidCents: 0,
            balanceDueCents: 5000,
            proposedAmountCents: 5000,
          },
          connectedAccountReadiness: {
            isReady: true,
            connectedAccountId: "acct_ready_1",
            onboardingStatus: "complete",
            chargesEnabled: true,
            payoutsEnabled: true,
            detailsSubmitted: true,
            disabledReason: null,
            lastSyncedAt: null,
            mismatchWithProfile: false,
            mismatchWithMethod: false,
            mismatchWithConsent: false,
          },
          paymentProfileReadiness: {
            profileFound: true,
            profileId: "tsc-1",
            profileStatus: "active",
            isCurrent: true,
            stripeConnectedAccountId: "acct_ready_1",
            stripeCustomerId: "cus_123",
          },
          savedPaymentMethodReadiness: {
            methodFound: true,
            methodId: "pm-row-1",
            stripePaymentMethodId: "pm_123",
            methodStatus: "active",
            methodType: "card",
            tenantStripeCustomerId: "tsc-1",
            stripeConnectedAccountId: "acct_ready_1",
            detachedAt: null,
            invalidatedAt: null,
          },
          consentReadiness: {
            consentFound: true,
            consentId: "consent-1",
            consentStatus: "enabled",
            isEnabled: true,
            isPausedOrRevoked: false,
            maintenanceAgreementId: "ma-1",
            tenantStripeCustomerId: "tsc-1",
            tenantCustomerPaymentMethodId: "pm-row-1",
            stripeConnectedAccountId: "acct_ready_1",
            maxAmountCents: null,
          },
          billingContext: {
            billingPeriodId: "bp-1",
            billingPeriodStatus: "invoice_linked",
            maintenanceAgreementId: "ma-1",
            maintenanceAgreementStatus: "active",
            maintenanceAgreementCustomerId: "cust-1",
          },
          inFlightAttempt: {
            exists: false,
            attemptId: null,
            attemptKind: null,
            attemptStatus: null,
            stripeIdempotencyKey: null,
          },
        },
      },
    ],
    eligibleInvoices: [],
    blockedInvoices: [],
  } as ScheduledAutopayDryRunResult;
}

function makeAdminMock(opts?: {
  uniqueConflictOnInsert?: boolean;
}) {
  const writes: Array<{ table: string; payload: any }> = [];

  return {
    writes,
    admin: {
      from(table: string) {
        return {
          insert: async (payload: any) => {
            if (table === "tenant_saved_method_payment_attempts") {
              if (opts?.uniqueConflictOnInsert) {
                return {
                  error: {
                    code: "23505",
                    message: "duplicate key value violates unique constraint",
                  },
                };
              }
              writes.push({ table, payload });
            }
            return { error: null };
          },
        };
      },
    },
  };
}

function makeRevalidationResult(params?: {
  eligibility?: "eligible" | "blocked";
  blockedReasonCodes?: string[];
  status?: string;
  balanceDueCents?: number;
}) {
  const status = params?.status ?? "issued";
  const balanceDueCents = params?.balanceDueCents ?? 5000;

  return {
    accountOwnerUserId: OWNER_ID,
    evaluatedAt: "2026-05-28T00:10:00.000Z",
    dryRun: {
      mode: "dry_run" as const,
      marker: "scheduled_autopay_eligibility_dry_run" as const,
      noWrites: true as const,
      noStripeCalls: true as const,
      mutationInstructions: [],
    },
    invoicesEvaluatedCount: 1,
    eligibleInvoicesCount: params?.eligibility === "blocked" ? 0 : 1,
    blockedInvoicesCount: params?.eligibility === "blocked" ? 1 : 0,
    blockedReasonCounts: {
      invoice_not_issued: 0,
      invoice_void: 0,
      invoice_no_balance_due: 0,
      invoice_already_paid: 0,
      missing_customer: 0,
      missing_payment_profile: 0,
      payment_profile_inactive: 0,
      missing_saved_payment_method: 0,
      saved_payment_method_inactive: 0,
      missing_autopay_consent: 0,
      autopay_not_enabled: 0,
      autopay_paused_or_revoked: 0,
      amount_exceeds_consent_max: 0,
      connected_account_not_ready: 0,
      connected_account_mismatch: 0,
      billing_period_cancelled: 0,
      maintenance_agreement_not_eligible: 0,
      in_flight_attempt_exists: 0,
      unsupported_invoice_context: 0,
    },
    invoicesEvaluated: [
      {
        invoiceId: INVOICE_ID,
        customerId: "cust-1",
        eligibility: params?.eligibility ?? "eligible",
        blockedReasonCodes: (params?.blockedReasonCodes ?? []) as any,
        snapshots: {
          invoice: {
            id: INVOICE_ID,
            status,
            customerId: "cust-1",
            invoiceTotalCents: 5000,
            amountPaidCents: 0,
            balanceDueCents,
            proposedAmountCents: balanceDueCents,
          },
          connectedAccountReadiness: {
            isReady: true,
            connectedAccountId: "acct_ready_1",
            onboardingStatus: "complete",
            chargesEnabled: true,
            payoutsEnabled: true,
            detailsSubmitted: true,
            disabledReason: null,
            lastSyncedAt: null,
            mismatchWithProfile: false,
            mismatchWithMethod: false,
            mismatchWithConsent: false,
          },
          paymentProfileReadiness: {
            profileFound: true,
            profileId: "tsc-1",
            profileStatus: "active",
            isCurrent: true,
            stripeConnectedAccountId: "acct_ready_1",
            stripeCustomerId: "cus_123",
          },
          savedPaymentMethodReadiness: {
            methodFound: true,
            methodId: "pm-row-1",
            stripePaymentMethodId: "pm_123",
            methodStatus: "active",
            methodType: "card",
            tenantStripeCustomerId: "tsc-1",
            stripeConnectedAccountId: "acct_ready_1",
            detachedAt: null,
            invalidatedAt: null,
          },
          consentReadiness: {
            consentFound: true,
            consentId: "consent-1",
            consentStatus: "enabled",
            isEnabled: true,
            isPausedOrRevoked: false,
            maintenanceAgreementId: "ma-1",
            tenantStripeCustomerId: "tsc-1",
            tenantCustomerPaymentMethodId: "pm-row-1",
            stripeConnectedAccountId: "acct_ready_1",
            maxAmountCents: null,
          },
          billingContext: {
            billingPeriodId: "bp-1",
            billingPeriodStatus: "invoice_linked",
            maintenanceAgreementId: "ma-1",
            maintenanceAgreementStatus: "active",
            maintenanceAgreementCustomerId: "cust-1",
          },
          inFlightAttempt: {
            exists: false,
            attemptId: null,
            attemptKind: null,
            attemptStatus: null,
            stripeIdempotencyKey: null,
          },
        },
      },
    ],
    eligibleInvoices: [],
    blockedInvoices: [],
  } satisfies ScheduledAutopayDryRunResult;
}

describe("scheduled autopay attempt creation", () => {
  it("creates one pending scheduled_autopay attempt for eligible invoice", async () => {
    const { admin, writes } = makeAdminMock();
    const revalidateDryRun = vi.fn(async () => makeRevalidationResult());

    const result = await createScheduledAutopayAttemptsFromEligibility({
      admin,
      accountOwnerUserId: OWNER_ID,
      eligibilityDryRun: {
        ...makeEligibleDryRun(),
        eligibleInvoices: makeEligibleDryRun().invoicesEvaluated,
      },
      mode: "commit",
      cycleKey: "2026-05-28",
      revalidateDryRun,
    });

    expect(result.attemptsCreatedCount).toBe(1);
    expect(result.createdAttemptIds.length).toBe(1);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.table).toBe("tenant_saved_method_payment_attempts");
    expect(writes[0]?.payload.attempt_kind).toBe("scheduled_autopay");
    expect(writes[0]?.payload.attempt_status).toBe("pending");
    expect(writes[0]?.payload.amount_cents_snapshot).toBe(5000);
    expect(writes[0]?.payload.stripe_payment_intent_id).toBeUndefined();
  });

  it("does not create attempt for blocked invoice from eligibility input", async () => {
    const { admin, writes } = makeAdminMock();

    const result = await createScheduledAutopayAttemptsFromEligibility({
      admin,
      accountOwnerUserId: OWNER_ID,
      eligibilityDryRun: {
        ...makeEligibleDryRun(),
        eligibleInvoices: [],
      },
      mode: "commit",
      revalidateDryRun: vi.fn(async () => makeRevalidationResult()),
    });

    expect(result.eligibleConsideredCount).toBe(0);
    expect(result.attemptsCreatedCount).toBe(0);
    expect(writes).toHaveLength(0);
  });

  it("does not create duplicate attempt when pending exists (unique conflict)", async () => {
    const { admin, writes } = makeAdminMock({ uniqueConflictOnInsert: true });

    const result = await createScheduledAutopayAttemptsFromEligibility({
      admin,
      accountOwnerUserId: OWNER_ID,
      eligibilityDryRun: {
        ...makeEligibleDryRun(),
        eligibleInvoices: makeEligibleDryRun().invoicesEvaluated,
      },
      mode: "commit",
      cycleKey: "2026-05-28",
      revalidateDryRun: vi.fn(async () => makeRevalidationResult()),
    });

    expect(result.attemptsCreatedCount).toBe(0);
    expect(result.skippedDuplicateOrInFlightCount).toBe(1);
    expect(result.skippedDuplicateOrInFlightInvoiceIds).toEqual([INVOICE_ID]);
    expect(writes).toHaveLength(0);
  });

  it("does not create duplicate on repeated create call with same cycle key", async () => {
    const dryRun = {
      ...makeEligibleDryRun(),
      eligibleInvoices: makeEligibleDryRun().invoicesEvaluated,
    };

    const insertSeen = new Set<string>();
    const writes: any[] = [];
    const admin = {
      from() {
        return {
          insert: async (payload: any) => {
            const key = String(payload.stripe_idempotency_key ?? "");
            if (insertSeen.has(key)) {
              return {
                error: { code: "23505", message: "duplicate key value violates unique constraint" },
              };
            }
            insertSeen.add(key);
            writes.push(payload);
            return { error: null };
          },
        };
      },
    };

    const revalidateDryRun = vi.fn(async () => makeRevalidationResult());

    const first = await createScheduledAutopayAttemptsFromEligibility({
      admin,
      accountOwnerUserId: OWNER_ID,
      eligibilityDryRun: dryRun,
      mode: "commit",
      cycleKey: "2026-05-28",
      revalidateDryRun,
    });

    const second = await createScheduledAutopayAttemptsFromEligibility({
      admin,
      accountOwnerUserId: OWNER_ID,
      eligibilityDryRun: dryRun,
      mode: "commit",
      cycleKey: "2026-05-28",
      revalidateDryRun,
    });

    expect(first.attemptsCreatedCount).toBe(1);
    expect(second.attemptsCreatedCount).toBe(0);
    expect(second.skippedDuplicateOrInFlightCount).toBe(1);
    expect(writes).toHaveLength(1);
  });

  it("blocks if invoice became paid/no-balance before create", async () => {
    const { admin } = makeAdminMock();

    const result = await createScheduledAutopayAttemptsFromEligibility({
      admin,
      accountOwnerUserId: OWNER_ID,
      eligibilityDryRun: {
        ...makeEligibleDryRun(),
        eligibleInvoices: makeEligibleDryRun().invoicesEvaluated,
      },
      mode: "commit",
      revalidateDryRun: vi.fn(async () =>
        makeRevalidationResult({
          eligibility: "blocked",
          blockedReasonCodes: ["invoice_no_balance_due"],
          balanceDueCents: 0,
        }),
      ),
    });

    expect(result.blockedOnRevalidationCount).toBe(1);
    expect(result.blockedOnRevalidation[0]?.blockedReasonCodes).toContain("invoice_no_balance_due");
  });

  it("blocks if invoice became void before create", async () => {
    const { admin } = makeAdminMock();

    const result = await createScheduledAutopayAttemptsFromEligibility({
      admin,
      accountOwnerUserId: OWNER_ID,
      eligibilityDryRun: {
        ...makeEligibleDryRun(),
        eligibleInvoices: makeEligibleDryRun().invoicesEvaluated,
      },
      mode: "commit",
      revalidateDryRun: vi.fn(async () =>
        makeRevalidationResult({
          eligibility: "blocked",
          blockedReasonCodes: ["invoice_void"],
          status: "void",
        }),
      ),
    });

    expect(result.blockedOnRevalidation[0]?.blockedReasonCodes).toContain("invoice_void");
  });

  it("blocks if consent became disabled/revoked before create", async () => {
    const { admin } = makeAdminMock();

    const disabled = await createScheduledAutopayAttemptsFromEligibility({
      admin,
      accountOwnerUserId: OWNER_ID,
      eligibilityDryRun: {
        ...makeEligibleDryRun(),
        eligibleInvoices: makeEligibleDryRun().invoicesEvaluated,
      },
      mode: "commit",
      revalidateDryRun: vi.fn(async () =>
        makeRevalidationResult({
          eligibility: "blocked",
          blockedReasonCodes: ["autopay_not_enabled"],
        }),
      ),
    });

    const revoked = await createScheduledAutopayAttemptsFromEligibility({
      admin,
      accountOwnerUserId: OWNER_ID,
      eligibilityDryRun: {
        ...makeEligibleDryRun(),
        eligibleInvoices: makeEligibleDryRun().invoicesEvaluated,
      },
      mode: "commit",
      revalidateDryRun: vi.fn(async () =>
        makeRevalidationResult({
          eligibility: "blocked",
          blockedReasonCodes: ["autopay_paused_or_revoked"],
        }),
      ),
    });

    expect(disabled.blockedOnRevalidation[0]?.blockedReasonCodes).toContain("autopay_not_enabled");
    expect(revoked.blockedOnRevalidation[0]?.blockedReasonCodes).toContain("autopay_paused_or_revoked");
  });

  it("blocks if method became inactive/stale before create", async () => {
    const { admin } = makeAdminMock();

    const result = await createScheduledAutopayAttemptsFromEligibility({
      admin,
      accountOwnerUserId: OWNER_ID,
      eligibilityDryRun: {
        ...makeEligibleDryRun(),
        eligibleInvoices: makeEligibleDryRun().invoicesEvaluated,
      },
      mode: "commit",
      revalidateDryRun: vi.fn(async () =>
        makeRevalidationResult({
          eligibility: "blocked",
          blockedReasonCodes: ["saved_payment_method_inactive"],
        }),
      ),
    });

    expect(result.blockedOnRevalidation[0]?.blockedReasonCodes).toContain("saved_payment_method_inactive");
  });

  it("blocks if connected account became not ready", async () => {
    const { admin } = makeAdminMock();

    const result = await createScheduledAutopayAttemptsFromEligibility({
      admin,
      accountOwnerUserId: OWNER_ID,
      eligibilityDryRun: {
        ...makeEligibleDryRun(),
        eligibleInvoices: makeEligibleDryRun().invoicesEvaluated,
      },
      mode: "commit",
      revalidateDryRun: vi.fn(async () =>
        makeRevalidationResult({
          eligibility: "blocked",
          blockedReasonCodes: ["connected_account_not_ready"],
        }),
      ),
    });

    expect(result.blockedOnRevalidation[0]?.blockedReasonCodes).toContain("connected_account_not_ready");
  });

  it("uses deterministic idempotency key format", async () => {
    const key = buildScheduledAutopayIdempotencyKey({
      accountOwnerUserId: OWNER_ID,
      invoiceId: INVOICE_ID,
      cycleKey: "2026-05-28",
      ordinal: 1,
    });

    expect(key).toBe("scheduled_autopay:owner-1:inv-1:2026-05-28:1");
  });

  it("returns created/skipped/blocked summary and dry markers", async () => {
    const { admin } = makeAdminMock();

    const result = await createScheduledAutopayAttemptsFromEligibility({
      admin,
      accountOwnerUserId: OWNER_ID,
      eligibilityDryRun: {
        ...makeEligibleDryRun(),
        eligibleInvoices: makeEligibleDryRun().invoicesEvaluated,
      },
      mode: "dry_run",
      revalidateDryRun: vi.fn(async () => makeRevalidationResult()),
    });

    expect(result.mode).toBe("dry_run");
    expect(result.noStripeSubmit).toBe(true);
    expect(result.noPaymentRowWrites).toBe(true);
    expect(result.noAllocationRowWrites).toBe(true);
    expect(result.noInvoiceMutations).toBe(true);
    expect(result.noVisitOrNextDueMutations).toBe(true);
    expect(result.attemptsCreatedCount).toBe(0);
  });

  it("does not call Stripe and does not create payment/allocation writes", async () => {
    const { admin, writes } = makeAdminMock();
    const stripe = { paymentIntents: { create: vi.fn() } };

    const result = await createScheduledAutopayAttemptsFromEligibility({
      admin,
      accountOwnerUserId: OWNER_ID,
      eligibilityDryRun: {
        ...makeEligibleDryRun(),
        eligibleInvoices: makeEligibleDryRun().invoicesEvaluated,
      },
      mode: "commit",
      revalidateDryRun: vi.fn(async () => makeRevalidationResult()),
    });

    expect(result.attemptsCreatedCount).toBe(1);
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    expect(writes.some((entry) => entry.table === "internal_invoice_payments")).toBe(false);
    expect(writes.some((entry) => entry.table === "internal_invoice_payment_allocations")).toBe(false);
  });

  it("does not perform invoice paid/status mutations or visit/next_due behavior", async () => {
    const { admin, writes } = makeAdminMock();

    const result = await createScheduledAutopayAttemptsFromEligibility({
      admin,
      accountOwnerUserId: OWNER_ID,
      eligibilityDryRun: {
        ...makeEligibleDryRun(),
        eligibleInvoices: makeEligibleDryRun().invoicesEvaluated,
      },
      mode: "commit",
      revalidateDryRun: vi.fn(async () => makeRevalidationResult()),
    });

    expect(result.noInvoiceMutations).toBe(true);
    expect(result.noVisitOrNextDueMutations).toBe(true);
    expect(writes.some((entry) => entry.table === "internal_invoices")).toBe(false);
    expect(writes.some((entry) => entry.table === "maintenance_agreements")).toBe(false);
    expect(writes.some((entry) => entry.table === "maintenance_agreement_visits")).toBe(false);
  });
});
