import type Stripe from "stripe";
import { resolveTenantStripeConnectReadiness } from "@/lib/business/tenant-stripe-connect-readiness";

type SyncStatus = "synced" | "skipped" | "unmatched" | "failed";

type InternalInvoicePaymentSettlementSourceRow = {
  id: string;
  account_owner_user_id: string;
  payment_status: string | null;
  payment_method: string | null;
  amount_cents: number | null;
  processor_name: string | null;
  processor_payment_reference: string | null;
  processor_charge_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
};

export type SyncStripePaymentSettlementResult = {
  status: SyncStatus;
  code: string;
  reason: string;
  settlementId: string | null;
  platformFeeProven: boolean;
};

export type SyncStripePaymentSettlementForPaymentParams = {
  supabase: any;
  stripe: Pick<Stripe, "charges" | "balanceTransactions" | "payouts">;
  accountOwnerUserId: string;
  internalInvoicePaymentId: string;
  now?: Date;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function unixSecondsToIso(value: unknown) {
  const seconds = Number(value ?? 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function normalizeCurrency(value: unknown) {
  const currency = clean(value).toLowerCase();
  return /^[a-z]{3}$/.test(currency) ? currency : "usd";
}

function skip(code: string, reason: string): SyncStripePaymentSettlementResult {
  return {
    status: "skipped",
    code,
    reason,
    settlementId: null,
    platformFeeProven: false,
  };
}

function failed(params: {
  code: string;
  reason: string;
  settlementId?: string | null;
}): SyncStripePaymentSettlementResult {
  return {
    status: "failed",
    code: params.code,
    reason: params.reason,
    settlementId: clean(params.settlementId) || null,
    platformFeeProven: false,
  };
}

function isStripeCollectedPayment(row: InternalInvoicePaymentSettlementSourceRow) {
  const status = clean(row.payment_status).toLowerCase();
  if (status !== "recorded") return false;

  return (
    clean(row.payment_method) === "card_stripe_online" ||
    clean(row.processor_name).toLowerCase() === "stripe" ||
    clean(row.stripe_payment_intent_id).length > 0 ||
    clean(row.stripe_checkout_session_id).length > 0 ||
    clean(row.processor_charge_id).length > 0
  );
}

function resolveLocalChargeId(row: InternalInvoicePaymentSettlementSourceRow) {
  const processorChargeId = clean(row.processor_charge_id);
  if (processorChargeId) return processorChargeId;

  const processorReference = clean(row.processor_payment_reference);
  if (/^(ch|py)_[A-Za-z0-9_]+$/.test(processorReference)) {
    return processorReference;
  }

  return "";
}

function resolveObjectId(value: unknown) {
  if (typeof value === "string") return clean(value);
  if (value && typeof value === "object" && "id" in value) {
    return clean((value as { id?: unknown }).id);
  }
  return "";
}

function extractFeeDetails(balanceTransaction: Stripe.BalanceTransaction) {
  const details = Array.isArray(balanceTransaction.fee_details)
    ? balanceTransaction.fee_details
    : [];

  return details.map((detail) => ({
    amount: Number(detail.amount ?? 0) || 0,
    currency: normalizeCurrency(detail.currency),
    type: clean(detail.type) || null,
    description: clean(detail.description) || null,
    application: clean((detail as { application?: unknown }).application) || null,
  }));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : clean((error as { message?: unknown } | null)?.message) || "unknown error";
}

async function loadPaymentRow(params: {
  supabase: any;
  accountOwnerUserId: string;
  internalInvoicePaymentId: string;
}) {
  const { data, error } = await params.supabase
    .from("internal_invoice_payments")
    .select(
      [
        "id",
        "account_owner_user_id",
        "payment_status",
        "payment_method",
        "amount_cents",
        "processor_name",
        "processor_payment_reference",
        "processor_charge_id",
        "stripe_checkout_session_id",
        "stripe_payment_intent_id",
      ].join(", "),
    )
    .eq("id", params.internalInvoicePaymentId)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load internal invoice payment row.");
  }

  return (data ?? null) as InternalInvoicePaymentSettlementSourceRow | null;
}

async function upsertSettlement(params: {
  supabase: any;
  payload: Record<string, unknown>;
}) {
  const { data, error } = await params.supabase
    .from("stripe_payment_settlements")
    .upsert(params.payload, {
      onConflict: "stripe_connected_account_id,stripe_balance_transaction_id",
    })
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to upsert Stripe payment settlement.");
  }

  return clean(data?.id) || null;
}

export async function syncStripePaymentSettlementForPayment(
  params: SyncStripePaymentSettlementForPaymentParams,
): Promise<SyncStripePaymentSettlementResult> {
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  const internalInvoicePaymentId = clean(params.internalInvoicePaymentId);
  const syncedAt = (params.now ?? new Date()).toISOString();

  if (!accountOwnerUserId || !internalInvoicePaymentId) {
    return skip("missing_input", "Account owner id and internal invoice payment id are required.");
  }

  let payment: InternalInvoicePaymentSettlementSourceRow | null = null;
  try {
    payment = await loadPaymentRow({
      supabase: params.supabase,
      accountOwnerUserId,
      internalInvoicePaymentId,
    });
  } catch (error) {
    return failed({
      code: "payment_lookup_failed",
      reason: getErrorMessage(error),
    });
  }

  if (!payment) {
    return skip("payment_not_found", "No payment row exists in the requested account scope.");
  }

  if (!isStripeCollectedPayment(payment)) {
    return skip(
      "not_collected_stripe_payment",
      "Only recorded Stripe online payment rows can be synced as payment settlements.",
    );
  }

  const localChargeId = resolveLocalChargeId(payment);
  if (!localChargeId) {
    return skip("missing_charge_id", "The payment row does not have a usable Stripe charge id.");
  }

  const readiness = await resolveTenantStripeConnectReadiness(accountOwnerUserId, params.supabase);
  const connectedAccountId = clean(readiness.connectedAccountId);
  if (!readiness.isReady || !connectedAccountId) {
    return skip(
      "connect_not_ready",
      "Tenant connected account is missing or not ready enough for settlement sync.",
    );
  }

  let charge: Stripe.Charge;
  try {
    charge = await params.stripe.charges.retrieve(
      localChargeId,
      {},
      { stripeAccount: connectedAccountId },
    );
  } catch (error) {
    return failed({
      code: "stripe_charge_fetch_failed",
      reason: getErrorMessage(error),
    });
  }

  const balanceTransactionId = resolveObjectId(charge.balance_transaction);
  if (!balanceTransactionId) {
    return failed({
      code: "missing_balance_transaction",
      reason: "Stripe charge did not include a usable balance transaction id.",
    });
  }

  let balanceTransaction: Stripe.BalanceTransaction;
  try {
    balanceTransaction = await params.stripe.balanceTransactions.retrieve(
      balanceTransactionId,
      {},
      { stripeAccount: connectedAccountId },
    );
  } catch (error) {
    return failed({
      code: "stripe_balance_transaction_fetch_failed",
      reason: getErrorMessage(error),
    });
  }

  const payoutId = resolveObjectId((balanceTransaction as { payout?: unknown }).payout);
  let payoutStatus: string | null = null;
  let payoutArrivalDate: string | null = null;
  let payoutFetchError: string | null = null;

  if (payoutId) {
    try {
      const payout = await params.stripe.payouts.retrieve(
        payoutId,
        {},
        { stripeAccount: connectedAccountId },
      );
      payoutStatus = clean(payout.status) || null;
      payoutArrivalDate = unixSecondsToIso(payout.arrival_date);
    } catch (error) {
      payoutFetchError = getErrorMessage(error);
    }
  }

  const payload = {
    account_owner_user_id: accountOwnerUserId,
    internal_invoice_payment_id: clean(payment.id),
    stripe_connected_account_id: connectedAccountId,
    stripe_charge_id: clean(charge.id) || localChargeId,
    stripe_payment_intent_id: resolveObjectId(charge.payment_intent) || clean(payment.stripe_payment_intent_id) || null,
    stripe_checkout_session_id: clean(payment.stripe_checkout_session_id) || null,
    stripe_balance_transaction_id: balanceTransactionId,
    stripe_payout_id: payoutId || null,
    settlement_kind: "payment",
    source_object_type: "charge",
    gross_amount_cents: Number(balanceTransaction.amount ?? charge.amount ?? payment.amount_cents ?? 0) || 0,
    stripe_fee_cents: Number(balanceTransaction.fee ?? 0) || 0,
    platform_fee_cents: 0,
    net_amount_cents: Number(balanceTransaction.net ?? 0) || 0,
    currency: normalizeCurrency(balanceTransaction.currency ?? charge.currency),
    available_on: unixSecondsToIso(balanceTransaction.available_on),
    payout_arrival_date: payoutArrivalDate,
    payout_status: payoutStatus,
    reporting_category: clean((balanceTransaction as { reporting_category?: unknown }).reporting_category) || null,
    fee_details: extractFeeDetails(balanceTransaction),
    sync_status: payoutFetchError ? "failed" : "synced",
    sync_error: payoutFetchError,
    synced_at: syncedAt,
  };

  try {
    const settlementId = await upsertSettlement({
      supabase: params.supabase,
      payload,
    });

    if (payoutFetchError) {
      return failed({
        code: "stripe_payout_fetch_failed",
        reason: payoutFetchError,
        settlementId,
      });
    }

    return {
      status: "synced",
      code: "synced",
      reason: "Stripe payment settlement synced.",
      settlementId,
      platformFeeProven: false,
    };
  } catch (error) {
    return failed({
      code: "settlement_upsert_failed",
      reason: getErrorMessage(error),
    });
  }
}
