'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { requireInternalUser } from '@/lib/auth/internal-user';
import { loadScopedInternalJobForMutation } from '@/lib/auth/internal-job-scope';
import { resolveFieldBillingCapabilities } from '@/lib/auth/field-billing-access';
import { resolveBillingModeByAccountOwnerId } from '@/lib/business/internal-business-profile';
import { resolveOperationalMutationEntitlementAccess } from '@/lib/business/platform-entitlement';
import { normalizeInternalInvoiceItemType, resolveInternalInvoiceByJobId } from '@/lib/business/internal-invoice';
import { insertJobEvent } from '@/lib/actions/job-actions';
import { sanitizeVisitScopeItemId, sanitizeVisitScopeItems } from '@/lib/jobs/visit-scope';

const FIELD_BILLING_SUMMARY_HASH = 'field-billing-summary-title';
const FIELD_CHARGE_PROPOSAL_STATUS = 'submitted_for_review';

export type FieldChargeProposalActionResult = {
  ok: boolean;
  banner?: string;
  proposalId?: string;
  fieldErrors?: Record<string, string>;
};

function getTrimmedString(value: FormDataEntryValue | null | undefined) {
  return String(value ?? '').trim();
}

function getOptionalText(value: FormDataEntryValue | string | null | undefined) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function buildJobDetailHref(jobId: string, tab: string, banner: string) {
  const safeTab = String(tab ?? '').trim() || 'info';
  return `/jobs/${jobId}?tab=${safeTab}&banner=${banner}#${FIELD_BILLING_SUMMARY_HASH}`;
}

function isNoRedirectRequested(formData: FormData) {
  return getTrimmedString(formData.get('no_redirect')) === '1';
}

function resolveActionResult(params: {
  jobId: string;
  tab: string;
  banner: string;
  noRedirect: boolean;
  ok: boolean;
  proposalId?: string;
  fieldErrors?: Record<string, string>;
}): FieldChargeProposalActionResult | never {
  if (params.noRedirect) {
    return {
      ok: params.ok,
      banner: params.banner,
      proposalId: params.proposalId,
      fieldErrors: params.fieldErrors,
    };
  }

  redirect(buildJobDetailHref(params.jobId, params.tab, params.banner));
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

function parseQuantityToHundredths(raw: string) {
  const quantity = parseScaledInteger(raw, 2, 'Quantity');
  if (quantity <= 0) {
    throw new Error('Quantity must be greater than zero.');
  }
  return quantity;
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

function formatScaledInt(value: number, scale: number) {
  const sign = value < 0 ? '-' : '';
  const normalized = Math.abs(Math.trunc(value));
  const divisor = 10 ** scale;
  const whole = Math.floor(normalized / divisor);
  const fraction = String(normalized % divisor).padStart(scale, '0');
  return `${sign}${whole}.${fraction}`;
}

function computeSubtotalCents(quantityHundredths: number, unitPriceCents: number) {
  return Math.round((quantityHundredths * unitPriceCents) / 100);
}

async function requireOperationalFieldChargeProposalEntitlementAccessOrRedirect(params: {
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

async function loadFieldChargeProposalContext(formData: FormData) {
  const jobId =
    getTrimmedString(formData.get('job_id')) ||
    getTrimmedString(formData.get('id'));

  if (!jobId) throw new Error('Job ID is required.');

  const tab = getTrimmedString(formData.get('tab')) || 'info';
  const supabase = await createClient();
  const admin = createAdminClient();
  const { userId, internalUser } = await requireInternalUser({ supabase });

  const scopedJob = await loadScopedInternalJobForMutation({
    accountOwnerUserId: internalUser.account_owner_user_id,
    jobId,
    select: 'id',
  });

  if (!scopedJob?.id) {
    redirect(buildJobDetailHref(jobId, tab, 'not_authorized'));
  }

  await requireOperationalFieldChargeProposalEntitlementAccessOrRedirect({
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

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('id, account_owner_user_id, visit_scope_items')
    .eq('id', jobId)
    .maybeSingle();

  if (jobErr) throw jobErr;
  if (!job?.id || String(job.account_owner_user_id ?? '') !== internalUser.account_owner_user_id) {
    redirect(buildJobDetailHref(jobId, tab, 'not_authorized'));
  }

  const invoice = await resolveInternalInvoiceByJobId({ supabase, jobId });
  const safeInvoice = invoice
    && invoice.account_owner_user_id === internalUser.account_owner_user_id
    && invoice.job_id === jobId
    && invoice.status !== 'void'
      ? invoice
      : null;

  return {
    supabase,
    admin,
    userId,
    internalUser,
    jobId,
    tab,
    job,
    invoice: safeInvoice,
    noRedirect: isNoRedirectRequested(formData),
  };
}

function fieldBillingAccessParams(context: Awaited<ReturnType<typeof loadFieldChargeProposalContext>>) {
  return {
    actorUserId: context.userId,
    internalUser: context.internalUser,
    resourceAccountOwnerUserId: context.internalUser.account_owner_user_id,
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

async function insertFieldChargeProposal(params: {
  context: Awaited<ReturnType<typeof loadFieldChargeProposalContext>>;
  payload: Record<string, unknown>;
  eventMeta: Record<string, unknown>;
}) {
  const { context } = params;
  const submittedAt = new Date().toISOString();

  const insertPayload = {
    account_owner_user_id: context.internalUser.account_owner_user_id,
    job_id: context.jobId,
    internal_invoice_id: context.invoice?.id ?? null,
    status: FIELD_CHARGE_PROPOSAL_STATUS,
    submitted_at: submittedAt,
    proposed_by_user_id: context.userId,
    ...params.payload,
  };

  const { data: inserted, error: insertErr } = await context.admin
    .from('field_charge_proposals')
    .insert(insertPayload)
    .select('id')
    .single();

  if (insertErr) throw insertErr;

  const proposalId = String(inserted?.id ?? '').trim();
  if (!proposalId) {
    throw new Error('Failed to create field charge proposal.');
  }

  await insertJobEvent({
    supabase: context.supabase,
    jobId: context.jobId,
    event_type: 'field_charge_proposed',
    userId: context.userId,
    meta: {
      proposal_id: proposalId,
      status: FIELD_CHARGE_PROPOSAL_STATUS,
      internal_invoice_id: context.invoice?.id ?? null,
      ...params.eventMeta,
    },
  });

  revalidatePath(`/jobs/${context.jobId}`);
  revalidatePath(`/jobs/${context.jobId}/invoice`);
  revalidatePath('/ops');

  return proposalId;
}

export async function createFieldChargeProposalFromPricebookForm(
  formData: FormData,
): Promise<FieldChargeProposalActionResult | void> {
  const context = await loadFieldChargeProposalContext(formData);
  const capabilities = resolveFieldBillingCapabilities(fieldBillingAccessParams(context));

  if (!capabilities.can_select_pricebook_lines) {
    redirect(buildJobDetailHref(context.jobId, context.tab, 'not_authorized'));
  }

  const pricebookItemId = getTrimmedString(formData.get('pricebook_item_id'));
  if (!pricebookItemId) {
    return resolveActionResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'field_charge_pricebook_item_missing',
      noRedirect: context.noRedirect,
      ok: false,
      fieldErrors: { pricebook_item_id: 'Select a Pricebook item.' },
    });
  }

  let quantityHundredths = 100;
  try {
    quantityHundredths = parseQuantityToHundredths(getTrimmedString(formData.get('quantity')) || '1');
  } catch {
    return resolveActionResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'field_charge_quantity_invalid',
      noRedirect: context.noRedirect,
      ok: false,
      fieldErrors: { quantity: 'Quantity must be greater than zero.' },
    });
  }

  if (quantityHundredths !== 100 && !capabilities.can_edit_charge_quantity) {
    redirect(buildJobDetailHref(context.jobId, context.tab, 'not_authorized'));
  }

  const pricebookItem = await loadScopedPricebookSnapshot({
    supabase: context.supabase,
    accountOwnerUserId: context.internalUser.account_owner_user_id,
    pricebookItemId,
  });

  if (!pricebookItem?.id) {
    return resolveActionResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'field_charge_pricebook_item_not_found',
      noRedirect: context.noRedirect,
      ok: false,
    });
  }

  if (!pricebookItem.is_active) {
    return resolveActionResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'field_charge_pricebook_item_inactive',
      noRedirect: context.noRedirect,
      ok: false,
    });
  }

  const normalizedItemType = getTrimmedString(pricebookItem.item_type).toLowerCase();
  if (normalizedItemType === 'adjustment') {
    return resolveActionResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'field_charge_pricebook_adjustment_deferred',
      noRedirect: context.noRedirect,
      ok: false,
    });
  }

  let unitPriceCents = 0;
  try {
    unitPriceCents = parseNonNegativeMoneyNumberToCents(pricebookItem.default_unit_price, 'Unit price');
  } catch {
    return resolveActionResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'field_charge_pricebook_price_invalid',
      noRedirect: context.noRedirect,
      ok: false,
    });
  }

  const requestedUnitPrice = getOptionalText(formData.get('proposed_unit_price'))
    ?? getOptionalText(formData.get('unit_price'));
  if (requestedUnitPrice) {
    let requestedUnitPriceCents = 0;
    try {
      requestedUnitPriceCents = parseMoneyToCents(requestedUnitPrice, 'Unit price');
    } catch {
      return resolveActionResult({
        jobId: context.jobId,
        tab: context.tab,
        banner: 'field_charge_price_invalid',
        noRedirect: context.noRedirect,
        ok: false,
        fieldErrors: { proposed_unit_price: 'Unit price must be valid.' },
      });
    }

    if (requestedUnitPriceCents !== unitPriceCents) {
      if (!capabilities.can_edit_charge_price) {
        redirect(buildJobDetailHref(context.jobId, context.tab, 'not_authorized'));
      }
      unitPriceCents = requestedUnitPriceCents;
    }
  }

  const subtotalCents = computeSubtotalCents(quantityHundredths, unitPriceCents);
  const proposalId = await insertFieldChargeProposal({
    context,
    payload: {
      source_kind: 'pricebook',
      source_pricebook_item_id: String(pricebookItem.id),
      source_visit_scope_item_id: null,
      proposed_name: getTrimmedString(pricebookItem.item_name),
      proposed_description: getOptionalText(pricebookItem.default_description),
      proposed_item_type: normalizeInternalInvoiceItemType(pricebookItem.item_type),
      proposed_quantity: formatScaledInt(quantityHundredths, 2),
      proposed_unit_price_cents: unitPriceCents,
      proposed_subtotal_cents: subtotalCents,
      proposed_currency: 'usd',
    },
    eventMeta: {
      source_kind: 'pricebook',
      source_pricebook_item_id: String(pricebookItem.id),
      proposed_amount_cents: subtotalCents,
      source_action: 'create_field_charge_proposal_from_pricebook',
    },
  });

  return resolveActionResult({
    jobId: context.jobId,
    tab: context.tab,
    banner: 'field_charge_proposal_submitted',
    noRedirect: context.noRedirect,
    ok: true,
    proposalId,
  });
}

export async function createFieldChargeProposalFromVisitScopeForm(
  formData: FormData,
): Promise<FieldChargeProposalActionResult | void> {
  const context = await loadFieldChargeProposalContext(formData);
  const capabilities = resolveFieldBillingCapabilities(fieldBillingAccessParams(context));

  if (!capabilities.can_convert_visit_scope_to_invoice_line) {
    redirect(buildJobDetailHref(context.jobId, context.tab, 'not_authorized'));
  }

  const sourceVisitScopeItemId = sanitizeVisitScopeItemId(
    formData.get('visit_scope_item_id') ?? formData.get('source_visit_scope_item_id'),
  );
  if (!sourceVisitScopeItemId) {
    return resolveActionResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'field_charge_visit_scope_item_missing',
      noRedirect: context.noRedirect,
      ok: false,
      fieldErrors: { visit_scope_item_id: 'Select a Visit Scope item.' },
    });
  }

  let quantityHundredths = 100;
  try {
    quantityHundredths = parseQuantityToHundredths(getTrimmedString(formData.get('quantity')) || '1');
  } catch {
    return resolveActionResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'field_charge_quantity_invalid',
      noRedirect: context.noRedirect,
      ok: false,
      fieldErrors: { quantity: 'Quantity must be greater than zero.' },
    });
  }

  if (quantityHundredths !== 100 && !capabilities.can_edit_charge_quantity) {
    redirect(buildJobDetailHref(context.jobId, context.tab, 'not_authorized'));
  }

  let scopeItems: ReturnType<typeof sanitizeVisitScopeItems> = [];
  try {
    scopeItems = sanitizeVisitScopeItems(context.job.visit_scope_items ?? []);
  } catch {
    return resolveActionResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'field_charge_visit_scope_item_invalid',
      noRedirect: context.noRedirect,
      ok: false,
      fieldErrors: { visit_scope_item_id: 'Visit Scope selection is invalid.' },
    });
  }

  const scopeItem = scopeItems.find((item) => sanitizeVisitScopeItemId(item.id) === sourceVisitScopeItemId);
  if (!scopeItem) {
    return resolveActionResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'field_charge_visit_scope_item_not_found',
      noRedirect: context.noRedirect,
      ok: false,
    });
  }

  let unitPriceCents: number | null = null;
  const requestedUnitPrice = getOptionalText(formData.get('proposed_unit_price'))
    ?? getOptionalText(formData.get('unit_price'));
  if (requestedUnitPrice) {
    if (!capabilities.can_edit_charge_price) {
      redirect(buildJobDetailHref(context.jobId, context.tab, 'not_authorized'));
    }

    try {
      unitPriceCents = parseMoneyToCents(requestedUnitPrice, 'Unit price');
    } catch {
      return resolveActionResult({
        jobId: context.jobId,
        tab: context.tab,
        banner: 'field_charge_price_invalid',
        noRedirect: context.noRedirect,
        ok: false,
        fieldErrors: { proposed_unit_price: 'Unit price must be valid.' },
      });
    }
  }

  const subtotalCents = unitPriceCents === null ? null : computeSubtotalCents(quantityHundredths, unitPriceCents);
  const proposalId = await insertFieldChargeProposal({
    context,
    payload: {
      source_kind: 'visit_scope',
      source_pricebook_item_id: null,
      source_visit_scope_item_id: sourceVisitScopeItemId,
      proposed_name: getTrimmedString(scopeItem.title),
      proposed_description: getOptionalText(scopeItem.details),
      proposed_item_type: normalizeInternalInvoiceItemType(scopeItem.item_type),
      proposed_quantity: formatScaledInt(quantityHundredths, 2),
      proposed_unit_price_cents: unitPriceCents,
      proposed_subtotal_cents: subtotalCents,
      proposed_currency: 'usd',
    },
    eventMeta: {
      source_kind: 'visit_scope',
      source_visit_scope_item_id: sourceVisitScopeItemId,
      proposed_amount_cents: subtotalCents,
      source_action: 'create_field_charge_proposal_from_visit_scope',
    },
  });

  return resolveActionResult({
    jobId: context.jobId,
    tab: context.tab,
    banner: 'field_charge_proposal_submitted',
    noRedirect: context.noRedirect,
    ok: true,
    proposalId,
  });
}
