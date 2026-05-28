import { describe, expect, it } from "vitest";
import {
  SCHEDULED_AUTOPAY_ELIGIBILITY_BLOCKED_REASONS,
  runScheduledAutopayEligibilityDryRun,
  type ScheduledAutopayEligibilityDependencies,
} from "@/lib/business/scheduled-autopay-eligibility";

type ScenarioState = {
  invoices?: Array<{
    id: string;
    account_owner_user_id: string;
    customer_id: string | null;
    status: string;
    total_cents: number;
  }>;
  invoiceSummaries?: Record<
    string,
    {
      invoiceId: string;
      invoiceTotalCents: number;
      amountPaidCents: number;
      balanceDueCents: number;
      paymentStatus: "unpaid" | "partial" | "paid";
    }
  >;
  connect?: {
    connectedAccountId: string | null;
    onboardingStatus: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    disabledReason: string | null;
    lastSyncedAt: string | null;
    isReady: boolean;
  };
  profile?: {
    id: string;
    customer_id: string;
    stripe_connected_account_id: string;
    stripe_customer_id: string;
    profile_status: string;
    is_current: boolean;
  } | null;
  method?: {
    id: string;
    customer_id: string;
    tenant_stripe_customer_id: string;
    stripe_connected_account_id: string;
    stripe_customer_id: string;
    stripe_payment_method_id: string;
    payment_method_status: string;
    payment_method_type: string;
    detached_at: string | null;
    invalidated_at: string | null;
  } | null;
  consent?: {
    id: string;
    customer_id: string;
    maintenance_agreement_id: string;
    tenant_stripe_customer_id: string;
    tenant_customer_payment_method_id: string;
    stripe_connected_account_id: string;
    consent_status: string;
    max_amount_cents: number | null;
    is_current: boolean;
  } | null;
  billingPeriod?: {
    id: string;
    maintenance_agreement_id: string;
    billing_period_status: string;
  } | null;
  maintenanceAgreement?: {
    id: string;
    customer_id: string;
    status: string;
  } | null;
  inFlightAttempt?: {
    id: string;
    attempt_kind: string;
    attempt_status: string;
    stripe_idempotency_key: string;
  } | null;
};

const OWNER_ID = "owner-1";
const INVOICE_ID = "inv-1";
const CUSTOMER_ID = "cust-1";

function makeDefaultState(): Required<ScenarioState> {
  return {
    invoices: [
      {
        id: INVOICE_ID,
        account_owner_user_id: OWNER_ID,
        customer_id: CUSTOMER_ID,
        status: "issued",
        total_cents: 5000,
      },
    ],
    invoiceSummaries: {
      [INVOICE_ID]: {
        invoiceId: INVOICE_ID,
        invoiceTotalCents: 5000,
        amountPaidCents: 0,
        balanceDueCents: 5000,
        paymentStatus: "unpaid",
      },
    },
    connect: {
      connectedAccountId: "acct_ready_1",
      onboardingStatus: "complete",
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      disabledReason: null,
      lastSyncedAt: "2026-05-28T01:00:00.000Z",
      isReady: true,
    },
    profile: {
      id: "tsc-1",
      customer_id: CUSTOMER_ID,
      stripe_connected_account_id: "acct_ready_1",
      stripe_customer_id: "cus_123",
      profile_status: "active",
      is_current: true,
    },
    method: {
      id: "pm-row-1",
      customer_id: CUSTOMER_ID,
      tenant_stripe_customer_id: "tsc-1",
      stripe_connected_account_id: "acct_ready_1",
      stripe_customer_id: "cus_123",
      stripe_payment_method_id: "pm_123",
      payment_method_status: "active",
      payment_method_type: "card",
      detached_at: null,
      invalidated_at: null,
    },
    consent: {
      id: "consent-1",
      customer_id: CUSTOMER_ID,
      maintenance_agreement_id: "ma-1",
      tenant_stripe_customer_id: "tsc-1",
      tenant_customer_payment_method_id: "pm-row-1",
      stripe_connected_account_id: "acct_ready_1",
      consent_status: "enabled",
      max_amount_cents: null,
      is_current: true,
    },
    billingPeriod: {
      id: "bp-1",
      maintenance_agreement_id: "ma-1",
      billing_period_status: "invoice_linked",
    },
    maintenanceAgreement: {
      id: "ma-1",
      customer_id: CUSTOMER_ID,
      status: "active",
    },
    inFlightAttempt: null,
  };
}

function makeDependencies(overrides: ScenarioState = {}): ScheduledAutopayEligibilityDependencies {
  const state = makeDefaultState();

  if (overrides.invoices) state.invoices = overrides.invoices;
  if (overrides.invoiceSummaries) state.invoiceSummaries = overrides.invoiceSummaries;
  if (overrides.connect) state.connect = overrides.connect;
  if (Object.prototype.hasOwnProperty.call(overrides, "profile")) state.profile = overrides.profile as any;
  if (Object.prototype.hasOwnProperty.call(overrides, "method")) state.method = overrides.method as any;
  if (Object.prototype.hasOwnProperty.call(overrides, "consent")) state.consent = overrides.consent as any;
  if (Object.prototype.hasOwnProperty.call(overrides, "billingPeriod")) state.billingPeriod = overrides.billingPeriod as any;
  if (Object.prototype.hasOwnProperty.call(overrides, "maintenanceAgreement")) {
    state.maintenanceAgreement = overrides.maintenanceAgreement as any;
  }
  if (Object.prototype.hasOwnProperty.call(overrides, "inFlightAttempt")) {
    state.inFlightAttempt = overrides.inFlightAttempt as any;
  }

  return {
    async listCandidateInvoices() {
      return state.invoices;
    },
    async resolveInvoiceSummary(_, invoiceId) {
      return state.invoiceSummaries[invoiceId] ?? {
        invoiceId,
        invoiceTotalCents: 0,
        amountPaidCents: 0,
        balanceDueCents: 0,
        paymentStatus: "unpaid",
      };
    },
    async resolveConnectReadiness() {
      return state.connect;
    },
    async resolveStripeCustomerProfile() {
      return state.profile;
    },
    async resolveSavedPaymentMethod() {
      return state.method;
    },
    async resolveBillingPeriodContext() {
      return state.billingPeriod;
    },
    async resolveMaintenanceAgreementContext() {
      return state.maintenanceAgreement;
    },
    async resolveAutopayConsent() {
      return state.consent;
    },
    async resolveInFlightAttempt() {
      return state.inFlightAttempt;
    },
  };
}

async function runScenario(overrides: ScenarioState = {}) {
  return runScheduledAutopayEligibilityDryRun({
    accountOwnerUserId: OWNER_ID,
    dependencies: makeDependencies(overrides),
    evaluatedAt: "2026-05-28T00:00:00.000Z",
  });
}

describe("scheduled autopay eligibility dry run", () => {
  it("marks issued invoice eligible with enabled consent, active method, and ready connect account", async () => {
    const result = await runScenario();

    expect(result.invoicesEvaluatedCount).toBe(1);
    expect(result.eligibleInvoicesCount).toBe(1);
    expect(result.blockedInvoicesCount).toBe(0);
    expect(result.eligibleInvoices[0]?.invoiceId).toBe(INVOICE_ID);
    expect(result.eligibleInvoices[0]?.blockedReasonCodes).toEqual([]);
    expect(result.eligibleInvoices[0]?.snapshots.invoice.proposedAmountCents).toBe(5000);
    expect(result.eligibleInvoices[0]?.snapshots.consentReadiness.isEnabled).toBe(true);
    expect(result.eligibleInvoices[0]?.snapshots.savedPaymentMethodReadiness.methodFound).toBe(true);
    expect(result.eligibleInvoices[0]?.snapshots.connectedAccountReadiness.isReady).toBe(true);
  });

  it("blocks draft invoice with invoice_not_issued", async () => {
    const result = await runScenario({
      invoices: [
        {
          id: INVOICE_ID,
          account_owner_user_id: OWNER_ID,
          customer_id: CUSTOMER_ID,
          status: "draft",
          total_cents: 5000,
        },
      ],
    });

    expect(result.blockedInvoices[0]?.blockedReasonCodes).toContain("invoice_not_issued");
  });

  it("blocks void invoice with invoice_void", async () => {
    const result = await runScenario({
      invoices: [
        {
          id: INVOICE_ID,
          account_owner_user_id: OWNER_ID,
          customer_id: CUSTOMER_ID,
          status: "void",
          total_cents: 5000,
        },
      ],
    });

    expect(result.blockedInvoices[0]?.blockedReasonCodes).toContain("invoice_void");
  });

  it("blocks invoice with no balance due", async () => {
    const result = await runScenario({
      invoiceSummaries: {
        [INVOICE_ID]: {
          invoiceId: INVOICE_ID,
          invoiceTotalCents: 5000,
          amountPaidCents: 1000,
          balanceDueCents: 0,
          paymentStatus: "partial",
        },
      },
    });

    expect(result.blockedInvoices[0]?.blockedReasonCodes).toContain("invoice_no_balance_due");
  });

  it("blocks when consent is missing", async () => {
    const result = await runScenario({ consent: null });
    expect(result.blockedInvoices[0]?.blockedReasonCodes).toContain("missing_autopay_consent");
  });

  it("blocks disabled, paused, and revoked consent with stable reasons", async () => {
    const disabled = await runScenario({
      consent: {
        id: "consent-1",
        customer_id: CUSTOMER_ID,
        maintenance_agreement_id: "ma-1",
        tenant_stripe_customer_id: "tsc-1",
        tenant_customer_payment_method_id: "pm-row-1",
        stripe_connected_account_id: "acct_ready_1",
        consent_status: "disabled",
        max_amount_cents: null,
        is_current: true,
      },
    });
    const paused = await runScenario({
      consent: {
        id: "consent-1",
        customer_id: CUSTOMER_ID,
        maintenance_agreement_id: "ma-1",
        tenant_stripe_customer_id: "tsc-1",
        tenant_customer_payment_method_id: "pm-row-1",
        stripe_connected_account_id: "acct_ready_1",
        consent_status: "paused",
        max_amount_cents: null,
        is_current: true,
      },
    });
    const revoked = await runScenario({
      consent: {
        id: "consent-1",
        customer_id: CUSTOMER_ID,
        maintenance_agreement_id: "ma-1",
        tenant_stripe_customer_id: "tsc-1",
        tenant_customer_payment_method_id: "pm-row-1",
        stripe_connected_account_id: "acct_ready_1",
        consent_status: "revoked",
        max_amount_cents: null,
        is_current: true,
      },
    });

    expect(disabled.blockedInvoices[0]?.blockedReasonCodes).toContain("autopay_not_enabled");
    expect(paused.blockedInvoices[0]?.blockedReasonCodes).toContain("autopay_paused_or_revoked");
    expect(revoked.blockedInvoices[0]?.blockedReasonCodes).toContain("autopay_paused_or_revoked");
  });

  it("blocks when saved payment method is missing", async () => {
    const result = await runScenario({ method: null });
    expect(result.blockedInvoices[0]?.blockedReasonCodes).toContain("missing_saved_payment_method");
  });

  it("blocks inactive/expired/detached payment methods", async () => {
    const inactive = await runScenario({
      method: {
        id: "pm-row-1",
        customer_id: CUSTOMER_ID,
        tenant_stripe_customer_id: "tsc-1",
        stripe_connected_account_id: "acct_ready_1",
        stripe_customer_id: "cus_123",
        stripe_payment_method_id: "pm_123",
        payment_method_status: "inactive",
        payment_method_type: "card",
        detached_at: null,
        invalidated_at: null,
      },
    });
    const expired = await runScenario({
      method: {
        id: "pm-row-1",
        customer_id: CUSTOMER_ID,
        tenant_stripe_customer_id: "tsc-1",
        stripe_connected_account_id: "acct_ready_1",
        stripe_customer_id: "cus_123",
        stripe_payment_method_id: "pm_123",
        payment_method_status: "expired_display_only",
        payment_method_type: "card",
        detached_at: null,
        invalidated_at: null,
      },
    });
    const detached = await runScenario({
      method: {
        id: "pm-row-1",
        customer_id: CUSTOMER_ID,
        tenant_stripe_customer_id: "tsc-1",
        stripe_connected_account_id: "acct_ready_1",
        stripe_customer_id: "cus_123",
        stripe_payment_method_id: "pm_123",
        payment_method_status: "detached",
        payment_method_type: "card",
        detached_at: null,
        invalidated_at: null,
      },
    });

    expect(inactive.blockedInvoices[0]?.blockedReasonCodes).toContain("saved_payment_method_inactive");
    expect(expired.blockedInvoices[0]?.blockedReasonCodes).toContain("saved_payment_method_inactive");
    expect(detached.blockedInvoices[0]?.blockedReasonCodes).toContain("saved_payment_method_inactive");
  });

  it("blocks when connected account is not ready", async () => {
    const result = await runScenario({
      connect: {
        connectedAccountId: null,
        onboardingStatus: "pending",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        disabledReason: "requirements_past_due",
        lastSyncedAt: null,
        isReady: false,
      },
    });

    expect(result.blockedInvoices[0]?.blockedReasonCodes).toContain("connected_account_not_ready");
  });

  it("blocks when invoice amount exceeds consent max", async () => {
    const result = await runScenario({
      consent: {
        id: "consent-1",
        customer_id: CUSTOMER_ID,
        maintenance_agreement_id: "ma-1",
        tenant_stripe_customer_id: "tsc-1",
        tenant_customer_payment_method_id: "pm-row-1",
        stripe_connected_account_id: "acct_ready_1",
        consent_status: "enabled",
        max_amount_cents: 1000,
        is_current: true,
      },
      invoiceSummaries: {
        [INVOICE_ID]: {
          invoiceId: INVOICE_ID,
          invoiceTotalCents: 5000,
          amountPaidCents: 0,
          balanceDueCents: 5000,
          paymentStatus: "unpaid",
        },
      },
    });

    expect(result.blockedInvoices[0]?.blockedReasonCodes).toContain("amount_exceeds_consent_max");
  });

  it("blocks when linked billing period is cancelled", async () => {
    const result = await runScenario({
      billingPeriod: {
        id: "bp-1",
        maintenance_agreement_id: "ma-1",
        billing_period_status: "cancelled",
      },
    });

    expect(result.blockedInvoices[0]?.blockedReasonCodes).toContain("billing_period_cancelled");
  });

  it("blocks when an in-flight scheduled_autopay attempt exists", async () => {
    const result = await runScenario({
      inFlightAttempt: {
        id: "attempt-1",
        attempt_kind: "scheduled_autopay",
        attempt_status: "submitted",
        stripe_idempotency_key: "scheduled_autopay:owner-1:inv-1:c1:1",
      },
    });

    expect(result.blockedInvoices[0]?.blockedReasonCodes).toContain("in_flight_attempt_exists");
    expect(result.blockedInvoices[0]?.snapshots.inFlightAttempt.exists).toBe(true);
  });

  it("returns explicit dry-run marker with no writes and no Stripe calls", async () => {
    const result = await runScenario();

    expect(result.dryRun).toEqual({
      mode: "dry_run",
      marker: "scheduled_autopay_eligibility_dry_run",
      noWrites: true,
      noStripeCalls: true,
      mutationInstructions: [],
    });
  });

  it("separates eligible and blocked invoice arrays", async () => {
    const result = await runScheduledAutopayEligibilityDryRun({
      accountOwnerUserId: OWNER_ID,
      evaluatedAt: "2026-05-28T00:00:00.000Z",
      dependencies: makeDependencies({
        invoices: [
          {
            id: "inv-eligible",
            account_owner_user_id: OWNER_ID,
            customer_id: CUSTOMER_ID,
            status: "issued",
            total_cents: 1000,
          },
          {
            id: "inv-blocked",
            account_owner_user_id: OWNER_ID,
            customer_id: CUSTOMER_ID,
            status: "draft",
            total_cents: 1000,
          },
        ],
        invoiceSummaries: {
          "inv-eligible": {
            invoiceId: "inv-eligible",
            invoiceTotalCents: 1000,
            amountPaidCents: 0,
            balanceDueCents: 1000,
            paymentStatus: "unpaid",
          },
          "inv-blocked": {
            invoiceId: "inv-blocked",
            invoiceTotalCents: 1000,
            amountPaidCents: 0,
            balanceDueCents: 1000,
            paymentStatus: "unpaid",
          },
        },
      }),
    });

    expect(result.invoicesEvaluatedCount).toBe(2);
    expect(result.eligibleInvoicesCount).toBe(1);
    expect(result.blockedInvoicesCount).toBe(1);
    expect(result.eligibleInvoices[0]?.invoiceId).toBe("inv-eligible");
    expect(result.blockedInvoices[0]?.invoiceId).toBe("inv-blocked");
  });

  it("keeps blocked reason code list stable", async () => {
    expect(SCHEDULED_AUTOPAY_ELIGIBILITY_BLOCKED_REASONS).toEqual([
      "invoice_not_issued",
      "invoice_void",
      "invoice_no_balance_due",
      "invoice_already_paid",
      "missing_customer",
      "missing_payment_profile",
      "payment_profile_inactive",
      "missing_saved_payment_method",
      "saved_payment_method_inactive",
      "missing_autopay_consent",
      "autopay_not_enabled",
      "autopay_paused_or_revoked",
      "amount_exceeds_consent_max",
      "connected_account_not_ready",
      "connected_account_mismatch",
      "billing_period_cancelled",
      "maintenance_agreement_not_eligible",
      "in_flight_attempt_exists",
      "unsupported_invoice_context",
    ]);
  });
});
