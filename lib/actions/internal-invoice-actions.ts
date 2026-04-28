'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { requireInternalUser } from '@/lib/auth/internal-user';
import { loadScopedInternalJobForMutation } from '@/lib/auth/internal-job-scope';
import {
  resolveBillingModeByAccountOwnerId,
  resolveInternalBusinessIdentityByAccountOwnerId,
} from '@/lib/business/internal-business-profile';
import { INTERNAL_INVOICE_EMAIL_NOTIFICATION_TYPE } from '@/lib/business/internal-invoice-delivery';
import { resolveJobBillingSource } from '@/lib/business/job-billing-source';
import {
  normalizeInternalInvoiceItemType,
  resolveInternalInvoiceByJobId,
  type InternalInvoiceRecord,
} from '@/lib/business/internal-invoice';
import { evaluateJobOpsStatus, healStalePaperworkOpsStatus } from '@/lib/actions/job-evaluator';
import { insertJobEvent } from '@/lib/actions/job-actions';
import { renderSystemEmailLayout, escapeHtml } from '@/lib/email/layout';
import { sendEmail } from '@/lib/email/sendEmail';
import { resolveNotificationAccountOwnerUserId } from '@/lib/notifications/account-owner';
import { sanitizeVisitScopeItemId, sanitizeVisitScopeItems } from '@/lib/jobs/visit-scope';

function getTrimmedString(value: FormDataEntryValue | null | undefined) {
  return String(value ?? '').trim();
}

function getOptionalText(value: FormDataEntryValue | string | null | undefined) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function firstNonEmpty(...values: Array<unknown>) {
  for (const value of values) {
    const normalized = getOptionalText(value as any);
    if (normalized) return normalized;
  }
  return null;
}

const INTERNAL_INVOICE_PANEL_HASH = 'internal-invoice-panel';

function buildJobDetailHref(jobId: string, tab: string, banner: string) {
  const safeTab = String(tab ?? '').trim() || 'info';
  return `/jobs/${jobId}?tab=${safeTab}&banner=${banner}#${INTERNAL_INVOICE_PANEL_HASH}`;
}

function buildInternalInvoiceNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `INV-${datePart}-${suffix}`;
}

function formatMoneyForMeta(cents: number) {
  return (cents / 100).toFixed(2);
}

function formatCurrencyFromCents(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format((Number(cents ?? 0) || 0) / 100);
}

function formatScaledInt(value: number, scale: number) {
  const sign = value < 0 ? '-' : '';
  const normalized = Math.abs(Math.trunc(value));
  const divisor = 10 ** scale;
  const whole = Math.floor(normalized / divisor);
  const fraction = String(normalized % divisor).padStart(scale, '0');
  return `${sign}${whole}.${fraction}`;
}

function parseScaledInteger(raw: string, scale: number, fieldLabel: string) {
  const normalized = raw.trim();
  const pattern = scale === 0
    ? /^\d+$/
    : new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`);

  if (!normalized || !pattern.test(normalized)) {
    throw new Error(`${fieldLabel} must be a valid number.`);
  }

  const [wholePart, decimalPart = ''] = normalized.split('.');
  const scaled = Number(wholePart) * 10 ** scale + Number(decimalPart.padEnd(scale, '0').slice(0, scale));

  if (!Number.isFinite(scaled) || scaled < 0) {
    throw new Error(`${fieldLabel} must be a valid number.`);
  }

  return scaled;
}

function parseMoneyToCents(raw: string, fieldLabel: string) {
  return parseScaledInteger(raw, 2, fieldLabel);
}

function parseNonNegativeMoneyNumberToCents(raw: unknown, fieldLabel: string) {
  const normalized = Number(raw);
  if (!Number.isFinite(normalized)) {
    throw new Error(`${fieldLabel} must be a valid number.`);
  }

  const cents = Math.round(normalized * 100);
  if (cents < 0) {
    throw new Error(`${fieldLabel} must be greater than or equal to zero.`);
  }

  return cents;
}

function parseQuantityToHundredths(raw: string) {
  const quantity = parseScaledInteger(raw, 2, 'Quantity');
  if (quantity <= 0) {
    throw new Error('Quantity must be greater than zero.');
  }
  return quantity;
}

function computeLineSubtotalCents(quantityHundredths: number, unitPriceCents: number) {
  return Math.round((quantityHundredths * unitPriceCents) / 100);
}

function normalizeInvoiceDate(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error('Invoice date must use YYYY-MM-DD.');
  }
  return trimmed;
}

function buildJobOverrideBillingSnapshot(job: any) {
  return {
    billing_name: getOptionalText(job.billing_name),
    billing_email: getOptionalText(job.billing_email),
    billing_phone: getOptionalText(job.billing_phone),
    billing_address_line1: getOptionalText(job.billing_address_line1),
    billing_address_line2: getOptionalText(job.billing_address_line2),
    billing_city: getOptionalText(job.billing_city),
    billing_state: getOptionalText(job.billing_state),
    billing_zip: getOptionalText(job.billing_zip),
  };
}

async function loadCanonicalDraftBillingSources(params: {
  internalUser: { account_owner_user_id: string };
  job: any;
}) {
  const adminSupabase = createAdminClient();
  const customerId = String(params.job?.customer_id ?? '').trim();
  const contractorId = String(params.job?.contractor_id ?? '').trim();
  const locationId = String(params.job?.location_id ?? '').trim();

  let customerBilling: any = null;
  let contractorBilling: any = null;
  let locationBilling: any = null;

  if (customerId) {
    const { data, error } = await adminSupabase
      .from('customers')
      .select('owner_user_id, full_name, first_name, last_name, billing_name, email, phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip')
      .eq('id', customerId)
      .eq('owner_user_id', params.internalUser.account_owner_user_id)
      .maybeSingle();

    if (error) throw error;
    customerBilling = data
      ? {
          ...data,
          billing_email: data.email ?? null,
          billing_phone: data.phone ?? null,
        }
      : null;
  }

  if (contractorId) {
    const { data, error } = await adminSupabase
      .from('contractors')
      .select('owner_user_id, name, billing_name, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip')
      .eq('id', contractorId)
      .eq('owner_user_id', params.internalUser.account_owner_user_id)
      .maybeSingle();

    if (error) throw error;
    contractorBilling = data ?? null;
  }

  if (locationId) {
    const { data, error } = await adminSupabase
      .from('locations')
      .select('owner_user_id, address_line1, address_line2, city, state, zip, postal_code')
      .eq('id', locationId)
      .eq('owner_user_id', params.internalUser.account_owner_user_id)
      .maybeSingle();

    if (error) throw error;
    locationBilling = data ?? null;
  }

  return { customerBilling, contractorBilling, locationBilling };
}

async function recomputeOpsAfterInvoiceMutation(params: {
  supabase: any;
  jobId: string;
  userId: string;
  previousOpsStatus: string | null;
  source: string;
}) {
  await evaluateJobOpsStatus(params.jobId);
  await healStalePaperworkOpsStatus(params.jobId);

  const { data: refreshedJob, error: refreshedJobErr } = await params.supabase
    .from('jobs')
    .select('ops_status')
    .eq('id', params.jobId)
    .single();

  if (refreshedJobErr) throw refreshedJobErr;

  const nextOpsStatus = String(refreshedJob?.ops_status ?? '').trim() || null;
  if (nextOpsStatus === (params.previousOpsStatus ?? null)) return;

  await insertJobEvent({
    supabase: params.supabase,
    jobId: params.jobId,
    event_type: 'ops_update',
    meta: {
      source: params.source,
      changes: [{ field: 'ops_status', from: params.previousOpsStatus ?? null, to: nextOpsStatus }],
    },
    userId: params.userId,
  });
}

async function syncInvoiceTotalsFromLineItems(params: {
  supabase: any;
  invoiceId: string;
  userId: string;
}) {
  const { data: lineItems, error: lineItemsErr } = await params.supabase
    .from('internal_invoice_line_items')
    .select('line_subtotal')
    .eq('invoice_id', params.invoiceId);

  if (lineItemsErr) throw lineItemsErr;

  const subtotalCents = (lineItems ?? []).reduce((sum: number, row: any) => {
    const normalized = parseMoneyToCents(String(row?.line_subtotal ?? '0'), 'Line subtotal');
    return sum + normalized;
  }, 0);

  const { error: updateErr } = await params.supabase
    .from('internal_invoices')
    .update({
      subtotal_cents: subtotalCents,
      total_cents: subtotalCents,
      updated_by_user_id: params.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.invoiceId);

  if (updateErr) throw updateErr;

  return subtotalCents;
}

function redirectInternalInvoiceValidation(jobId: string, tab: string, banner: string): never {
  redirect(buildJobDetailHref(jobId, tab, banner));
}

function parseLineItemDraftFields(formData: FormData) {
  const itemName = getTrimmedString(formData.get('item_name_snapshot'));
  if (!itemName) {
    throw new Error('Item name is required.');
  }

  const quantityHundredths = parseQuantityToHundredths(getTrimmedString(formData.get('quantity')) || '1');
  const unitPriceCents = parseMoneyToCents(getTrimmedString(formData.get('unit_price')) || '0', 'Unit price');
  const lineSubtotalCents = computeLineSubtotalCents(quantityHundredths, unitPriceCents);

  return {
    item_name_snapshot: itemName,
    description_snapshot: getOptionalText(formData.get('description_snapshot')),
    item_type_snapshot: normalizeInternalInvoiceItemType(formData.get('item_type_snapshot')),
    quantity: formatScaledInt(quantityHundredths, 2),
    unit_price: formatScaledInt(unitPriceCents, 2),
    line_subtotal: formatScaledInt(lineSubtotalCents, 2),
  };
}

function parseSelectedVisitScopeItemIds(formData: FormData) {
  const rawSelectedValues = [
    ...formData.getAll('visit_scope_item_ids'),
    ...String(formData.get('visit_scope_item_ids_csv') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ];

  const malformedIds: string[] = [];
  const selectedIds: string[] = [];
  const seen = new Set<string>();

  for (const rawSelectedValue of rawSelectedValues) {
    const normalizedId = sanitizeVisitScopeItemId(rawSelectedValue);
    if (!normalizedId) {
      const rawText = String(rawSelectedValue ?? '').trim();
      if (rawText) malformedIds.push(rawText);
      continue;
    }

    if (seen.has(normalizedId)) continue;
    seen.add(normalizedId);
    selectedIds.push(normalizedId);
  }

  return {
    selectedIds,
    malformedIds,
  };
}

async function loadScopedPricebookSnapshot(params: {
  supabase: any;
  accountOwnerUserId: string;
  pricebookItemId: string;
}) {
  const { data, error } = await params.supabase
    .from('pricebook_items')
    .select('id, account_owner_user_id, item_name, item_type, category, default_description, default_unit_price, unit_label, is_active')
    .eq('id', params.pricebookItemId)
    .eq('account_owner_user_id', params.accountOwnerUserId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function loadInternalInvoiceContext(formData: FormData) {
  const jobId =
    getTrimmedString(formData.get('job_id')) ||
    getTrimmedString(formData.get('id'));

  if (!jobId) throw new Error('Job ID is required.');

  const tab = getTrimmedString(formData.get('tab')) || 'info';
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

  const billingMode = await resolveBillingModeByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  if (billingMode !== 'internal_invoicing') {
    redirect(buildJobDetailHref(jobId, tab, 'internal_invoicing_billing_pending'));
  }

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select(
      'id, title, job_type, status, field_complete, ops_status, invoice_complete, invoice_number, customer_id, contractor_id, location_id, service_case_id, billing_recipient, customer_first_name, customer_last_name, billing_name, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip'
    )
    .eq('id', jobId)
    .single();

  if (jobErr) throw jobErr;

  const invoice = await resolveInternalInvoiceByJobId({ supabase, jobId });

  return {
    supabase,
    userId,
    tab,
    jobId,
    internalUser,
    job,
    invoice,
  };
}

type InternalInvoiceEmailDeliveryStatus = 'queued' | 'sent' | 'failed';
type InternalInvoiceEmailAttemptKind = 'sent' | 'resent';

function buildInternalInvoiceEmailBody(args: {
  businessName: string;
  supportEmail: string | null;
  supportPhone: string | null;
  invoice: InternalInvoiceRecord;
  jobTitle: string | null;
}) {
  const lineItemsHtml = (args.invoice.line_items ?? [])
    .map((lineItem) => {
      const name = escapeHtml(String(lineItem.item_name_snapshot ?? '').trim() || 'Line item');
      const description = escapeHtml(String(lineItem.description_snapshot ?? '').trim());
      const quantity = escapeHtml(String(lineItem.quantity ?? '0'));
      const subtotal = escapeHtml(formatCurrencyFromCents(Math.round(Number(lineItem.line_subtotal ?? 0) * 100)));

      return `
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top;">
            <div style="font-weight: 600; color: #111827;">${name}</div>
            ${description ? `<div style="margin-top: 4px; color: #4b5563; font-size: 13px;">${description}</div>` : ''}
          </td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #111827; text-align: right; white-space: nowrap;">${quantity}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #111827; text-align: right; white-space: nowrap;">${subtotal}</td>
        </tr>`;
    })
    .join('');

  const invoiceNumber = escapeHtml(String(args.invoice.invoice_number ?? '').trim());
  const invoiceDate = escapeHtml(String(args.invoice.invoice_date ?? '').trim());
  const recipientName = escapeHtml(String(args.invoice.billing_name ?? '').trim() || 'Customer');
  const jobTitle = escapeHtml(String(args.jobTitle ?? '').trim() || 'Service visit');
  const total = escapeHtml(formatCurrencyFromCents(Number(args.invoice.total_cents ?? 0)));
  const supportLine = [args.supportEmail, args.supportPhone].filter(Boolean).map((value) => escapeHtml(String(value))).join(' • ');
  const notes = escapeHtml(String(args.invoice.notes ?? '').trim());

  return renderSystemEmailLayout({
    title: `Invoice ${invoiceNumber}`,
    bodyHtml: `
      <p style="margin: 0 0 12px 0;">Hello ${recipientName},</p>
      <p style="margin: 0 0 16px 0;">Your invoice for ${jobTitle} is ready.</p>
      <div style="margin: 0 0 18px 0; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px 16px; background: #f8fafc;">
        <div style="font-size: 13px; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700;">Invoice Summary</div>
        <div style="margin-top: 10px; color: #111827;"><strong>Invoice #:</strong> ${invoiceNumber}</div>
        <div style="margin-top: 6px; color: #111827;"><strong>Invoice Date:</strong> ${invoiceDate}</div>
        <div style="margin-top: 6px; color: #111827;"><strong>Total:</strong> ${total}</div>
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin: 0 0 18px 0; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <thead>
          <tr style="background: #f8fafc;">
            <th align="left" style="padding: 10px 12px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #475569;">Line Item</th>
            <th align="right" style="padding: 10px 12px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #475569;">Qty</th>
            <th align="right" style="padding: 10px 12px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #475569;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${lineItemsHtml || `<tr><td colspan="3" style="padding: 12px; color: #475569;">No billed line items were recorded.</td></tr>`}
        </tbody>
      </table>
      ${notes ? `<div style="margin: 0 0 16px 0;"><strong>Notes:</strong><br />${notes.replace(/\n/g, '<br />')}</div>` : ''}
      ${supportLine ? `<p style="margin: 0; color: #4b5563;">Questions? Contact ${escapeHtml(args.businessName)} at ${supportLine}.</p>` : ''}
    `,
  });
}

async function listInternalInvoiceEmailNotifications(params: {
  supabase: any;
  jobId: string;
  invoiceId: string;
}) {
  const { data, error } = await params.supabase
    .from('notifications')
    .select('id, payload, status, sent_at, created_at')
    .eq('job_id', params.jobId)
    .eq('channel', 'email')
    .eq('notification_type', INTERNAL_INVOICE_EMAIL_NOTIFICATION_TYPE)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).filter((row: any) => String(row?.payload?.invoice_id ?? '').trim() === params.invoiceId);
}

async function insertInternalInvoiceEmailNotification(params: {
  supabase: any;
  jobId: string;
  invoiceId: string;
  invoiceNumber: string;
  recipientEmail: string;
  subject: string;
  body: string;
  attemptKind: InternalInvoiceEmailAttemptKind;
  attemptNumber: number;
  status: InternalInvoiceEmailDeliveryStatus;
  errorDetail?: string | null;
}) {
  const accountOwnerUserId = await resolveNotificationAccountOwnerUserId({
    jobId: params.jobId,
  });

  if (!accountOwnerUserId) {
    throw new Error(`Unable to resolve notification account owner for job ${params.jobId}`);
  }

  const payload: Record<string, unknown> = {
    source: 'internal_invoice_email',
    invoice_id: params.invoiceId,
    invoice_number: params.invoiceNumber,
    recipient_email: params.recipientEmail,
    attempt_kind: params.attemptKind,
    attempt_number: params.attemptNumber,
  };

  const errorDetail = String(params.errorDetail ?? '').trim();
  if (errorDetail) payload.error_detail = errorDetail;

  const { data, error } = await params.supabase
    .from('notifications')
    .insert({
      job_id: params.jobId,
      account_owner_user_id: accountOwnerUserId,
      recipient_type: 'customer',
      recipient_ref: null,
      channel: 'email',
      notification_type: INTERNAL_INVOICE_EMAIL_NOTIFICATION_TYPE,
      subject: params.subject,
      body: params.body,
      payload,
      status: params.status,
      sent_at: params.status === 'sent' ? new Date().toISOString() : null,
    })
    .select('id')
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error('Failed to create invoice email notification row');
  return { id: String(data.id) };
}

async function markInternalInvoiceEmailNotification(params: {
  supabase: any;
  notificationId: string;
  status: 'sent' | 'failed';
  errorDetail?: string | null;
}) {
  const { data: existingNotification, error: existingNotificationErr } = await params.supabase
    .from('notifications')
    .select('payload')
    .eq('id', params.notificationId)
    .maybeSingle();

  if (existingNotificationErr) throw existingNotificationErr;

  const patch: Record<string, unknown> = {
    status: params.status,
  };

  if (params.status === 'sent') {
    patch.sent_at = new Date().toISOString();
  }

  const errorDetail = String(params.errorDetail ?? '').trim();
  if (params.status === 'failed' && errorDetail) {
    patch.body = `Invoice email delivery failed: ${errorDetail}`;
    patch.payload = {
      ...(existingNotification?.payload ?? {}),
      error_detail: errorDetail,
    };
  }

  const { error } = await params.supabase
    .from('notifications')
    .update(patch)
    .eq('id', params.notificationId);

  if (error) throw error;
}

async function requireDraftInvoiceContext(formData: FormData) {
  const context = await loadInternalInvoiceContext(formData);

  if (!context.invoice) {
    redirectInternalInvoiceValidation(context.jobId, context.tab, 'internal_invoice_missing');
  }

  if (context.invoice.status !== 'draft') {
    redirectInternalInvoiceValidation(context.jobId, context.tab, 'internal_invoice_line_items_locked');
  }

  return context;
}

async function logInvoiceEvent(params: {
  supabase: any;
  userId: string;
  jobId: string;
  eventType:
    | 'internal_invoice_drafted'
    | 'internal_invoice_issued'
    | 'internal_invoice_voided'
    | 'internal_invoice_email_sent'
    | 'internal_invoice_email_resent'
    | 'internal_invoice_email_failed';
  invoice: InternalInvoiceRecord | { id: string; invoice_number: string; status: string; total_cents: number; void_reason?: string | null };
  extraMeta?: Record<string, unknown>;
}) {
  const meta: Record<string, unknown> = {
    invoice_id: params.invoice.id,
    invoice_number: params.invoice.invoice_number,
    status: params.invoice.status,
    total_cents: params.invoice.total_cents,
    total_display: formatMoneyForMeta(params.invoice.total_cents),
  };

  if (params.eventType === 'internal_invoice_voided') {
    meta.void_reason = params.invoice.void_reason ?? null;
  }

  if (params.extraMeta) {
    Object.assign(meta, params.extraMeta);
  }

  await insertJobEvent({
    supabase: params.supabase,
    jobId: params.jobId,
    event_type: params.eventType,
    meta,
    userId: params.userId,
  });
}

export async function createInternalInvoiceDraftFromForm(formData: FormData) {
  const context = await loadInternalInvoiceContext(formData);

  if (context.invoice) {
    redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_draft_exists'));
  }

  const { customerBilling, contractorBilling, locationBilling } = await loadCanonicalDraftBillingSources({
    internalUser: context.internalUser,
    job: context.job,
  });

  const jobBilling = buildJobOverrideBillingSnapshot(context.job);

  const { billing } = resolveJobBillingSource({
    billingRecipient: context.job.billing_recipient,
    customerBilling,
    contractorBilling,
    jobBilling,
  });

  const customerFallbackName = firstNonEmpty(
    customerBilling?.billing_name,
    customerBilling?.full_name,
    [customerBilling?.first_name, customerBilling?.last_name].filter(Boolean).join(' '),
  );

  const draftBilling = {
    billing_name: firstNonEmpty(
      billing.billing_name,
      customerFallbackName,
      contractorBilling?.billing_name,
      contractorBilling?.name,
      jobBilling.billing_name,
    ),
    billing_email: firstNonEmpty(
      billing.billing_email,
      customerBilling?.billing_email,
      contractorBilling?.billing_email,
      jobBilling.billing_email,
    ),
    billing_phone: firstNonEmpty(
      billing.billing_phone,
      customerBilling?.billing_phone,
      contractorBilling?.billing_phone,
      jobBilling.billing_phone,
    ),
    billing_address_line1: firstNonEmpty(
      billing.billing_address_line1,
      jobBilling.billing_address_line1,
      customerBilling?.billing_address_line1,
      contractorBilling?.billing_address_line1,
      locationBilling?.address_line1,
    ),
    billing_address_line2: firstNonEmpty(
      billing.billing_address_line2,
      jobBilling.billing_address_line2,
      customerBilling?.billing_address_line2,
      contractorBilling?.billing_address_line2,
      locationBilling?.address_line2,
    ),
    billing_city: firstNonEmpty(
      billing.billing_city,
      jobBilling.billing_city,
      customerBilling?.billing_city,
      contractorBilling?.billing_city,
      locationBilling?.city,
    ),
    billing_state: firstNonEmpty(
      billing.billing_state,
      jobBilling.billing_state,
      customerBilling?.billing_state,
      contractorBilling?.billing_state,
      locationBilling?.state,
    ),
    billing_zip: firstNonEmpty(
      billing.billing_zip,
      jobBilling.billing_zip,
      customerBilling?.billing_zip,
      contractorBilling?.billing_zip,
      locationBilling?.zip,
      locationBilling?.postal_code,
    ),
  };

  const draftPayload = {
    account_owner_user_id: context.internalUser.account_owner_user_id,
    job_id: context.jobId,
    customer_id: context.job.customer_id ?? null,
    location_id: context.job.location_id ?? null,
    service_case_id: context.job.service_case_id ?? null,
    invoice_number: buildInternalInvoiceNumber(),
    status: 'draft',
    invoice_date: new Date().toISOString().slice(0, 10),
    source_type: 'job',
    subtotal_cents: 0,
    total_cents: 0,
    notes: null,
    ...draftBilling,
    created_by_user_id: context.userId,
    updated_by_user_id: context.userId,
  };

  const { data, error } = await context.supabase
    .from('internal_invoices')
    .insert(draftPayload)
    .select('id, invoice_number, status, total_cents')
    .single();

  if (error) {
    if (error.code === '23505') {
      redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_draft_exists'));
    }
    throw error;
  }

  await logInvoiceEvent({
    supabase: context.supabase,
    userId: context.userId,
    jobId: context.jobId,
    eventType: 'internal_invoice_drafted',
    invoice: {
      id: String(data.id),
      invoice_number: String(data.invoice_number),
      status: String(data.status),
      total_cents: Number(data.total_cents ?? 0) || 0,
    },
  });

  revalidatePath(`/jobs/${context.jobId}`);
  revalidatePath('/jobs');
  revalidatePath('/ops');
  redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_draft_created'));
}

export async function saveInternalInvoiceDraftFromForm(formData: FormData) {
  const context = await loadInternalInvoiceContext(formData);

  if (!context.invoice) {
    redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_missing'));
  }

  if (context.invoice.status !== 'draft') {
    redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_locked'));
  }

  const invoiceNumber = getTrimmedString(formData.get('invoice_number'));
  if (!invoiceNumber) {
    redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_required_fields'));
  }

  const derivedSubtotalCents = await syncInvoiceTotalsFromLineItems({
    supabase: context.supabase,
    invoiceId: context.invoice.id,
    userId: context.userId,
  });

  const updates = {
    invoice_number: invoiceNumber,
    invoice_date: normalizeInvoiceDate(getTrimmedString(formData.get('invoice_date'))),
    subtotal_cents: derivedSubtotalCents,
    total_cents: derivedSubtotalCents,
    notes: getOptionalText(formData.get('notes')),
    billing_name: getOptionalText(formData.get('billing_name')),
    billing_email: getOptionalText(formData.get('billing_email')),
    billing_phone: getOptionalText(formData.get('billing_phone')),
    billing_address_line1: getOptionalText(formData.get('billing_address_line1')),
    billing_address_line2: getOptionalText(formData.get('billing_address_line2')),
    billing_city: getOptionalText(formData.get('billing_city')),
    billing_state: getOptionalText(formData.get('billing_state')),
    billing_zip: getOptionalText(formData.get('billing_zip')),
    updated_by_user_id: context.userId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await context.supabase
    .from('internal_invoices')
    .update(updates)
    .eq('id', context.invoice.id);

  if (error) {
    if (error.code === '23505') {
      redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_number_taken'));
    }
    throw error;
  }

  revalidatePath(`/jobs/${context.jobId}`);
  revalidatePath('/jobs');
  revalidatePath('/ops');
  redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_draft_saved'));
}

export async function issueInternalInvoiceFromForm(formData: FormData) {
  const context = await loadInternalInvoiceContext(formData);

  if (!context.invoice) {
    redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_missing'));
  }

  if (context.invoice.status === 'issued') {
    redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_already_issued'));
  }

  if (context.invoice.status === 'void') {
    redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_locked'));
  }

  if (!context.job.field_complete || String(context.job.status ?? '').trim().toLowerCase() !== 'completed') {
    redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_issue_blocked'));
  }

  const billingName = getTrimmedString(context.invoice.billing_name);
  if (!billingName || context.invoice.total_cents <= 0 || (context.invoice.line_items?.length ?? 0) === 0) {
    redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_issue_incomplete'));
  }

  const issuedAt = new Date().toISOString();
  const previousOpsStatus = String(context.job.ops_status ?? '').trim() || null;

  const { error: invoiceErr } = await context.supabase
    .from('internal_invoices')
    .update({
      status: 'issued',
      issued_at: issuedAt,
      issued_by_user_id: context.userId,
      updated_by_user_id: context.userId,
      updated_at: issuedAt,
    })
    .eq('id', context.invoice.id)
    .eq('status', 'draft');

  if (invoiceErr) throw invoiceErr;

  const { error: jobErr } = await context.supabase
    .from('jobs')
    .update({
      invoice_complete: true,
      invoice_number: context.invoice.invoice_number,
    })
    .eq('id', context.jobId);

  if (jobErr) throw jobErr;

  await logInvoiceEvent({
    supabase: context.supabase,
    userId: context.userId,
    jobId: context.jobId,
    eventType: 'internal_invoice_issued',
    invoice: {
      ...context.invoice,
      status: 'issued',
    },
  });

  await recomputeOpsAfterInvoiceMutation({
    supabase: context.supabase,
    jobId: context.jobId,
    userId: context.userId,
    previousOpsStatus,
    source: 'internal_invoice_issue_recompute',
  });

  revalidatePath(`/jobs/${context.jobId}`);
  revalidatePath('/jobs');
  revalidatePath('/ops');
  redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_issued'));
}

export async function voidInternalInvoiceFromForm(formData: FormData) {
  const context = await loadInternalInvoiceContext(formData);

  if (!context.invoice) {
    redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_missing'));
  }

  if (context.invoice.status === 'void') {
    redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_already_voided'));
  }

  const voidedAt = new Date().toISOString();
  const voidReason = getOptionalText(formData.get('void_reason'));
  const previousOpsStatus = String(context.job.ops_status ?? '').trim() || null;
  const wasIssued = context.invoice.status === 'issued';

  const { error: invoiceErr } = await context.supabase
    .from('internal_invoices')
    .update({
      status: 'void',
      voided_at: voidedAt,
      voided_by_user_id: context.userId,
      void_reason: voidReason,
      updated_by_user_id: context.userId,
      updated_at: voidedAt,
    })
    .eq('id', context.invoice.id)
    .neq('status', 'void');

  if (invoiceErr) throw invoiceErr;

  if (wasIssued) {
    const { error: jobErr } = await context.supabase
      .from('jobs')
      .update({
        invoice_complete: false,
        invoice_number: null,
      })
      .eq('id', context.jobId);

    if (jobErr) throw jobErr;
  }

  await logInvoiceEvent({
    supabase: context.supabase,
    userId: context.userId,
    jobId: context.jobId,
    eventType: 'internal_invoice_voided',
    invoice: {
      ...context.invoice,
      status: 'void',
      void_reason: voidReason,
    },
  });

  if (wasIssued) {
    await recomputeOpsAfterInvoiceMutation({
      supabase: context.supabase,
      jobId: context.jobId,
      userId: context.userId,
      previousOpsStatus,
      source: 'internal_invoice_void_recompute',
    });
  }

  revalidatePath(`/jobs/${context.jobId}`);
  revalidatePath('/jobs');
  revalidatePath('/ops');
  redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_voided'));
}

export async function addInternalInvoiceLineItemFromForm(formData: FormData) {
  const context = await requireDraftInvoiceContext(formData);
  const invoice = context.invoice!;

  let payload: ReturnType<typeof parseLineItemDraftFields>;
  try {
    payload = parseLineItemDraftFields(formData);
  } catch {
    redirectInternalInvoiceValidation(context.jobId, context.tab, 'internal_invoice_line_item_invalid');
  }

  const nextSortOrder = (invoice.line_items?.length ?? 0) + 1;

  const { error } = await context.supabase
    .from('internal_invoice_line_items')
    .insert({
      invoice_id: invoice.id,
      sort_order: nextSortOrder,
      source_kind: 'manual',
      ...payload,
      created_by_user_id: context.userId,
      updated_by_user_id: context.userId,
    });

  if (error) throw error;

  await syncInvoiceTotalsFromLineItems({
    supabase: context.supabase,
    invoiceId: invoice.id,
    userId: context.userId,
  });

  revalidatePath(`/jobs/${context.jobId}`);
  revalidatePath('/jobs');
  revalidatePath('/ops');
  redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_line_item_added'));
}

export async function addInternalInvoiceLineItemFromPricebookForm(formData: FormData) {
  const context = await requireDraftInvoiceContext(formData);
  const invoice = context.invoice!;

  const pricebookItemId = getTrimmedString(formData.get('pricebook_item_id'));
  if (!pricebookItemId) {
    redirectInternalInvoiceValidation(context.jobId, context.tab, 'internal_invoice_pricebook_item_missing');
  }

  let quantityHundredths = 0;
  try {
    quantityHundredths = parseQuantityToHundredths(getTrimmedString(formData.get('quantity')) || '1');
  } catch {
    redirectInternalInvoiceValidation(context.jobId, context.tab, 'internal_invoice_pricebook_quantity_invalid');
  }

  const pricebookItem = await loadScopedPricebookSnapshot({
    supabase: context.supabase,
    accountOwnerUserId: context.internalUser.account_owner_user_id,
    pricebookItemId,
  });

  if (!pricebookItem?.id) {
    redirectInternalInvoiceValidation(context.jobId, context.tab, 'internal_invoice_pricebook_item_not_found');
  }

  if (!pricebookItem.is_active) {
    redirectInternalInvoiceValidation(context.jobId, context.tab, 'internal_invoice_pricebook_item_inactive');
  }

  const normalizedItemType = getTrimmedString(pricebookItem.item_type).toLowerCase();
  if (normalizedItemType === 'adjustment') {
    redirectInternalInvoiceValidation(context.jobId, context.tab, 'internal_invoice_pricebook_negative_price_deferred');
  }

  let unitPriceCents = 0;
  try {
    unitPriceCents = parseNonNegativeMoneyNumberToCents(pricebookItem.default_unit_price, 'Unit price');
  } catch {
    redirectInternalInvoiceValidation(context.jobId, context.tab, 'internal_invoice_pricebook_negative_price_deferred');
  }

  const lineSubtotalCents = computeLineSubtotalCents(quantityHundredths, unitPriceCents);
  const nextSortOrder = (invoice.line_items?.length ?? 0) + 1;

  const { error } = await context.supabase
    .from('internal_invoice_line_items')
    .insert({
      invoice_id: invoice.id,
      sort_order: nextSortOrder,
      source_kind: 'pricebook',
      source_pricebook_item_id: String(pricebookItem.id),
      item_name_snapshot: getTrimmedString(pricebookItem.item_name),
      description_snapshot: getOptionalText(pricebookItem.default_description),
      item_type_snapshot: normalizeInternalInvoiceItemType(pricebookItem.item_type),
      category_snapshot: getOptionalText(pricebookItem.category),
      unit_label_snapshot: getOptionalText(pricebookItem.unit_label),
      quantity: formatScaledInt(quantityHundredths, 2),
      unit_price: formatScaledInt(unitPriceCents, 2),
      line_subtotal: formatScaledInt(lineSubtotalCents, 2),
      created_by_user_id: context.userId,
      updated_by_user_id: context.userId,
    });

  if (error) throw error;

  await syncInvoiceTotalsFromLineItems({
    supabase: context.supabase,
    invoiceId: invoice.id,
    userId: context.userId,
  });

  revalidatePath(`/jobs/${context.jobId}`);
  revalidatePath('/jobs');
  revalidatePath('/ops');
  redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_pricebook_line_item_added'));
}

export async function addInternalInvoiceLineItemsFromVisitScopeForm(formData: FormData) {
  const context = await requireDraftInvoiceContext(formData);
  const invoice = context.invoice!;

  const { selectedIds, malformedIds } = parseSelectedVisitScopeItemIds(formData);

  if (malformedIds.length > 0) {
    redirectInternalInvoiceValidation(context.jobId, context.tab, 'internal_invoice_visit_scope_item_invalid');
  }

  if (selectedIds.length === 0) {
    redirectInternalInvoiceValidation(context.jobId, context.tab, 'internal_invoice_visit_scope_item_missing');
  }

  let quantityHundredths = 100;
  try {
    quantityHundredths = parseQuantityToHundredths(getTrimmedString(formData.get('quantity')) || '1');
  } catch {
    redirectInternalInvoiceValidation(context.jobId, context.tab, 'internal_invoice_visit_scope_quantity_invalid');
  }

  const { data: jobScopeRow, error: jobScopeErr } = await context.supabase
    .from('jobs')
    .select('id, visit_scope_items')
    .eq('id', context.jobId)
    .maybeSingle();

  if (jobScopeErr) throw jobScopeErr;
  if (!jobScopeRow?.id) {
    redirectInternalInvoiceValidation(context.jobId, context.tab, 'internal_invoice_visit_scope_item_not_found');
  }

  let scopeItems: ReturnType<typeof sanitizeVisitScopeItems> = [];
  try {
    scopeItems = sanitizeVisitScopeItems(jobScopeRow.visit_scope_items ?? []);
  } catch {
    redirectInternalInvoiceValidation(context.jobId, context.tab, 'internal_invoice_visit_scope_item_invalid');
  }

  const scopeItemsById = new Map(
    scopeItems
      .map((scopeItem) => {
        const scopeItemId = sanitizeVisitScopeItemId(scopeItem.id);
        if (!scopeItemId) return null;
        return [scopeItemId, scopeItem] as const;
      })
      .filter(Boolean) as Array<readonly [string, (typeof scopeItems)[number]]>,
  );

  const missingScopeIds = selectedIds.filter((selectedId) => !scopeItemsById.has(selectedId));
  if (missingScopeIds.length > 0) {
    redirectInternalInvoiceValidation(context.jobId, context.tab, 'internal_invoice_visit_scope_item_not_found');
  }

  const existingScopeSourceIds = new Set(
    (invoice.line_items ?? [])
      .filter((lineItem) => lineItem.source_kind === 'visit_scope')
      .map((lineItem) => sanitizeVisitScopeItemId(lineItem.source_visit_scope_item_id))
      .filter(Boolean) as string[],
  );

  const idsToInsert = selectedIds.filter((selectedId) => !existingScopeSourceIds.has(selectedId));
  if (idsToInsert.length === 0) {
    redirectInternalInvoiceValidation(context.jobId, context.tab, 'internal_invoice_visit_scope_line_item_duplicate');
  }

  const nextSortOrder = (invoice.line_items?.length ?? 0) + 1;
  const unitPriceCents = 0;
  const lineSubtotalCents = computeLineSubtotalCents(quantityHundredths, unitPriceCents);

  const payload = idsToInsert.map((scopeItemId, index) => {
    const scopeItem = scopeItemsById.get(scopeItemId)!;
    return {
      invoice_id: invoice.id,
      sort_order: nextSortOrder + index,
      source_kind: 'visit_scope',
      source_visit_scope_item_id: scopeItemId,
      item_name_snapshot: getTrimmedString(scopeItem.title),
      description_snapshot: getOptionalText(scopeItem.details),
      item_type_snapshot: 'service',
      category_snapshot: null,
      unit_label_snapshot: null,
      quantity: formatScaledInt(quantityHundredths, 2),
      unit_price: formatScaledInt(unitPriceCents, 2),
      line_subtotal: formatScaledInt(lineSubtotalCents, 2),
      created_by_user_id: context.userId,
      updated_by_user_id: context.userId,
    };
  });

  const { error: insertErr } = await context.supabase
    .from('internal_invoice_line_items')
    .insert(payload);

  if (insertErr) throw insertErr;

  await syncInvoiceTotalsFromLineItems({
    supabase: context.supabase,
    invoiceId: invoice.id,
    userId: context.userId,
  });

  revalidatePath(`/jobs/${context.jobId}`);
  revalidatePath('/jobs');
  revalidatePath('/ops');

  if (idsToInsert.length < selectedIds.length) {
    redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_visit_scope_line_item_partial_added'));
  }

  redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_visit_scope_line_item_added'));
}

export async function updateInternalInvoiceLineItemFromForm(formData: FormData) {
  const context = await requireDraftInvoiceContext(formData);
  const invoice = context.invoice!;
  const lineItemId = getTrimmedString(formData.get('line_item_id'));
  if (!lineItemId) {
    redirectInternalInvoiceValidation(context.jobId, context.tab, 'internal_invoice_line_item_missing');
  }

  let payload: ReturnType<typeof parseLineItemDraftFields>;
  try {
    payload = parseLineItemDraftFields(formData);
  } catch {
    redirectInternalInvoiceValidation(context.jobId, context.tab, 'internal_invoice_line_item_invalid');
  }

  const targetLineItem = invoice.line_items.find((lineItem) => lineItem.id === lineItemId);
  if (!targetLineItem) {
    redirectInternalInvoiceValidation(context.jobId, context.tab, 'internal_invoice_line_item_missing');
  }

  const { error } = await context.supabase
    .from('internal_invoice_line_items')
    .update({
      ...payload,
      updated_by_user_id: context.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lineItemId)
    .eq('invoice_id', invoice.id);

  if (error) throw error;

  await syncInvoiceTotalsFromLineItems({
    supabase: context.supabase,
    invoiceId: invoice.id,
    userId: context.userId,
  });

  revalidatePath(`/jobs/${context.jobId}`);
  revalidatePath('/jobs');
  revalidatePath('/ops');
  redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_line_item_saved'));
}

export async function removeInternalInvoiceLineItemFromForm(formData: FormData) {
  const context = await requireDraftInvoiceContext(formData);
  const invoice = context.invoice!;
  const lineItemId = getTrimmedString(formData.get('line_item_id'));
  if (!lineItemId) {
    redirectInternalInvoiceValidation(context.jobId, context.tab, 'internal_invoice_line_item_missing');
  }

  const targetLineItem = invoice.line_items.find((lineItem) => lineItem.id === lineItemId);
  if (!targetLineItem) {
    redirectInternalInvoiceValidation(context.jobId, context.tab, 'internal_invoice_line_item_missing');
  }

  const { error } = await context.supabase
    .from('internal_invoice_line_items')
    .delete()
    .eq('id', lineItemId)
    .eq('invoice_id', invoice.id);

  if (error) throw error;

  await syncInvoiceTotalsFromLineItems({
    supabase: context.supabase,
    invoiceId: invoice.id,
    userId: context.userId,
  });

  revalidatePath(`/jobs/${context.jobId}`);
  revalidatePath('/jobs');
  revalidatePath('/ops');
  redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_line_item_removed'));
}

export async function sendInternalInvoiceEmailFromForm(formData: FormData) {
  const context = await loadInternalInvoiceContext(formData);

  if (!context.invoice) {
    redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_missing'));
  }

  if (context.invoice.status !== 'issued') {
    redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_send_requires_issued'));
  }

  const recipientEmail = getTrimmedString(formData.get('recipient_email')).toLowerCase() || getTrimmedString(context.invoice.billing_email).toLowerCase();

  if (!recipientEmail) {
    redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_send_recipient_required'));
  }

  const sendHistory = await listInternalInvoiceEmailNotifications({
    supabase: context.supabase,
    jobId: context.jobId,
    invoiceId: context.invoice.id,
  });
  const successfulSendExists = sendHistory.some((row: any) => String(row?.status ?? '').trim().toLowerCase() === 'sent');
  const attemptKind: InternalInvoiceEmailAttemptKind = successfulSendExists ? 'resent' : 'sent';
  const attemptNumber = sendHistory.length + 1;

  const businessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    supabase: context.supabase,
    accountOwnerUserId: context.internalUser.account_owner_user_id,
  });

  const subject = `${businessIdentity.display_name} invoice ${context.invoice.invoice_number}`;
  const body = buildInternalInvoiceEmailBody({
    businessName: businessIdentity.display_name,
    supportEmail: businessIdentity.support_email,
    supportPhone: businessIdentity.support_phone,
    invoice: context.invoice,
    jobTitle: context.job.title ?? null,
  });

  const queuedDelivery = await insertInternalInvoiceEmailNotification({
    supabase: context.supabase,
    jobId: context.jobId,
    invoiceId: context.invoice.id,
    invoiceNumber: context.invoice.invoice_number,
    recipientEmail,
    subject,
    body: attemptKind === 'resent' ? 'Internal invoice resend queued.' : 'Internal invoice email queued.',
    attemptKind,
    attemptNumber,
    status: 'queued',
  });

  try {
    await sendEmail({
      to: recipientEmail,
      subject,
      html: body,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown send error';

    await markInternalInvoiceEmailNotification({
      supabase: context.supabase,
      notificationId: queuedDelivery.id,
      status: 'failed',
      errorDetail: errorMessage,
    });

    await logInvoiceEvent({
      supabase: context.supabase,
      userId: context.userId,
      jobId: context.jobId,
      eventType: 'internal_invoice_email_failed',
      invoice: context.invoice,
      extraMeta: {
        recipient_email: recipientEmail,
        attempt_kind: attemptKind,
        attempt_number: attemptNumber,
        error_detail: errorMessage,
      },
    });

    revalidatePath(`/jobs/${context.jobId}`);
    revalidatePath('/jobs');
    revalidatePath('/ops');
    redirect(buildJobDetailHref(context.jobId, context.tab, 'internal_invoice_email_failed'));
  }

  await markInternalInvoiceEmailNotification({
    supabase: context.supabase,
    notificationId: queuedDelivery.id,
    status: 'sent',
  });

  await logInvoiceEvent({
    supabase: context.supabase,
    userId: context.userId,
    jobId: context.jobId,
    eventType: attemptKind === 'resent' ? 'internal_invoice_email_resent' : 'internal_invoice_email_sent',
    invoice: context.invoice,
    extraMeta: {
      recipient_email: recipientEmail,
      attempt_kind: attemptKind,
      attempt_number: attemptNumber,
    },
  });

  revalidatePath(`/jobs/${context.jobId}`);
  revalidatePath('/jobs');
  revalidatePath('/ops');
  redirect(buildJobDetailHref(context.jobId, context.tab, attemptKind === 'resent' ? 'internal_invoice_email_resent' : 'internal_invoice_email_sent'));
}