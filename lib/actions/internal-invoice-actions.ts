'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { requireInternalUser } from '@/lib/auth/internal-user';
import { loadScopedInternalJobForMutation } from '@/lib/auth/internal-job-scope';
import {
  canManageInvoiceLifecycle,
  requireInvoiceLifecycleAccessOrRedirect,
} from '@/lib/auth/financial-access';
import {
  resolveFieldBillingCapabilities,
  requireFieldChargeEditAccessOrRedirect,
  requireFieldChargeRemoveAccessOrRedirect,
  requireFieldInvoiceIssueAccessOrRedirect,
  requireFieldInvoiceSendAccessOrRedirect,
  requireManualFieldChargeAccessOrRedirect,
  requirePricebookFieldChargeAccessOrRedirect,
  requireVisitScopeFieldChargeAccessOrRedirect,
} from '@/lib/auth/field-billing-access';
import { loadFieldBillingExplicitCapabilitiesForUser } from '@/lib/auth/internal-user-access-capabilities';
import {
  resolveBillingModeByAccountOwnerId,
} from '@/lib/business/internal-business-profile';
import { resolveOperationalMutationEntitlementAccess } from '@/lib/business/platform-entitlement';
import { INTERNAL_INVOICE_EMAIL_NOTIFICATION_TYPE } from '@/lib/business/internal-invoice-delivery';
import { resolveJobBillingSource } from '@/lib/business/job-billing-source';
import { buildDraftBillingSnapshot } from '@/lib/business/invoice-billing-snapshot';
import { autoSyncIssuedInvoiceToQbo } from '@/lib/qbo/qbo-auto-sync';
import { resolveOperationalTenantIdentity } from '@/lib/email/operational-tenant-branding';
import {
  normalizeInternalInvoiceItemType,
  resolveInternalInvoiceById,
  resolveInternalInvoiceByJobId,
  type InternalInvoiceRecord,
} from '@/lib/business/internal-invoice';
import {
  createTenantInvoicePaymentLink,
  expireStoredOpenTenantInvoiceCheckoutSessionsForInvoice,
  resolveInvoiceCollectedPaymentLedger,
} from '@/lib/business/internal-invoice-payments';
import { evaluateJobOpsStatus, healStalePaperworkOpsStatus } from '@/lib/actions/job-evaluator';
import {
  applyExternalBillingCompletionMutation,
  type JobBillingDisposition,
} from '@/lib/actions/external-billing-completion';
import { insertJobEvent } from '@/lib/actions/job-actions';
import { reconcileServiceCaseStatusAfterJobChange } from '@/lib/actions/service-case-reconciliation';
import { escapeHtml } from '@/lib/email/layout';
import { sendEmail } from '@/lib/email/sendEmail';
import { resolveNotificationAccountOwnerUserId } from '@/lib/notifications/account-owner';
import { sanitizeVisitScopeItemId, sanitizeVisitScopeItems } from '@/lib/jobs/visit-scope';
import { formatInvoiceDisplayReference } from '@/lib/utils/display-references';
import { resolveInternalInvoiceDuplicateRisks } from '@/lib/business/internal-invoice-duplicate-risk';
import { withJobsBillingDispositionSelectFallback } from '@/lib/supabase/jobs-billing-disposition-compat';

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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '').trim());
}

const INTERNAL_INVOICE_PANEL_HASH = 'internal-invoice-panel';

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
    const allowedPaths = new Set([`/jobs/${jobId}`, `/jobs/${jobId}/invoice`, '/reports/invoices']);
    if (!allowedPaths.has(parsed.pathname)) return fallback;

    parsed.searchParams.set('banner', banner);
    if (!parsed.hash && parsed.pathname !== '/reports/invoices') {
      parsed.hash = parsed.pathname.endsWith('/invoice') ? 'invoice-workspace' : INTERNAL_INVOICE_PANEL_HASH;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

function buildSupplementalInvoiceWorkspaceReturnHref(params: {
  jobId: string;
  tab: string;
  banner: string;
  supplementalInvoiceId: string;
  returnTo?: string | null;
}) {
  const baseHref = buildInternalInvoiceReturnHref(
    params.jobId,
    params.tab,
    params.banner,
    params.returnTo,
  );

  try {
    const parsed = new URL(baseHref, 'https://app.local');
    parsed.searchParams.set('invoice_id', params.supplementalInvoiceId);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return `${baseHref}${baseHref.includes('?') ? '&' : '?'}invoice_id=${encodeURIComponent(params.supplementalInvoiceId)}`;
  }
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

function formatInvoiceDateForDisplay(value: string | null | undefined) {
  const normalized = String(value ?? '').trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return normalized || 'N/A';
  return `${match[2]}-${match[3]}-${match[1]}`;
}

function normalizeJobContextForSentence(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!normalized) return 'your service visit';
  return normalized.replace(/[.!?\s]+$/g, '') || 'your service visit';
}

function resolveSafeEmailLogoUrl(rawUrl: string | null | undefined) {
  const normalized = String(rawUrl ?? '').trim();
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function buildContactLine(args: {
  businessName: string;
  supportEmail: string | null;
  supportPhone: string | null;
}) {
  const contactBits = [args.supportEmail, args.supportPhone].filter((value) => String(value ?? '').trim().length > 0);
  if (contactBits.length === 0) {
    return `Questions? Contact ${args.businessName}.`;
  }

  if (contactBits.length === 1) {
    return `Questions? Contact ${args.businessName} at ${contactBits[0]}.`;
  }

  return `Questions? Contact ${args.businessName} at ${contactBits[0]} or ${contactBits[1]}.`;
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

  let customerBilling: any = null;
  let contractorBilling: any = null;

  if (customerId) {
    const { data, error } = await adminSupabase
      .from('customers')
      .select('owner_user_id, full_name, first_name, last_name, billing_name, email, phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip, billing_country, qbo_customer_name')
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
      .select('owner_user_id, name, billing_name, billing_email, billing_phone, billing_contact_name, billing_contact_email, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip, billing_country, qbo_customer_name')
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
  accountOwnerUserId: string;
  jobType?: string | null;
  serviceCaseId?: string | null;
  previousOpsStatus: string | null;
  source: string;
}) {
  await evaluateJobOpsStatus(params.jobId);
  await healStalePaperworkOpsStatus(params.jobId);

  const { data: refreshedJob, error: refreshedJobErr } = await params.supabase
    .from('jobs')
    .select('ops_status, job_type, service_case_id')
    .eq('id', params.jobId)
    .single();

  if (refreshedJobErr) throw refreshedJobErr;

  const nextOpsStatus = String(refreshedJob?.ops_status ?? '').trim() || null;
  const refreshedJobType = String(refreshedJob?.job_type ?? params.jobType ?? '').trim().toLowerCase();
  const refreshedServiceCaseId = String(
    refreshedJob?.service_case_id ?? params.serviceCaseId ?? '',
  ).trim();

  if (refreshedJobType === 'service' && refreshedServiceCaseId) {
    await reconcileServiceCaseStatusAfterJobChange({
      supabase: params.supabase,
      accountOwnerUserId: params.accountOwnerUserId,
      serviceCaseId: refreshedServiceCaseId,
      triggerJobId: params.jobId,
      source: params.source,
    });
  }

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

async function resolveSupplementalParentInvoiceContext(params: {
  supabase: any;
  accountOwnerUserId: string;
  parentInvoiceId?: string;
  fallbackJobId?: string;
}) {
  const parentInvoiceId = String(params.parentInvoiceId ?? '').trim();
  const fallbackJobId = String(params.fallbackJobId ?? '').trim();

  if (!parentInvoiceId && !fallbackJobId) {
    return null;
  }

  if (parentInvoiceId) {
    const { data, error } = await params.supabase
      .from('internal_invoices')
      .select(
        'id, account_owner_user_id, job_id, customer_id, bill_to_kind, bill_to_contractor_id, location_id, service_case_id, invoice_kind, original_internal_invoice_id, supplemental_reason, invoice_number, status, source_type, total_cents, billing_name, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip',
      )
      .eq('id', parentInvoiceId)
      .eq('account_owner_user_id', params.accountOwnerUserId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return data;
  }

  const { data, error } = await params.supabase
    .from('internal_invoices')
    .select(
      'id, account_owner_user_id, job_id, customer_id, bill_to_kind, bill_to_contractor_id, location_id, service_case_id, invoice_kind, original_internal_invoice_id, supplemental_reason, invoice_number, status, source_type, total_cents, billing_name, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip',
    )
    .eq('job_id', fallbackJobId)
    .eq('account_owner_user_id', params.accountOwnerUserId)
    .eq('invoice_kind', 'primary')
    .neq('status', 'void')
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export type InternalInvoiceActionResult = {
  ok: boolean;
  banner?: string;
  fieldErrors?: Record<string, string>;
};

function isNoRedirectRequested(formData: FormData) {
  return getTrimmedString(formData.get('no_redirect')) === '1';
}

function resolveSmallMutationResult(params: {
  jobId: string;
  tab: string;
  banner: string;
  noRedirect: boolean;
  ok: boolean;
  fieldErrors?: Record<string, string>;
}): InternalInvoiceActionResult | never {
  if (params.noRedirect) {
    return {
      ok: params.ok,
      banner: params.banner,
      fieldErrors: params.fieldErrors,
    };
  }

  redirect(buildJobDetailHref(params.jobId, params.tab, params.banner));
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

// Resolves the effective starting unit price (in cents) for a Work Item imported
// into a draft invoice charge. Manually priced Work Items keep their expected price.
// A Work Item picked from the Pricebook but never manually priced (expected null)
// falls back to the source Pricebook item's default_unit_price. Otherwise 0.
// The Pricebook lookup is scoped to the account owner and is a prefill only.
async function resolveEffectiveUnitPriceCents(
  supabase: any,
  expectedUnitPrice: number | null | undefined,
  sourcePricebookItemId: string | null | undefined,
  accountOwnerUserId: string,
): Promise<number> {
  if (expectedUnitPrice != null) {
    return parseNonNegativeMoneyNumberToCents(expectedUnitPrice, 'Unit price');
  }

  const pricebookItemId = sanitizeVisitScopeItemId(sourcePricebookItemId);
  if (pricebookItemId && accountOwnerUserId) {
    const pricebookItem = await loadScopedPricebookSnapshot({
      supabase,
      accountOwnerUserId,
      pricebookItemId,
    });
    if (pricebookItem?.default_unit_price != null) {
      try {
        return parseNonNegativeMoneyNumberToCents(pricebookItem.default_unit_price, 'Unit price');
      } catch {
        return 0;
      }
    }
  }

  return 0;
}

async function requireOperationalInternalInvoiceEntitlementAccessOrRedirect(params: {
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

async function loadInternalInvoiceContext(formData: FormData) {
  const jobId =
    getTrimmedString(formData.get('job_id')) ||
    getTrimmedString(formData.get('id'));
  const invoiceIdInput =
    getTrimmedString(formData.get('invoice_id')) ||
    getTrimmedString(formData.get('supplemental_invoice_id'));

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

  await requireOperationalInternalInvoiceEntitlementAccessOrRedirect({
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

  const { data: job, error: jobErr } = await withJobsBillingDispositionSelectFallback<any>({
    runPrimary: () =>
      supabase
        .from('jobs')
        .select(
          'id, title, job_type, status, field_complete, ops_status, invoice_complete, billing_disposition, billing_disposition_note, billing_disposition_at, billing_disposition_by_user_id, invoice_number, data_entry_completed_at, customer_id, contractor_id, location_id, service_case_id, billing_recipient, customer_first_name, customer_last_name, billing_name, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip'
        )
        .eq('id', jobId)
        .single(),
    runCompat: () =>
      supabase
        .from('jobs')
        .select(
          'id, title, job_type, status, field_complete, ops_status, invoice_complete, invoice_number, data_entry_completed_at, customer_id, contractor_id, location_id, service_case_id, billing_recipient, customer_first_name, customer_last_name, billing_name, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip'
        )
        .eq('id', jobId)
        .single(),
    includeDispositionMetadata: true,
  });

  if (jobErr) throw jobErr;

  const invoice = invoiceIdInput
    ? await resolveInternalInvoiceById({
        supabase,
        invoiceId: invoiceIdInput,
      })
    : await resolveInternalInvoiceByJobId({ supabase, jobId });

  if (
    invoice
    && (
      invoice.account_owner_user_id !== internalUser.account_owner_user_id
      || invoice.job_id !== jobId
    )
  ) {
    redirect(buildJobDetailHref(jobId, tab, 'not_authorized'));
  }

  const fieldBillingExplicitCapabilities = await loadFieldBillingExplicitCapabilitiesForUser({
    supabase: supabase as any,
    accountOwnerUserId: internalUser.account_owner_user_id,
    internalUserId: internalUser.user_id,
  });

  return {
    supabase,
    userId,
    tab,
    jobId,
    returnTo: getTrimmedString(formData.get('return_to')),
    internalUser,
    job,
    invoice,
    fieldBillingExplicitCapabilities,
  };
}

type InternalInvoiceEmailDeliveryStatus = 'queued' | 'sent' | 'failed';
type InternalInvoiceEmailAttemptKind = 'sent' | 'resent';

function resolveInternalInvoiceGreetingName(args: {
  invoice: Pick<InternalInvoiceRecord, 'billing_name'>;
  job: {
    billing_recipient?: unknown;
    billing_name?: unknown;
    customer_first_name?: unknown;
    customer_last_name?: unknown;
  };
  contractorDisplayName?: string | null;
}) {
  const invoiceBillingName = getTrimmedString(args.invoice.billing_name);
  if (invoiceBillingName) return invoiceBillingName;

  const billingRecipient = String(args.job.billing_recipient ?? '').trim().toLowerCase();
  const jobBillingName = String(args.job.billing_name ?? '').trim();
  if (jobBillingName && billingRecipient !== 'customer') return jobBillingName;

  if (billingRecipient === 'contractor') {
    return args.contractorDisplayName || null;
  }

  const jobCustomerName = [args.job.customer_first_name, args.job.customer_last_name]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();

  if (billingRecipient === 'customer') {
    return jobBillingName || jobCustomerName || null;
  }

  return jobCustomerName || null;
}

async function resolveContractorGreetingNameForInvoiceEmail(args: {
  supabase: any;
  accountOwnerUserId: string;
  contractorId: unknown;
}) {
  const contractorId = String(args.contractorId ?? '').trim();
  if (!contractorId) return null;

  const { data, error } = await args.supabase
    .from('contractors')
    .select('billing_name, name')
    .eq('id', contractorId)
    .eq('owner_user_id', args.accountOwnerUserId)
    .maybeSingle();

  if (error) {
    console.warn('Invoice email contractor greeting lookup failed', {
      accountOwnerUserId: args.accountOwnerUserId,
      contractorId,
      message: error instanceof Error ? error.message : String((error as any)?.message ?? error),
    });
    return null;
  }

  return firstNonEmpty(data?.billing_name, data?.name);
}

function buildInternalInvoiceEmailBody(args: {
  businessName: string;
  companyLogoUrl: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  paymentUrl: string | null;
  invoice: InternalInvoiceRecord;
  greetingName: string | null;
  jobTitle: string | null;
  serviceLocation: string | null;
  customerName: string | null;
  amountPaidCents: number;
  balanceDueCents: number;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
}) {
  const lineItems = args.invoice.line_items ?? [];
  const totalDisplay = formatCurrencyFromCents(Number(args.invoice.total_cents ?? 0));
  const amountPaidDisplay = formatCurrencyFromCents(args.amountPaidCents);
  const balanceDueDisplay = formatCurrencyFromCents(args.balanceDueCents);
  const statusDisplay = args.paymentStatus === 'paid' ? 'Paid' : args.paymentStatus === 'partial' ? 'Partially Paid' : 'Issued';
  const safeLogoUrl = resolveSafeEmailLogoUrl(args.companyLogoUrl);
  const companyName = String(args.businessName ?? '').trim() || 'Compliance Matters';
  const recipientName = String(args.greetingName ?? args.invoice.billing_name ?? '').trim() || 'there';
  const jobContext = normalizeJobContextForSentence(args.jobTitle);
  const contactLine = buildContactLine({
    businessName: companyName,
    supportEmail: args.supportEmail,
    supportPhone: args.supportPhone,
  });
  const invoiceDateDisplay = formatInvoiceDateForDisplay(args.invoice.invoice_date);
  const serviceLocationText = String(args.serviceLocation ?? '').trim() || 'Service location unavailable';
  const customerNameText = String(args.customerName ?? '').trim() || 'Customer unavailable';
  const lineItemsHtml = lineItems
    .map((lineItem) => {
      const name = escapeHtml(String(lineItem.item_name_snapshot ?? '').trim() || 'Line item');
      const description = escapeHtml(String(lineItem.description_snapshot ?? '').trim());
      const serviceLocation = escapeHtml(serviceLocationText);
      const customerName = escapeHtml(customerNameText);
      const quantity = escapeHtml(String(lineItem.quantity ?? '0'));
      const unitPrice = escapeHtml(formatCurrencyFromCents(Math.round(Number(lineItem.unit_price ?? 0) * 100)));
      const subtotal = escapeHtml(formatCurrencyFromCents(Math.round(Number(lineItem.line_subtotal ?? 0) * 100)));

      return `
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top;">
            <div style="font-weight: 600; color: #111827;">${name}</div>
            ${description ? `<div style="margin-top: 4px; color: #4b5563; font-size: 13px;">${description}</div>` : ''}
          </td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #111827; vertical-align: top;">${serviceLocation}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #111827; vertical-align: top;">${customerName}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #111827; text-align: right; white-space: nowrap;">${quantity}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #111827; text-align: right; white-space: nowrap;">${unitPrice}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #111827; text-align: right; white-space: nowrap;">${subtotal}</td>
        </tr>`;
    })
    .join('');
  const invoiceReferenceText = formatInvoiceDisplayReference({
    invoiceDisplayNumber: args.invoice.invoice_display_number,
    invoiceNumber: args.invoice.invoice_number,
    invoiceId: args.invoice.id,
  });
  const invoiceReference = escapeHtml(invoiceReferenceText);
  const invoiceDate = escapeHtml(invoiceDateDisplay);
  const total = escapeHtml(totalDisplay);
  const notes = escapeHtml(String(args.invoice.notes ?? '').trim());
  const paymentUrl = String(args.paymentUrl ?? '').trim();
  const safePaymentUrl = paymentUrl ? escapeHtml(paymentUrl) : null;
  const paymentSection = safePaymentUrl
    ? `
              <tr>
                <td style="padding: 16px 20px 0 20px;">
                  <div style="border: 1px solid #dbe4f0; border-radius: 12px; background: #f8fbff; padding: 14px;">
                    <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #334155;">You can pay this invoice securely online using the button below.</p>
                    <div style="margin-top: 12px;">
                      <a href="${safePaymentUrl}" style="display: inline-block; background: #0b3b87; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; line-height: 1; padding: 12px 16px; border-radius: 10px;">Pay Invoice</a>
                    </div>
                    <p style="margin: 10px 0 0 0; font-size: 12px; line-height: 1.5; color: #64748b;">Payment is processed securely by Stripe.</p>
                  </div>
                </td>
              </tr>`
    : '';

  return `
    <div style="margin: 0; padding: 0; background: #f3f6fb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #0f172a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin: 0; padding: 24px 12px;">
        <tr>
          <td align="center" style="padding: 0;">
            <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width: 100%; max-width: 640px; border-collapse: collapse; border: 1px solid #dbe4f0; border-radius: 16px; overflow: hidden; background: #ffffff; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);">
              <tr>
                <td style="padding: 18px 20px 10px 20px; border-bottom: 1px solid #e2e8f0; background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);">
                  <div style="font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #1d4ed8; font-weight: 700; margin: 0 0 8px 0;">Invoice</div>
                  ${safeLogoUrl
                    ? `<img src="${escapeHtml(safeLogoUrl)}" alt="" width="180" height="48" style="display: block; max-width: 180px; max-height: 48px; width: auto; height: auto; object-fit: contain; border: 0; outline: none; text-decoration: none;" />`
                    : `<div style="font-size: 22px; line-height: 1.2; font-weight: 700; color: #0f172a;">${escapeHtml(companyName)}</div>`}
                </td>
              </tr>
              <tr>
                <td style="padding: 18px 20px 0 20px;">
                  <h1 style="margin: 0; font-size: 24px; line-height: 1.25; color: #0f172a;">${invoiceReference}</h1>
                  <p style="margin: 10px 0 0 0; font-size: 15px; line-height: 1.6; color: #334155;">Hi ${escapeHtml(recipientName)},</p>
                  <p style="margin: 2px 0 0 0; font-size: 15px; line-height: 1.6; color: #334155;">Your invoice for ${escapeHtml(jobContext)} is ready.</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 16px 20px 0 20px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: 1px solid #dbe4f0; border-radius: 12px; overflow: hidden; background: #f8fbff;">
                    <tr>
                      <td colspan="2" style="padding: 10px 12px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #334155; font-weight: 700; border-bottom: 1px solid #dbe4f0;">Invoice Summary</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 12px; font-size: 13px; color: #475569;">Invoice #</td>
                      <td align="right" style="padding: 8px 12px; font-size: 13px; color: #0f172a; font-weight: 600;">${invoiceReference}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 12px; font-size: 13px; color: #475569;">Invoice Date</td>
                      <td align="right" style="padding: 8px 12px; font-size: 13px; color: #0f172a; font-weight: 600;">${invoiceDate}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 12px; font-size: 13px; color: #475569;">Status</td>
                      <td align="right" style="padding: 8px 12px; font-size: 13px; color: ${args.paymentStatus === 'paid' ? '#047857' : '#0f172a'}; font-weight: 700;">${statusDisplay}</td>
                    </tr>
                    ${args.amountPaidCents > 0 ? `<tr><td style="padding: 8px 12px; font-size: 13px; color: #475569;">Amount Paid</td><td align="right" style="padding: 8px 12px; font-size: 13px; color: #047857; font-weight: 700;">${amountPaidDisplay}</td></tr>` : ''}
                    <tr>
                      <td style="padding: 10px 12px; font-size: 13px; color: #0f172a; font-weight: 700; border-top: 1px solid #dbe4f0;">Balance Due</td>
                      <td align="right" style="padding: 10px 12px; font-size: 16px; color: ${args.paymentStatus === 'paid' ? '#047857' : '#0b3b87'}; font-weight: 800; border-top: 1px solid #dbe4f0;">${balanceDueDisplay}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding: 16px 20px 0 20px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: 1px solid #dbe4f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
                    <thead>
                      <tr style="background: #f1f5f9;">
                        <th align="left" style="padding: 10px 12px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #334155;">Description</th>
                        <th align="left" style="padding: 10px 12px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #334155;">Service Location</th>
                        <th align="left" style="padding: 10px 12px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #334155;">Customer</th>
                        <th align="right" style="padding: 10px 12px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #334155;">Qty</th>
                        <th align="right" style="padding: 10px 12px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #334155;">Unit Price</th>
                        <th align="right" style="padding: 10px 12px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #334155;">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${lineItemsHtml || `<tr><td colspan="6" style="padding: 12px; color: #475569;">No billed line items were recorded.</td></tr>`}
                      <tr>
                        <td colspan="5" align="right" style="padding: 10px 12px; border-top: 1px solid #dbe4f0; font-size: 13px; color: #334155; font-weight: 700;">Total</td>
                        <td align="right" style="padding: 10px 12px; border-top: 1px solid #dbe4f0; font-size: 14px; color: #0f172a; font-weight: 800;">${total}</td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
              ${paymentSection}
              ${notes ? `<tr><td style="padding: 16px 20px 0 20px;"><div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; background: #f8fafc;"><div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #334155; font-weight: 700; margin: 0 0 6px 0;">Notes</div><div style="font-size: 14px; line-height: 1.55; color: #334155;">${notes.replace(/\n/g, '<br />')}</div></div></td></tr>` : ''}
              <tr>
                <td style="padding: 16px 20px 20px 20px;">
                  <p style="margin: 0 0 8px 0; font-size: 14px; line-height: 1.6; color: #334155;">Please contact us with any billing questions or payment instructions.</p>
                  <p style="margin: 0 0 4px 0; font-size: 13px; line-height: 1.6; color: #475569;">${escapeHtml(contactLine)}</p>
                  <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #94a3b8;">This invoice was sent by ${escapeHtml(companyName)}.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function buildInternalInvoiceEmailText(args: {
  businessName: string;
  supportEmail: string | null;
  supportPhone: string | null;
  paymentUrl: string | null;
  invoice: InternalInvoiceRecord;
  greetingName: string | null;
  jobTitle: string | null;
  serviceLocation: string | null;
  customerName: string | null;
  amountPaidCents: number;
  balanceDueCents: number;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
}) {
  const invoiceReference = formatInvoiceDisplayReference({
    invoiceDisplayNumber: args.invoice.invoice_display_number,
    invoiceNumber: args.invoice.invoice_number,
    invoiceId: args.invoice.id,
  });
  const invoiceDate = formatInvoiceDateForDisplay(args.invoice.invoice_date);
  const recipientName = String(args.greetingName ?? args.invoice.billing_name ?? '').trim() || 'there';
  const jobTitle = normalizeJobContextForSentence(args.jobTitle);
  const serviceLocation = String(args.serviceLocation ?? '').trim() || 'Service location unavailable';
  const customerName = String(args.customerName ?? '').trim() || 'Customer unavailable';
  const total = formatCurrencyFromCents(Number(args.invoice.total_cents ?? 0));
  const amountPaid = formatCurrencyFromCents(args.amountPaidCents);
  const balanceDue = formatCurrencyFromCents(args.balanceDueCents);
  const status = args.paymentStatus === 'paid' ? 'Paid' : args.paymentStatus === 'partial' ? 'Partially Paid' : 'Issued';
  const paymentUrl = String(args.paymentUrl ?? '').trim();
  const contactLine = buildContactLine({
    businessName: args.businessName,
    supportEmail: args.supportEmail,
    supportPhone: args.supportPhone,
  });

  const lineItems = (args.invoice.line_items ?? [])
    .map((lineItem, index) => {
      const itemName = String(lineItem.item_name_snapshot ?? '').trim() || `Line item ${index + 1}`;
      const quantity = String(lineItem.quantity ?? '0').trim() || '0';
      const unitPrice = formatCurrencyFromCents(Math.round(Number(lineItem.unit_price ?? 0) * 100));
      const subtotal = formatCurrencyFromCents(Math.round(Number(lineItem.line_subtotal ?? 0) * 100));
      return `${index + 1}. ${itemName} | Service Location: ${serviceLocation} | Customer: ${customerName} | Qty: ${quantity} | Unit: ${unitPrice} | Subtotal: ${subtotal}`;
    })
    .join('\n');

  const notes = String(args.invoice.notes ?? '').trim();

  return [
    `Hi ${recipientName},`,
    '',
    `Your invoice for ${jobTitle} is ready.`,
    '',
    'INVOICE SUMMARY',
    `Invoice: ${invoiceReference}`,
    `Invoice Date: ${invoiceDate}`,
    `Status: ${status}`,
    `Total: ${total}`,
    ...(args.amountPaidCents > 0 ? [`Amount Paid: ${amountPaid}`] : []),
    `Balance Due: ${balanceDue}`,
    ...(paymentUrl
      ? [
          '',
          'ONLINE PAYMENT',
          'You can pay this invoice securely online using the button below.',
          'Pay Invoice:',
          paymentUrl,
          'Payment is processed securely by Stripe.',
        ]
      : []),
    '',
    'CHARGES',
    lineItems || 'No billed line items were recorded.',
    ...(notes ? ['', 'NOTES', notes] : []),
    '',
    'Please contact us with any billing questions or payment instructions.',
    contactLine,
    `This invoice was sent by ${args.businessName}.`,
  ].join('\n');
}

async function resolveServiceLocationLabelForInvoiceEmail(params: {
  supabase: any;
  accountOwnerUserId: string;
  locationId: string | null | undefined;
}) {
  const locationId = String(params.locationId ?? '').trim();
  if (!locationId) return null;

  const { data, error } = await params.supabase
    .from('locations')
    .select('address_line1, address_line2, city, state, zip, postal_code')
    .eq('id', locationId)
    .eq('owner_user_id', params.accountOwnerUserId)
    .maybeSingle();

  if (error) return null;
  if (!data) return null;

  const line1 = getOptionalText(data.address_line1);
  const line2 = getOptionalText(data.address_line2);
  const city = getOptionalText(data.city);
  const state = getOptionalText(data.state);
  const zip = getOptionalText(data.zip) ?? getOptionalText(data.postal_code);
  const locality = [city, state, zip].filter(Boolean).join(' ');

  const label = [line1, line2, locality].filter(Boolean).join(', ');
  return label || null;
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
  providerMessageId?: string | null;
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
    const providerMessageId = String(params.providerMessageId ?? '').trim();
    patch.payload = {
      ...(existingNotification?.payload ?? {}),
      provider_name: 'resend',
      ...(providerMessageId ? { provider_message_id: providerMessageId } : {}),
    };
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

async function resolveInvoicePaymentLinkForEmail(params: {
  supabase: any;
  accountOwnerUserId: string;
  jobId: string;
  invoice: InternalInvoiceRecord;
}) {
  if (!params.invoice?.id) return null;
  if (String(params.invoice.status ?? '').trim().toLowerCase() !== 'issued') return null;

  try {
    const paymentLink = await createTenantInvoicePaymentLink({
      accountOwnerUserId: params.accountOwnerUserId,
      jobId: params.jobId,
      invoiceId: params.invoice.id,
      supabase: params.supabase,
    });

    return String(paymentLink.paymentLinkUrl ?? '').trim() || null;
  } catch (error) {
    console.warn('Invoice email payment link unavailable', {
      accountOwnerUserId: params.accountOwnerUserId,
      jobId: params.jobId,
      invoiceId: params.invoice.id,
      message: error instanceof Error ? error.message : 'unknown_error',
    });
    return null;
  }
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

function fieldChargeDeniedRedirect(context: Awaited<ReturnType<typeof loadInternalInvoiceContext>>) {
  return buildInternalInvoiceReturnHref(context.jobId, context.tab, 'not_authorized', context.returnTo);
}

function fieldChargeAccessParams(context: Awaited<ReturnType<typeof loadInternalInvoiceContext>>) {
  return {
    actorUserId: context.userId,
    internalUser: context.internalUser,
    resourceAccountOwnerUserId: context.internalUser.account_owner_user_id,
    explicitCapabilities: context.fieldBillingExplicitCapabilities,
    redirectTo: fieldChargeDeniedRedirect(context),
  };
}

function resolveFieldChargeCapabilities(context: Awaited<ReturnType<typeof loadInternalInvoiceContext>>) {
  return resolveFieldBillingCapabilities({
    actorUserId: context.userId,
    internalUser: context.internalUser,
    resourceAccountOwnerUserId: context.internalUser.account_owner_user_id,
    explicitCapabilities: context.fieldBillingExplicitCapabilities,
  });
}

function hasDraftInvoiceCreateAccess(context: Awaited<ReturnType<typeof loadInternalInvoiceContext>>) {
  if (canManageInvoiceLifecycle({
    actorUserId: context.userId,
    internalUser: context.internalUser,
    resourceAccountOwnerUserId: context.internalUser.account_owner_user_id,
  })) {
    return true;
  }

  return resolveFieldChargeCapabilities(context).can_create_direct_invoice_draft;
}

function isAutoImportVisitScopeRequested(formData: FormData) {
  return getTrimmedString(formData.get('auto_import_visit_scope_items')) === '1';
}

async function importEligibleVisitScopeItemsToDraftInvoice(params: {
  context: Awaited<ReturnType<typeof loadInternalInvoiceContext>>;
  invoice: {
    id: string;
    status: string;
    line_items?: Array<{
      source_kind?: string | null;
      source_visit_scope_item_id?: string | null;
    }> | null;
  };
}) {
  const { context, invoice } = params;
  if (!invoice?.id || String(invoice.status ?? '').trim().toLowerCase() !== 'draft') {
    return { insertedCount: 0, subtotalCents: null as number | null };
  }

  const capabilities = resolveFieldChargeCapabilities(context);
  if (!capabilities.can_convert_visit_scope_to_invoice_lines) {
    return { insertedCount: 0, subtotalCents: null as number | null };
  }

  const { data: jobScopeRow, error: jobScopeErr } = await context.supabase
    .from('jobs')
    .select('id, visit_scope_items')
    .eq('id', context.jobId)
    .maybeSingle();

  if (jobScopeErr) throw jobScopeErr;
  if (!jobScopeRow?.id) {
    return { insertedCount: 0, subtotalCents: null as number | null };
  }

  let scopeItems: ReturnType<typeof sanitizeVisitScopeItems> = [];
  try {
    scopeItems = sanitizeVisitScopeItems(jobScopeRow.visit_scope_items ?? []);
  } catch {
    return { insertedCount: 0, subtotalCents: null as number | null };
  }

  const existingScopeSourceIds = new Set(
    (invoice.line_items ?? [])
      .filter((lineItem) => lineItem.source_kind === 'visit_scope')
      .map((lineItem) => sanitizeVisitScopeItemId(lineItem.source_visit_scope_item_id))
      .filter(Boolean) as string[],
  );

  const eligibleScopeItems = scopeItems
    .map((scopeItem) => {
      const scopeItemId = sanitizeVisitScopeItemId(scopeItem.id);
      if (!scopeItemId || existingScopeSourceIds.has(scopeItemId)) return null;
      return { scopeItemId, scopeItem };
    })
    .filter(Boolean) as Array<{
      scopeItemId: string;
      scopeItem: ReturnType<typeof sanitizeVisitScopeItems>[number];
    }>;

  if (eligibleScopeItems.length === 0) {
    return { insertedCount: 0, subtotalCents: null as number | null };
  }

  const nextSortOrder = (invoice.line_items?.length ?? 0) + 1;
  const payload = await Promise.all(eligibleScopeItems.map(async ({ scopeItemId, scopeItem }, index) => {
    const quantityHundredths = parseQuantityToHundredths(String(scopeItem.expected_quantity ?? 1));
    const unitPriceCents = await resolveEffectiveUnitPriceCents(
      context.supabase,
      scopeItem.expected_unit_price,
      scopeItem.source_pricebook_item_id,
      context.internalUser.account_owner_user_id,
    );
    const lineSubtotalCents = computeLineSubtotalCents(quantityHundredths, unitPriceCents);

    return {
      invoice_id: invoice.id,
      sort_order: nextSortOrder + index,
      source_kind: 'visit_scope',
      source_visit_scope_item_id: scopeItemId,
      item_name_snapshot: getTrimmedString(scopeItem.title),
      description_snapshot: getOptionalText(scopeItem.details),
      item_type_snapshot: scopeItem.item_type
        ? normalizeInternalInvoiceItemType(scopeItem.item_type)
        : 'service',
      category_snapshot: getOptionalText(scopeItem.category),
      unit_label_snapshot: getOptionalText(scopeItem.unit_label),
      quantity: formatScaledInt(quantityHundredths, 2),
      unit_price: formatScaledInt(unitPriceCents, 2),
      line_subtotal: formatScaledInt(lineSubtotalCents, 2),
      created_by_user_id: context.userId,
      updated_by_user_id: context.userId,
    };
  }));

  const { error: insertErr } = await context.supabase
    .from('internal_invoice_line_items')
    .insert(payload);

  if (insertErr) throw insertErr;

  const subtotalCents = await syncInvoiceTotalsFromLineItems({
    supabase: context.supabase,
    invoiceId: invoice.id,
    userId: context.userId,
  });

  return { insertedCount: payload.length, subtotalCents };
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

/**
 * "Bill To" control: change who a draft invoice bills (customer / contractor /
 * other) and RE-PULL the billing snapshot from that source. This decouples
 * "which contractor is assigned" from "who pays" — a job can keep its contractor
 * while billing the customer, and vice versa. Only mutates DRAFT invoices.
 */
export async function updateInvoiceBillToFromForm(formData: FormData) {
  const context = await loadInternalInvoiceContext(formData);

  requireInvoiceLifecycleAccessOrRedirect({
    actorUserId: context.userId,
    internalUser: context.internalUser,
    resourceAccountOwnerUserId: context.internalUser.account_owner_user_id,
    redirectTo: buildInternalInvoiceReturnHref(context.jobId, context.tab, 'not_authorized', context.returnTo),
  });

  if (!context.invoice) {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_missing', context.returnTo));
  }
  if (context.invoice.status !== 'draft') {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_locked', context.returnTo));
  }

  const requested = String(formData.get('billing_recipient') ?? '').trim().toLowerCase();
  if (requested !== 'customer' && requested !== 'contractor' && requested !== 'other') {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_bill_to_invalid', context.returnTo));
  }
  if (requested === 'contractor' && !String(context.job.contractor_id ?? '').trim()) {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_bill_to_no_contractor', context.returnTo));
  }

  // Persist the job's bill-to classification (admin write, already access-gated).
  const adminSupabase = createAdminClient();
  const { error: jobErr } = await adminSupabase
    .from('jobs')
    .update({ billing_recipient: requested })
    .eq('id', context.jobId);
  if (jobErr) throw jobErr;

  // Re-pull the draft snapshot from the newly-selected source.
  const { customerBilling, contractorBilling } = await loadCanonicalDraftBillingSources({
    internalUser: context.internalUser,
    job: context.job,
  });
  const draftBilling = buildDraftBillingSnapshot({
    billingRecipient: requested,
    customerBilling,
    contractorBilling,
    jobBilling: buildJobOverrideBillingSnapshot(context.job),
  });

  const { error: invErr } = await context.supabase
    .from('internal_invoices')
    .update({
      ...draftBilling,
      bill_to_kind: requested,
      bill_to_contractor_id: requested === 'contractor' ? context.job.contractor_id : null,
      updated_by_user_id: context.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', context.invoice.id)
    .eq('status', 'draft');
  if (invErr) throw invErr;

  revalidatePath(`/jobs/${context.jobId}`);
  revalidatePath(`/jobs/${context.jobId}/invoice`);
  revalidatePath('/reports/invoices');
  redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_bill_to_updated', context.returnTo));
}

export async function createInternalInvoiceDraftFromForm(formData: FormData) {
  const context = await loadInternalInvoiceContext(formData);

  if (!hasDraftInvoiceCreateAccess(context)) {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'not_authorized', context.returnTo));
  }

  if (context.invoice) {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_draft_exists', context.returnTo));
  }

  const { customerBilling, contractorBilling } = await loadCanonicalDraftBillingSources({
    internalUser: context.internalUser,
    job: context.job,
  });

  const jobBilling = buildJobOverrideBillingSnapshot(context.job);

  const draftBilling = buildDraftBillingSnapshot({
    billingRecipient: context.job.billing_recipient,
    customerBilling,
    contractorBilling,
    jobBilling,
  });

  const draftPayload = {
    account_owner_user_id: context.internalUser.account_owner_user_id,
    job_id: context.jobId,
    customer_id: context.job.customer_id ?? null,
    bill_to_kind: String(context.job.billing_recipient ?? '').trim().toLowerCase() || 'customer',
    bill_to_contractor_id:
      String(context.job.billing_recipient ?? '').trim().toLowerCase() === 'contractor'
        ? context.job.contractor_id ?? null
        : null,
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
    .select('id, invoice_number, invoice_display_number, status, total_cents')
    .single();

  if (error) {
    if (error.code === '23505') {
      redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_draft_exists', context.returnTo));
    }
    throw error;
  }

  const invoiceDisplayNumber = String(data?.invoice_display_number ?? '').trim();
  if (!invoiceDisplayNumber) {
    throw new Error('Invoice draft insert failed: missing invoice_display_number');
  }

  const autoImportResult = isAutoImportVisitScopeRequested(formData)
    ? await importEligibleVisitScopeItemsToDraftInvoice({
        context,
        invoice: {
          id: String(data.id),
          status: String(data.status),
          line_items: [],
        },
      })
    : { insertedCount: 0, subtotalCents: null as number | null };

  await logInvoiceEvent({
    supabase: context.supabase,
    userId: context.userId,
    jobId: context.jobId,
    eventType: 'internal_invoice_drafted',
    invoice: {
      id: String(data.id),
      invoice_number: String(data.invoice_number),
      status: String(data.status),
      total_cents: autoImportResult.subtotalCents ?? (Number(data.total_cents ?? 0) || 0),
    },
    extraMeta: autoImportResult.insertedCount > 0
      ? { auto_imported_visit_scope_line_count: autoImportResult.insertedCount }
      : undefined,
  });

  revalidatePath(`/jobs/${context.jobId}`);
  revalidatePath(`/jobs/${context.jobId}/invoice`);
  revalidatePath('/jobs');
  revalidatePath('/ops');
  redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_draft_created', context.returnTo));
}

export async function createSupplementalInternalInvoiceFromForm(formData: FormData) {
  const supabase = await createClient();
  const { userId, internalUser } = await requireInternalUser({ supabase });

  const requestedJobId =
    getTrimmedString(formData.get('job_id')) ||
    getTrimmedString(formData.get('id'));
  const parentInvoiceId =
    getTrimmedString(formData.get('original_internal_invoice_id')) ||
    getTrimmedString(formData.get('parent_invoice_id')) ||
    getTrimmedString(formData.get('invoice_id'));
  const tab = getTrimmedString(formData.get('tab')) || 'info';
  const returnTo = getTrimmedString(formData.get('return_to'));
  const supplementalReason = getOptionalText(formData.get('supplemental_reason'));

  if (!requestedJobId && !parentInvoiceId) {
    redirect(buildJobDetailHref('unknown', tab, 'internal_invoice_supplemental_parent_required'));
  }

  await requireOperationalInternalInvoiceEntitlementAccessOrRedirect({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const billingMode = await resolveBillingModeByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  if (billingMode !== 'internal_invoicing') {
    redirect(buildJobDetailHref(requestedJobId || 'unknown', tab, 'internal_invoicing_billing_pending'));
  }

  const parentInvoice = await resolveSupplementalParentInvoiceContext({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    parentInvoiceId,
    fallbackJobId: requestedJobId,
  });

  if (!parentInvoice) {
    redirect(buildJobDetailHref(requestedJobId || 'unknown', tab, 'internal_invoice_supplemental_parent_missing'));
  }

  const jobId = String(parentInvoice.job_id ?? '').trim() || requestedJobId;
  const scopedJob = await loadScopedInternalJobForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
    select: 'id',
  });

  if (!scopedJob?.id) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo));
  }

  requireInvoiceLifecycleAccessOrRedirect({
    actorUserId: userId,
    internalUser,
    resourceAccountOwnerUserId: internalUser.account_owner_user_id,
    redirectTo: buildInternalInvoiceReturnHref(jobId, tab, 'not_authorized', returnTo),
  });

  if (requestedJobId && requestedJobId !== String(parentInvoice.job_id ?? '').trim()) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoice_supplemental_parent_invalid', returnTo));
  }

  const parentInvoiceKind = String(parentInvoice.invoice_kind ?? '').trim().toLowerCase();
  if (parentInvoiceKind !== 'primary') {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoice_supplemental_parent_invalid', returnTo));
  }

  const parentStatus = String(parentInvoice.status ?? '').trim().toLowerCase();
  const allowedParentStatuses = new Set(['issued', 'sent', 'partially_paid', 'paid']);
  if (!allowedParentStatuses.has(parentStatus)) {
    redirect(buildInternalInvoiceReturnHref(jobId, tab, 'internal_invoice_supplemental_parent_invalid_state', returnTo));
  }

  const draftPayload = {
    account_owner_user_id: internalUser.account_owner_user_id,
    job_id: String(parentInvoice.job_id ?? '').trim() || jobId,
    customer_id: parentInvoice.customer_id ?? null,
    bill_to_kind: parentInvoice.bill_to_kind ?? null,
    bill_to_contractor_id: parentInvoice.bill_to_contractor_id ?? null,
    location_id: parentInvoice.location_id ?? null,
    service_case_id: parentInvoice.service_case_id ?? null,
    invoice_kind: 'supplemental',
    original_internal_invoice_id: String(parentInvoice.id ?? '').trim(),
    supplemental_reason: supplementalReason,
    invoice_number: buildInternalInvoiceNumber(),
    status: 'draft',
    invoice_date: new Date().toISOString().slice(0, 10),
    source_type: String(parentInvoice.source_type ?? '').trim() || 'job',
    subtotal_cents: 0,
    total_cents: 0,
    notes: null,
    billing_name: getOptionalText(parentInvoice.billing_name),
    billing_email: getOptionalText(parentInvoice.billing_email),
    billing_phone: getOptionalText(parentInvoice.billing_phone),
    billing_address_line1: getOptionalText(parentInvoice.billing_address_line1),
    billing_address_line2: getOptionalText(parentInvoice.billing_address_line2),
    billing_city: getOptionalText(parentInvoice.billing_city),
    billing_state: getOptionalText(parentInvoice.billing_state),
    billing_zip: getOptionalText(parentInvoice.billing_zip),
    created_by_user_id: userId,
    updated_by_user_id: userId,
  };

  const { data, error } = await supabase
    .from('internal_invoices')
    .insert(draftPayload)
    .select('id, invoice_number, invoice_display_number, status, total_cents')
    .single();

  if (error) throw error;

  const invoiceDisplayNumber = String(data?.invoice_display_number ?? '').trim();
  if (!invoiceDisplayNumber) {
    throw new Error('Supplemental invoice draft insert failed: missing invoice_display_number');
  }

  await logInvoiceEvent({
    supabase,
    userId,
    jobId,
    eventType: 'internal_invoice_drafted',
    invoice: {
      id: String(data.id),
      invoice_number: String(data.invoice_number),
      status: String(data.status),
      total_cents: Number(data.total_cents ?? 0) || 0,
    },
    extraMeta: {
      invoice_kind: 'supplemental',
      original_internal_invoice_id: String(parentInvoice.id ?? '').trim(),
      supplemental_reason: supplementalReason,
    },
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/invoice`);
  revalidatePath('/jobs');
  revalidatePath('/ops');

  redirect(
    buildSupplementalInvoiceWorkspaceReturnHref({
      jobId,
      tab,
      banner: 'internal_invoice_supplemental_draft_created',
      supplementalInvoiceId: String(data.id),
      returnTo,
    }),
  );
}

export async function saveInternalInvoiceDraftFromForm(formData: FormData): Promise<InternalInvoiceActionResult | void> {
  const context = await loadInternalInvoiceContext(formData);
  const noRedirect = isNoRedirectRequested(formData);

  requireInvoiceLifecycleAccessOrRedirect({
    actorUserId: context.userId,
    internalUser: context.internalUser,
    resourceAccountOwnerUserId: context.internalUser.account_owner_user_id,
    redirectTo: buildInternalInvoiceReturnHref(context.jobId, context.tab, 'not_authorized', context.returnTo),
  });

  if (!context.invoice) {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_missing',
      noRedirect,
      ok: false,
    });
  }

  if (context.invoice.status !== 'draft') {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_locked',
      noRedirect,
      ok: false,
    });
  }

  const invoiceNumber = getTrimmedString(formData.get('invoice_number'));
  if (!invoiceNumber) {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_required_fields',
      noRedirect,
      ok: false,
      fieldErrors: {
        invoice_number: 'Invoice number is required.',
      },
    });
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
      return resolveSmallMutationResult({
        jobId: context.jobId,
        tab: context.tab,
        banner: 'internal_invoice_number_taken',
        noRedirect,
        ok: false,
        fieldErrors: {
          invoice_number: 'Invoice number is already in use.',
        },
      });
    }
    throw error;
  }

  revalidatePath(`/jobs/${context.jobId}`);
  if (!noRedirect) {
    revalidatePath('/jobs');
    revalidatePath('/ops');
  }

  return resolveSmallMutationResult({
    jobId: context.jobId,
    tab: context.tab,
    banner: 'internal_invoice_draft_saved',
    noRedirect,
    ok: true,
  });
}

type LoadedInternalInvoiceContext = Awaited<ReturnType<typeof loadInternalInvoiceContext>>;

// Slice B: issue mutation core, shared by issueInternalInvoiceFromForm and the
// compound issueAndSendInternalInvoiceFromForm. Callers must run readiness checks
// (recipient, charges, total, job closeout) and access gates BEFORE invoking.
// This performs the mutation only — no revalidate, no redirect.
async function applyInternalInvoiceIssueMutation(context: LoadedInternalInvoiceContext) {
  const invoice = context.invoice;
  if (!invoice) throw new Error('Invoice is required to issue.');

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
    .eq('id', invoice.id)
    .eq('status', 'draft');

  if (invoiceErr) throw invoiceErr;

  const { error: jobErr } = await context.supabase
    .from('jobs')
    .update({
      invoice_complete: true,
      invoice_number: invoice.invoice_number,
    })
    .eq('id', context.jobId);

  if (jobErr) throw jobErr;

  await logInvoiceEvent({
    supabase: context.supabase,
    userId: context.userId,
    jobId: context.jobId,
    eventType: 'internal_invoice_issued',
    invoice: {
      ...invoice,
      status: 'issued',
    },
  });

  await recomputeOpsAfterInvoiceMutation({
    supabase: context.supabase,
    jobId: context.jobId,
    userId: context.userId,
    accountOwnerUserId: context.internalUser.account_owner_user_id,
    jobType: context.job.job_type ?? null,
    serviceCaseId: context.job.service_case_id ?? null,
    previousOpsStatus,
    source: 'internal_invoice_issue_recompute',
  });

  // Auto-sync the freshly-issued invoice to QBO so users never have to run a
  // manual sync. Best-effort and never throws: unconnected accounts and envs
  // without QBO are no-ops; transient failures are recorded on the invoice for
  // the next retry. Both "Issue" and "Issue & Send" flow through here.
  await autoSyncIssuedInvoiceToQbo({
    accountOwnerUserId: context.internalUser.account_owner_user_id,
    invoiceId: invoice.id,
  });
}

async function requireDuplicateChargeReviewBeforeIssue(context: LoadedInternalInvoiceContext, formData: FormData) {
  if (!context.invoice || String(formData.get('duplicate_charge_review_confirmed') ?? '') === '1') return;
  const risks = await resolveInternalInvoiceDuplicateRisks({
    supabase: context.supabase,
    accountOwnerUserId: context.internalUser.account_owner_user_id,
    invoiceId: context.invoice.id,
    customerId: context.invoice.customer_id,
    lineItems: context.invoice.line_items ?? [],
  });
  if (risks.length > 0) {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_duplicate_review_required', context.returnTo));
  }
}

export async function issueInternalInvoiceFromForm(formData: FormData) {
  const context = await loadInternalInvoiceContext(formData);

  requireFieldInvoiceIssueAccessOrRedirect({
    actorUserId: context.userId,
    internalUser: context.internalUser,
    resourceAccountOwnerUserId: context.internalUser.account_owner_user_id,
    explicitCapabilities: context.fieldBillingExplicitCapabilities,
    redirectTo: buildInternalInvoiceReturnHref(context.jobId, context.tab, 'not_authorized', context.returnTo),
  });

  if (!context.invoice) {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_missing', context.returnTo));
  }

  if (context.invoice.status === 'issued') {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_already_issued', context.returnTo));
  }

  if (context.invoice.status === 'void') {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_locked', context.returnTo));
  }

  if (!context.job.field_complete || String(context.job.status ?? '').trim().toLowerCase() !== 'completed') {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_issue_blocked', context.returnTo));
  }

  const billingName = getTrimmedString(context.invoice.billing_name);
  if (!billingName || context.invoice.total_cents <= 0 || (context.invoice.line_items?.length ?? 0) === 0) {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_issue_incomplete', context.returnTo));
  }

  await requireDuplicateChargeReviewBeforeIssue(context, formData);

  await applyInternalInvoiceIssueMutation(context);

  revalidatePath(`/jobs/${context.jobId}`);
  revalidatePath(`/jobs/${context.jobId}/invoice`);
  revalidatePath('/jobs');
  revalidatePath('/ops');
  redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_issued', context.returnTo));
}

function billingDispositionBanner(disposition: JobBillingDisposition) {
  return disposition === 'no_charge'
    ? 'internal_invoice_no_charge_saved'
    : 'internal_invoice_externally_billed_saved';
}

function buildExternalBillingRecordedInvoiceWorkspaceHref(jobId: string) {
  return `/jobs/${jobId}/invoice?banner=external_billing_recorded#invoice-workspace`;
}

async function markInternalInvoiceBillingDispositionFromForm(
  formData: FormData,
  disposition: JobBillingDisposition,
): Promise<InternalInvoiceActionResult | void> {
  const context = await loadInternalInvoiceContext(formData);
  const noRedirect = isNoRedirectRequested(formData);
  const banner = billingDispositionBanner(disposition);

  requireFieldInvoiceIssueAccessOrRedirect({
    actorUserId: context.userId,
    internalUser: context.internalUser,
    resourceAccountOwnerUserId: context.internalUser.account_owner_user_id,
    explicitCapabilities: context.fieldBillingExplicitCapabilities,
    redirectTo: buildInternalInvoiceReturnHref(context.jobId, context.tab, 'not_authorized', context.returnTo),
  });

  if (!context.invoice) {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_missing',
      noRedirect,
      ok: false,
    });
  }

  if (context.invoice.status !== 'draft') {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_locked',
      noRedirect,
      ok: false,
    });
  }

  if (!context.job.field_complete || String(context.job.status ?? '').trim().toLowerCase() !== 'completed') {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_issue_blocked',
      noRedirect,
      ok: false,
    });
  }

  if (disposition === 'no_charge' && Number(context.invoice.total_cents ?? 0) !== 0) {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_disposition_requires_zero_total',
      noRedirect,
      ok: false,
    });
  }

  const previousOpsStatus = String(context.job.ops_status ?? '').trim() || null;
  const note = getOptionalText(formData.get('billing_disposition_note'));
  const appliedAt = new Date().toISOString();

  await applyExternalBillingCompletionMutation({
    supabase: context.supabase,
    jobId: context.jobId,
    currentInvoiceComplete: context.job.invoice_complete,
    currentDataEntryCompletedAt: (context.job as any).data_entry_completed_at,
    invoiceFieldMode: 'always',
    dataEntryFieldMode: 'if_missing',
    billingDisposition: disposition,
    billingDispositionNote: note,
    billingDispositionByUserId: context.userId,
    billingDispositionAt: appliedAt,
  });

  await expireStoredOpenTenantInvoiceCheckoutSessionsForInvoice({
    accountOwnerUserId: context.internalUser.account_owner_user_id,
    invoiceId: context.invoice.id,
    supabase: context.supabase,
  });

  await insertJobEvent({
    supabase: context.supabase,
    jobId: context.jobId,
    event_type: 'ops_update',
    meta: {
      source: 'internal_invoice_billing_disposition',
      invoice_id: context.invoice.id,
      invoice_number: context.invoice.invoice_number,
      total_cents: context.invoice.total_cents,
      billing_disposition: disposition,
      billing_disposition_note: note,
      changes: [
        { field: 'invoice_complete', from: Boolean(context.job.invoice_complete), to: true },
        { field: 'billing_disposition', from: null, to: disposition },
      ],
    },
    userId: context.userId,
  });

  await recomputeOpsAfterInvoiceMutation({
    supabase: context.supabase,
    jobId: context.jobId,
    userId: context.userId,
    accountOwnerUserId: context.internalUser.account_owner_user_id,
    jobType: context.job.job_type ?? null,
    serviceCaseId: context.job.service_case_id ?? null,
    previousOpsStatus,
    source: `internal_invoice_${disposition}_recompute`,
  });

  revalidatePath(`/jobs/${context.jobId}`);
  revalidatePath(`/jobs/${context.jobId}/invoice`);
  revalidatePath('/jobs');
  revalidatePath('/ops');
  revalidatePath('/ops/closeout-queue');
  revalidatePath('/reports/closeout');

  if (!noRedirect && disposition === 'externally_billed') {
    redirect(buildExternalBillingRecordedInvoiceWorkspaceHref(context.jobId));
  }

  return resolveSmallMutationResult({
    jobId: context.jobId,
    tab: context.tab,
    banner,
    noRedirect,
    ok: true,
  });
}

export async function markInternalInvoiceNoChargeFromForm(formData: FormData): Promise<InternalInvoiceActionResult | void> {
  return markInternalInvoiceBillingDispositionFromForm(formData, 'no_charge');
}

export async function markInternalInvoiceExternallyBilledFromForm(formData: FormData): Promise<InternalInvoiceActionResult | void> {
  return markInternalInvoiceBillingDispositionFromForm(formData, 'externally_billed');
}

export async function voidInternalInvoiceFromForm(formData: FormData) {
  const context = await loadInternalInvoiceContext(formData);

  requireInvoiceLifecycleAccessOrRedirect({
    actorUserId: context.userId,
    internalUser: context.internalUser,
    resourceAccountOwnerUserId: context.internalUser.account_owner_user_id,
    redirectTo: buildInternalInvoiceReturnHref(context.jobId, context.tab, 'not_authorized', context.returnTo),
  });

  if (!context.invoice) {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_missing', context.returnTo));
  }

  if (context.invoice.status === 'void') {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_already_voided', context.returnTo));
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
      accountOwnerUserId: context.internalUser.account_owner_user_id,
      jobType: context.job.job_type ?? null,
      serviceCaseId: context.job.service_case_id ?? null,
      previousOpsStatus,
      source: 'internal_invoice_void_recompute',
    });
  }

  revalidatePath(`/jobs/${context.jobId}`);
  revalidatePath(`/jobs/${context.jobId}/invoice`);
  revalidatePath('/jobs');
  revalidatePath('/ops');
  redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_voided', context.returnTo));
}

export async function addInternalInvoiceLineItemFromForm(formData: FormData): Promise<InternalInvoiceActionResult | void> {
  const noRedirect = isNoRedirectRequested(formData);
  const context = await requireDraftInvoiceContext(formData);
  requireManualFieldChargeAccessOrRedirect(fieldChargeAccessParams(context));
  const invoice = context.invoice!;
  const capabilities = resolveFieldChargeCapabilities(context);

  const itemName = getTrimmedString(formData.get('item_name_snapshot'));
  if (!itemName) {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_line_item_invalid',
      noRedirect,
      ok: false,
      fieldErrors: {
        item_name_snapshot: 'Item name is required.',
      },
    });
  }

  let quantityHundredths = 100;
  let unitPriceCents = 0;
  try {
    quantityHundredths = capabilities.can_edit_invoice_line_quantity
      ? parseQuantityToHundredths(getTrimmedString(formData.get('quantity')) || '1')
      : 100;
    unitPriceCents = capabilities.can_edit_invoice_line_price
      ? parseMoneyToCents(getTrimmedString(formData.get('unit_price')) || '0', 'Unit price')
      : 0;
  } catch {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_line_item_invalid',
      noRedirect,
      ok: false,
      fieldErrors: {
        _form: 'Line item fields are invalid.',
      },
    });
  }

  const payload = {
    item_name_snapshot: itemName,
    description_snapshot: capabilities.can_edit_invoice_line_description
      ? getOptionalText(formData.get('description_snapshot'))
      : null,
    item_type_snapshot: normalizeInternalInvoiceItemType(formData.get('item_type_snapshot')),
    quantity: formatScaledInt(quantityHundredths, 2),
    unit_price: formatScaledInt(unitPriceCents, 2),
    line_subtotal: formatScaledInt(computeLineSubtotalCents(quantityHundredths, unitPriceCents), 2),
  };

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
  if (!noRedirect) {
    revalidatePath('/jobs');
    revalidatePath('/ops');
  }

  return resolveSmallMutationResult({
    jobId: context.jobId,
    tab: context.tab,
    banner: 'internal_invoice_line_item_added',
    noRedirect,
    ok: true,
  });
}

export async function addInternalInvoiceLineItemFromPricebookForm(formData: FormData): Promise<InternalInvoiceActionResult | void> {
  const noRedirect = isNoRedirectRequested(formData);
  const context = await requireDraftInvoiceContext(formData);
  requirePricebookFieldChargeAccessOrRedirect(fieldChargeAccessParams(context));
  const invoice = context.invoice!;
  const capabilities = resolveFieldChargeCapabilities(context);

  const pricebookItemId = getTrimmedString(formData.get('pricebook_item_id'));
  if (!pricebookItemId) {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_pricebook_item_missing',
      noRedirect,
      ok: false,
      fieldErrors: {
        pricebook_item_id: 'Select a Pricebook item.',
      },
    });
  }

  let quantityHundredths = 100;
  try {
    quantityHundredths = capabilities.can_edit_invoice_line_quantity
      ? parseQuantityToHundredths(getTrimmedString(formData.get('quantity')) || '1')
      : 100;
  } catch {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_pricebook_quantity_invalid',
      noRedirect,
      ok: false,
      fieldErrors: {
        quantity: 'Quantity must be greater than zero.',
      },
    });
  }

  const pricebookItem = await loadScopedPricebookSnapshot({
    supabase: context.supabase,
    accountOwnerUserId: context.internalUser.account_owner_user_id,
    pricebookItemId,
  });

  if (!pricebookItem?.id) {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_pricebook_item_not_found',
      noRedirect,
      ok: false,
    });
  }

  if (!pricebookItem.is_active) {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_pricebook_item_inactive',
      noRedirect,
      ok: false,
    });
  }

  const normalizedItemType = getTrimmedString(pricebookItem.item_type).toLowerCase();
  if (normalizedItemType === 'adjustment') {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_pricebook_negative_price_deferred',
      noRedirect,
      ok: false,
    });
  }

  let unitPriceCents = 0;
  try {
    const submittedUnitPrice = getTrimmedString(formData.get('unit_price'));
    const effectiveUnitPrice = capabilities.can_edit_invoice_line_price && submittedUnitPrice
      ? submittedUnitPrice
      : pricebookItem.default_unit_price;
    unitPriceCents = parseNonNegativeMoneyNumberToCents(effectiveUnitPrice, 'Unit price');
  } catch {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_pricebook_negative_price_deferred',
      noRedirect,
      ok: false,
    });
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
      description_snapshot:
        capabilities.can_edit_invoice_line_description && formData.has('description_snapshot')
          ? getOptionalText(formData.get('description_snapshot'))
          : getOptionalText(pricebookItem.default_description),
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
  if (!noRedirect) {
    revalidatePath('/jobs');
    revalidatePath('/ops');
  }

  return resolveSmallMutationResult({
    jobId: context.jobId,
    tab: context.tab,
    banner: 'internal_invoice_pricebook_line_item_added',
    noRedirect,
    ok: true,
  });
}

export async function addInternalInvoiceLineItemsFromVisitScopeForm(formData: FormData): Promise<InternalInvoiceActionResult | void> {
  const noRedirect = isNoRedirectRequested(formData);
  const context = await requireDraftInvoiceContext(formData);
  requireVisitScopeFieldChargeAccessOrRedirect(fieldChargeAccessParams(context));
  const invoice = context.invoice!;
  const capabilities = resolveFieldChargeCapabilities(context);

  const { selectedIds, malformedIds } = parseSelectedVisitScopeItemIds(formData);

  if (malformedIds.length > 0) {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_visit_scope_item_invalid',
      noRedirect,
      ok: false,
      fieldErrors: {
        visit_scope_item_ids: 'Select valid Visit Scope items.',
      },
    });
  }

  if (selectedIds.length === 0) {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_visit_scope_item_missing',
      noRedirect,
      ok: false,
      fieldErrors: {
        visit_scope_item_ids: 'Select at least one Visit Scope item.',
      },
    });
  }

  let quantityHundredths = 100;
  try {
    quantityHundredths = capabilities.can_edit_invoice_line_quantity
      ? parseQuantityToHundredths(getTrimmedString(formData.get('quantity')) || '1')
      : 100;
  } catch {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_visit_scope_quantity_invalid',
      noRedirect,
      ok: false,
      fieldErrors: {
        quantity: 'Quantity must be greater than zero.',
      },
    });
  }

  const { data: jobScopeRow, error: jobScopeErr } = await context.supabase
    .from('jobs')
    .select('id, visit_scope_items')
    .eq('id', context.jobId)
    .maybeSingle();

  if (jobScopeErr) throw jobScopeErr;
  if (!jobScopeRow?.id) {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_visit_scope_item_not_found',
      noRedirect,
      ok: false,
    });
  }

  let scopeItems: ReturnType<typeof sanitizeVisitScopeItems> = [];
  try {
    scopeItems = sanitizeVisitScopeItems(jobScopeRow.visit_scope_items ?? []);
  } catch {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_visit_scope_item_invalid',
      noRedirect,
      ok: false,
      fieldErrors: {
        visit_scope_item_ids: 'Visit Scope selection is invalid.',
      },
    });
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
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_visit_scope_item_not_found',
      noRedirect,
      ok: false,
    });
  }

  const existingScopeSourceIds = new Set(
    (invoice.line_items ?? [])
      .filter((lineItem) => lineItem.source_kind === 'visit_scope')
      .map((lineItem) => sanitizeVisitScopeItemId(lineItem.source_visit_scope_item_id))
      .filter(Boolean) as string[],
  );

  const idsToInsert = selectedIds.filter((selectedId) => !existingScopeSourceIds.has(selectedId));
  if (idsToInsert.length === 0) {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_visit_scope_line_item_duplicate',
      noRedirect,
      ok: false,
    });
  }

  const nextSortOrder = (invoice.line_items?.length ?? 0) + 1;

  const payload = await Promise.all(idsToInsert.map(async (scopeItemId, index) => {
    const scopeItem = scopeItemsById.get(scopeItemId)!;
    const unitPriceCents = await resolveEffectiveUnitPriceCents(
      context.supabase,
      scopeItem.expected_unit_price,
      scopeItem.source_pricebook_item_id,
      context.internalUser.account_owner_user_id,
    );
    const lineSubtotalCents = computeLineSubtotalCents(quantityHundredths, unitPriceCents);
    return {
      invoice_id: invoice.id,
      sort_order: nextSortOrder + index,
      source_kind: 'visit_scope',
      source_visit_scope_item_id: scopeItemId,
      item_name_snapshot: getTrimmedString(scopeItem.title),
      description_snapshot: getOptionalText(scopeItem.details),
      item_type_snapshot: scopeItem.item_type
        ? normalizeInternalInvoiceItemType(scopeItem.item_type)
        : 'service',
      category_snapshot: getOptionalText(scopeItem.category),
      unit_label_snapshot: getOptionalText(scopeItem.unit_label),
      quantity: formatScaledInt(quantityHundredths, 2),
      unit_price: formatScaledInt(unitPriceCents, 2),
      line_subtotal: formatScaledInt(lineSubtotalCents, 2),
      created_by_user_id: context.userId,
      updated_by_user_id: context.userId,
    };
  }));

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
  if (!noRedirect) {
    revalidatePath('/jobs');
    revalidatePath('/ops');
  }

  if (idsToInsert.length < selectedIds.length) {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_visit_scope_line_item_partial_added',
      noRedirect,
      ok: true,
    });
  }

  return resolveSmallMutationResult({
    jobId: context.jobId,
    tab: context.tab,
    banner: 'internal_invoice_visit_scope_line_item_added',
    noRedirect,
    ok: true,
  });
}

export async function updateInternalInvoiceLineItemFromForm(formData: FormData): Promise<InternalInvoiceActionResult | void> {
  const noRedirect = isNoRedirectRequested(formData);
  const context = await requireDraftInvoiceContext(formData);
  requireFieldChargeEditAccessOrRedirect(fieldChargeAccessParams(context));
  const capabilities = resolveFieldChargeCapabilities(context);
  const invoice = context.invoice!;
  const lineItemId = getTrimmedString(formData.get('line_item_id'));
  if (!lineItemId) {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_line_item_missing',
      noRedirect,
      ok: false,
      fieldErrors: {
        line_item_id: 'Line item is missing.',
      },
    });
  }

  const targetLineItem = invoice.line_items.find((lineItem) => lineItem.id === lineItemId);
  if (!targetLineItem) {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_line_item_missing',
      noRedirect,
      ok: false,
      fieldErrors: {
        line_item_id: 'Line item was not found.',
      },
    });
  }

  const canEditDescription = capabilities.can_edit_invoice_line_description;
  const canEditQuantity = capabilities.can_edit_invoice_line_quantity;
  const canEditPrice = capabilities.can_edit_invoice_line_price;

  let nextItemName = String(targetLineItem.item_name_snapshot ?? '').trim() || 'Line item';
  let nextDescription = getOptionalText(targetLineItem.description_snapshot);
  let nextItemType = normalizeInternalInvoiceItemType(targetLineItem.item_type_snapshot);

  if (canEditDescription) {
    const candidateName = getTrimmedString(formData.get('item_name_snapshot'));
    if (!candidateName) {
      return resolveSmallMutationResult({
        jobId: context.jobId,
        tab: context.tab,
        banner: 'internal_invoice_line_item_invalid',
        noRedirect,
        ok: false,
        fieldErrors: {
          item_name_snapshot: 'Item name is required.',
        },
      });
    }

    nextItemName = candidateName;
    nextDescription = getOptionalText(formData.get('description_snapshot'));
    nextItemType = normalizeInternalInvoiceItemType(formData.get('item_type_snapshot'));
  }

  const currentQuantityHundredths = Math.max(1, Math.round(Number(targetLineItem.quantity ?? 0) * 100));
  const currentUnitPriceCents = Math.max(0, Math.round(Number(targetLineItem.unit_price ?? 0) * 100));

  let nextQuantityHundredths = currentQuantityHundredths;
  let nextUnitPriceCents = currentUnitPriceCents;

  try {
    if (canEditQuantity) {
      nextQuantityHundredths = parseQuantityToHundredths(getTrimmedString(formData.get('quantity')) || '1');
    }
    if (canEditPrice) {
      nextUnitPriceCents = parseMoneyToCents(getTrimmedString(formData.get('unit_price')) || '0', 'Unit price');
    }
  } catch {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_line_item_invalid',
      noRedirect,
      ok: false,
      fieldErrors: {
        _form: 'Line item fields are invalid.',
      },
    });
  }

  const lineSubtotalCents = computeLineSubtotalCents(nextQuantityHundredths, nextUnitPriceCents);
  const payload = {
    item_name_snapshot: nextItemName,
    description_snapshot: nextDescription,
    item_type_snapshot: nextItemType,
    quantity: formatScaledInt(nextQuantityHundredths, 2),
    unit_price: formatScaledInt(nextUnitPriceCents, 2),
    line_subtotal: formatScaledInt(lineSubtotalCents, 2),
  };

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
  if (!noRedirect) {
    revalidatePath('/jobs');
    revalidatePath('/ops');
  }

  return resolveSmallMutationResult({
    jobId: context.jobId,
    tab: context.tab,
    banner: 'internal_invoice_line_item_saved',
    noRedirect,
    ok: true,
  });
}

export async function removeInternalInvoiceLineItemFromForm(formData: FormData): Promise<InternalInvoiceActionResult | void> {
  const noRedirect = isNoRedirectRequested(formData);
  const context = await requireDraftInvoiceContext(formData);
  requireFieldChargeRemoveAccessOrRedirect(fieldChargeAccessParams(context));
  const invoice = context.invoice!;
  const lineItemId = getTrimmedString(formData.get('line_item_id'));
  if (!lineItemId) {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_line_item_missing',
      noRedirect,
      ok: false,
      fieldErrors: {
        line_item_id: 'Line item is missing.',
      },
    });
  }

  const targetLineItem = invoice.line_items.find((lineItem) => lineItem.id === lineItemId);
  if (!targetLineItem) {
    return resolveSmallMutationResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'internal_invoice_line_item_missing',
      noRedirect,
      ok: false,
      fieldErrors: {
        line_item_id: 'Line item was not found.',
      },
    });
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
  if (!noRedirect) {
    revalidatePath('/jobs');
    revalidatePath('/ops');
  }

  return resolveSmallMutationResult({
    jobId: context.jobId,
    tab: context.tab,
    banner: 'internal_invoice_line_item_removed',
    noRedirect,
    ok: true,
  });
}

// Slice B: email delivery core, shared by sendInternalInvoiceEmailFromForm and the
// compound issueAndSendInternalInvoiceFromForm. Callers validate access, invoice
// status, and recipient email BEFORE invoking, and own revalidate/redirect after.
// Records the queued/sent/failed notification and logs the invoice event; never
// throws on a send failure — returns { status: 'failed' } instead.
async function deliverInternalInvoiceEmailForContext(
  context: LoadedInternalInvoiceContext,
  recipientEmail: string,
): Promise<{ attemptKind: InternalInvoiceEmailAttemptKind; status: 'sent' | 'failed' }> {
  const invoice = context.invoice;
  if (!invoice) throw new Error('Invoice is required to send.');

  const sendHistory = await listInternalInvoiceEmailNotifications({
    supabase: context.supabase,
    jobId: context.jobId,
    invoiceId: invoice.id,
  });
  const successfulSendExists = sendHistory.some((row: any) => String(row?.status ?? '').trim().toLowerCase() === 'sent');
  const attemptKind: InternalInvoiceEmailAttemptKind = successfulSendExists ? 'resent' : 'sent';
  const attemptNumber = sendHistory.length + 1;

  const email = await buildInternalInvoiceEmailForContext(context);

  const queuedDelivery = await insertInternalInvoiceEmailNotification({
    supabase: context.supabase,
    jobId: context.jobId,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    recipientEmail,
    subject: email.subject,
    body: attemptKind === 'resent' ? 'Internal invoice resend queued.' : 'Internal invoice email queued.',
    attemptKind,
    attemptNumber,
    status: 'queued',
  });

  let providerMessageId: string | null = null;
  try {
    const sendResult = await sendEmail({
      to: recipientEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    providerMessageId = String(sendResult?.data?.id ?? '').trim() || null;
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
      invoice,
      extraMeta: {
        recipient_email: recipientEmail,
        attempt_kind: attemptKind,
        attempt_number: attemptNumber,
        error_detail: errorMessage,
      },
    });

    return { attemptKind, status: 'failed' };
  }

  await markInternalInvoiceEmailNotification({
    supabase: context.supabase,
    notificationId: queuedDelivery.id,
    status: 'sent',
    providerMessageId,
  });

  await logInvoiceEvent({
    supabase: context.supabase,
    userId: context.userId,
    jobId: context.jobId,
    eventType: attemptKind === 'resent' ? 'internal_invoice_email_resent' : 'internal_invoice_email_sent',
    invoice,
    extraMeta: {
      recipient_email: recipientEmail,
      attempt_kind: attemptKind,
      attempt_number: attemptNumber,
    },
  });

  return { attemptKind, status: 'sent' };
}

async function buildInternalInvoiceEmailForContext(context: LoadedInternalInvoiceContext) {
  const invoice = context.invoice;
  if (!invoice) throw new Error('Invoice is required to preview.');

  const tenantIdentity = await resolveOperationalTenantIdentity({
    supabase: context.supabase,
    accountOwnerUserId: context.internalUser.account_owner_user_id,
  });

  const serviceLocation = await resolveServiceLocationLabelForInvoiceEmail({
    supabase: context.supabase,
    accountOwnerUserId: context.internalUser.account_owner_user_id,
    locationId: context.job.location_id,
  });
  const serviceCustomerName = [context.job.customer_first_name, context.job.customer_last_name]
    .map((value: unknown) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .trim() || null;
  const shouldLookupContractorGreetingName =
    !getTrimmedString(invoice.billing_name)
    && String(context.job.billing_recipient ?? '').trim().toLowerCase() === 'contractor'
    && !String(context.job.billing_name ?? '').trim();
  const contractorDisplayName = shouldLookupContractorGreetingName
    ? await resolveContractorGreetingNameForInvoiceEmail({
        supabase: context.supabase,
        accountOwnerUserId: context.internalUser.account_owner_user_id,
        contractorId: context.job.contractor_id,
      })
    : null;
  const greetingName = resolveInternalInvoiceGreetingName({
    invoice,
    job: context.job,
    contractorDisplayName,
  });
  const paymentUrl = await resolveInvoicePaymentLinkForEmail({
    supabase: context.supabase,
    accountOwnerUserId: context.internalUser.account_owner_user_id,
    jobId: context.jobId,
    invoice,
  });
  const paymentLedger = await resolveInvoiceCollectedPaymentLedger(
    context.internalUser.account_owner_user_id,
    invoice.id,
    context.supabase,
  );
  const paymentSummary = paymentLedger.summary;

  const invoiceReference = formatInvoiceDisplayReference({
    invoiceDisplayNumber: invoice.invoice_display_number,
    invoiceNumber: invoice.invoice_number,
    invoiceId: invoice.id,
  });
  const subject = `${invoiceReference} from ${tenantIdentity.displayName}`;
  const html = buildInternalInvoiceEmailBody({
    businessName: tenantIdentity.displayName,
    companyLogoUrl: tenantIdentity.logoUrl,
    supportEmail: tenantIdentity.supportEmail,
    supportPhone: tenantIdentity.supportPhone,
    paymentUrl,
    invoice,
    greetingName,
    jobTitle: context.job.title ?? null,
    serviceLocation: serviceLocation || null,
    customerName: serviceCustomerName,
    amountPaidCents: paymentSummary.amountPaidCents,
    balanceDueCents: paymentSummary.balanceDueCents,
    paymentStatus: paymentSummary.paymentStatus,
  });
  const text = buildInternalInvoiceEmailText({
    businessName: tenantIdentity.displayName,
    supportEmail: tenantIdentity.supportEmail,
    supportPhone: tenantIdentity.supportPhone,
    paymentUrl,
    invoice,
    greetingName,
    jobTitle: context.job.title ?? null,
    serviceLocation: serviceLocation || null,
    customerName: serviceCustomerName,
    amountPaidCents: paymentSummary.amountPaidCents,
    balanceDueCents: paymentSummary.balanceDueCents,
    paymentStatus: paymentSummary.paymentStatus,
  });

  return { subject, html, text, paymentUrl };
}

export async function loadInternalInvoiceCustomerEmailPreview(formData: FormData) {
  const context = await loadInternalInvoiceContext(formData);

  requireFieldInvoiceSendAccessOrRedirect({
    actorUserId: context.userId,
    internalUser: context.internalUser,
    resourceAccountOwnerUserId: context.internalUser.account_owner_user_id,
    explicitCapabilities: context.fieldBillingExplicitCapabilities,
    redirectTo: buildInternalInvoiceReturnHref(context.jobId, context.tab, 'not_authorized'),
  });

  if (!context.invoice || context.invoice.status !== 'issued') {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_send_requires_issued'));
  }

  const email = await buildInternalInvoiceEmailForContext(context);
  return {
    ...email,
    recipientEmail: getTrimmedString(context.invoice.billing_email).toLowerCase(),
    invoiceReference: formatInvoiceDisplayReference({
      invoiceDisplayNumber: context.invoice.invoice_display_number,
      invoiceNumber: context.invoice.invoice_number,
      invoiceId: context.invoice.id,
    }),
  };
}

export async function sendInternalInvoiceEmailFromForm(formData: FormData) {
  const context = await loadInternalInvoiceContext(formData);

  requireFieldInvoiceSendAccessOrRedirect({
    actorUserId: context.userId,
    internalUser: context.internalUser,
    resourceAccountOwnerUserId: context.internalUser.account_owner_user_id,
    explicitCapabilities: context.fieldBillingExplicitCapabilities,
    redirectTo: buildInternalInvoiceReturnHref(context.jobId, context.tab, 'not_authorized', context.returnTo),
  });

  if (!context.invoice) {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_missing', context.returnTo));
  }

  if (context.invoice.status !== 'issued') {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_send_requires_issued', context.returnTo));
  }

  const recipientEmail = getTrimmedString(formData.get('recipient_email')).toLowerCase() || getTrimmedString(context.invoice.billing_email).toLowerCase();

  if (!recipientEmail) {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_send_recipient_required', context.returnTo));
  }

  if (!isValidEmail(recipientEmail)) {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_send_recipient_invalid', context.returnTo));
  }

  const deliveryResult = await deliverInternalInvoiceEmailForContext(context, recipientEmail);

  revalidatePath(`/jobs/${context.jobId}`);
  revalidatePath(`/jobs/${context.jobId}/invoice`);
  revalidatePath('/jobs');
  revalidatePath('/ops');
  revalidatePath('/reports/invoices');

  if (deliveryResult.status === 'failed') {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_email_failed', context.returnTo));
  }

  redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, deliveryResult.attemptKind === 'resent' ? 'internal_invoice_email_resent' : 'internal_invoice_email_sent', context.returnTo));
}

// Slice B: compound "Issue & Send" for the compressed mobile field flow. Issues the
// draft invoice and immediately emails it to the billing recipient in one round trip.
// Additive — the standalone issue and send actions are unchanged. Requires BOTH issue
// and send authority, and validates all readiness (recipient name + email, charges,
// total, job closeout) BEFORE mutating, so it never issues when the send would fail
// for a missing/invalid recipient email.
export async function issueAndSendInternalInvoiceFromForm(formData: FormData) {
  const context = await loadInternalInvoiceContext(formData);

  requireFieldInvoiceIssueAccessOrRedirect({
    actorUserId: context.userId,
    internalUser: context.internalUser,
    resourceAccountOwnerUserId: context.internalUser.account_owner_user_id,
    explicitCapabilities: context.fieldBillingExplicitCapabilities,
    redirectTo: buildInternalInvoiceReturnHref(context.jobId, context.tab, 'not_authorized', context.returnTo),
  });

  requireFieldInvoiceSendAccessOrRedirect({
    actorUserId: context.userId,
    internalUser: context.internalUser,
    resourceAccountOwnerUserId: context.internalUser.account_owner_user_id,
    explicitCapabilities: context.fieldBillingExplicitCapabilities,
    redirectTo: buildInternalInvoiceReturnHref(context.jobId, context.tab, 'not_authorized', context.returnTo),
  });

  if (!context.invoice) {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_missing', context.returnTo));
  }

  if (context.invoice.status === 'issued') {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_already_issued', context.returnTo));
  }

  if (context.invoice.status === 'void') {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_locked', context.returnTo));
  }

  if (!context.job.field_complete || String(context.job.status ?? '').trim().toLowerCase() !== 'completed') {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_issue_blocked', context.returnTo));
  }

  const billingName = getTrimmedString(context.invoice.billing_name);
  if (!billingName || context.invoice.total_cents <= 0 || (context.invoice.line_items?.length ?? 0) === 0) {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_issue_incomplete', context.returnTo));
  }


  await requireDuplicateChargeReviewBeforeIssue(context, formData);

  // Recipient email is mandatory for the compound action: the send must be able to
  // succeed before we issue. If it is missing/invalid we redirect WITHOUT mutating.
  const recipientEmail =
    getTrimmedString(formData.get('recipient_email')).toLowerCase()
    || getTrimmedString(context.invoice.billing_email).toLowerCase();

  if (!recipientEmail) {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_send_recipient_required', context.returnTo));
  }

  if (!isValidEmail(recipientEmail)) {
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_send_recipient_invalid', context.returnTo));
  }

  // All readiness green — issue, then send.
  await applyInternalInvoiceIssueMutation(context);
  // Reflect the issued state on the in-memory invoice so the delivery event meta and
  // downstream references see 'issued' rather than the stale draft snapshot.
  context.invoice = { ...context.invoice, status: 'issued' };

  const deliveryResult = await deliverInternalInvoiceEmailForContext(context, recipientEmail);

  revalidatePath(`/jobs/${context.jobId}`);
  revalidatePath(`/jobs/${context.jobId}/invoice`);
  revalidatePath('/jobs');
  revalidatePath('/ops');
  revalidatePath('/reports/invoices');

  if (deliveryResult.status === 'failed') {
    // Invoice is issued but the email failed — surface a distinct banner so the user
    // can Send again from the issued invoice.
    redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_issued_email_failed', context.returnTo));
  }

  redirect(buildInternalInvoiceReturnHref(context.jobId, context.tab, 'internal_invoice_issued_and_sent', context.returnTo));
}
