function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value: unknown) {
  const normalized = Number(value ?? 0);
  return Number.isFinite(normalized) ? normalized : 0;
}

function toNullableNumber(value: unknown) {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized)) return null;
  return normalized;
}

function pickLastAttemptTimestamp(row: FailedAutopayAttemptRow) {
  return clean(row.resolved_at) || clean(row.submitted_at) || clean(row.created_at) || "";
}

function includesAuthenticationSignal(value: unknown) {
  const normalized = clean(value).toLowerCase();
  if (!normalized) return false;
  return normalized.includes("authentication") || normalized.includes("requires_action");
}

const OPEN_ATTEMPT_STATUSES = [
  "failed_declined",
  "failed_requires_action",
  "blocked_precondition",
] as const;

const MEANINGFUL_BLOCKED_REASON_CODES = new Set([
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
  "unsupported_invoice_context",
  "missing_attempt_snapshot",
  "attempt_status_not_pending",
  "invoice_not_issued",
  "invoice_void",
  "invoice_no_balance_due",
]);

type AttentionCategory =
  | "payment_declined"
  | "authentication_required"
  | "precondition_blocked"
  | "unknown_failure";

type RecommendedOperatorAction =
  | "review_payment_method"
  | "request_customer_authentication"
  | "fix_payment_setup"
  | "retry_after_review"
  | "no_action_available";

type FailedAutopayAttemptStatus =
  | "failed_declined"
  | "failed_requires_action"
  | "blocked_precondition";

type FailedAutopayAttemptRow = {
  id: string;
  account_owner_user_id: string;
  customer_id: string | null;
  invoice_id: string | null;
  billing_period_id: string | null;
  maintenance_agreement_id: string | null;
  tenant_customer_payment_method_id: string | null;
  tenant_customer_autopay_consent_id: string | null;
  attempt_kind: string | null;
  attempt_status: string | null;
  blocked_reason_code: string | null;
  failure_code: string | null;
  failure_message: string | null;
  requires_action_type: string | null;
  retry_count: number | null;
  next_retry_at: string | null;
  amount_cents_snapshot: number | null;
  invoice_balance_due_cents_snapshot: number | null;
  invoice_status_snapshot: string | null;
  consent_status_snapshot: string | null;
  payment_method_status_snapshot: string | null;
  stripe_connected_account_id: string | null;
  created_at: string | null;
  submitted_at: string | null;
  resolved_at: string | null;
  resolved_internal_invoice_payment_id: string | null;
};

type InvoiceRow = {
  id: string;
  customer_id: string | null;
  invoice_number: string | null;
  status: string | null;
  total_cents: number | null;
};

type CustomerRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

type PaymentMethodRow = {
  id: string;
  payment_method_status: string | null;
  display_brand: string | null;
  display_last4: string | null;
  display_exp_month: number | null;
  display_exp_year: number | null;
};

type ConsentRow = {
  id: string;
  consent_status: string | null;
};

function buildCustomerDisplayName(customer: CustomerRow | null | undefined) {
  const fullName = clean(customer?.full_name);
  if (fullName) return fullName;

  const first = clean(customer?.first_name);
  const last = clean(customer?.last_name);
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined || null;
}

function isMeaningfulBlockedPrecondition(row: FailedAutopayAttemptRow) {
  if (clean(row.attempt_status).toLowerCase() !== "blocked_precondition") return false;
  const blockedReasonCode = clean(row.blocked_reason_code).toLowerCase();
  if (!blockedReasonCode) return false;
  return MEANINGFUL_BLOCKED_REASON_CODES.has(blockedReasonCode);
}

function isResolvedClosedAttempt(row: FailedAutopayAttemptRow) {
  const resolvedPaymentId = clean(row.resolved_internal_invoice_payment_id);
  if (resolvedPaymentId) return true;

  const status = clean(row.attempt_status).toLowerCase();
  if (status === "abandoned" || status === "succeeded") return true;

  return false;
}

function mapAttentionCategory(row: FailedAutopayAttemptRow): AttentionCategory {
  const status = clean(row.attempt_status).toLowerCase();

  if (
    status === "failed_requires_action"
    || includesAuthenticationSignal(row.requires_action_type)
    || includesAuthenticationSignal(row.failure_code)
    || includesAuthenticationSignal(row.failure_message)
  ) {
    return "authentication_required";
  }

  if (status === "failed_declined") {
    return "payment_declined";
  }

  if (status === "blocked_precondition") {
    return "precondition_blocked";
  }

  return "unknown_failure";
}

function mapRecommendedAction(category: AttentionCategory, row: FailedAutopayAttemptRow): RecommendedOperatorAction {
  if (category === "authentication_required") {
    return "request_customer_authentication";
  }

  if (category === "precondition_blocked") {
    return "fix_payment_setup";
  }

  if (category === "payment_declined") {
    if (toNumber(row.retry_count) > 0) {
      return "retry_after_review";
    }
    return "review_payment_method";
  }

  return "no_action_available";
}

export type FailedAutopayAttentionItem = {
  attemptId: string;
  attemptStatus: FailedAutopayAttemptStatus;
  attemptKind: "scheduled_autopay";
  failureCode: string | null;
  failureMessage: string | null;
  blockedReasonCode: string | null;
  requiresActionType: string | null;
  retryCount: number;
  nextRetryAt: string | null;
  createdAt: string | null;
  submittedAt: string | null;
  resolvedAt: string | null;
  lastAttemptAt: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  invoiceTotalCents: number | null;
  invoiceBalanceProjectionCents: number | null;
  customerId: string | null;
  customerName: string | null;
  maintenanceAgreementId: string | null;
  billingPeriodId: string | null;
  paymentMethod: {
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
    methodStatus: string | null;
  };
  consent: {
    consentId: string | null;
    consentStatus: string | null;
  };
  connectedAccountId: string | null;
  connectedAccountReadinessBlocker: string | null;
  attentionCategory: AttentionCategory;
  recommendedOperatorAction: RecommendedOperatorAction;
};

export type FailedAutopayAttentionReadModelResult = {
  items: FailedAutopayAttentionItem[];
  countsByStatus: Record<FailedAutopayAttemptStatus, number>;
  countsByCategory: Record<AttentionCategory, number>;
  generatedAt: string;
  noStripeCalls: true;
  noPaymentRowWrites: true;
  noAllocationRowWrites: true;
  noInvoiceMutations: true;
  noVisitOrNextDueMutations: true;
};

function normalizeLimit(limit: unknown) {
  const parsed = Math.floor(toNumber(limit));
  if (parsed <= 0) return 200;
  return Math.min(parsed, 500);
}

export async function loadFailedAutopayAttentionItems(params: {
  admin: any;
  accountOwnerUserId: string;
  customerId?: string | null;
  invoiceId?: string | null;
  limit?: number;
}): Promise<FailedAutopayAttentionReadModelResult> {
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  const customerId = clean(params.customerId);
  const invoiceId = clean(params.invoiceId);
  const limit = normalizeLimit(params.limit);

  const emptyResult: FailedAutopayAttentionReadModelResult = {
    items: [],
    countsByStatus: {
      failed_declined: 0,
      failed_requires_action: 0,
      blocked_precondition: 0,
    },
    countsByCategory: {
      payment_declined: 0,
      authentication_required: 0,
      precondition_blocked: 0,
      unknown_failure: 0,
    },
    generatedAt: nowIso(),
    noStripeCalls: true,
    noPaymentRowWrites: true,
    noAllocationRowWrites: true,
    noInvoiceMutations: true,
    noVisitOrNextDueMutations: true,
  };

  if (!accountOwnerUserId) {
    return emptyResult;
  }

  let attemptsQuery = params.admin
    .from("tenant_saved_method_payment_attempts")
    .select(
      [
        "id",
        "account_owner_user_id",
        "customer_id",
        "invoice_id",
        "billing_period_id",
        "maintenance_agreement_id",
        "tenant_customer_payment_method_id",
        "tenant_customer_autopay_consent_id",
        "attempt_kind",
        "attempt_status",
        "blocked_reason_code",
        "failure_code",
        "failure_message",
        "requires_action_type",
        "retry_count",
        "next_retry_at",
        "amount_cents_snapshot",
        "invoice_balance_due_cents_snapshot",
        "invoice_status_snapshot",
        "consent_status_snapshot",
        "payment_method_status_snapshot",
        "stripe_connected_account_id",
        "created_at",
        "submitted_at",
        "resolved_at",
        "resolved_internal_invoice_payment_id",
      ].join(", "),
    )
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("attempt_kind", "scheduled_autopay")
    .in("attempt_status", [...OPEN_ATTEMPT_STATUSES]);

  if (customerId) {
    attemptsQuery = attemptsQuery.eq("customer_id", customerId);
  }

  if (invoiceId) {
    attemptsQuery = attemptsQuery.eq("invoice_id", invoiceId);
  }

  const { data: attemptsRaw, error: attemptsError } = await attemptsQuery
    .order("created_at", { ascending: false })
    .limit(Math.max(500, limit * 2));

  if (attemptsError) {
    throw new Error(
      `Failed to load failed scheduled autopay attempts: ${attemptsError.message ?? "unknown error"}`,
    );
  }

  const attempts = (Array.isArray(attemptsRaw) ? attemptsRaw : []) as FailedAutopayAttemptRow[];

  const openAttentionAttempts = attempts.filter((row) => {
    const status = clean(row.attempt_status).toLowerCase();
    if (status === "blocked_precondition" && !isMeaningfulBlockedPrecondition(row)) {
      return false;
    }

    if (isResolvedClosedAttempt(row)) {
      return false;
    }

    return status === "failed_declined" || status === "failed_requires_action" || status === "blocked_precondition";
  });

  const invoiceIds = Array.from(new Set(openAttentionAttempts.map((row) => clean(row.invoice_id)).filter(Boolean)));
  const customerIds = Array.from(new Set(openAttentionAttempts.map((row) => clean(row.customer_id)).filter(Boolean)));
  const methodIds = Array.from(new Set(openAttentionAttempts.map((row) => clean(row.tenant_customer_payment_method_id)).filter(Boolean)));
  const consentIds = Array.from(new Set(openAttentionAttempts.map((row) => clean(row.tenant_customer_autopay_consent_id)).filter(Boolean)));

  const [invoiceResult, customerResult, methodResult, consentResult] = await Promise.all([
    invoiceIds.length
      ? params.admin
        .from("internal_invoices")
        .select("id, customer_id, invoice_number, status, total_cents")
        .eq("account_owner_user_id", accountOwnerUserId)
        .in("id", invoiceIds)
        .limit(invoiceIds.length)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? params.admin
        .from("customers")
        .select("id, full_name, first_name, last_name")
        .eq("owner_user_id", accountOwnerUserId)
        .in("id", customerIds)
        .limit(customerIds.length)
      : Promise.resolve({ data: [], error: null }),
    methodIds.length
      ? params.admin
        .from("tenant_customer_payment_methods")
        .select("id, payment_method_status, display_brand, display_last4, display_exp_month, display_exp_year")
        .eq("account_owner_user_id", accountOwnerUserId)
        .in("id", methodIds)
        .limit(methodIds.length)
      : Promise.resolve({ data: [], error: null }),
    consentIds.length
      ? params.admin
        .from("tenant_customer_autopay_consents")
        .select("id, consent_status")
        .eq("account_owner_user_id", accountOwnerUserId)
        .in("id", consentIds)
        .limit(consentIds.length)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (invoiceResult.error) {
    throw new Error(
      `Failed to load invoice context for failed autopay attention items: ${invoiceResult.error.message ?? "unknown error"}`,
    );
  }

  if (customerResult.error) {
    throw new Error(
      `Failed to load customer context for failed autopay attention items: ${customerResult.error.message ?? "unknown error"}`,
    );
  }

  if (methodResult.error) {
    throw new Error(
      `Failed to load payment-method context for failed autopay attention items: ${methodResult.error.message ?? "unknown error"}`,
    );
  }

  if (consentResult.error) {
    throw new Error(
      `Failed to load consent context for failed autopay attention items: ${consentResult.error.message ?? "unknown error"}`,
    );
  }

  const invoicesById = new Map(
    ((Array.isArray(invoiceResult.data) ? invoiceResult.data : []) as InvoiceRow[])
      .map((row) => [clean(row.id), row]),
  );
  const customersById = new Map(
    ((Array.isArray(customerResult.data) ? customerResult.data : []) as CustomerRow[])
      .map((row) => [clean(row.id), row]),
  );
  const methodsById = new Map(
    ((Array.isArray(methodResult.data) ? methodResult.data : []) as PaymentMethodRow[])
      .map((row) => [clean(row.id), row]),
  );
  const consentsById = new Map(
    ((Array.isArray(consentResult.data) ? consentResult.data : []) as ConsentRow[])
      .map((row) => [clean(row.id), row]),
  );

  const items = openAttentionAttempts
    .map((attempt) => {
      const status = clean(attempt.attempt_status).toLowerCase() as FailedAutopayAttemptStatus;
      const invoice = invoicesById.get(clean(attempt.invoice_id));
      const customer = customersById.get(clean(attempt.customer_id));
      const paymentMethod = methodsById.get(clean(attempt.tenant_customer_payment_method_id));
      const consent = consentsById.get(clean(attempt.tenant_customer_autopay_consent_id));
      const attentionCategory = mapAttentionCategory(attempt);
      const recommendedOperatorAction = mapRecommendedAction(attentionCategory, attempt);
      const blockedReasonCode = clean(attempt.blocked_reason_code) || null;
      const connectedAccountReadinessBlocker = blockedReasonCode?.startsWith("connected_account_")
        ? blockedReasonCode
        : null;
      const lastAttemptAt = pickLastAttemptTimestamp(attempt) || null;

      return {
        attemptId: clean(attempt.id),
        attemptStatus: status,
        attemptKind: "scheduled_autopay" as const,
        failureCode: clean(attempt.failure_code) || null,
        failureMessage: clean(attempt.failure_message) || null,
        blockedReasonCode,
        requiresActionType: clean(attempt.requires_action_type) || null,
        retryCount: Math.max(0, Math.floor(toNumber(attempt.retry_count))),
        nextRetryAt: clean(attempt.next_retry_at) || null,
        createdAt: clean(attempt.created_at) || null,
        submittedAt: clean(attempt.submitted_at) || null,
        resolvedAt: clean(attempt.resolved_at) || null,
        lastAttemptAt,
        invoiceId: clean(attempt.invoice_id) || null,
        invoiceNumber: clean(invoice?.invoice_number) || null,
        invoiceStatus: clean(invoice?.status) || clean(attempt.invoice_status_snapshot) || null,
        invoiceTotalCents: toNullableNumber(invoice?.total_cents),
        invoiceBalanceProjectionCents: toNullableNumber(attempt.invoice_balance_due_cents_snapshot),
        customerId: clean(attempt.customer_id) || null,
        customerName: buildCustomerDisplayName(customer),
        maintenanceAgreementId: clean(attempt.maintenance_agreement_id) || null,
        billingPeriodId: clean(attempt.billing_period_id) || null,
        paymentMethod: {
          brand: clean(paymentMethod?.display_brand) || null,
          last4: clean(paymentMethod?.display_last4) || null,
          expMonth: toNullableNumber(paymentMethod?.display_exp_month),
          expYear: toNullableNumber(paymentMethod?.display_exp_year),
          methodStatus: clean(paymentMethod?.payment_method_status) || clean(attempt.payment_method_status_snapshot) || null,
        },
        consent: {
          consentId: clean(attempt.tenant_customer_autopay_consent_id) || null,
          consentStatus: clean(consent?.consent_status) || clean(attempt.consent_status_snapshot) || null,
        },
        connectedAccountId: clean(attempt.stripe_connected_account_id) || null,
        connectedAccountReadinessBlocker,
        attentionCategory,
        recommendedOperatorAction,
      };
    })
    .sort((a, b) => {
      const aMs = Date.parse(a.lastAttemptAt ?? "") || 0;
      const bMs = Date.parse(b.lastAttemptAt ?? "") || 0;
      return bMs - aMs;
    })
    .slice(0, limit);

  const countsByStatus: FailedAutopayAttentionReadModelResult["countsByStatus"] = {
    failed_declined: 0,
    failed_requires_action: 0,
    blocked_precondition: 0,
  };

  const countsByCategory: FailedAutopayAttentionReadModelResult["countsByCategory"] = {
    payment_declined: 0,
    authentication_required: 0,
    precondition_blocked: 0,
    unknown_failure: 0,
  };

  for (const item of items) {
    countsByStatus[item.attemptStatus] += 1;
    countsByCategory[item.attentionCategory] += 1;
  }

  return {
    items,
    countsByStatus,
    countsByCategory,
    generatedAt: nowIso(),
    noStripeCalls: true,
    noPaymentRowWrites: true,
    noAllocationRowWrites: true,
    noInvoiceMutations: true,
    noVisitOrNextDueMutations: true,
  };
}
