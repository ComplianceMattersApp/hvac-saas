import type Stripe from "stripe";
import { createHmac, timingSafeEqual } from "crypto";
import {
  getStripeServerClient,
  resolvePlatformBillingAppUrl,
} from "@/lib/business/platform-billing-stripe";
import { resolveTenantStripeConnectReadiness } from "@/lib/business/tenant-stripe-connect-readiness";
import {
  deriveCompatibilityInvoiceAllocations,
  sumActiveInvoiceAllocationCents,
} from "@/lib/business/payment-allocations";
import {
  calculatePlatformApplicationFeeAmountCents,
  derivePlatformApplicationFeeConfig,
} from "@/lib/business/platform-application-fees";
import { normalizeJobBillingDisposition } from "@/lib/business/job-billing-state";

export const INTERNAL_INVOICE_PAYMENT_STATUSES = [
  "recorded",
  "pending",
  "failed",
  "reversed",
] as const;

export const INTERNAL_INVOICE_PAYMENT_METHODS = [
  "cash",
  "check",
  "ach_off_platform",
  "card_off_platform",
  "bank_transfer",
  "other",
  "card_stripe_online",
] as const;

export type InternalInvoicePaymentStatus =
  (typeof INTERNAL_INVOICE_PAYMENT_STATUSES)[number];

export type InternalInvoicePaymentMethod =
  (typeof INTERNAL_INVOICE_PAYMENT_METHODS)[number];

export type InternalInvoicePaymentRow = {
  id: string;
  account_owner_user_id: string;
  invoice_id: string;
  job_id: string;
  payment_status: InternalInvoicePaymentStatus;
  payment_method: InternalInvoicePaymentMethod;
  amount_cents: number;
  paid_at: string;
  received_reference: string | null;
  notes: string | null;
  recorded_by_user_id: string;
  created_at: string;
  updated_at: string;
  reversed_at?: string | null;
  reversed_by_user_id?: string | null;
  reversal_reason?: string | null;
  processor_name?: string | null;
  stripe_checkout_session_id?: string | null;
  stripe_event_id?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_charged_at?: string | null;
  qbo_sync_status?: "not_synced" | "pending" | "synced" | "failed" | null;
  qbo_payment_id?: string | null;
  qbo_last_synced_at?: string | null;
  qbo_sync_error?: string | null;
};

export type InternalInvoiceCollectedPaymentSummary = {
  invoiceId: string;
  invoiceTotalCents: number;
  amountPaidCents: number;
  balanceDueCents: number;
  paymentStatus: "unpaid" | "partial" | "paid";
};

export type TenantInvoiceCheckoutSessionResult = {
  checkoutSessionId: string;
  checkoutSessionUrl: string;
  connectedAccountId: string;
  balanceDueCents: number;
};

export type TenantInvoicePaymentLinkResult = {
  paymentLinkUrl: string;
  paymentLinkToken: string;
  connectedAccountId: string;
  balanceDueCents: number;
};

export type TenantInvoicePaymentLinkPayload = {
  v: 1;
  accountOwnerUserId: string;
  jobId: string;
  invoiceId: string;
  balanceDueCents: number;
  createdAt: string;
};

export type TenantInvoiceCheckoutSessionExpirationResult = {
  attempted: number;
  expired: number;
  skipped: number;
};

function buildPublicTenantInvoiceCheckoutReturnPath(params: {
  status: "success" | "cancelled";
  jobId: string;
  invoiceId: string;
}) {
  const search = new URLSearchParams({
    status: params.status,
    job_id: params.jobId,
    invoice_id: params.invoiceId,
  });
  return `/payments/checkout-complete?${search.toString()}`;
}

function buildPublicTenantInvoicePaymentPath(token: string) {
  return `/payments/invoice/${encodeURIComponent(token)}`;
}

function resolvePaymentLinkSigningSecret(explicitSecret?: string | null) {
  const secret = String(
    explicitSecret ??
      process.env.TENANT_INVOICE_PAYMENT_LINK_SECRET ??
      process.env.AUTH_SECRET ??
      process.env.NEXTAUTH_SECRET ??
      process.env.STRIPE_WEBHOOK_SECRET ??
      "",
  ).trim();

  if (!secret) {
    throw new Error("Payment link signing secret is not configured.");
  }

  return secret;
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signTokenBody(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function signTenantInvoicePaymentLinkPayload(
  payload: TenantInvoicePaymentLinkPayload,
  signingSecret?: string | null,
) {
  const body = encodeBase64Url(JSON.stringify(payload));
  const signature = signTokenBody(body, resolvePaymentLinkSigningSecret(signingSecret));
  return `${body}.${signature}`;
}

export function verifyTenantInvoicePaymentLinkToken(
  token: string,
  signingSecret?: string | null,
): TenantInvoicePaymentLinkPayload | null {
  const [body, signature, extra] = String(token ?? "").trim().split(".");
  if (!body || !signature || extra !== undefined) return null;

  const expectedSignature = signTokenBody(body, resolvePaymentLinkSigningSecret(signingSecret));
  const expected = Buffer.from(expectedSignature);
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const parsed = JSON.parse(decodeBase64Url(body)) as Partial<TenantInvoicePaymentLinkPayload>;
    const accountOwnerUserId = String(parsed.accountOwnerUserId ?? "").trim();
    const jobId = String(parsed.jobId ?? "").trim();
    const invoiceId = String(parsed.invoiceId ?? "").trim();
    const balanceDueCents = Number(parsed.balanceDueCents ?? 0);
    const createdAt = String(parsed.createdAt ?? "").trim();

    if (
      parsed.v !== 1 ||
      !accountOwnerUserId ||
      !jobId ||
      !invoiceId ||
      !Number.isFinite(balanceDueCents) ||
      balanceDueCents <= 0 ||
      !createdAt
    ) {
      return null;
    }

    return {
      v: 1,
      accountOwnerUserId,
      jobId,
      invoiceId,
      balanceDueCents: Math.round(balanceDueCents),
      createdAt,
    };
  } catch {
    return null;
  }
}

export async function resolveJobBlocksOnlineInvoicePayment(params: {
  accountOwnerUserId: string;
  jobId: string;
  supabase: any;
}): Promise<boolean> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  const jobId = String(params.jobId ?? "").trim();
  if (!accountOwnerUserId || !jobId) return false;

  const { data, error } = await params.supabase
    .from("jobs")
    .select("id, invoice_complete, billing_disposition")
    .eq("id", jobId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (error || !data?.id) return false;

  return Boolean(data.invoice_complete) || Boolean(normalizeJobBillingDisposition(data.billing_disposition));
}

const INTERNAL_INVOICE_PAYMENT_SELECT = [
  "id",
  "account_owner_user_id",
  "invoice_id",
  "job_id",
  "payment_status",
  "payment_method",
  "amount_cents",
  "paid_at",
  "received_reference",
  "notes",
  "recorded_by_user_id",
  "created_at",
  "updated_at",
  "reversed_at",
  "reversed_by_user_id",
  "reversal_reason",
  "processor_name",
  "stripe_checkout_session_id",
  "stripe_event_id",
  "stripe_payment_intent_id",
  "stripe_charged_at",
  "qbo_sync_status",
  "qbo_payment_id",
  "qbo_last_synced_at",
  "qbo_sync_error",
].join(", ");

function normalizePaymentStatus(value: unknown): InternalInvoicePaymentStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "pending") return "pending";
  if (normalized === "failed") return "failed";
  if (normalized === "reversed") return "reversed";
  return "recorded";
}

function normalizePaymentMethod(value: unknown): InternalInvoicePaymentMethod {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "check") return "check";
  if (normalized === "ach_off_platform") return "ach_off_platform";
  if (normalized === "card_off_platform") return "card_off_platform";
  if (normalized === "bank_transfer") return "bank_transfer";
  if (normalized === "other") return "other";
  if (normalized === "card_stripe_online") return "card_stripe_online";
  return "cash";
}

function normalizePaymentRow(row: any): InternalInvoicePaymentRow {
  return {
    id: String(row?.id ?? "").trim(),
    account_owner_user_id: String(row?.account_owner_user_id ?? "").trim(),
    invoice_id: String(row?.invoice_id ?? "").trim(),
    job_id: String(row?.job_id ?? "").trim(),
    payment_status: normalizePaymentStatus(row?.payment_status),
    payment_method: normalizePaymentMethod(row?.payment_method),
    amount_cents: Number(row?.amount_cents ?? 0) || 0,
    paid_at: String(row?.paid_at ?? "").trim(),
    received_reference: String(row?.received_reference ?? "").trim() || null,
    notes: String(row?.notes ?? "").trim() || null,
    recorded_by_user_id: String(row?.recorded_by_user_id ?? "").trim(),
    created_at: String(row?.created_at ?? "").trim(),
    updated_at: String(row?.updated_at ?? "").trim(),
    reversed_at: String(row?.reversed_at ?? "").trim() || null,
    reversed_by_user_id: String(row?.reversed_by_user_id ?? "").trim() || null,
    reversal_reason: String(row?.reversal_reason ?? "").trim() || null,
    processor_name: String(row?.processor_name ?? "").trim() || null,
    stripe_checkout_session_id: String(row?.stripe_checkout_session_id ?? "").trim() || null,
    stripe_event_id: String(row?.stripe_event_id ?? "").trim() || null,
    stripe_payment_intent_id: String(row?.stripe_payment_intent_id ?? "").trim() || null,
    stripe_charged_at: String(row?.stripe_charged_at ?? "").trim() || null,
    qbo_sync_status: ["not_synced", "pending", "synced", "failed"].includes(String(row?.qbo_sync_status ?? ""))
      ? row.qbo_sync_status
      : null,
    qbo_payment_id: String(row?.qbo_payment_id ?? "").trim() || null,
    qbo_last_synced_at: String(row?.qbo_last_synced_at ?? "").trim() || null,
    qbo_sync_error: String(row?.qbo_sync_error ?? "").trim() || null,
  };
}

export async function listInvoicePaymentRows(
  accountOwnerUserId: string,
  invoiceId: string,
  supabase: any,
): Promise<InternalInvoicePaymentRow[]> {
  const normalizedOwnerId = String(accountOwnerUserId ?? "").trim();
  const normalizedInvoiceId = String(invoiceId ?? "").trim();

  if (!normalizedOwnerId || !normalizedInvoiceId) return [];

  const { data, error } = await supabase
    .from("internal_invoice_payments")
    .select(INTERNAL_INVOICE_PAYMENT_SELECT)
    .eq("account_owner_user_id", normalizedOwnerId)
    .eq("invoice_id", normalizedInvoiceId)
    .order("paid_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      `Failed to list internal invoice payments: ${error.message ?? "unknown error"}`,
    );
  }

  return Array.isArray(data) ? data.map(normalizePaymentRow) : [];
}

export async function resolveInvoiceCollectedPaymentSummary(
  accountOwnerUserId: string,
  invoiceId: string,
  supabase: any,
): Promise<InternalInvoiceCollectedPaymentSummary> {
  const normalizedOwnerId = String(accountOwnerUserId ?? "").trim();
  const normalizedInvoiceId = String(invoiceId ?? "").trim();

  if (!normalizedOwnerId || !normalizedInvoiceId) {
    return {
      invoiceId: normalizedInvoiceId,
      invoiceTotalCents: 0,
      amountPaidCents: 0,
      balanceDueCents: 0,
      paymentStatus: "unpaid",
    };
  }

  const { data: invoice, error: invoiceErr } = await supabase
    .from("internal_invoices")
    .select("id, total_cents")
    .eq("id", normalizedInvoiceId)
    .eq("account_owner_user_id", normalizedOwnerId)
    .maybeSingle();

  if (invoiceErr) {
    throw new Error(
      `Failed to resolve internal invoice payment summary: ${invoiceErr.message ?? "unknown error"}`,
    );
  }

  const invoiceTotalCents = Number(invoice?.total_cents ?? 0) || 0;

  const paymentRows = await listInvoicePaymentRows(
    normalizedOwnerId,
    normalizedInvoiceId,
    supabase,
  );

  // Phase 4 compatibility layer: derive invoice paid totals from allocation-compatible records.
  const allocations = deriveCompatibilityInvoiceAllocations(paymentRows);
  const amountPaidCents = sumActiveInvoiceAllocationCents(
    allocations,
    normalizedInvoiceId,
  );

  const balanceDueCents = Math.max(0, invoiceTotalCents - amountPaidCents);

  const paymentStatus =
    amountPaidCents <= 0
      ? "unpaid"
      : amountPaidCents >= invoiceTotalCents
        ? "paid"
        : "partial";

  return {
    invoiceId: normalizedInvoiceId,
    invoiceTotalCents,
    amountPaidCents,
    balanceDueCents,
    paymentStatus,
  };
}

export async function resolveInvoiceCollectedPaymentLedger(
  accountOwnerUserId: string,
  invoiceId: string,
  supabase: any,
): Promise<{
  summary: InternalInvoiceCollectedPaymentSummary;
  rows: InternalInvoicePaymentRow[];
}> {
  const [summary, rows] = await Promise.all([
    resolveInvoiceCollectedPaymentSummary(accountOwnerUserId, invoiceId, supabase),
    listInvoicePaymentRows(accountOwnerUserId, invoiceId, supabase),
  ]);

  return {
    summary,
    rows,
  };
}

/**
 * Checks if a Stripe webhook event has already been recorded as a payment.
 * Uses stripe_event_id as idempotency key.
 */
export async function isStripeEventAlreadyRecorded(
  eventId: string,
  supabase: any,
): Promise<boolean> {
  const normalizedEventId = String(eventId ?? "").trim();
  if (!normalizedEventId) return false;

  const { data, error } = await supabase
    .from("internal_invoice_payments")
    .select("id")
    .eq("stripe_event_id", normalizedEventId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to check Stripe event idempotency: ${error.message ?? "unknown error"}`,
    );
  }

  return Boolean(data?.id);
}

export async function isStripePaymentAlreadyRecorded(params: {
  accountOwnerUserId: string;
  invoiceId: string;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  processorChargeId?: string | null;
  supabase: any;
}): Promise<boolean> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  const invoiceId = String(params.invoiceId ?? "").trim();
  const stripeCheckoutSessionId = String(params.stripeCheckoutSessionId ?? "").trim();
  const stripePaymentIntentId = String(params.stripePaymentIntentId ?? "").trim();
  const processorChargeId = String(params.processorChargeId ?? "").trim();

  if (!accountOwnerUserId || !invoiceId) return false;

  const identityClauses = [
    stripeCheckoutSessionId && `stripe_checkout_session_id.eq.${stripeCheckoutSessionId}`,
    stripePaymentIntentId && `stripe_payment_intent_id.eq.${stripePaymentIntentId}`,
    processorChargeId && `processor_charge_id.eq.${processorChargeId}`,
  ].filter(Boolean);

  if (!identityClauses.length) return false;

  const { data, error } = await params.supabase
    .from("internal_invoice_payments")
    .select("id")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("invoice_id", invoiceId)
    .or(identityClauses.join(","))
    .limit(1);

  if (error) {
    throw new Error(
      `Failed to check Stripe payment identity idempotency: ${error.message ?? "unknown error"}`,
    );
  }

  const first = Array.isArray(data) ? data[0] : null;
  return Boolean(first?.id);
}

/**
 * Validates that an invoice is eligible for online payment.
 * Requirements: issued status, positive balance, active account
 */
export function validateInvoiceEligibleForOnlinePayment(
  invoice: any,
  paymentSummary: InternalInvoiceCollectedPaymentSummary,
): { eligible: boolean; reason?: string } {
  if (!invoice) {
    return { eligible: false, reason: "Invoice not found" };
  }

  const status = String(invoice.status ?? "").trim().toLowerCase();
  if (status !== "issued") {
    return { eligible: false, reason: "Invoice must be issued to accept online payment" };
  }

  if (paymentSummary.balanceDueCents <= 0) {
    return { eligible: false, reason: "Invoice balance must be greater than zero" };
  }

  return { eligible: true };
}

/**
 * Builds normalized Stripe payment reference from Stripe charge object.
 * Extracts key payment details for internal_invoice_payments row.
 */
export function buildStripePaymentReference(charge: any): {
  processor_name: string;
  processor_payment_reference: string | null;
  processor_charge_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charged_at: string | null;
} {
  const chargeId = String(charge?.id ?? "").trim() || null;
  const intentId = String(charge?.payment_intent ?? "").trim() || null;
  const chargedAtUnix = Number(charge?.created) || null;

  let stripe_charged_at: string | null = null;
  if (chargedAtUnix && Number.isFinite(chargedAtUnix)) {
    stripe_charged_at = new Date(chargedAtUnix * 1000).toISOString();
  }

  return {
    processor_name: "stripe",
    processor_payment_reference: chargeId,
    processor_charge_id: chargeId,
    stripe_payment_intent_id: intentId,
    stripe_charged_at,
  };
}

export async function createTenantInvoiceCheckoutSession(params: {
  accountOwnerUserId: string;
  jobId: string;
  invoiceId: string;
  supabase: any;
  stripe?: Stripe;
  appUrl?: string | null;
}) : Promise<TenantInvoiceCheckoutSessionResult> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  const jobId = String(params.jobId ?? "").trim();
  const invoiceId = String(params.invoiceId ?? "").trim();

  if (!accountOwnerUserId || !jobId || !invoiceId) {
    throw new Error("accountOwnerUserId, jobId, and invoiceId are required.");
  }

  const { data: invoice, error: invoiceErr } = await params.supabase
    .from("internal_invoices")
    .select("id, account_owner_user_id, job_id, invoice_number, status, total_cents, billing_email")
    .eq("id", invoiceId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (invoiceErr) {
    throw new Error(`Failed to load invoice for checkout session: ${invoiceErr.message ?? "unknown error"}`);
  }

  if (!invoice?.id) {
    throw new Error("Invoice not found for checkout session.");
  }

  if (await resolveJobBlocksOnlineInvoicePayment({ accountOwnerUserId, jobId, supabase: params.supabase })) {
    throw new Error("Invoice already paid or resolved outside online payment.");
  }

  const paymentSummary = await resolveInvoiceCollectedPaymentSummary(
    accountOwnerUserId,
    invoiceId,
    params.supabase,
  );

  const eligibility = validateInvoiceEligibleForOnlinePayment(invoice, paymentSummary);
  if (!eligibility.eligible) {
    throw new Error(eligibility.reason ?? "Invoice is not eligible for online payment.");
  }

  const readiness = await resolveTenantStripeConnectReadiness(accountOwnerUserId, params.supabase);
  if (!readiness.isReady || !readiness.connectedAccountId) {
    throw new Error("Tenant Stripe Connect account is not ready for checkout session creation.");
  }

  const stripe = params.stripe ?? getStripeServerClient();
  const appUrl = String(params.appUrl ?? resolvePlatformBillingAppUrl() ?? "").trim().replace(/\/$/, "");

  if (!appUrl) {
    throw new Error("APP_URL is not configured.");
  }

  const balanceDueCents = paymentSummary.balanceDueCents;
  const checkoutMetadata = {
    account_owner_user_id: accountOwnerUserId,
    invoice_id: invoiceId,
    job_id: jobId,
    invoice_number: String(invoice.invoice_number ?? "").trim() || invoiceId,
  };
  const platformFeeConfig = derivePlatformApplicationFeeConfig({
    stripeConnectReady: readiness.isReady,
    connectedAccountId: readiness.connectedAccountId,
  });
  const platformFee = calculatePlatformApplicationFeeAmountCents({
    amountCents: balanceDueCents,
    feeBasisPoints: platformFeeConfig.feeBasisPoints,
    enabled: platformFeeConfig.enabled,
  });
  const paymentIntentData = {
    metadata: checkoutMetadata,
    ...(platformFee.applicationFeeAmountCents > 0
      ? { application_fee_amount: platformFee.applicationFeeAmountCents }
      : {}),
  };

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: balanceDueCents,
            product_data: {
              name: `Invoice ${String(invoice.invoice_number ?? "").trim() || invoiceId}`,
            },
          },
        },
      ],
      success_url: `${appUrl}${buildPublicTenantInvoiceCheckoutReturnPath({
        status: "success",
        jobId,
        invoiceId,
      })}`,
      cancel_url: `${appUrl}${buildPublicTenantInvoiceCheckoutReturnPath({
        status: "cancelled",
        jobId,
        invoiceId,
      })}`,
      metadata: checkoutMetadata,
      payment_intent_data: paymentIntentData,
      ...(String(invoice.billing_email ?? "").trim()
        ? { customer_email: String(invoice.billing_email).trim() }
        : {}),
    },
    {
      stripeAccount: readiness.connectedAccountId,
    },
  );

  const checkoutSessionId = String(session.id ?? "").trim();
  const checkoutSessionUrl = String(session.url ?? "").trim();

  if (!checkoutSessionId || !checkoutSessionUrl) {
    throw new Error("Stripe checkout session response was missing id or url.");
  }

  const { error: pendingInsertErr } = await params.supabase
    .from("internal_invoice_payments")
    .insert({
      account_owner_user_id: accountOwnerUserId,
      invoice_id: invoiceId,
      job_id: jobId,
      payment_status: "pending",
      payment_method: "card_stripe_online",
      amount_cents: balanceDueCents,
      paid_at: new Date().toISOString(),
      received_reference: checkoutSessionId,
      notes: `Pending Stripe checkout session ${checkoutSessionId}`,
      recorded_by_user_id: accountOwnerUserId,
      processor_name: "stripe",
      processor_payment_reference: checkoutSessionId,
      stripe_checkout_session_id: checkoutSessionId,
    });

  if (pendingInsertErr) {
    try {
      await stripe.checkout.sessions.expire(
        checkoutSessionId,
        {},
        { stripeAccount: readiness.connectedAccountId },
      );
    } catch (error) {
      console.warn("Stripe checkout session could not be expired after pending row insert failure", {
        accountOwnerUserId,
        invoiceId,
        checkoutSessionId,
        message: error instanceof Error ? error.message : "unknown_error",
      });
    }
    throw new Error(`Failed to store pending Stripe checkout session: ${pendingInsertErr.message ?? "unknown error"}`);
  }

  return {
    checkoutSessionId,
    checkoutSessionUrl,
    connectedAccountId: readiness.connectedAccountId,
    balanceDueCents,
  };
}

export async function createTenantInvoicePaymentLink(params: {
  accountOwnerUserId: string;
  jobId: string;
  invoiceId: string;
  supabase: any;
  appUrl?: string | null;
  signingSecret?: string | null;
}): Promise<TenantInvoicePaymentLinkResult> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  const jobId = String(params.jobId ?? "").trim();
  const invoiceId = String(params.invoiceId ?? "").trim();

  if (!accountOwnerUserId || !jobId || !invoiceId) {
    throw new Error("accountOwnerUserId, jobId, and invoiceId are required.");
  }

  const { data: invoice, error: invoiceErr } = await params.supabase
    .from("internal_invoices")
    .select("id, account_owner_user_id, job_id, invoice_number, status, total_cents, billing_email")
    .eq("id", invoiceId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (invoiceErr) {
    throw new Error(`Failed to load invoice for payment link: ${invoiceErr.message ?? "unknown error"}`);
  }

  if (!invoice?.id) {
    throw new Error("Invoice not found for payment link.");
  }

  if (await resolveJobBlocksOnlineInvoicePayment({ accountOwnerUserId, jobId, supabase: params.supabase })) {
    throw new Error("Invoice already paid or resolved outside online payment.");
  }

  const paymentSummary = await resolveInvoiceCollectedPaymentSummary(
    accountOwnerUserId,
    invoiceId,
    params.supabase,
  );

  const eligibility = validateInvoiceEligibleForOnlinePayment(invoice, paymentSummary);
  if (!eligibility.eligible) {
    throw new Error(eligibility.reason ?? "Invoice is not eligible for online payment.");
  }

  const readiness = await resolveTenantStripeConnectReadiness(accountOwnerUserId, params.supabase);
  if (!readiness.isReady || !readiness.connectedAccountId) {
    throw new Error("Tenant Stripe Connect account is not ready for payment link creation.");
  }

  const appUrl = String(params.appUrl ?? resolvePlatformBillingAppUrl() ?? "").trim().replace(/\/$/, "");
  if (!appUrl) {
    throw new Error("APP_URL is not configured.");
  }

  const balanceDueCents = paymentSummary.balanceDueCents;
  const paymentLinkToken = signTenantInvoicePaymentLinkPayload(
    {
      v: 1,
      accountOwnerUserId,
      jobId,
      invoiceId,
      balanceDueCents,
      createdAt: new Date().toISOString(),
    },
    params.signingSecret,
  );

  return {
    paymentLinkUrl: `${appUrl}${buildPublicTenantInvoicePaymentPath(paymentLinkToken)}`,
    paymentLinkToken,
    connectedAccountId: readiness.connectedAccountId,
    balanceDueCents,
  };
}

export async function expireStoredOpenTenantInvoiceCheckoutSessionsForInvoice(params: {
  accountOwnerUserId: string;
  invoiceId: string;
  supabase: any;
  stripe?: Stripe;
}): Promise<TenantInvoiceCheckoutSessionExpirationResult> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  const invoiceId = String(params.invoiceId ?? "").trim();

  if (!accountOwnerUserId || !invoiceId) {
    return { attempted: 0, expired: 0, skipped: 0 };
  }

  const paymentRows = await listInvoicePaymentRows(accountOwnerUserId, invoiceId, params.supabase);
  const checkoutSessionIds = Array.from(
    new Set(
      paymentRows
        .filter((row) => row.payment_status === "pending")
        .filter((row) => row.payment_method === "card_stripe_online" || String(row.processor_name ?? "").toLowerCase() === "stripe")
        .map((row) => String(row.stripe_checkout_session_id ?? "").trim())
        .filter(Boolean),
    ),
  );

  if (checkoutSessionIds.length === 0) {
    return { attempted: 0, expired: 0, skipped: 0 };
  }

  const readiness = await resolveTenantStripeConnectReadiness(accountOwnerUserId, params.supabase);
  if (!readiness.isReady || !readiness.connectedAccountId) {
    return { attempted: 0, expired: 0, skipped: checkoutSessionIds.length };
  }

  const stripe = params.stripe ?? getStripeServerClient();
  let expired = 0;
  let skipped = 0;

  for (const checkoutSessionId of checkoutSessionIds) {
    try {
      await stripe.checkout.sessions.expire(
        checkoutSessionId,
        {},
        { stripeAccount: readiness.connectedAccountId },
      );
      expired += 1;
    } catch (error) {
      skipped += 1;
      console.warn("Stored Stripe checkout session could not be expired", {
        accountOwnerUserId,
        invoiceId,
        checkoutSessionId,
        message: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  return {
    attempted: checkoutSessionIds.length,
    expired,
    skipped,
  };
}
