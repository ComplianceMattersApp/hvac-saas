'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { requireInternalUser } from '@/lib/auth/internal-user';
import { resolveBillingModeByAccountOwnerId } from '@/lib/business/internal-business-profile';
import { resolveJobBillingSource } from '@/lib/business/job-billing-source';
import {
  normalizeInternalInvoiceItemType,
  resolveInternalInvoiceByJobId,
  type InternalInvoiceRecord,
} from '@/lib/business/internal-invoice';
import { evaluateJobOpsStatus, healStalePaperworkOpsStatus } from '@/lib/actions/job-evaluator';
import { insertJobEvent } from '@/lib/actions/job-actions';

function getTrimmedString(value: FormDataEntryValue | null | undefined) {
  return String(value ?? '').trim();
}

function getOptionalText(value: FormDataEntryValue | string | null | undefined) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
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
  const billingRecipient = String(params.job?.billing_recipient ?? '').trim().toLowerCase();

  let customerBilling: any = null;
  let contractorBilling: any = null;

  if (billingRecipient === 'customer' && customerId) {
    const { data, error } = await adminSupabase
      .from('customers')
      .select('owner_user_id, full_name, first_name, last_name, billing_name, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip')
      .eq('id', customerId)
      .eq('owner_user_id', params.internalUser.account_owner_user_id)
      .maybeSingle();

    if (error) throw error;
    customerBilling = data ?? null;
  }

  if (billingRecipient === 'contractor' && contractorId) {
    const { data, error } = await adminSupabase
      .from('contractors')
      .select('owner_user_id, name, billing_name, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip')
      .eq('id', contractorId)
      .eq('owner_user_id', params.internalUser.account_owner_user_id)
      .maybeSingle();

    if (error) throw error;
    contractorBilling = data ?? null;
  }

  return { customerBilling, contractorBilling };
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

async function loadInternalInvoiceContext(formData: FormData) {
  const jobId =
    getTrimmedString(formData.get('job_id')) ||
    getTrimmedString(formData.get('id'));

  if (!jobId) throw new Error('Job ID is required.');

  const tab = getTrimmedString(formData.get('tab')) || 'info';
  const supabase = await createClient();
  const { userId, internalUser } = await requireInternalUser({ supabase });

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
  eventType: 'internal_invoice_drafted' | 'internal_invoice_issued' | 'internal_invoice_voided';
  invoice: InternalInvoiceRecord | { id: string; invoice_number: string; status: string; total_cents: number; void_reason?: string | null };
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

  const { customerBilling, contractorBilling } = await loadCanonicalDraftBillingSources({
    internalUser: context.internalUser,
    job: context.job,
  });

  const { billing } = resolveJobBillingSource({
    billingRecipient: context.job.billing_recipient,
    customerBilling,
    contractorBilling,
    jobBilling: buildJobOverrideBillingSnapshot(context.job),
  });

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
    ...billing,
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