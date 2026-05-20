'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireInternalUser } from '@/lib/auth/internal-user';
import { loadScopedInternalJobForMutation } from '@/lib/auth/internal-job-scope';
import { resolveBillingModeByAccountOwnerId } from '@/lib/business/internal-business-profile';
import { resolveOperationalMutationEntitlementAccess } from '@/lib/business/platform-entitlement';
import { resolveInternalInvoiceByJobId } from '@/lib/business/internal-invoice';
import {
  createTenantInvoiceCheckoutSession,
  INTERNAL_INVOICE_PAYMENT_METHODS,
  resolveInvoiceCollectedPaymentSummary,
} from '@/lib/business/internal-invoice-payments';
import { insertJobEvent } from '@/lib/actions/job-actions';
import {
  type TenantInvoiceCheckoutSessionActionState,
  INITIAL_TENANT_INVOICE_CHECKOUT_SESSION_ACTION_STATE,
} from '@/lib/actions/internal-invoice-payment-actions-state';

const INTERNAL_INVOICE_PANEL_HASH = 'internal-invoice-panel';

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
    const allowedPaths = new Set([`/jobs/${jobId}`, `/jobs/${jobId}/invoice`]);
    if (!allowedPaths.has(parsed.pathname)) return fallback;

    parsed.searchParams.set('banner', banner);
    if (!parsed.hash) {
      parsed.hash = parsed.pathname.endsWith('/invoice') ? 'invoice-workspace' : INTERNAL_INVOICE_PANEL_HASH;
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

  const { data: insertedPayment, error: insertErr } = await supabase
    .from('internal_invoice_payments')
    .insert({
      account_owner_user_id: internalUser.account_owner_user_id,
      invoice_id: invoice.id,
      job_id: jobId,
      payment_status: 'recorded',
      payment_method: method,
      amount_cents: amountCents,
      paid_at: new Date().toISOString(),
      received_reference: getOptionalText(formData.get('received_reference')),
      notes: getOptionalText(formData.get('notes')),
      recorded_by_user_id: userId,
    })
    .select('id')
    .single();

  if (insertErr) throw insertErr;

  await insertJobEvent({
    supabase,
    jobId,
    event_type: 'payment_recorded',
    userId,
    meta: {
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      payment_id: insertedPayment?.id ?? null,
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

  if (invoiceIdInput && invoiceIdInput !== invoice.id) {
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
