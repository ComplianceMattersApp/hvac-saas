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
import { checkQboBalanceBeforeCollection } from "@/lib/qbo/qbo-collection-preflight";
import {
  claimInvoiceCollectionReservation,
  releaseInvoiceCollectionReservation,
} from "@/lib/business/invoice-collection-reservations";

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
  collection_reservation_key?: string | null;
  stripe_event_id?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_charged_at?: string | null;
  stripe_refunded_amount_cents?: number | null;
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
  paymentLinkToken?: string | null;
}) {
  const search = new URLSearchParams({
    status: params.status,
    job_id: params.jobId,
    invoice_id: params.invoiceId,
  });
  const paymentLinkToken = String(params.paymentLinkToken ?? "").trim();
  if (paymentLinkToken) search.set("payment_token", paymentLinkToken);
  return `/payments/checkout-complete?${search.toString()}`;
}

function buildPublicTenantInvoicePaymentPath(token: string) {
  return `/payments/invoice/${encodeURIComponent(token)}`;
}

function isDatabaseUniqueConflict(error: unknown): boolean {
  const code = String((error as { code?: unknown } | null)?.code ?? "").trim();
  if (code === "23505") return true;
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return message.includes("duplicate key") || message.includes("unique constraint");
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
    .select("id, billing_disposition")
    .eq("id", jobId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (error || !data?.id) return false;

  // `invoice_complete` means the invoice workflow has been closed out/issued. It
  // does not mean the invoice was paid. Only an explicit non-online billing
  // disposition should prevent the customer from paying an issued balance.
  return Boolean(normalizeJobBillingDisposition(data.billing_disposition));
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
  "collection_reservation_key",
  "stripe_event_id",
  "stripe_payment_intent_id",
  "stripe_charged_at",
  "stripe_refunded_amount_cents",
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
    collection_reservation_key: String(row?.collection_reservation_key ?? "").trim() || null,
    stripe_event_id: String(row?.stripe_event_id ?? "").trim() || null,
    stripe_payment_intent_id: String(row?.stripe_payment_intent_id ?? "").trim() || null,
    stripe_charged_at: String(row?.stripe_charged_at ?? "").trim() || null,
    stripe_refunded_amount_cents: row?.stripe_refunded_amount_cents == null
      ? null
      : Math.max(0, Number(row.stripe_refunded_amount_cents) || 0),
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

  const paymentRows = await listInvoicePaymentRows(
    normalizedOwnerId,
    normalizedInvoiceId,
    supabase,
  );

  return buildInvoiceCollectedPaymentSummary(
    normalizedInvoiceId,
    Number(invoice?.total_cents ?? 0) || 0,
    paymentRows,
  );
}

function buildInvoiceCollectedPaymentSummary(
  normalizedInvoiceId: string,
  invoiceTotalCents: number,
  paymentRows: InternalInvoicePaymentRow[],
): InternalInvoiceCollectedPaymentSummary {
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
  const normalizedOwnerId = String(accountOwnerUserId ?? "").trim();
  const normalizedInvoiceId = String(invoiceId ?? "").trim();
  if (!normalizedOwnerId || !normalizedInvoiceId) {
    return {
      summary: buildInvoiceCollectedPaymentSummary(normalizedInvoiceId, 0, []),
      rows: [],
    };
  }

  // The previous implementation called listInvoicePaymentRows twice: once
  // directly and once inside resolveInvoiceCollectedPaymentSummary. Fetch the
  // invoice total and payment rows once, in parallel, then derive the summary.
  const [invoiceResult, rows] = await Promise.all([
    supabase
      .from("internal_invoices")
      .select("id, total_cents")
      .eq("id", normalizedInvoiceId)
      .eq("account_owner_user_id", normalizedOwnerId)
      .maybeSingle(),
    listInvoicePaymentRows(accountOwnerUserId, invoiceId, supabase),
  ]);

  if (invoiceResult.error) {
    throw new Error(
      `Failed to resolve internal invoice payment summary: ${invoiceResult.error.message ?? "unknown error"}`,
    );
  }

  const summary = buildInvoiceCollectedPaymentSummary(
    normalizedInvoiceId,
    Number(invoiceResult.data?.total_cents ?? 0) || 0,
    rows,
  );

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
    .neq("payment_status", "failed")
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
  const intentId =
    (typeof charge?.payment_intent === "string"
      ? String(charge.payment_intent).trim()
      : String(charge?.payment_intent?.id ?? "").trim()) || null;
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
  paymentLinkToken?: string | null;
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

  // Double-collection guard: if QuickBooks shows this invoice already settled
  // (paid via QuickBooks Payments or keyed there manually), refuse to ask the
  // customer for money EveryStep doesn't know was collected.
  const qboPreflight = await checkQboBalanceBeforeCollection({
    supabase: params.supabase,
    accountOwnerUserId,
    invoiceId,
    collectAmountCents: paymentSummary.balanceDueCents,
  });
  if (qboPreflight.blocked) {
    throw new Error(qboPreflight.message);
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
  const currentPaymentRows = await listInvoicePaymentRows(accountOwnerUserId, invoiceId, params.supabase);
  const storedCheckoutRows = currentPaymentRows.filter((row) =>
    row.payment_status === "pending" &&
    (row.payment_method === "card_stripe_online" || String(row.processor_name ?? "").toLowerCase() === "stripe"),
  );

  // Repeated clicks and simultaneous public/internal submissions must converge
  // on one Stripe Session. A pending paid Session means webhook confirmation is
  // lagging, so fail closed rather than expose a second way to charge the card.
  for (const row of storedCheckoutRows) {
    const storedSessionId = String(row.stripe_checkout_session_id ?? "").trim();
    if (!storedSessionId) {
      throw new Error("An existing Stripe checkout attempt is missing its Session identity. Review it before collecting again.");
    }

    let storedSession: Stripe.Checkout.Session;
    try {
      storedSession = await stripe.checkout.sessions.retrieve(
        storedSessionId,
        {},
        { stripeAccount: readiness.connectedAccountId },
      );
    } catch (error) {
      throw new Error(
        `Could not verify existing Stripe checkout session ${storedSessionId}; refusing a second collection attempt. ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }

    const metadataMatches =
      String(storedSession.metadata?.account_owner_user_id ?? "").trim() === accountOwnerUserId &&
      String(storedSession.metadata?.invoice_id ?? "").trim() === invoiceId &&
      String(storedSession.metadata?.job_id ?? "").trim() === jobId;
    if (!metadataMatches) {
      throw new Error("Existing Stripe checkout Session metadata does not match this invoice. Review it before collecting again.");
    }

    if (String(storedSession.payment_status ?? "").toLowerCase() === "paid") {
      throw new Error("Stripe already shows a paid checkout for this invoice and EveryStep is awaiting confirmation.");
    }

    const storedStatus = String(storedSession.status ?? "").toLowerCase();
    const storedAmountCents = Number(storedSession.amount_total ?? 0) || 0;
    const storedUrl = String(storedSession.url ?? "").trim();
    if (storedStatus === "open" && storedAmountCents === balanceDueCents && storedUrl) {
      const storedReservationKey =
        String(storedSession.metadata?.collection_reservation_key ?? "").trim() ||
        `checkout-session:${storedSessionId}`;
      const claimed = await claimInvoiceCollectionReservation({
        supabase: params.supabase,
        accountOwnerUserId,
        invoiceId,
        sourceKind: "stripe_checkout",
        reservationKey: storedReservationKey,
        amountCents: balanceDueCents,
        ttlSeconds: 90000,
      });
      if (!claimed) {
        throw new Error("Another payment collection is already in progress for this invoice.");
      }
      return {
        checkoutSessionId: storedSessionId,
        checkoutSessionUrl: storedUrl,
        connectedAccountId: readiness.connectedAccountId,
        balanceDueCents,
      };
    }

    if (storedStatus === "open") {
      try {
        await stripe.checkout.sessions.expire(
          storedSessionId,
          {},
          { stripeAccount: readiness.connectedAccountId },
        );
      } catch (error) {
        throw new Error(
          `Could not expire stale Stripe checkout session ${storedSessionId}; refusing a second collection attempt. ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
      continue;
    }

    if (storedStatus !== "expired") {
      throw new Error(`Stripe checkout session ${storedSessionId} is ${storedStatus || "unresolved"}; refusing a second collection attempt.`);
    }
  }

  const checkoutGeneration = currentPaymentRows.filter((row) =>
    String(row.stripe_checkout_session_id ?? "").trim().length > 0,
  ).length;
  const checkoutIdempotencyKey = `invoice-checkout:${invoiceId}:${balanceDueCents}:${checkoutGeneration}`;
  const checkoutMetadata = {
    account_owner_user_id: accountOwnerUserId,
    invoice_id: invoiceId,
    job_id: jobId,
    invoice_number: String(invoice.invoice_number ?? "").trim() || invoiceId,
    collection_reservation_key: checkoutIdempotencyKey,
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
  const claimed = await claimInvoiceCollectionReservation({
    supabase: params.supabase,
    accountOwnerUserId,
    invoiceId,
    sourceKind: "stripe_checkout",
    reservationKey: checkoutIdempotencyKey,
    amountCents: balanceDueCents,
    ttlSeconds: 90000,
  });
  if (!claimed) {
    throw new Error("Another payment collection is already in progress for this invoice.");
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
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
        paymentLinkToken: params.paymentLinkToken,
      })}`,
      cancel_url: `${appUrl}${buildPublicTenantInvoiceCheckoutReturnPath({
        status: "cancelled",
        jobId,
        invoiceId,
        paymentLinkToken: params.paymentLinkToken,
      })}`,
      metadata: checkoutMetadata,
      payment_intent_data: paymentIntentData,
      ...(String(invoice.billing_email ?? "").trim()
        ? { customer_email: String(invoice.billing_email).trim() }
        : {}),
    }, {
      stripeAccount: readiness.connectedAccountId,
      idempotencyKey: checkoutIdempotencyKey,
    });
  } catch (error) {
    await releaseInvoiceCollectionReservation({
      supabase: params.supabase,
      accountOwnerUserId,
      invoiceId,
      reservationKey: checkoutIdempotencyKey,
    });
    throw error;
  }

  const checkoutSessionId = String(session.id ?? "").trim();
  const checkoutSessionUrl = String(session.url ?? "").trim();

  if (!checkoutSessionId || !checkoutSessionUrl) {
    await releaseInvoiceCollectionReservation({
      supabase: params.supabase,
      accountOwnerUserId,
      invoiceId,
      reservationKey: checkoutIdempotencyKey,
    });
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
      collection_reservation_key: checkoutIdempotencyKey,
      stripe_identity_dedupe_scope: "checkout_v1",
    });

  if (pendingInsertErr) {
    if (isDatabaseUniqueConflict(pendingInsertErr)) {
      return {
        checkoutSessionId,
        checkoutSessionUrl,
        connectedAccountId: readiness.connectedAccountId,
        balanceDueCents,
      };
    }

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
    await releaseInvoiceCollectionReservation({
      supabase: params.supabase,
      accountOwnerUserId,
      invoiceId,
      reservationKey: checkoutIdempotencyKey,
    });
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
  const checkoutSessions = Array.from(new Map(
    paymentRows
      .filter((row) => row.payment_status === "pending")
      .filter((row) => row.payment_method === "card_stripe_online" || String(row.processor_name ?? "").toLowerCase() === "stripe")
      .map((row) => ({
        sessionId: String(row.stripe_checkout_session_id ?? "").trim(),
        reservationKey: String(row.collection_reservation_key ?? "").trim(),
      }))
      .filter((row) => Boolean(row.sessionId))
      .map((row) => [row.sessionId, row] as const),
  ).values());

  if (checkoutSessions.length === 0) {
    return { attempted: 0, expired: 0, skipped: 0 };
  }

  const readiness = await resolveTenantStripeConnectReadiness(accountOwnerUserId, params.supabase);
  if (!readiness.isReady || !readiness.connectedAccountId) {
    return { attempted: 0, expired: 0, skipped: checkoutSessions.length };
  }

  const stripe = params.stripe ?? getStripeServerClient();
  let expired = 0;
  let skipped = 0;

  for (const checkoutRow of checkoutSessions) {
    const checkoutSessionId = checkoutRow.sessionId;
    try {
      const expiredSession = await stripe.checkout.sessions.expire(
        checkoutSessionId,
        {},
        { stripeAccount: readiness.connectedAccountId },
      );
      const reservationKey =
        checkoutRow.reservationKey
        || String(expiredSession?.metadata?.collection_reservation_key ?? "").trim();
      if (reservationKey) {
        await releaseInvoiceCollectionReservation({
          supabase: params.supabase,
          accountOwnerUserId,
          invoiceId,
          reservationKey,
        });
      }
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
    attempted: checkoutSessions.length,
    expired,
    skipped,
  };
}
