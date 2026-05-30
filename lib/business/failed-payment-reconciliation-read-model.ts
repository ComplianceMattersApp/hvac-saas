import {
  deriveCompatibilityInvoiceAllocations,
  sumActiveInvoiceAllocationCents,
  sumActivePersistedInvoiceAllocationCents,
  type InvoicePaymentAllocationRow,
} from "@/lib/business/payment-allocations";

type ReconciliationAttemptStatus =
  | "failed_declined"
  | "failed_requires_action"
  | "blocked_precondition";

type FailureCategory =
  | "payment_declined"
  | "authentication_required"
  | "precondition_blocked"
  | "unknown_failure";

type RecommendedAction =
  | "review_payment_method"
  | "request_customer_authentication"
  | "fix_payment_setup"
  | "retry_after_review"
  | "no_action_available";

type AlertSeverity = "high" | "medium" | "low";

type AttemptRow = {
  id: string;
  account_owner_user_id: string;
  customer_id: string | null;
  invoice_id: string | null;
  attempt_kind: string | null;
  attempt_status: string | null;
  blocked_reason_code: string | null;
  failure_code: string | null;
  failure_message: string | null;
  requires_action_type: string | null;
  retry_count: number | null;
  tenant_customer_payment_method_id: string | null;
  created_at: string | null;
  submitted_at: string | null;
  resolved_at: string | null;
  resolved_internal_invoice_payment_id: string | null;
};

type InvoiceRow = {
  id: string;
  account_owner_user_id: string;
  customer_id: string | null;
  job_id: string | null;
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

type MethodRow = {
  id: string;
  payment_method_status: string | null;
  display_brand: string | null;
  display_last4: string | null;
  display_exp_month: number | null;
  display_exp_year: number | null;
};

type PaymentRow = {
  id: string;
  invoice_id: string;
  account_owner_user_id: string;
  amount_cents: number;
  payment_status: "recorded" | "pending" | "failed" | "reversed" | string;
};

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

function pickLastAttemptAt(row: AttemptRow) {
  return clean(row.resolved_at) || clean(row.submitted_at) || clean(row.created_at) || "";
}

function includesAuthenticationSignal(value: unknown) {
  const normalized = clean(value).toLowerCase();
  if (!normalized) return false;
  return normalized.includes("authentication") || normalized.includes("requires_action");
}

function isMeaningfulBlockedPrecondition(row: AttemptRow) {
  if (clean(row.attempt_status).toLowerCase() !== "blocked_precondition") return false;
  const blockedReasonCode = clean(row.blocked_reason_code).toLowerCase();
  if (!blockedReasonCode) return false;
  return MEANINGFUL_BLOCKED_REASON_CODES.has(blockedReasonCode);
}

function isClosedAttempt(row: AttemptRow) {
  if (clean(row.resolved_internal_invoice_payment_id)) return true;

  const status = clean(row.attempt_status).toLowerCase();
  return status === "succeeded" || status === "abandoned";
}

function mapFailureCategory(row: AttemptRow): FailureCategory {
  const status = clean(row.attempt_status).toLowerCase();

  if (
    status === "failed_requires_action"
    || includesAuthenticationSignal(row.requires_action_type)
    || includesAuthenticationSignal(row.failure_code)
    || includesAuthenticationSignal(row.failure_message)
  ) {
    return "authentication_required";
  }

  if (status === "failed_declined") return "payment_declined";
  if (status === "blocked_precondition") return "precondition_blocked";
  return "unknown_failure";
}

function mapRecommendedAction(category: FailureCategory, row: AttemptRow): RecommendedAction {
  if (category === "authentication_required") return "request_customer_authentication";
  if (category === "precondition_blocked") return "fix_payment_setup";

  if (category === "payment_declined") {
    if (toNumber(row.retry_count) > 0) return "retry_after_review";
    return "review_payment_method";
  }

  return "no_action_available";
}

function mapAlertSeverity(category: FailureCategory): AlertSeverity {
  if (category === "authentication_required") return "high";
  if (category === "payment_declined") return "medium";
  if (category === "precondition_blocked") return "medium";
  return "low";
}

function normalizeLimit(limit: unknown) {
  const parsed = Math.floor(toNumber(limit));
  if (parsed <= 0) return 250;
  return Math.min(parsed, 500);
}

function buildCustomerDisplayName(customer: CustomerRow | null | undefined) {
  const fullName = clean(customer?.full_name);
  if (fullName) return fullName;

  const first = clean(customer?.first_name);
  const last = clean(customer?.last_name);
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined || null;
}

export type FailedPaymentReconciliationItem = {
  accountOwnerUserId: string;
  customerId: string | null;
  customerDisplayName: string | null;
  invoiceId: string;
  invoiceNumber: string | null;
  jobId: string | null;
  balanceDueCents: number;
  totalCents: number;
  attemptId: string;
  attemptStatus: ReconciliationAttemptStatus;
  attemptKind: "scheduled_autopay";
  failureCategory: FailureCategory;
  failureCode: string | null;
  failureMessage: string | null;
  lastAttemptAt: string | null;
  retryCount: number;
  retryEligible: boolean;
  recommendedAction: RecommendedAction;
  alertCategory: FailureCategory;
  alertSeverity: AlertSeverity;
  linkTarget: {
    invoiceWorkspaceHref: string;
    customerHref: string | null;
    jobHref: string | null;
  };
  paymentMethod: {
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
    methodStatus: string | null;
  };
};

export type FailedPaymentReconciliationSummary = {
  openCount: number;
  declinedCount: number;
  requiresActionCount: number;
  blockedPreconditionCount: number;
  retryEligibleCount: number;
  totalBalanceDueCents: number;
  oldestOpenedAt: string | null;
  newestOpenedAt: string | null;
};

export type FailedPaymentReconciliationReadModelResult = {
  items: FailedPaymentReconciliationItem[];
  summary: FailedPaymentReconciliationSummary;
  generatedAt: string;
  noStripeCalls: true;
  noPaymentRowWrites: true;
  noAllocationRowWrites: true;
  noInvoiceMutations: true;
  noVisitOrNextDueMutations: true;
};

export async function loadFailedPaymentReconciliationItems(params: {
  admin: any;
  accountOwnerUserId: string;
  limit?: number;
}): Promise<FailedPaymentReconciliationReadModelResult> {
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  const limit = normalizeLimit(params.limit);

  const emptyResult: FailedPaymentReconciliationReadModelResult = {
    items: [],
    summary: {
      openCount: 0,
      declinedCount: 0,
      requiresActionCount: 0,
      blockedPreconditionCount: 0,
      retryEligibleCount: 0,
      totalBalanceDueCents: 0,
      oldestOpenedAt: null,
      newestOpenedAt: null,
    },
    generatedAt: nowIso(),
    noStripeCalls: true,
    noPaymentRowWrites: true,
    noAllocationRowWrites: true,
    noInvoiceMutations: true,
    noVisitOrNextDueMutations: true,
  };

  if (!accountOwnerUserId) return emptyResult;

  const { data: attemptsRaw, error: attemptsError } = await params.admin
    .from("tenant_saved_method_payment_attempts")
    .select(
      [
        "id",
        "account_owner_user_id",
        "customer_id",
        "invoice_id",
        "attempt_kind",
        "attempt_status",
        "blocked_reason_code",
        "failure_code",
        "failure_message",
        "requires_action_type",
        "retry_count",
        "tenant_customer_payment_method_id",
        "created_at",
        "submitted_at",
        "resolved_at",
        "resolved_internal_invoice_payment_id",
      ].join(", "),
    )
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("attempt_kind", "scheduled_autopay")
    .in("attempt_status", [...OPEN_ATTEMPT_STATUSES])
    .order("created_at", { ascending: false })
    .limit(Math.max(limit * 3, 500));

  if (attemptsError) {
    throw new Error(
      `Failed to load failed payment reconciliation attempts: ${attemptsError.message ?? "unknown error"}`,
    );
  }

  const attempts = (Array.isArray(attemptsRaw) ? attemptsRaw : []) as AttemptRow[];

  const openAttempts = attempts.filter((row) => {
    const status = clean(row.attempt_status).toLowerCase();
    if (status === "blocked_precondition" && !isMeaningfulBlockedPrecondition(row)) return false;
    if (isClosedAttempt(row)) return false;
    return status === "failed_declined" || status === "failed_requires_action" || status === "blocked_precondition";
  });

  if (!openAttempts.length) return emptyResult;

  const invoiceIds = Array.from(new Set(openAttempts.map((row) => clean(row.invoice_id)).filter(Boolean)));
  const customerIds = Array.from(new Set(openAttempts.map((row) => clean(row.customer_id)).filter(Boolean)));
  const methodIds = Array.from(new Set(openAttempts.map((row) => clean(row.tenant_customer_payment_method_id)).filter(Boolean)));

  const [invoiceResult, customerResult, methodResult, paymentResult, allocationResult] = await Promise.all([
    invoiceIds.length
      ? params.admin
        .from("internal_invoices")
        .select("id, account_owner_user_id, customer_id, job_id, invoice_number, status, total_cents")
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
    invoiceIds.length
      ? params.admin
        .from("internal_invoice_payments")
        .select("id, account_owner_user_id, invoice_id, amount_cents, payment_status")
        .eq("account_owner_user_id", accountOwnerUserId)
        .in("invoice_id", invoiceIds)
        .limit(2500)
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length
      ? params.admin
        .from("internal_invoice_payment_allocations")
        .select("id, account_owner_user_id, source_internal_invoice_payment_id, target_invoice_id, allocated_amount_cents, allocation_status")
        .eq("account_owner_user_id", accountOwnerUserId)
        .in("target_invoice_id", invoiceIds)
        .limit(2500)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (invoiceResult.error) {
    throw new Error(`Failed to load reconciliation invoice context: ${invoiceResult.error.message ?? "unknown error"}`);
  }
  if (customerResult.error) {
    throw new Error(`Failed to load reconciliation customer context: ${customerResult.error.message ?? "unknown error"}`);
  }
  if (methodResult.error) {
    throw new Error(`Failed to load reconciliation payment-method context: ${methodResult.error.message ?? "unknown error"}`);
  }
  if (paymentResult.error) {
    throw new Error(`Failed to load reconciliation payment rows: ${paymentResult.error.message ?? "unknown error"}`);
  }
  if (allocationResult.error) {
    throw new Error(`Failed to load reconciliation allocation rows: ${allocationResult.error.message ?? "unknown error"}`);
  }

  const invoices = (Array.isArray(invoiceResult.data) ? invoiceResult.data : []) as InvoiceRow[];
  const customers = (Array.isArray(customerResult.data) ? customerResult.data : []) as CustomerRow[];
  const methods = (Array.isArray(methodResult.data) ? methodResult.data : []) as MethodRow[];
  const paymentRows = (Array.isArray(paymentResult.data) ? paymentResult.data : []) as PaymentRow[];
  const allocationRows = (Array.isArray(allocationResult.data) ? allocationResult.data : []) as InvoicePaymentAllocationRow[];

  const invoicesById = new Map(invoices.map((row) => [clean(row.id), row]));
  const customersById = new Map(customers.map((row) => [clean(row.id), row]));
  const methodsById = new Map(methods.map((row) => [clean(row.id), row]));

  const compatibilityAllocations = deriveCompatibilityInvoiceAllocations(paymentRows as any[]);

  const invoiceHasPersistedAllocation = new Set<string>();
  for (const row of allocationRows) {
    const invoiceId = clean(row.target_invoice_id);
    if (invoiceId) invoiceHasPersistedAllocation.add(invoiceId);
  }

  const paidByInvoice = new Map<string, number>();
  for (const invoiceId of invoiceIds) {
    const persistedPaid = sumActivePersistedInvoiceAllocationCents(allocationRows, invoiceId);
    const compatibilityPaid = sumActiveInvoiceAllocationCents(compatibilityAllocations, invoiceId);
    paidByInvoice.set(
      invoiceId,
      invoiceHasPersistedAllocation.has(invoiceId) ? persistedPaid : compatibilityPaid,
    );
  }

  const items = openAttempts
    .map((attempt) => {
      const attemptStatus = clean(attempt.attempt_status).toLowerCase() as ReconciliationAttemptStatus;
      const attemptId = clean(attempt.id);
      const invoiceId = clean(attempt.invoice_id);
      const invoice = invoicesById.get(invoiceId);
      if (!attemptId || !invoiceId || !invoice) return null;

      const invoiceStatus = clean(invoice.status).toLowerCase();
      if (invoiceStatus !== "issued") return null;

      const totalCents = Math.max(0, toNumber(invoice.total_cents));
      const amountPaidCents = Math.max(0, toNumber(paidByInvoice.get(invoiceId)));
      const balanceDueCents = Math.max(0, totalCents - amountPaidCents);
      if (balanceDueCents <= 0) return null;

      const failureCategory = mapFailureCategory(attempt);
      const recommendedAction = mapRecommendedAction(failureCategory, attempt);
      const retryCount = Math.max(0, Math.floor(toNumber(attempt.retry_count)));
      const retryEligible = attemptStatus === "failed_declined";
      const customer = customersById.get(clean(attempt.customer_id));
      const method = methodsById.get(clean(attempt.tenant_customer_payment_method_id));
      const lastAttemptAt = pickLastAttemptAt(attempt) || null;
      const jobId = clean(invoice.job_id) || null;
      const customerId = clean(attempt.customer_id) || null;

      return {
        accountOwnerUserId,
        customerId,
        customerDisplayName: buildCustomerDisplayName(customer),
        invoiceId,
        invoiceNumber: clean(invoice.invoice_number) || null,
        jobId,
        balanceDueCents,
        totalCents,
        attemptId,
        attemptStatus,
        attemptKind: "scheduled_autopay" as const,
        failureCategory,
        failureCode: clean(attempt.failure_code) || null,
        failureMessage: clean(attempt.failure_message) || null,
        lastAttemptAt,
        retryCount,
        retryEligible,
        recommendedAction,
        alertCategory: failureCategory,
        alertSeverity: mapAlertSeverity(failureCategory),
        linkTarget: {
          invoiceWorkspaceHref: `/jobs/${jobId ?? ""}/invoice`,
          customerHref: customerId ? `/customers/${customerId}` : null,
          jobHref: jobId ? `/jobs/${jobId}` : null,
        },
        paymentMethod: {
          brand: clean(method?.display_brand) || null,
          last4: clean(method?.display_last4) || null,
          expMonth: toNullableNumber(method?.display_exp_month),
          expYear: toNullableNumber(method?.display_exp_year),
          methodStatus: clean(method?.payment_method_status) || null,
        },
      };
    })
    .filter((item): item is FailedPaymentReconciliationItem => item !== null)
    .sort((a, b) => (Date.parse(b.lastAttemptAt ?? "") || 0) - (Date.parse(a.lastAttemptAt ?? "") || 0))
    .slice(0, limit);

  const summary: FailedPaymentReconciliationSummary = {
    openCount: items.length,
    declinedCount: items.filter((item) => item.attemptStatus === "failed_declined").length,
    requiresActionCount: items.filter((item) => item.attemptStatus === "failed_requires_action").length,
    blockedPreconditionCount: items.filter((item) => item.attemptStatus === "blocked_precondition").length,
    retryEligibleCount: items.filter((item) => item.retryEligible).length,
    totalBalanceDueCents: items.reduce((sum, item) => sum + item.balanceDueCents, 0),
    oldestOpenedAt: null,
    newestOpenedAt: null,
  };

  const lastAttemptDates = items
    .map((item) => Date.parse(item.lastAttemptAt ?? ""))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (lastAttemptDates.length > 0) {
    const oldest = Math.min(...lastAttemptDates);
    const newest = Math.max(...lastAttemptDates);
    summary.oldestOpenedAt = new Date(oldest).toISOString();
    summary.newestOpenedAt = new Date(newest).toISOString();
  }

  return {
    items,
    summary,
    generatedAt: nowIso(),
    noStripeCalls: true,
    noPaymentRowWrites: true,
    noAllocationRowWrites: true,
    noInvoiceMutations: true,
    noVisitOrNextDueMutations: true,
  };
}
