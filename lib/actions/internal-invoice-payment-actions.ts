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
  INTERNAL_INVOICE_PAYMENT_METHODS,
  resolveInvoiceCollectedPaymentSummary,
} from '@/lib/business/internal-invoice-payments';
import { insertJobEvent } from '@/lib/actions/job-actions';

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
    redirect(buildJobDetailHref(jobId, tab, 'not_authorized'));
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
    redirect(buildJobDetailHref(jobId, tab, 'internal_invoicing_billing_pending'));
  }

  const invoice = await resolveInternalInvoiceByJobId({
    supabase,
    jobId,
  });

  if (!invoice) {
    redirect(buildJobDetailHref(jobId, tab, 'internal_invoice_missing'));
  }

  if (invoice.account_owner_user_id !== internalUser.account_owner_user_id || invoice.job_id !== jobId) {
    redirect(buildJobDetailHref(jobId, tab, 'not_authorized'));
  }

  if (invoice.status !== 'issued') {
    redirect(buildJobDetailHref(jobId, tab, 'internal_invoice_payment_requires_issued'));
  }

  const method = normalizePaymentMethod(formData.get('payment_method'));
  if (!method) {
    redirect(buildJobDetailHref(jobId, tab, 'internal_invoice_payment_method_required'));
  }

  let amountCents = 0;
  try {
    amountCents = parseMoneyToCents(getTrimmedString(formData.get('payment_amount')));
  } catch {
    redirect(buildJobDetailHref(jobId, tab, 'internal_invoice_payment_invalid_amount'));
  }

  const summary = await resolveInvoiceCollectedPaymentSummary(
    internalUser.account_owner_user_id,
    invoice.id,
    supabase,
  );

  if (summary.balanceDueCents <= 0 || amountCents > summary.balanceDueCents) {
    redirect(buildJobDetailHref(jobId, tab, 'internal_invoice_payment_overpay_denied'));
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
  revalidatePath('/jobs');
  revalidatePath('/ops');
  revalidatePath('/reports/invoices');

  redirect(buildJobDetailHref(jobId, tab, 'internal_invoice_payment_recorded'));
}
