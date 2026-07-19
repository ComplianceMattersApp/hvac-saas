type PaymentRow = {
  id: string;
  payment_status: string | null;
  payment_method: string | null;
  processor_name: string | null;
  processor_charge_id: string | null;
  stripe_charged_at: string | null;
  paid_at: string | null;
  created_at: string | null;
};

type SettlementRow = {
  internal_invoice_payment_id: string | null;
  stripe_payout_id: string | null;
  payout_status: string | null;
  sync_status: string | null;
};

export type DepositsReconciliationStatus = {
  recordedStripePayments: number;
  syncedSettlements: number;
  awaitingSync: number;
  pendingPayout: number;
  syncFailures: number;
  settlementsInRange: number;
  filteredSettlementRows: number;
};

const clean = (value: unknown) => String(value ?? '').trim();

function paymentTimestamp(row: PaymentRow) {
  return clean(row.stripe_charged_at) || clean(row.paid_at) || clean(row.created_at);
}

function inRange(value: string, from?: string | null, to?: string | null) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;
  if (from && time < new Date(`${from}T00:00:00.000Z`).getTime()) return false;
  if (to && time > new Date(`${to}T23:59:59.999Z`).getTime()) return false;
  return true;
}

function isRecordedStripe(row: PaymentRow) {
  return clean(row.payment_status).toLowerCase() === 'recorded' && (
    clean(row.payment_method) === 'card_stripe_online'
    || clean(row.processor_name).toLowerCase() === 'stripe'
    || Boolean(clean(row.processor_charge_id))
  );
}

export async function getDepositsReconciliationStatus(params: {
  supabase: any;
  accountOwnerUserId: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  payoutStatus?: string | null;
  syncStatus?: string | null;
  filteredSettlementRows: number;
}): Promise<DepositsReconciliationStatus> {
  const [paymentsResult, settlementsResult] = await Promise.all([
    params.supabase.from('internal_invoice_payments')
      .select('id, payment_status, payment_method, processor_name, processor_charge_id, stripe_charged_at, paid_at, created_at')
      .eq('account_owner_user_id', params.accountOwnerUserId),
    params.supabase.from('stripe_payment_settlements')
      .select('internal_invoice_payment_id, stripe_payout_id, payout_status, sync_status')
      .eq('account_owner_user_id', params.accountOwnerUserId),
  ]);
  if (paymentsResult.error) throw new Error('Unable to load recorded online payment diagnostics.');
  if (settlementsResult.error) throw new Error('Unable to load Stripe settlement diagnostics.');

  const payments = ((paymentsResult.data ?? []) as PaymentRow[]).filter(
    (row) => isRecordedStripe(row) && inRange(paymentTimestamp(row), params.dateFrom, params.dateTo),
  );
  const paymentIds = new Set(payments.map((row) => clean(row.id)));
  const settlements = ((settlementsResult.data ?? []) as SettlementRow[]).filter(
    (row) => paymentIds.has(clean(row.internal_invoice_payment_id)),
  );
  const settledPaymentIds = new Set(settlements.map((row) => clean(row.internal_invoice_payment_id)).filter(Boolean));

  return {
    recordedStripePayments: payments.length,
    syncedSettlements: settledPaymentIds.size,
    awaitingSync: payments.filter((row) => !settledPaymentIds.has(clean(row.id))).length,
    pendingPayout: settlements.filter((row) => !clean(row.stripe_payout_id) || !['paid', 'complete'].includes(clean(row.payout_status).toLowerCase())).length,
    syncFailures: settlements.filter((row) => clean(row.sync_status).toLowerCase() === 'failed').length,
    settlementsInRange: settlements.length,
    filteredSettlementRows: params.filteredSettlementRows,
  };
}
