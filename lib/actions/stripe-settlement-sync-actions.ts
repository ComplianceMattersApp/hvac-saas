'use server';

import type Stripe from 'stripe';
import { canExportFinancialData } from '@/lib/auth/financial-access';
import { requireInternalUser, type InternalUserRow } from '@/lib/auth/internal-user';
import { syncStripePaymentSettlementForPayment } from '@/lib/business/stripe-payment-settlements';
import { getStripeServerClient } from '@/lib/business/platform-billing-stripe';
import { resolveTenantStripeConnectReadiness } from '@/lib/business/tenant-stripe-connect-readiness';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

type SettlementSyncPaymentRow = {
  id: string;
  account_owner_user_id: string;
  invoice_id: string | null;
  job_id: string | null;
  payment_status: string | null;
  payment_method: string | null;
  amount_cents: number | null;
  paid_at: string | null;
  stripe_charged_at?: string | null;
  created_at: string | null;
  processor_name: string | null;
  processor_payment_reference: string | null;
  processor_charge_id: string | null;
  stripe_event_id?: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  internal_invoices?: { invoice_number?: string | null } | null;
};

type ExistingSettlementRow = {
  id: string | null;
  internal_invoice_payment_id: string | null;
  sync_status: string | null;
  stripe_payout_id: string | null;
  payout_status: string | null;
};

export type StripeSettlementSyncRowStatus = 'eligible' | 'synced' | 'skipped' | 'failed';

export type StripeSettlementSyncRowDetail = {
  paymentId: string | null;
  invoiceNumber: string | null;
  chargeId: string | null;
  status: StripeSettlementSyncRowStatus;
  code: string;
  reason: string;
  settlementId: string | null;
};

export type StripeSettlementSyncSummary = {
  dryRun: boolean;
  accountOwnerUserId: string;
  dateFrom: string;
  dateTo: string;
  evaluated: number;
  eligible: number;
  synced: number;
  skipped: number;
  failed: number;
  unmatched: number;
  alreadySynced: number;
  perCodeCounts: Record<string, number>;
  details: StripeSettlementSyncRowDetail[];
};

export type SyncStripePaymentSettlementsForAccountParams = {
  supabase: any;
  stripe?: Pick<Stripe, 'charges' | 'balanceTransactions' | 'payouts'>;
  actorUserId?: string | null;
  internalUser?: InternalUserRow | null;
  accountOwnerUserId: string;
  dateFrom: string | Date;
  dateTo: string | Date;
  paymentId?: string | null;
  chargeId?: string | null;
  dryRun?: boolean;
  now?: Date;
  syncPaymentSettlementForPayment?: typeof syncStripePaymentSettlementForPayment;
};

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeDateInput(value: string | Date) {
  const date = value instanceof Date ? value : new Date(clean(value));
  if (!Number.isFinite(date.getTime())) return null;
  return date;
}

function iso(value: Date) {
  return value.toISOString();
}

function isStripeLikePayment(row: SettlementSyncPaymentRow) {
  return (
    clean(row.payment_method) === 'card_stripe_online' ||
    clean(row.processor_name).toLowerCase() === 'stripe' ||
    clean(row.stripe_event_id).length > 0 ||
    clean(row.stripe_checkout_session_id).length > 0 ||
    clean(row.stripe_payment_intent_id).length > 0 ||
    clean(row.processor_charge_id).length > 0
  );
}

function resolveChargeId(row: SettlementSyncPaymentRow) {
  const processorChargeId = clean(row.processor_charge_id);
  if (processorChargeId) return processorChargeId;

  const reference = clean(row.processor_payment_reference);
  if (/^(ch|py)_[A-Za-z0-9_]+$/.test(reference)) return reference;

  return '';
}

function increment(summary: StripeSettlementSyncSummary, code: string) {
  summary.perCodeCounts[code] = (summary.perCodeCounts[code] ?? 0) + 1;
}

function pushDetail(
  summary: StripeSettlementSyncSummary,
  row: SettlementSyncPaymentRow | null,
  detail: Omit<StripeSettlementSyncRowDetail, 'paymentId' | 'invoiceNumber' | 'chargeId'> & {
    chargeId?: string | null;
  },
) {
  const chargeId = detail.chargeId ?? (row ? resolveChargeId(row) : null);
  summary.details.push({
    paymentId: clean(row?.id) || null,
    invoiceNumber: clean(row?.internal_invoices?.invoice_number) || null,
    chargeId: clean(chargeId) || null,
    status: detail.status,
    code: detail.code,
    reason: detail.reason,
    settlementId: detail.settlementId,
  });
  increment(summary, detail.code);
}

function isWithinDateRange(row: SettlementSyncPaymentRow, dateFrom: Date, dateTo: Date) {
  const paymentTimestamp = normalizeDateInput(row.stripe_charged_at ?? row.paid_at ?? row.created_at ?? '');
  if (!paymentTimestamp) return false;
  return paymentTimestamp.getTime() >= dateFrom.getTime() && paymentTimestamp.getTime() <= dateTo.getTime();
}

function assertAuthorized(params: {
  actorUserId?: string | null;
  internalUser?: InternalUserRow | null;
  accountOwnerUserId: string;
}) {
  if (!params.actorUserId || !params.internalUser?.is_active) {
    throw new Error('Internal authenticated user required for settlement sync.');
  }

  if (
    !canExportFinancialData({
      actorUserId: params.actorUserId,
      internalUser: params.internalUser,
      resourceAccountOwnerUserId: params.accountOwnerUserId,
    })
  ) {
    throw new Error('Owner/Admin/Billing financial authority required for settlement sync.');
  }
}

async function loadPaymentRows(params: {
  supabase: any;
  accountOwnerUserId: string;
  dateFromIso: string;
  dateToIso: string;
  paymentId?: string | null;
  chargeId?: string | null;
}) {
  let query = params.supabase
    .from('internal_invoice_payments')
    .select(
      [
        'id',
        'account_owner_user_id',
        'invoice_id',
        'job_id',
        'payment_status',
        'payment_method',
        'amount_cents',
        'paid_at',
        'stripe_charged_at',
        'created_at',
        'processor_name',
        'processor_payment_reference',
        'processor_charge_id',
        'stripe_event_id',
        'stripe_checkout_session_id',
        'stripe_payment_intent_id',
        'internal_invoices(invoice_number)',
      ].join(', '),
    )
    .eq('account_owner_user_id', params.accountOwnerUserId)
    .or(
      `and(stripe_charged_at.gte.${params.dateFromIso},stripe_charged_at.lte.${params.dateToIso}),` +
      `and(paid_at.gte.${params.dateFromIso},paid_at.lte.${params.dateToIso}),` +
      `and(created_at.gte.${params.dateFromIso},created_at.lte.${params.dateToIso})`,
    );

  const paymentId = clean(params.paymentId);
  if (paymentId) query = query.eq('id', paymentId);

  const chargeId = clean(params.chargeId);
  if (chargeId) query = query.or(`processor_charge_id.eq.${chargeId},processor_payment_reference.eq.${chargeId}`);

  const { data, error } = await query.order('paid_at', { ascending: true });
  if (error) throw new Error(error.message ?? 'Failed to load settlement sync payment candidates.');
  return (data ?? []) as SettlementSyncPaymentRow[];
}

async function loadExistingSyncedSettlementIds(params: {
  supabase: any;
  accountOwnerUserId: string;
  paymentIds: string[];
}) {
  if (params.paymentIds.length === 0) return new Map<string, ExistingSettlementRow>();

  const { data, error } = await params.supabase
    .from('stripe_payment_settlements')
    .select('id, internal_invoice_payment_id, sync_status, stripe_payout_id, payout_status')
    .eq('account_owner_user_id', params.accountOwnerUserId)
    .in('internal_invoice_payment_id', params.paymentIds);

  if (error) throw new Error(error.message ?? 'Failed to load existing Stripe payment settlements.');

  const existingByPaymentId = new Map<string, ExistingSettlementRow>();
  for (const row of (data ?? []) as ExistingSettlementRow[]) {
    const paymentId = clean(row.internal_invoice_payment_id);
    if (paymentId) {
      existingByPaymentId.set(paymentId, row);
    }
  }
  return existingByPaymentId;
}

export async function syncStripePaymentSettlementsForAccount(
  params: SyncStripePaymentSettlementsForAccountParams,
): Promise<StripeSettlementSyncSummary> {
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  if (!accountOwnerUserId) throw new Error('accountOwnerUserId is required.');

  assertAuthorized({
    actorUserId: clean(params.actorUserId),
    internalUser: params.internalUser,
    accountOwnerUserId,
  });

  const dateFrom = normalizeDateInput(params.dateFrom);
  const dateTo = normalizeDateInput(params.dateTo);
  if (!dateFrom || !dateTo) throw new Error('dateFrom and dateTo are required ISO-compatible dates.');
  if (dateFrom.getTime() > dateTo.getTime()) throw new Error('dateFrom must be before dateTo.');

  const dryRun = params.dryRun !== false;
  const summary: StripeSettlementSyncSummary = {
    dryRun,
    accountOwnerUserId,
    dateFrom: iso(dateFrom),
    dateTo: iso(dateTo),
    evaluated: 0,
    eligible: 0,
    synced: 0,
    skipped: 0,
    failed: 0,
    unmatched: 0,
    alreadySynced: 0,
    perCodeCounts: {},
    details: [],
  };

  const rows = await loadPaymentRows({
    supabase: params.supabase,
    accountOwnerUserId,
    dateFromIso: summary.dateFrom,
    dateToIso: summary.dateTo,
    paymentId: params.paymentId,
    chargeId: params.chargeId,
  });

  summary.evaluated = rows.length;

  const existingByPaymentId = await loadExistingSyncedSettlementIds({
    supabase: params.supabase,
    accountOwnerUserId,
    paymentIds: rows.map((row) => clean(row.id)).filter(Boolean),
  });

  let readiness: Awaited<ReturnType<typeof resolveTenantStripeConnectReadiness>>;
  try {
    readiness = await resolveTenantStripeConnectReadiness(accountOwnerUserId, params.supabase);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resolve connected account readiness.';
    for (const row of rows) {
      summary.skipped += 1;
      pushDetail(summary, row, {
        status: 'skipped',
        code: 'connected_account_not_ready',
        reason: message,
        settlementId: null,
      });
    }
    return summary;
  }

  const connectedAccountId = clean(readiness.connectedAccountId);
  const syncOne = params.syncPaymentSettlementForPayment ?? syncStripePaymentSettlementForPayment;

  for (const row of rows) {
    const paymentId = clean(row.id);
    const chargeId = resolveChargeId(row);

    if (!isWithinDateRange(row, dateFrom, dateTo)) {
      summary.skipped += 1;
      pushDetail(summary, row, {
        status: 'skipped',
        code: 'outside_date_range',
        reason: 'Payment charged/paid timestamp is outside the requested settlement sync date range.',
        settlementId: null,
        chargeId,
      });
      continue;
    }

    if (clean(row.payment_status).toLowerCase() !== 'recorded') {
      summary.skipped += 1;
      pushDetail(summary, row, {
        status: 'skipped',
        code: 'non_recorded_payment',
        reason: 'Only recorded payment rows can be evaluated for Stripe settlement sync.',
        settlementId: null,
        chargeId,
      });
      continue;
    }

    if (!isStripeLikePayment(row)) {
      summary.skipped += 1;
      pushDetail(summary, row, {
        status: 'skipped',
        code: 'non_stripe_payment',
        reason: 'Manual or off-platform payment rows are outside Stripe settlement sync.',
        settlementId: null,
        chargeId,
      });
      continue;
    }

    if (!chargeId) {
      summary.skipped += 1;
      pushDetail(summary, row, {
        status: 'skipped',
        code: 'missing_charge_id',
        reason: 'Payment row does not have a usable Stripe charge id.',
        settlementId: null,
        chargeId,
      });
      continue;
    }

    if (!connectedAccountId) {
      summary.skipped += 1;
      pushDetail(summary, row, {
        status: 'skipped',
        code: 'missing_connected_account',
        reason: 'Tenant is missing a Stripe connected account id.',
        settlementId: null,
        chargeId,
      });
      continue;
    }

    if (!readiness.isReady) {
      summary.skipped += 1;
      pushDetail(summary, row, {
        status: 'skipped',
        code: 'connected_account_not_ready',
        reason: 'Tenant connected account is not ready for settlement sync.',
        settlementId: null,
        chargeId,
      });
      continue;
    }

    const existing = existingByPaymentId.get(paymentId);
    const existingIsFinal = existing
      && clean(existing.sync_status).toLowerCase() === 'synced'
      && Boolean(clean(existing.stripe_payout_id))
      && ['paid', 'complete'].includes(clean(existing.payout_status).toLowerCase());
    if (existingIsFinal) {
      summary.skipped += 1;
      summary.alreadySynced += 1;
      pushDetail(summary, row, {
        status: 'skipped',
        code: 'already_synced',
        reason: 'A synced settlement row already exists for this payment.',
        settlementId: clean(existing.id) || null,
        chargeId,
      });
      continue;
    }

    summary.eligible += 1;

    if (dryRun) {
      summary.skipped += 1;
      pushDetail(summary, row, {
        status: 'eligible',
        code: 'dry_run_only',
        reason: 'Eligible for settlement sync; dry-run did not call Stripe or write settlements.',
        settlementId: null,
        chargeId,
      });
      continue;
    }

    if (!params.stripe) {
      summary.failed += 1;
      pushDetail(summary, row, {
        status: 'failed',
        code: 'missing_stripe_client',
        reason: 'Commit mode requires a Stripe client.',
        settlementId: null,
        chargeId,
      });
      continue;
    }

    try {
      const result = await syncOne({
        supabase: params.supabase,
        stripe: params.stripe,
        accountOwnerUserId,
        internalInvoicePaymentId: paymentId,
        now: params.now,
      });

      if (result.status === 'synced') summary.synced += 1;
      else if (result.status === 'failed') summary.failed += 1;
      else if (result.status === 'unmatched') summary.unmatched += 1;
      else summary.skipped += 1;

      pushDetail(summary, row, {
        status: result.status === 'synced' ? 'synced' : result.status === 'failed' ? 'failed' : 'skipped',
        code: result.code,
        reason: result.reason,
        settlementId: result.settlementId,
        chargeId,
      });
    } catch (error) {
      summary.failed += 1;
      pushDetail(summary, row, {
        status: 'failed',
        code: 'helper_exception',
        reason: error instanceof Error ? error.message : 'Settlement sync helper failed.',
        settlementId: null,
        chargeId,
      });
    }
  }

  return summary;
}

function formString(formData: FormData, key: string) {
  return clean(formData.get(key));
}

export async function syncStripePaymentSettlementsForAccountFromForm(formData: FormData) {
  const authClient = await createClient();
  const { userId, internalUser } = await requireInternalUser({ supabase: authClient });
  // The settlement table intentionally has SELECT-only authenticated RLS. After
  // authority and account scope are proven above, use the server-only admin
  // client for the explicitly scoped reconciliation read/upsert path.
  const supabase = createAdminClient();

  const dryRun = formString(formData, 'commit') !== '1';
  const stripe = dryRun ? undefined : getStripeServerClient();
  const dateFrom = formString(formData, 'date_from');
  const dateTo = formString(formData, 'date_to');

  const result = await syncStripePaymentSettlementsForAccount({
    supabase,
    stripe,
    actorUserId: userId,
    internalUser,
    accountOwnerUserId: formString(formData, 'account_owner_user_id'),
    dateFrom: /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? `${dateFrom}T00:00:00.000Z` : dateFrom,
    dateTo: /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? `${dateTo}T23:59:59.999Z` : dateTo,
    paymentId: formString(formData, 'payment_id') || null,
    chargeId: formString(formData, 'charge_id') || null,
    dryRun,
  });
  if (!dryRun && result.synced > 0) {
    revalidatePath('/reports/deposits');
    revalidatePath('/reports/deposits/[payoutId]', 'page');
  }
  return result;
}
