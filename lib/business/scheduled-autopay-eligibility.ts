import { resolveInvoiceCollectedPaymentSummary } from "@/lib/business/internal-invoice-payments";
import { resolveTenantStripeConnectReadiness } from "@/lib/business/tenant-stripe-connect-readiness";

type SupabaseLike = {
  from(table: string): any;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function toLower(value: unknown) {
  return clean(value).toLowerCase();
}

function toPositiveInt(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  return Math.floor(n);
}

export const SCHEDULED_AUTOPAY_ELIGIBILITY_BLOCKED_REASONS = [
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
] as const;

export type ScheduledAutopayEligibilityBlockedReason =
  (typeof SCHEDULED_AUTOPAY_ELIGIBILITY_BLOCKED_REASONS)[number];

type InvoiceSummary = {
  invoiceId: string;
  invoiceTotalCents: number;
  amountPaidCents: number;
  balanceDueCents: number;
  paymentStatus: "unpaid" | "partial" | "paid";
};

type InvoiceRow = {
  id: string;
  account_owner_user_id: string;
  customer_id: string | null;
  status: string | null;
  total_cents?: number | null;
};

type BillingPeriodContext = {
  id: string;
  maintenance_agreement_id: string | null;
  billing_period_status: string | null;
};

type MaintenanceAgreementContext = {
  id: string;
  customer_id: string | null;
  status: string | null;
};

type StripeCustomerProfileContext = {
  id: string;
  customer_id: string | null;
  stripe_connected_account_id: string | null;
  stripe_customer_id: string | null;
  profile_status: string | null;
  is_current: boolean | null;
};

type SavedPaymentMethodContext = {
  id: string;
  customer_id: string | null;
  tenant_stripe_customer_id: string | null;
  stripe_connected_account_id: string | null;
  stripe_customer_id: string | null;
  payment_method_status: string | null;
  payment_method_type: string | null;
  detached_at: string | null;
  invalidated_at: string | null;
};

type AutopayConsentContext = {
  id: string;
  customer_id: string | null;
  maintenance_agreement_id: string | null;
  tenant_stripe_customer_id: string | null;
  tenant_customer_payment_method_id: string | null;
  stripe_connected_account_id: string | null;
  consent_status: string | null;
  max_amount_cents: number | null;
  is_current: boolean | null;
};

type InFlightAttemptContext = {
  id: string;
  attempt_kind: string | null;
  attempt_status: string | null;
  stripe_idempotency_key: string | null;
};

type ConnectReadinessSnapshot = {
  connectedAccountId: string | null;
  onboardingStatus: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  disabledReason: string | null;
  lastSyncedAt: string | null;
  isReady: boolean;
};

export type ScheduledAutopayInvoiceEligibilitySnapshot = {
  invoice: {
    id: string;
    status: string;
    customerId: string | null;
    invoiceTotalCents: number;
    amountPaidCents: number;
    balanceDueCents: number;
    proposedAmountCents: number;
  };
  connectedAccountReadiness: {
    isReady: boolean;
    connectedAccountId: string | null;
    onboardingStatus: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    disabledReason: string | null;
    lastSyncedAt: string | null;
    mismatchWithProfile: boolean;
    mismatchWithMethod: boolean;
    mismatchWithConsent: boolean;
  };
  paymentProfileReadiness: {
    profileFound: boolean;
    profileId: string | null;
    profileStatus: string | null;
    isCurrent: boolean;
    stripeConnectedAccountId: string | null;
    stripeCustomerId: string | null;
  };
  savedPaymentMethodReadiness: {
    methodFound: boolean;
    methodId: string | null;
    methodStatus: string | null;
    methodType: string | null;
    tenantStripeCustomerId: string | null;
    stripeConnectedAccountId: string | null;
    detachedAt: string | null;
    invalidatedAt: string | null;
  };
  consentReadiness: {
    consentFound: boolean;
    consentId: string | null;
    consentStatus: string | null;
    isEnabled: boolean;
    isPausedOrRevoked: boolean;
    maintenanceAgreementId: string | null;
    tenantStripeCustomerId: string | null;
    tenantCustomerPaymentMethodId: string | null;
    stripeConnectedAccountId: string | null;
    maxAmountCents: number | null;
  };
  billingContext: {
    billingPeriodId: string | null;
    billingPeriodStatus: string | null;
    maintenanceAgreementId: string | null;
    maintenanceAgreementStatus: string | null;
    maintenanceAgreementCustomerId: string | null;
  };
  inFlightAttempt: {
    exists: boolean;
    attemptId: string | null;
    attemptKind: string | null;
    attemptStatus: string | null;
    stripeIdempotencyKey: string | null;
  };
};

export type ScheduledAutopayInvoiceEligibilityResult = {
  invoiceId: string;
  customerId: string | null;
  eligibility: "eligible" | "blocked";
  blockedReasonCodes: ScheduledAutopayEligibilityBlockedReason[];
  snapshots: ScheduledAutopayInvoiceEligibilitySnapshot;
};

export type ScheduledAutopayDryRunResult = {
  accountOwnerUserId: string;
  evaluatedAt: string;
  dryRun: {
    mode: "dry_run";
    marker: "scheduled_autopay_eligibility_dry_run";
    noWrites: true;
    noStripeCalls: true;
    mutationInstructions: [];
  };
  invoicesEvaluatedCount: number;
  eligibleInvoicesCount: number;
  blockedInvoicesCount: number;
  blockedReasonCounts: Record<ScheduledAutopayEligibilityBlockedReason, number>;
  invoicesEvaluated: ScheduledAutopayInvoiceEligibilityResult[];
  eligibleInvoices: ScheduledAutopayInvoiceEligibilityResult[];
  blockedInvoices: ScheduledAutopayInvoiceEligibilityResult[];
};

export type ScheduledAutopayEligibilityDependencies = {
  listCandidateInvoices(accountOwnerUserId: string): Promise<InvoiceRow[]>;
  resolveInvoiceSummary(accountOwnerUserId: string, invoiceId: string): Promise<InvoiceSummary>;
  resolveConnectReadiness(accountOwnerUserId: string): Promise<ConnectReadinessSnapshot>;
  resolveStripeCustomerProfile(
    accountOwnerUserId: string,
    customerId: string,
  ): Promise<StripeCustomerProfileContext | null>;
  resolveSavedPaymentMethod(
    accountOwnerUserId: string,
    customerId: string,
  ): Promise<SavedPaymentMethodContext | null>;
  resolveBillingPeriodContext(
    accountOwnerUserId: string,
    invoiceId: string,
  ): Promise<BillingPeriodContext | null>;
  resolveMaintenanceAgreementContext(
    accountOwnerUserId: string,
    maintenanceAgreementId: string,
  ): Promise<MaintenanceAgreementContext | null>;
  resolveAutopayConsent(
    accountOwnerUserId: string,
    customerId: string,
    maintenanceAgreementId: string | null,
  ): Promise<AutopayConsentContext | null>;
  resolveInFlightAttempt(accountOwnerUserId: string, invoiceId: string): Promise<InFlightAttemptContext | null>;
};

type BuildDefaultDependenciesParams = {
  supabase: SupabaseLike;
};

function buildDefaultDependencies(
  params: BuildDefaultDependenciesParams,
): ScheduledAutopayEligibilityDependencies {
  const supabase = params.supabase;

  return {
    async listCandidateInvoices(accountOwnerUserId: string) {
      const { data, error } = await supabase
        .from("internal_invoices")
        .select("id, account_owner_user_id, customer_id, status, total_cents")
        .eq("account_owner_user_id", accountOwnerUserId)
        .order("created_at", { ascending: true });

      if (error) {
        throw new Error(
          `Failed to list candidate invoices for scheduled autopay eligibility: ${error.message ?? "unknown error"}`,
        );
      }

      return Array.isArray(data) ? (data as InvoiceRow[]) : [];
    },

    async resolveInvoiceSummary(accountOwnerUserId: string, invoiceId: string) {
      return resolveInvoiceCollectedPaymentSummary(accountOwnerUserId, invoiceId, supabase);
    },

    async resolveConnectReadiness(accountOwnerUserId: string) {
      return resolveTenantStripeConnectReadiness(accountOwnerUserId, supabase);
    },

    async resolveStripeCustomerProfile(accountOwnerUserId: string, customerId: string) {
      const { data, error } = await supabase
        .from("tenant_stripe_customers")
        .select(
          "id, customer_id, stripe_connected_account_id, stripe_customer_id, profile_status, is_current",
        )
        .eq("account_owner_user_id", accountOwnerUserId)
        .eq("customer_id", customerId)
        .order("is_current", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) {
        throw new Error(
          `Failed to resolve Stripe payment profile for scheduled autopay eligibility: ${error.message ?? "unknown error"}`,
        );
      }

      const row = Array.isArray(data) ? data[0] : null;
      return row ? (row as StripeCustomerProfileContext) : null;
    },

    async resolveSavedPaymentMethod(accountOwnerUserId: string, customerId: string) {
      const { data, error } = await supabase
        .from("tenant_customer_payment_methods")
        .select(
          [
            "id",
            "customer_id",
            "tenant_stripe_customer_id",
            "stripe_connected_account_id",
            "stripe_customer_id",
            "payment_method_status",
            "payment_method_type",
            "detached_at",
            "invalidated_at",
            "is_default",
            "updated_at",
          ].join(", "),
        )
        .eq("account_owner_user_id", accountOwnerUserId)
        .eq("customer_id", customerId)
        .order("is_default", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1);

      if (error) {
        throw new Error(
          `Failed to resolve saved payment method for scheduled autopay eligibility: ${error.message ?? "unknown error"}`,
        );
      }

      const row = Array.isArray(data) ? data[0] : null;
      return row ? (row as SavedPaymentMethodContext) : null;
    },

    async resolveBillingPeriodContext(accountOwnerUserId: string, invoiceId: string) {
      const { data, error } = await supabase
        .from("maintenance_agreement_billing_periods")
        .select("id, maintenance_agreement_id, billing_period_status")
        .eq("account_owner_user_id", accountOwnerUserId)
        .eq("internal_invoice_id", invoiceId)
        .limit(1);

      if (error) {
        throw new Error(
          `Failed to resolve billing-period context for scheduled autopay eligibility: ${error.message ?? "unknown error"}`,
        );
      }

      const row = Array.isArray(data) ? data[0] : null;
      return row ? (row as BillingPeriodContext) : null;
    },

    async resolveMaintenanceAgreementContext(accountOwnerUserId: string, maintenanceAgreementId: string) {
      const { data, error } = await supabase
        .from("maintenance_agreements")
        .select("id, customer_id, status")
        .eq("account_owner_user_id", accountOwnerUserId)
        .eq("id", maintenanceAgreementId)
        .maybeSingle();

      if (error) {
        throw new Error(
          `Failed to resolve maintenance-agreement context for scheduled autopay eligibility: ${error.message ?? "unknown error"}`,
        );
      }

      return data ? (data as MaintenanceAgreementContext) : null;
    },

    async resolveAutopayConsent(accountOwnerUserId: string, customerId: string, maintenanceAgreementId: string | null) {
      let query = supabase
        .from("tenant_customer_autopay_consents")
        .select(
          [
            "id",
            "customer_id",
            "maintenance_agreement_id",
            "tenant_stripe_customer_id",
            "tenant_customer_payment_method_id",
            "stripe_connected_account_id",
            "consent_status",
            "max_amount_cents",
            "is_current",
            "updated_at",
          ].join(", "),
        )
        .eq("account_owner_user_id", accountOwnerUserId)
        .eq("customer_id", customerId);

      if (maintenanceAgreementId) {
        query = query.eq("maintenance_agreement_id", maintenanceAgreementId);
      }

      const { data, error } = await query
        .order("is_current", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1);

      if (error) {
        throw new Error(
          `Failed to resolve autopay consent for scheduled autopay eligibility: ${error.message ?? "unknown error"}`,
        );
      }

      const row = Array.isArray(data) ? data[0] : null;
      return row ? (row as AutopayConsentContext) : null;
    },

    async resolveInFlightAttempt(accountOwnerUserId: string, invoiceId: string) {
      const { data, error } = await supabase
        .from("tenant_saved_method_payment_attempts")
        .select("id, attempt_kind, attempt_status, stripe_idempotency_key")
        .eq("account_owner_user_id", accountOwnerUserId)
        .eq("invoice_id", invoiceId)
        .eq("attempt_kind", "scheduled_autopay")
        .in("attempt_status", ["pending", "submitted", "retry_scheduled"])
        .limit(1);

      if (error) {
        throw new Error(
          `Failed to resolve in-flight scheduled-autopay attempt snapshot: ${error.message ?? "unknown error"}`,
        );
      }

      const row = Array.isArray(data) ? data[0] : null;
      return row ? (row as InFlightAttemptContext) : null;
    },
  };
}

type EvaluateInvoiceParams = {
  invoice: InvoiceRow;
  summary: InvoiceSummary;
  connectReadiness: ConnectReadinessSnapshot;
  profile: StripeCustomerProfileContext | null;
  method: SavedPaymentMethodContext | null;
  consent: AutopayConsentContext | null;
  billingPeriod: BillingPeriodContext | null;
  maintenanceAgreement: MaintenanceAgreementContext | null;
  inFlightAttempt: InFlightAttemptContext | null;
};

function emptyReasonCountMap() {
  return SCHEDULED_AUTOPAY_ELIGIBILITY_BLOCKED_REASONS.reduce(
    (acc, reason) => {
      acc[reason] = 0;
      return acc;
    },
    {} as Record<ScheduledAutopayEligibilityBlockedReason, number>,
  );
}

function normalizeBlockedReasons(
  reasons: Set<ScheduledAutopayEligibilityBlockedReason>,
): ScheduledAutopayEligibilityBlockedReason[] {
  return SCHEDULED_AUTOPAY_ELIGIBILITY_BLOCKED_REASONS.filter((reason) => reasons.has(reason));
}

function evaluateInvoiceEligibility(
  params: EvaluateInvoiceParams,
): ScheduledAutopayInvoiceEligibilityResult {
  const reasons = new Set<ScheduledAutopayEligibilityBlockedReason>();

  const invoiceId = clean(params.invoice.id);
  const customerId = clean(params.invoice.customer_id) || null;
  const invoiceStatus = toLower(params.invoice.status);
  const invoiceTotalCents = Number(params.summary.invoiceTotalCents ?? params.invoice.total_cents ?? 0) || 0;
  const amountPaidCents = Number(params.summary.amountPaidCents ?? 0) || 0;
  const balanceDueCents = Number(params.summary.balanceDueCents ?? 0) || 0;
  const proposedAmountCents = Math.max(0, balanceDueCents);

  const profileId = clean(params.profile?.id) || null;
  const profileStatus = toLower(params.profile?.profile_status);
  const profileIsCurrent = Boolean(params.profile?.is_current);
  const profileConnectedAccountId = clean(params.profile?.stripe_connected_account_id) || null;

  const methodId = clean(params.method?.id) || null;
  const methodStatus = toLower(params.method?.payment_method_status);
  const methodConnectedAccountId = clean(params.method?.stripe_connected_account_id) || null;

  const consentId = clean(params.consent?.id) || null;
  const consentStatus = toLower(params.consent?.consent_status);
  const consentConnectedAccountId = clean(params.consent?.stripe_connected_account_id) || null;
  const consentMaxAmountCents = toPositiveInt(params.consent?.max_amount_cents);

  const readinessAccountId = clean(params.connectReadiness.connectedAccountId) || null;

  const billingPeriodStatus = toLower(params.billingPeriod?.billing_period_status);
  const maintenanceAgreementStatus = toLower(params.maintenanceAgreement?.status);

  if (!customerId) {
    reasons.add("missing_customer");
  }

  if (invoiceStatus === "void") {
    reasons.add("invoice_void");
  } else if (invoiceStatus !== "issued") {
    reasons.add("invoice_not_issued");
  }

  if (toLower(params.summary.paymentStatus) === "paid") {
    reasons.add("invoice_already_paid");
  } else if (balanceDueCents <= 0) {
    reasons.add("invoice_no_balance_due");
  }

  if (!profileId) {
    reasons.add("missing_payment_profile");
  } else if (profileStatus !== "active" || !profileIsCurrent) {
    reasons.add("payment_profile_inactive");
  }

  if (!methodId) {
    reasons.add("missing_saved_payment_method");
  } else if (methodStatus !== "active") {
    reasons.add("saved_payment_method_inactive");
  }

  if (!consentId) {
    reasons.add("missing_autopay_consent");
  } else if (consentStatus !== "enabled") {
    if (consentStatus === "disabled") {
      reasons.add("autopay_not_enabled");
    } else {
      reasons.add("autopay_paused_or_revoked");
    }
  }

  if (consentMaxAmountCents > 0 && proposedAmountCents > consentMaxAmountCents) {
    reasons.add("amount_exceeds_consent_max");
  }

  if (!params.connectReadiness.isReady || !readinessAccountId) {
    reasons.add("connected_account_not_ready");
  }

  const mismatchWithProfile = Boolean(
    readinessAccountId && profileConnectedAccountId && readinessAccountId !== profileConnectedAccountId,
  );
  const mismatchWithMethod = Boolean(
    readinessAccountId && methodConnectedAccountId && readinessAccountId !== methodConnectedAccountId,
  );
  const mismatchWithConsent = Boolean(
    readinessAccountId && consentConnectedAccountId && readinessAccountId !== consentConnectedAccountId,
  );

  if (mismatchWithProfile || mismatchWithMethod || mismatchWithConsent) {
    reasons.add("connected_account_mismatch");
  }

  if (billingPeriodStatus === "cancelled") {
    reasons.add("billing_period_cancelled");
  }

  if (maintenanceAgreementStatus && maintenanceAgreementStatus !== "active") {
    reasons.add("maintenance_agreement_not_eligible");
  }

  if (clean(params.inFlightAttempt?.id)) {
    reasons.add("in_flight_attempt_exists");
  }

  const unsupportedContext =
    Boolean(profileId && methodId && clean(params.method?.tenant_stripe_customer_id) && clean(params.method?.tenant_stripe_customer_id) !== profileId)
    || Boolean(consentId && methodId && clean(params.consent?.tenant_customer_payment_method_id) && clean(params.consent?.tenant_customer_payment_method_id) !== methodId)
    || Boolean(consentId && profileId && clean(params.consent?.tenant_stripe_customer_id) && clean(params.consent?.tenant_stripe_customer_id) !== profileId)
    || Boolean(consentId && customerId && clean(params.consent?.customer_id) && clean(params.consent?.customer_id) !== customerId)
    || Boolean(
      clean(params.billingPeriod?.maintenance_agreement_id)
      && clean(params.maintenanceAgreement?.id)
      && clean(params.billingPeriod?.maintenance_agreement_id) !== clean(params.maintenanceAgreement?.id),
    );

  if (unsupportedContext) {
    reasons.add("unsupported_invoice_context");
  }

  const blockedReasonCodes = normalizeBlockedReasons(reasons);
  const eligibility = blockedReasonCodes.length > 0 ? "blocked" : "eligible";

  return {
    invoiceId,
    customerId,
    eligibility,
    blockedReasonCodes,
    snapshots: {
      invoice: {
        id: invoiceId,
        status: invoiceStatus,
        customerId,
        invoiceTotalCents,
        amountPaidCents,
        balanceDueCents,
        proposedAmountCents,
      },
      connectedAccountReadiness: {
        isReady: Boolean(params.connectReadiness.isReady),
        connectedAccountId: readinessAccountId,
        onboardingStatus: clean(params.connectReadiness.onboardingStatus),
        chargesEnabled: Boolean(params.connectReadiness.chargesEnabled),
        payoutsEnabled: Boolean(params.connectReadiness.payoutsEnabled),
        detailsSubmitted: Boolean(params.connectReadiness.detailsSubmitted),
        disabledReason: clean(params.connectReadiness.disabledReason) || null,
        lastSyncedAt: clean(params.connectReadiness.lastSyncedAt) || null,
        mismatchWithProfile,
        mismatchWithMethod,
        mismatchWithConsent,
      },
      paymentProfileReadiness: {
        profileFound: Boolean(profileId),
        profileId,
        profileStatus: profileStatus || null,
        isCurrent: profileIsCurrent,
        stripeConnectedAccountId: profileConnectedAccountId,
        stripeCustomerId: clean(params.profile?.stripe_customer_id) || null,
      },
      savedPaymentMethodReadiness: {
        methodFound: Boolean(methodId),
        methodId,
        methodStatus: methodStatus || null,
        methodType: clean(params.method?.payment_method_type) || null,
        tenantStripeCustomerId: clean(params.method?.tenant_stripe_customer_id) || null,
        stripeConnectedAccountId: methodConnectedAccountId,
        detachedAt: clean(params.method?.detached_at) || null,
        invalidatedAt: clean(params.method?.invalidated_at) || null,
      },
      consentReadiness: {
        consentFound: Boolean(consentId),
        consentId,
        consentStatus: consentStatus || null,
        isEnabled: consentStatus === "enabled",
        isPausedOrRevoked: consentStatus === "paused" || consentStatus === "revoked",
        maintenanceAgreementId: clean(params.consent?.maintenance_agreement_id) || null,
        tenantStripeCustomerId: clean(params.consent?.tenant_stripe_customer_id) || null,
        tenantCustomerPaymentMethodId: clean(params.consent?.tenant_customer_payment_method_id) || null,
        stripeConnectedAccountId: consentConnectedAccountId,
        maxAmountCents: consentMaxAmountCents > 0 ? consentMaxAmountCents : null,
      },
      billingContext: {
        billingPeriodId: clean(params.billingPeriod?.id) || null,
        billingPeriodStatus: billingPeriodStatus || null,
        maintenanceAgreementId: clean(params.billingPeriod?.maintenance_agreement_id) || null,
        maintenanceAgreementStatus: maintenanceAgreementStatus || null,
        maintenanceAgreementCustomerId: clean(params.maintenanceAgreement?.customer_id) || null,
      },
      inFlightAttempt: {
        exists: Boolean(clean(params.inFlightAttempt?.id)),
        attemptId: clean(params.inFlightAttempt?.id) || null,
        attemptKind: clean(params.inFlightAttempt?.attempt_kind) || null,
        attemptStatus: clean(params.inFlightAttempt?.attempt_status) || null,
        stripeIdempotencyKey: clean(params.inFlightAttempt?.stripe_idempotency_key) || null,
      },
    },
  };
}

export async function runScheduledAutopayEligibilityDryRun(params: {
  accountOwnerUserId: string;
  supabase?: SupabaseLike;
  dependencies?: ScheduledAutopayEligibilityDependencies;
  evaluatedAt?: string;
}): Promise<ScheduledAutopayDryRunResult> {
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  const evaluatedAt = clean(params.evaluatedAt) || new Date().toISOString();
  const dependencies = params.dependencies ?? buildDefaultDependencies({ supabase: params.supabase as SupabaseLike });

  if (!accountOwnerUserId) {
    return {
      accountOwnerUserId,
      evaluatedAt,
      dryRun: {
        mode: "dry_run",
        marker: "scheduled_autopay_eligibility_dry_run",
        noWrites: true,
        noStripeCalls: true,
        mutationInstructions: [],
      },
      invoicesEvaluatedCount: 0,
      eligibleInvoicesCount: 0,
      blockedInvoicesCount: 0,
      blockedReasonCounts: emptyReasonCountMap(),
      invoicesEvaluated: [],
      eligibleInvoices: [],
      blockedInvoices: [],
    };
  }

  const [connectReadiness, invoiceRows] = await Promise.all([
    dependencies.resolveConnectReadiness(accountOwnerUserId),
    dependencies.listCandidateInvoices(accountOwnerUserId),
  ]);

  const invoicesEvaluated = await Promise.all(
    invoiceRows.map(async (invoiceRow) => {
      const invoiceId = clean(invoiceRow.id);
      const customerId = clean(invoiceRow.customer_id);

      const [summary, billingPeriod, inFlightAttempt, profile, method] = await Promise.all([
        dependencies.resolveInvoiceSummary(accountOwnerUserId, invoiceId),
        dependencies.resolveBillingPeriodContext(accountOwnerUserId, invoiceId),
        dependencies.resolveInFlightAttempt(accountOwnerUserId, invoiceId),
        customerId
          ? dependencies.resolveStripeCustomerProfile(accountOwnerUserId, customerId)
          : Promise.resolve(null),
        customerId
          ? dependencies.resolveSavedPaymentMethod(accountOwnerUserId, customerId)
          : Promise.resolve(null),
      ]);

      const maintenanceAgreementId = clean(billingPeriod?.maintenance_agreement_id) || null;

      const [maintenanceAgreement, consent] = await Promise.all([
        maintenanceAgreementId
          ? dependencies.resolveMaintenanceAgreementContext(accountOwnerUserId, maintenanceAgreementId)
          : Promise.resolve(null),
        customerId
          ? dependencies.resolveAutopayConsent(accountOwnerUserId, customerId, maintenanceAgreementId)
          : Promise.resolve(null),
      ]);

      return evaluateInvoiceEligibility({
        invoice: invoiceRow,
        summary,
        connectReadiness,
        profile,
        method,
        consent,
        billingPeriod,
        maintenanceAgreement,
        inFlightAttempt,
      });
    }),
  );

  const eligibleInvoices = invoicesEvaluated.filter((row) => row.eligibility === "eligible");
  const blockedInvoices = invoicesEvaluated.filter((row) => row.eligibility === "blocked");

  const blockedReasonCounts = emptyReasonCountMap();
  for (const blockedInvoice of blockedInvoices) {
    for (const reason of blockedInvoice.blockedReasonCodes) {
      blockedReasonCounts[reason] += 1;
    }
  }

  return {
    accountOwnerUserId,
    evaluatedAt,
    dryRun: {
      mode: "dry_run",
      marker: "scheduled_autopay_eligibility_dry_run",
      noWrites: true,
      noStripeCalls: true,
      mutationInstructions: [],
    },
    invoicesEvaluatedCount: invoicesEvaluated.length,
    eligibleInvoicesCount: eligibleInvoices.length,
    blockedInvoicesCount: blockedInvoices.length,
    blockedReasonCounts,
    invoicesEvaluated,
    eligibleInvoices,
    blockedInvoices,
  };
}
