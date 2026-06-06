'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { requireInternalUser } from '@/lib/auth/internal-user';
import { loadScopedInternalJobForMutation } from '@/lib/auth/internal-job-scope';
import { resolveFieldBillingCapabilities } from '@/lib/auth/field-billing-access';
import { loadFieldBillingExplicitCapabilitiesForUser } from '@/lib/auth/internal-user-access-capabilities';
import {
  canRecordInvoicePayment,
  requireInvoicePaymentRecordAccessOrRedirect,
  requireTenantInvoicePaymentLinkAccessOrRedirect,
} from '@/lib/auth/financial-access';
import { resolveBillingModeByAccountOwnerId } from '@/lib/business/internal-business-profile';
import { resolveOperationalMutationEntitlementAccess } from '@/lib/business/platform-entitlement';
import { resolveInternalInvoiceById, resolveInternalInvoiceByJobId } from '@/lib/business/internal-invoice';
import {
  createTenantInvoiceCheckoutSession,
  INTERNAL_INVOICE_PAYMENT_METHODS,
  resolveInvoiceCollectedPaymentSummary,
} from '@/lib/business/internal-invoice-payments';
import { upsertInvoicePaymentAllocationForPaymentRow } from '@/lib/business/payment-allocations';
import { insertJobEvent } from '@/lib/actions/job-actions';
import {
  type TenantInvoiceCheckoutSessionActionState,
  INITIAL_TENANT_INVOICE_CHECKOUT_SESSION_ACTION_STATE,
} from '@/lib/actions/internal-invoice-payment-actions-state';

const INTERNAL_INVOICE_PANEL_HASH = 'internal-invoice-panel';

async function loadPaymentActionExplicitFieldBillingCapabilities(params: {
  supabase: any;
  internalUser: { account_owner_user_id?: string | null; user_id?: string | null };
}) {
  return loadFieldBillingExplicitCapabilitiesForUser({
    supabase: params.supabase,
    accountOwnerUserId: params.internalUser.account_owner_user_id,
    internalUserId: params.internalUser.user_id,
  });
}

function getTrimmedString(value: FormDataEntryValue | null | undefined) {
  return String(value ?? '').trim();
}

function getOptionalText(value: FormDataEntryValue | null | undefined) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : null;
}

function buildJobDetailHref(jobId: string, tab: string, banner: string) {
  const safeTab = String(tab ?? '').trim() || 'info';
  return `/jobs/${jobId}?tab=${safeTab}&banner=${banner}#${INTERNAL_INVOICE_PANEL_HASH}`;
}

function buildInternalInvoiceReturnHref(jobId: string, tab: string, banner: string, returnTo?: string | null) {
  const fallback = buildJobDetailHref(jobId, tab, banner);
  const raw = String(returnTo ?? '').trim();
  if (!raw) return fallback;

  try {
    const parsed = new URL(raw, 'https://app.local');
    const allowedPaths = new Set([
      `/jobs/${jobId}`,
      `/jobs/${jobId}/invoice`,
      '/ops/closeout-queue',
      '/reports/payment-reconciliation',
    ]);
    if (!allowedPaths.has(parsed.pathname)) return fallback;

    parsed.searchParams.set('banner', banner);
    if (!parsed.hash && parsed.pathname.endsWith('/invoice')) {
      parsed.hash = 'invoice-workspace';
    }

    if (!parsed.hash && parsed.pathname === `/jobs/${jobId}`) {
      parsed.hash = INTERNAL_INVOICE_PANEL_HASH;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

function buildInternalInvoiceCheckoutReturnHref(params: {
  jobId: string;
  tab: string;
  banner: string;
  returnTo?: string | null;
  checkoutSessionId?: string | null;
  checkoutSessionUrl?: string | null;
}) {
  const baseHref = buildInternalInvoiceReturnHref(
    params.jobId,
    params.tab,
    params.banner,
    params.returnTo,
  );

  try {
    const parsed = new URL(baseHref, 'https://app.local');
    const checkoutSessionId = String(params.checkoutSessionId ?? '').trim();
    const checkoutSessionUrl = String(params.checkoutSessionUrl ?? '').trim();

    if (checkoutSessionId) {
      parsed.searchParams.set('checkout_session_id', checkoutSessionId);
    }

    if (checkoutSessionUrl) {
      parsed.searchParams.set('checkout_session_url', checkoutSessionUrl);
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return baseHref;
  }
}

function mapTenantInvoiceCheckoutHelperErrorToBanner(error: unknown) {
  const message = String(error instanceof Error ? error.message : error ?? '').trim().toLowerCase();

  if (message.includes('issued')) {
    return 'internal_invoice_payment_requires_issued';
  }

  if (message.includes('greater than zero') || message.includes('positive balance')) {
    return 'internal_invoice_payment_no_balance_due';
  }

  if (message.includes('not ready') || message.includes('stripe connect')) {
    return 'internal_invoice_payment_connect_not_ready';
  }

  return null;
}

function parseMoneyToCents(raw: string) {
  const normalized = String(raw ?? '').trim();
  if (!normalized || !/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error('Payment amount must be a valid number.');
  }

  const [wholePart, decimalPart = ''] = normalized.split('.');
  const cents = Number(wholePart) * 100 + Number(decimalPart.padEnd(2, '0').slice(0, 2));

  if (!Number.isFinite(cents) || cents <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }

  return cents;
}

function normalizePaymentMethod(value: FormDataEntryValue | null | undefined) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return INTERNAL_INVOICE_PAYMENT_METHODS.includes(normalized as any)
    ? (normalized as (typeof INTERNAL_INVOICE_PAYMENT_METHODS)[number])
    : null;
}

function normalizeFieldReportedNonCardMethod(value: FormDataEntryValue | null | undefined) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'check') return 'check';
  if (normalized === 'cash') return 'cash';
  if (normalized === 'other') return 'other';
  return null;
}

function normalizeOpenFieldPaymentReportStatus(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'reported') return 'reported';
  if (normalized === 'under_review') return 'under_review';
  if (normalized === 'needs_correction') return 'needs_correction';
  return null;
}

function normalizeTerminalFieldPaymentReportStatus(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'verified') return 'verified';
  if (normalized === 'rejected') return 'rejected';
  if (normalized === 'voided') return 'voided';
  if (normalized === 'corrected') return 'corrected';
  return null;
}

async function createFinalManualInvoicePaymentTruthRecord(params: {
  supabase: any;
  accountOwnerUserId: string;
  invoiceId: string;
  jobId: string;
  method: (typeof INTERNAL_INVOICE_PAYMENT_METHODS)[number];
  amountCents: number;
  receivedReference?: string | null;
  notes?: string | null;
  recordedByUserId: string;
}) {
  const { data: insertedPayment, error: insertErr } = await params.supabase
    .from('internal_invoice_payments')
    .insert({
      account_owner_user_id: params.accountOwnerUserId,
      invoice_id: params.invoiceId,
      job_id: params.jobId,
      payment_status: 'recorded',
      payment_method: params.method,
      amount_cents: params.amountCents,
      paid_at: new Date().toISOString(),
      received_reference: params.receivedReference ?? null,
      notes: params.notes ?? null,
      recorded_by_user_id: params.recordedByUserId,
    })
    .select('id')
    .single();

  if (insertErr) throw insertErr;

  const paymentId = String(insertedPayment?.id ?? '').trim();
  if (!paymentId) {
    throw new Error('Failed to create final payment truth row.');
  }

  const allocationUpsertResult = await upsertInvoicePaymentAllocationForPaymentRow({
    supabase: params.supabase,
    paymentRow: {
      id: paymentId,
      account_owner_user_id: params.accountOwnerUserId,
      invoice_id: params.invoiceId,
      amount_cents: params.amountCents,
      payment_status: 'recorded',
    },
  });

  if (!allocationUpsertResult.ok) {
    console.warn('Manual payment allocation dual-write failed after payment row success', {
      paymentId,
      invoiceId: params.invoiceId,
      jobId: params.jobId,
      allocationStatus: allocationUpsertResult.allocationStatus,
      allocationResultStatus: allocationUpsertResult.status,
      allocationReason: allocationUpsertResult.reason,
    });
  }

  return { paymentId };
}

function revalidateFieldPaymentReconciliationVisibilityPaths(jobId: string) {
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/invoice`);
  revalidatePath('/jobs');
  revalidatePath('/ops');
  revalidatePath('/ops/closeout-queue');
  revalidatePath('/reports/invoices');
  revalidatePath('/reports/payments');
  revalidatePath('/reports/payment-reconciliation');
}

function isStripeSourcedPaymentRow(row: {
  payment_method?: string | null;
  processor_name?: string | null;
  stripe_event_id?: string | null;
  stripe_checkout_session_id?: string | null;
  stripe_payment_intent_id?: string | null;
}) {
  return (
    String(row.payment_method ?? '').trim() === 'card_stripe_online' ||
    String(row.processor_name ?? '').trim().toLowerCase() === 'stripe' ||
    String(row.stripe_event_id ?? '').trim().length > 0 ||
    String(row.stripe_checkout_session_id ?? '').trim().length > 0 ||
    String(row.stripe_payment_intent_id ?? '').trim().length > 0
  );
}

async function requireOperationalInternalInvoicePaymentEntitlementAccessOrRedirect(params: {
  supabase: any;
  accountOwnerUserId: string | null | undefined;
}) {
  const access = await resolveOperationalMutationEntitlementAccess({
    accountOwnerUserId: String(params.accountOwnerUserId ?? '').trim(),
    supabase: params.supabase,
  });

  if (access.authorized) {
    return;
  }

  const search = new URLSearchParams({
    err: 'entitlement_blocked',
    reason: access.reason,
  });
  redirect(`/ops/admin/company-profile?${search.toString()}`);
}

export async function recordInternalInvoicePaymentFromForm(formData: FormData) {
  const jobId = getTrimmedString(formData.get('job_id'));
  const invoiceIdInput = getTrimmedString(formData.get('invoice_id'));
  const tab = getTrimmedString(formData.get('tab')) || 'info';
  const returnTo = getTrimmedString(formData.get('return_to'));

  if (!jobId) {
    throw new Error('Job ID is required.');
  }

  const supabase = await createClient();
  const { userId, internalUser } = await requireInternalUser({ supabase });

  const scopedJob = await loadScopedInternalJobForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
    select: 'id',
  });

  if (!scopedJob?.id) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo));
  }

  requireInvoicePaymentRecordAccessOrRedirect({
    actorUserId: userId,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    redirectTo: buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo),
  });

  await requireOperationalInternalInvoicePaymentEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const billingMode = await resolveBillingModeByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  if (billingMode !== 'internal_invoicing') {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoicing_billing_pending', returnTo));
  }

  const invoice = invoiceIdInput
    ? await resolveInternalInvoiceById({
        supabase,
        invoiceId: invoiceIdInput,
      })
    : await resolveInternalInvoiceByJobId({
        supabase,
        jobId,
      });

  if (!invoice) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoice_missing', returnTo));
  }

  if (invoice.account_owner_user_id !== internalUser.account_owner_user_id || invoice.job_id !== jobId) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo));
  }

  if (invoice.status !== 'issued') {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoice_payment_requires_issued', returnTo));
  }

  const method = normalizePaymentMethod(formData.get('payment_method'));
  if (!method) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoice_payment_method_required', returnTo));
  }

  let amountCents = 0;
  try {
    amountCents = parseMoneyToCents(getTrimmedString(formData.get('payment_amount')));
  } catch {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoice_payment_invalid_amount', returnTo));
  }

  const summary = await resolveInvoiceCollectedPaymentSummary(
    internalUser.account_owner_user_id,
    invoice.id,
    supabase,
  );

  if (summary.balanceDueCents <= 0 || amountCents > summary.balanceDueCents) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoice_payment_overpay_denied', returnTo));
  }

  const paymentTruth = await createFinalManualInvoicePaymentTruthRecord({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    invoiceId: invoice.id,
    jobId,
    method,
    amountCents,
    receivedReference: getOptionalText(formData.get('received_reference')),
    notes: getOptionalText(formData.get('notes')),
    recordedByUserId: userId,
  });

  await insertJobEvent({
    supabase,
    jobId,
    event_type: 'payment_recorded',
    userId,
    meta: {
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      payment_id: paymentTruth.paymentId,
      payment_status: 'recorded',
      payment_method: method,
      amount_cents: amountCents,
      amount_display: (amountCents / 100).toFixed(2),
      source: 'manual_off_platform',
    },
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/invoice`);
  revalidatePath('/jobs');
  revalidatePath('/ops');
  revalidatePath('/reports/invoices');

  redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoice_payment_recorded', returnTo));
}

export async function createTenantInvoiceCheckoutSessionFromForm(formData: FormData) {
  const jobId = getTrimmedString(formData.get('job_id'));
  const invoiceIdInput = getTrimmedString(formData.get('invoice_id'));
  const tab = getTrimmedString(formData.get('tab')) || 'info';
  const returnTo = getTrimmedString(formData.get('return_to'));
  const noRedirect = getTrimmedString(formData.get('no_redirect')) === '1';
  const redirectToCheckout = getTrimmedString(formData.get('redirect_to_checkout')) === '1';

  if (!jobId) {
    throw new Error('Job ID is required.');
  }

  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });

  const scopedJob = await loadScopedInternalJobForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
    select: 'id',
  });

  if (!scopedJob?.id) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo));
  }

  requireTenantInvoicePaymentLinkAccessOrRedirect({
    actorUserId: internalUser.user_id,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    redirectTo: buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo),
  });

  await requireOperationalInternalInvoicePaymentEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const billingMode = await resolveBillingModeByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  if (billingMode !== 'internal_invoicing') {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoicing_billing_pending', returnTo));
  }

  const invoice = invoiceIdInput
    ? await resolveInternalInvoiceById({
        supabase,
        invoiceId: invoiceIdInput,
      })
    : await resolveInternalInvoiceByJobId({
        supabase,
        jobId,
      });

  if (!invoice) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoice_missing', returnTo));
  }

  if (invoice.account_owner_user_id !== internalUser.account_owner_user_id || invoice.job_id !== jobId) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo));
  }

  try {
    const checkoutSession = await createTenantInvoiceCheckoutSession({
      accountOwnerUserId: internalUser.account_owner_user_id,
      jobId,
      invoiceId: invoice.id,
      supabase,
    });

    revalidatePath(`/jobs/${jobId}`);
    revalidatePath(`/jobs/${jobId}/invoice`);
    revalidatePath('/jobs');
    revalidatePath('/ops');
    revalidatePath('/reports/invoices');

    if (noRedirect) {
      return {
        ok: true,
        checkoutSessionId: checkoutSession.checkoutSessionId,
        checkoutSessionUrl: checkoutSession.checkoutSessionUrl,
      } as const;
    }

    if (redirectToCheckout) {
      redirect(checkoutSession.checkoutSessionUrl);
    }

    redirect(
      buildInternalInvoiceCheckoutReturnHref({
        jobId,
        tab,
        banner: 'internal_invoice_payment_checkout_session_created',
        returnTo,
        checkoutSessionId: checkoutSession.checkoutSessionId,
        checkoutSessionUrl: checkoutSession.checkoutSessionUrl,
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('REDIRECT:')) {
      throw error;
    }

    const mappedBanner = mapTenantInvoiceCheckoutHelperErrorToBanner(error);
    if (mappedBanner) {
      redirect(buildInternalInvoiceReturnHref(jobId, tab, mappedBanner, returnTo));
    }

    throw error;
  }
}

export async function reverseInternalInvoicePaymentFromForm(formData: FormData) {
  const jobId = getTrimmedString(formData.get('job_id'));
  const paymentId = getTrimmedString(formData.get('payment_id'));
  const tab = getTrimmedString(formData.get('tab')) || 'info';
  const returnTo = getTrimmedString(formData.get('return_to'));
  const reversalReason = getTrimmedString(formData.get('reversal_reason'));

  if (!jobId) {
    throw new Error('Job ID is required.');
  }

  if (!paymentId) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoice_payment_reversal_not_found', returnTo));
  }

  if (!reversalReason) {
    redirect(
      buildInternalInvoiceReturnHref(
        jobId,
        tab,
        'internal_invoice_payment_reversal_reason_required',
        returnTo,
      ),
    );
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  const { userId, internalUser } = await requireInternalUser({ supabase });

  const scopedJob = await loadScopedInternalJobForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
    select: 'id',
  });

  if (!scopedJob?.id) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo));
  }

  requireInvoicePaymentRecordAccessOrRedirect({
    actorUserId: userId,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    redirectTo: buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo),
  });

  await requireOperationalInternalInvoicePaymentEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const billingMode = await resolveBillingModeByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  if (billingMode !== 'internal_invoicing') {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoicing_billing_pending', returnTo));
  }

  const invoice = await resolveInternalInvoiceByJobId({
    supabase,
    jobId,
  });

  if (!invoice) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoice_missing', returnTo));
  }

  if (invoice.account_owner_user_id !== internalUser.account_owner_user_id || invoice.job_id !== jobId) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo));
  }

  const { data: paymentRowRaw, error: paymentErr } = await admin
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
        'processor_name',
        'stripe_event_id',
        'stripe_checkout_session_id',
        'stripe_payment_intent_id',
      ].join(', '),
    )
    .eq('id', paymentId)
    .maybeSingle();

  if (paymentErr) {
    throw paymentErr;
  }

  if (!paymentRowRaw) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoice_payment_reversal_not_found', returnTo));
  }

  const paymentRow = paymentRowRaw as unknown as {
    id: string;
    account_owner_user_id: string;
    invoice_id: string;
    job_id: string;
    payment_status: string;
    payment_method: string | null;
    amount_cents: number;
    processor_name: string | null;
    stripe_event_id: string | null;
    stripe_checkout_session_id: string | null;
    stripe_payment_intent_id: string | null;
  };

  if (
    paymentRow.account_owner_user_id !== internalUser.account_owner_user_id ||
    paymentRow.job_id !== jobId ||
    paymentRow.invoice_id !== invoice.id
  ) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo));
  }

  const paymentStatus = String(paymentRow.payment_status ?? '').trim().toLowerCase();
  if (paymentStatus === 'reversed') {
    redirect(
      buildInternalInvoiceReturnHref(
        jobId,
        tab,
        'internal_invoice_payment_reversal_already_reversed',
        returnTo,
      ),
    );
  }

  if (paymentStatus === 'failed') {
    redirect(
      buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoice_payment_reversal_failed_blocked', returnTo),
    );
  }

  if (paymentStatus !== 'recorded') {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoice_payment_reversal_not_recorded', returnTo));
  }

  if (isStripeSourcedPaymentRow(paymentRow)) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoice_payment_reversal_online_blocked', returnTo));
  }

  const { data: updatedPayment, error: updateErr } = await admin
    .from('internal_invoice_payments')
    .update({
      payment_status: 'reversed',
      reversed_at: new Date().toISOString(),
      reversed_by_user_id: userId,
      reversal_reason: reversalReason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', paymentId)
    .eq('account_owner_user_id', internalUser.account_owner_user_id)
    .eq('job_id', jobId)
    .eq('invoice_id', invoice.id)
    .eq('payment_status', 'recorded')
    .select('id, amount_cents')
    .single();

  if (updateErr) {
    throw updateErr;
  }

  const allocationUpsertResult = await upsertInvoicePaymentAllocationForPaymentRow({
    supabase: admin,
    paymentRow: {
      id: String(updatedPayment?.id ?? paymentId).trim(),
      account_owner_user_id: internalUser.account_owner_user_id,
      invoice_id: invoice.id,
      amount_cents: Number(updatedPayment?.amount_cents ?? paymentRow.amount_cents ?? 0),
      payment_status: 'reversed',
    },
  });

  if (!allocationUpsertResult.ok) {
    console.warn('Manual payment reversal allocation dual-write failed after payment row success', {
      paymentId: updatedPayment?.id ?? paymentId,
      invoiceId: invoice.id,
      jobId,
      allocationStatus: allocationUpsertResult.allocationStatus,
      allocationResultStatus: allocationUpsertResult.status,
      allocationReason: allocationUpsertResult.reason,
    });
  }

  await insertJobEvent({
    supabase,
    jobId,
    event_type: 'payment_reversed',
    userId,
    meta: {
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      payment_id: updatedPayment?.id ?? paymentId,
      amount_cents: Number(updatedPayment?.amount_cents ?? paymentRow.amount_cents ?? 0),
      reason: reversalReason,
      source: 'manual_reversal',
    },
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/invoice`);
  revalidatePath('/jobs');
  revalidatePath('/ops');
  revalidatePath('/reports/invoices');
  revalidatePath('/reports/payments');
  if (invoice.customer_id) {
    revalidatePath(`/customers/${invoice.customer_id}`);
  }

  redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoice_payment_reversed', returnTo));
}

export async function collectTenantInvoicePaymentNowFromForm(formData: FormData): Promise<void> {
  const forwardedFormData = new FormData();

  for (const [key, value] of formData.entries()) {
    forwardedFormData.set(key, value);
  }

  forwardedFormData.delete('no_redirect');
  forwardedFormData.set('redirect_to_checkout', '1');

  await createTenantInvoiceCheckoutSessionFromForm(forwardedFormData);
}

export async function collectIssuedInvoiceCardPaymentFromForm(formData: FormData): Promise<void> {
  const jobId = getTrimmedString(formData.get('job_id'));
  const invoiceIdInput = getTrimmedString(formData.get('invoice_id'));
  const tab = getTrimmedString(formData.get('tab')) || 'info';
  const returnTo = getTrimmedString(formData.get('return_to'));

  if (!jobId) {
    throw new Error('Job ID is required.');
  }

  const supabase = await createClient();
  const { userId, internalUser } = await requireInternalUser({ supabase });

  const scopedJob = await loadScopedInternalJobForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
    select: 'id',
  });

  if (!scopedJob?.id) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo));
  }

  const explicitFieldBillingCapabilities = await loadPaymentActionExplicitFieldBillingCapabilities({
    supabase,
    internalUser,
  });
  const fieldBillingCapabilities = resolveFieldBillingCapabilities({
    actorUserId: userId,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    explicitCapabilities: explicitFieldBillingCapabilities,
  });

  if (!fieldBillingCapabilities.can_collect_card_payment) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo));
  }

  await requireOperationalInternalInvoicePaymentEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const billingMode = await resolveBillingModeByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  if (billingMode !== 'internal_invoicing') {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoicing_billing_pending', returnTo));
  }

  const invoice = invoiceIdInput
    ? await resolveInternalInvoiceById({
        supabase,
        invoiceId: invoiceIdInput,
      })
    : await resolveInternalInvoiceByJobId({
        supabase,
        jobId,
      });

  if (!invoice) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoice_missing', returnTo));
  }

  if (invoice.account_owner_user_id !== internalUser.account_owner_user_id || invoice.job_id !== jobId) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo));
  }

  try {
    const checkoutSession = await createTenantInvoiceCheckoutSession({
      accountOwnerUserId: internalUser.account_owner_user_id,
      jobId,
      invoiceId: invoice.id,
      supabase,
    });

    revalidatePath(`/jobs/${jobId}`);
    revalidatePath(`/jobs/${jobId}/invoice`);
    revalidatePath('/jobs');
    revalidatePath('/ops');
    revalidatePath('/reports/invoices');

    redirect(checkoutSession.checkoutSessionUrl);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('REDIRECT:')) {
      throw error;
    }

    const mappedBanner = mapTenantInvoiceCheckoutHelperErrorToBanner(error);
    if (mappedBanner) {
      redirect(buildInternalInvoiceReturnHref(jobId, tab, mappedBanner, returnTo));
    }

    throw error;
  }
}

export async function reportNonCardFieldPaymentCollectionFromForm(formData: FormData): Promise<void> {
  const jobId = getTrimmedString(formData.get('job_id'));
  const invoiceIdInput = getTrimmedString(formData.get('invoice_id'));
  const tab = getTrimmedString(formData.get('tab')) || 'info';
  const returnTo = getTrimmedString(formData.get('return_to'));

  if (!jobId) {
    throw new Error('Job ID is required.');
  }

  const supabase = await createClient();
  const { userId, internalUser } = await requireInternalUser({ supabase });

  const scopedJob = await loadScopedInternalJobForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
    select: 'id',
  });

  if (!scopedJob?.id) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo));
  }

  const explicitFieldBillingCapabilities = await loadPaymentActionExplicitFieldBillingCapabilities({
    supabase,
    internalUser,
  });
  const fieldBillingCapabilities = resolveFieldBillingCapabilities({
    actorUserId: userId,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    explicitCapabilities: explicitFieldBillingCapabilities,
  });

  if (!fieldBillingCapabilities.can_report_non_card_collection) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo));
  }

  await requireOperationalInternalInvoicePaymentEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const billingMode = await resolveBillingModeByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  if (billingMode !== 'internal_invoicing') {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoicing_billing_pending', returnTo));
  }

  if (!invoiceIdInput) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'field_payment_report_invalid', returnTo));
  }

  const invoice = await resolveInternalInvoiceById({
    supabase,
    invoiceId: invoiceIdInput,
  });

  if (!invoice) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoice_missing', returnTo));
  }

  if (invoice.account_owner_user_id !== internalUser.account_owner_user_id || invoice.job_id !== jobId) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo));
  }

  if (invoice.status !== 'issued') {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'field_payment_report_requires_issued', returnTo));
  }

  const method = normalizeFieldReportedNonCardMethod(formData.get('payment_method'));
  if (!method) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'field_payment_report_method_invalid', returnTo));
  }

  let amountCents = 0;
  try {
    amountCents = parseMoneyToCents(getTrimmedString(formData.get('payment_amount')));
  } catch {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'field_payment_report_amount_invalid', returnTo));
  }

  const summary = await resolveInvoiceCollectedPaymentSummary(
    internalUser.account_owner_user_id,
    invoice.id,
    supabase,
  );

  if (summary.balanceDueCents <= 0) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'field_payment_report_no_balance_due', returnTo));
  }

  if (amountCents > summary.balanceDueCents) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'field_payment_report_overpay_denied', returnTo));
  }

  const { error: reportInsertError } = await supabase
    .from('field_payment_collection_reports')
    .insert({
      account_owner_user_id: internalUser.account_owner_user_id,
      job_id: jobId,
      internal_invoice_id: invoice.id,
      customer_id: invoice.customer_id,
      reported_by_user_id: userId,
      payment_method: method,
      amount_cents: amountCents,
      currency: 'usd',
      reference: getOptionalText(formData.get('reference')),
      note: getOptionalText(formData.get('note')),
      status: 'reported',
    });

  if (reportInsertError) {
    throw reportInsertError;
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/invoice`);
  revalidatePath('/jobs');
  revalidatePath('/ops');
  revalidatePath('/reports/invoices');

  redirect(buildInternalInvoiceReturnHref(jobId, tab, 'field_payment_reported', returnTo));
}

export async function verifyFieldPaymentCollectionReportFromForm(formData: FormData): Promise<void> {
  const jobId = getTrimmedString(formData.get('job_id'));
  const reportId =
    getTrimmedString(formData.get('field_payment_report_id')) || getTrimmedString(formData.get('report_id'));
  const selectedInvoiceId = getTrimmedString(formData.get('invoice_id'));
  const tab = getTrimmedString(formData.get('tab')) || 'info';
  const returnTo = getTrimmedString(formData.get('return_to'));

  if (!jobId || !reportId) {
    throw new Error('Job ID and report ID are required.');
  }

  const verificationNote = getOptionalText(formData.get('verification_note'));

  const supabase = await createClient();
  const admin = createAdminClient();
  const { userId, internalUser } = await requireInternalUser({ supabase });

  const scopedJob = await loadScopedInternalJobForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
    select: 'id',
  });

  if (!scopedJob?.id) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo));
  }

  const explicitFieldBillingCapabilities = await loadPaymentActionExplicitFieldBillingCapabilities({
    supabase,
    internalUser,
  });
  const fieldBillingCapabilities = resolveFieldBillingCapabilities({
    actorUserId: userId,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    explicitCapabilities: explicitFieldBillingCapabilities,
  });

  const hasVerificationAuthority =
    canRecordInvoicePayment({
      actorUserId: userId,
      internalUser,
      resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    }) || fieldBillingCapabilities.can_verify_non_card_collection;

  if (!hasVerificationAuthority) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo));
  }

  await requireOperationalInternalInvoicePaymentEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const billingMode = await resolveBillingModeByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  if (billingMode !== 'internal_invoicing') {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoicing_billing_pending', returnTo));
  }

  const { data: reportRowRaw, error: reportErr } = await admin
    .from('field_payment_collection_reports')
    .select(
      [
        'id',
        'account_owner_user_id',
        'job_id',
        'internal_invoice_id',
        'customer_id',
        'reported_by_user_id',
        'payment_method',
        'amount_cents',
        'reference',
        'note',
        'status',
      ].join(', '),
    )
    .eq('id', reportId)
    .maybeSingle();

  if (reportErr) {
    throw reportErr;
  }

  if (!reportRowRaw) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'field_payment_verification_invalid', returnTo));
  }

  const reportRow = reportRowRaw as unknown as {
    id: string;
    account_owner_user_id: string;
    job_id: string;
    internal_invoice_id: string;
    customer_id: string | null;
    reported_by_user_id: string;
    payment_method: string;
    amount_cents: number;
    reference: string | null;
    note: string | null;
    status: string;
  };

  if (
    reportRow.account_owner_user_id !== internalUser.account_owner_user_id ||
    reportRow.job_id !== jobId ||
    (selectedInvoiceId && reportRow.internal_invoice_id !== selectedInvoiceId)
  ) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo));
  }

  if (String(reportRow.reported_by_user_id ?? '').trim() === userId) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'field_payment_verification_self_denied', returnTo));
  }

  const openStatus = normalizeOpenFieldPaymentReportStatus(reportRow.status);
  if (!openStatus) {
    const terminalStatus = normalizeTerminalFieldPaymentReportStatus(reportRow.status);
    if (terminalStatus) {
      redirect(buildInternalInvoiceReturnHref(jobId, tab, 'field_payment_verification_terminal', returnTo));
    }
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'field_payment_verification_invalid', returnTo));
  }

  const method = normalizeFieldReportedNonCardMethod(reportRow.payment_method);
  if (!method) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'field_payment_verification_invalid', returnTo));
  }

  const invoice = await resolveInternalInvoiceById({
    supabase,
    invoiceId: reportRow.internal_invoice_id,
  });

  if (!invoice) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoice_missing', returnTo));
  }

  if (invoice.account_owner_user_id !== internalUser.account_owner_user_id || invoice.job_id !== jobId) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo));
  }

  if (invoice.status !== 'issued') {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'field_payment_verification_requires_issued', returnTo));
  }

  const summary = await resolveInvoiceCollectedPaymentSummary(
    internalUser.account_owner_user_id,
    invoice.id,
    supabase,
  );

  if (summary.balanceDueCents <= 0) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'field_payment_verification_no_balance_due', returnTo));
  }

  const reportAmountCents = Number(reportRow.amount_cents ?? 0);
  if (!Number.isFinite(reportAmountCents) || reportAmountCents <= 0) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'field_payment_verification_invalid', returnTo));
  }

  if (reportAmountCents > summary.balanceDueCents) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'field_payment_verification_overpay_denied', returnTo));
  }

  const paymentTruth = await createFinalManualInvoicePaymentTruthRecord({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    invoiceId: invoice.id,
    jobId,
    method,
    amountCents: reportAmountCents,
    receivedReference: getOptionalText(reportRow.reference),
    notes: getOptionalText(reportRow.note),
    recordedByUserId: userId,
  });

  const nowIso = new Date().toISOString();
  const { error: reportUpdateErr } = await admin
    .from('field_payment_collection_reports')
    .update({
      status: 'verified',
      verified_by_user_id: userId,
      verified_at: nowIso,
      verification_note: verificationNote,
      final_internal_invoice_payment_id: paymentTruth.paymentId,
      updated_at: nowIso,
    })
    .eq('id', reportId)
    .eq('account_owner_user_id', internalUser.account_owner_user_id)
    .eq('status', openStatus);

  if (reportUpdateErr) {
    throw reportUpdateErr;
  }

  await insertJobEvent({
    supabase,
    jobId,
    event_type: 'field_payment_collection_verified',
    userId,
    meta: {
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      field_payment_report_id: reportId,
      verified_status: 'verified',
      payment_id: paymentTruth.paymentId,
      payment_method: method,
      amount_cents: reportAmountCents,
      verification_note: verificationNote,
      source: 'field_payment_reconciliation',
    },
  });

  revalidateFieldPaymentReconciliationVisibilityPaths(jobId);

  redirect(buildInternalInvoiceReturnHref(jobId, tab, 'field_payment_verification_verified', returnTo));
}

export async function rejectFieldPaymentCollectionReportFromForm(formData: FormData): Promise<void> {
  const jobId = getTrimmedString(formData.get('job_id'));
  const reportId =
    getTrimmedString(formData.get('field_payment_report_id')) || getTrimmedString(formData.get('report_id'));
  const selectedInvoiceId = getTrimmedString(formData.get('invoice_id'));
  const tab = getTrimmedString(formData.get('tab')) || 'info';
  const returnTo = getTrimmedString(formData.get('return_to'));
  const rejectionReason = getTrimmedString(formData.get('rejection_reason'));

  if (!jobId || !reportId) {
    throw new Error('Job ID and report ID are required.');
  }

  if (!rejectionReason) {
    redirect(
      buildInternalInvoiceReturnHref(jobId, tab, 'field_payment_verification_rejection_reason_required', returnTo),
    );
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  const { userId, internalUser } = await requireInternalUser({ supabase });

  const scopedJob = await loadScopedInternalJobForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
    select: 'id',
  });

  if (!scopedJob?.id) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo));
  }

  const explicitFieldBillingCapabilities = await loadPaymentActionExplicitFieldBillingCapabilities({
    supabase,
    internalUser,
  });
  const fieldBillingCapabilities = resolveFieldBillingCapabilities({
    actorUserId: userId,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    explicitCapabilities: explicitFieldBillingCapabilities,
  });

  const hasVerificationAuthority =
    canRecordInvoicePayment({
      actorUserId: userId,
      internalUser,
      resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    }) || fieldBillingCapabilities.can_verify_non_card_collection;

  if (!hasVerificationAuthority) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo));
  }

  await requireOperationalInternalInvoicePaymentEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const billingMode = await resolveBillingModeByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  if (billingMode !== 'internal_invoicing') {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoicing_billing_pending', returnTo));
  }

  const { data: reportRowRaw, error: reportErr } = await admin
    .from('field_payment_collection_reports')
    .select(
      [
        'id',
        'account_owner_user_id',
        'job_id',
        'internal_invoice_id',
        'status',
      ].join(', '),
    )
    .eq('id', reportId)
    .maybeSingle();

  if (reportErr) {
    throw reportErr;
  }

  if (!reportRowRaw) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'field_payment_verification_invalid', returnTo));
  }

  const reportRow = reportRowRaw as unknown as {
    id: string;
    account_owner_user_id: string;
    job_id: string;
    internal_invoice_id: string;
    status: string;
  };

  if (
    reportRow.account_owner_user_id !== internalUser.account_owner_user_id ||
    reportRow.job_id !== jobId ||
    (selectedInvoiceId && reportRow.internal_invoice_id !== selectedInvoiceId)
  ) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo));
  }

  const openStatus = normalizeOpenFieldPaymentReportStatus(reportRow.status);
  if (!openStatus) {
    const terminalStatus = normalizeTerminalFieldPaymentReportStatus(reportRow.status);
    if (terminalStatus) {
      redirect(buildInternalInvoiceReturnHref(jobId, tab, 'field_payment_verification_terminal', returnTo));
    }
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'field_payment_verification_invalid', returnTo));
  }

  const nowIso = new Date().toISOString();
  const { error: reportUpdateErr } = await admin
    .from('field_payment_collection_reports')
    .update({
      status: 'rejected',
      rejected_by_user_id: userId,
      rejected_at: nowIso,
      rejection_reason: rejectionReason,
      updated_at: nowIso,
    })
    .eq('id', reportId)
    .eq('account_owner_user_id', internalUser.account_owner_user_id)
    .eq('status', openStatus);

  if (reportUpdateErr) {
    throw reportUpdateErr;
  }

  await insertJobEvent({
    supabase,
    jobId,
    event_type: 'field_payment_collection_rejected',
    userId,
    meta: {
      field_payment_report_id: reportId,
      rejected_status: 'rejected',
      rejection_reason: rejectionReason,
      source: 'field_payment_reconciliation',
    },
  });

  revalidateFieldPaymentReconciliationVisibilityPaths(jobId);

  redirect(buildInternalInvoiceReturnHref(jobId, tab, 'field_payment_verification_rejected', returnTo));
}

export type { TenantInvoiceCheckoutSessionActionState } from '@/lib/actions/internal-invoice-payment-actions-state';

export async function createTenantInvoiceCheckoutSessionFromFormState(
  _prevState: TenantInvoiceCheckoutSessionActionState,
  formData: FormData,
): Promise<TenantInvoiceCheckoutSessionActionState> {
  const forwardedFormData = new FormData();

  for (const [key, value] of formData.entries()) {
    forwardedFormData.set(key, value);
  }

  forwardedFormData.set('no_redirect', '1');

  const result = await createTenantInvoiceCheckoutSessionFromForm(forwardedFormData);

  if (!result || result.ok !== true) {
    return {
      ...INITIAL_TENANT_INVOICE_CHECKOUT_SESSION_ACTION_STATE,
      status: 'error',
      message: 'We could not create the customer payment link.',
    };
  }

  return {
    status: 'success',
    message: 'Customer payment link created.',
    checkoutSessionId: String(result.checkoutSessionId ?? '').trim() || null,
    checkoutSessionUrl: String(result.checkoutSessionUrl ?? '').trim() || null,
  };
}
