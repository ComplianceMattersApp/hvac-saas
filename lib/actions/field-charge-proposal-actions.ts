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
import { normalizeFieldChargeProposalRow, type FieldChargeProposalRecord } from '@/lib/business/field-charge-proposals';
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

function formatDecimalNumber(value: number) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return '0.00';
  return normalized.toFixed(2);
}

function formatMoneyForInvoiceLine(cents: number) {
  return formatScaledInt(Number(cents ?? 0) || 0, 2);
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

async function syncDraftInvoiceTotalsFromLineItems(params: {
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
    return sum + parseMoneyToCents(String(row?.line_subtotal ?? '0'), 'Line subtotal');
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

async function loadScopedFieldChargeProposal(params: {
  admin: any;
  proposalId: string;
  accountOwnerUserId: string;
  jobId: string;
}) {
  const { data, error } = await params.admin
    .from('field_charge_proposals')
    .select('*')
    .eq('id', params.proposalId)
    .eq('account_owner_user_id', params.accountOwnerUserId)
    .eq('job_id', params.jobId)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeFieldChargeProposalRow(data) : null;
}

function requireFieldChargeProposalReviewAccessOrRedirect(
  context: Awaited<ReturnType<typeof loadFieldChargeProposalContext>>,
) {
  const capabilities = resolveFieldBillingCapabilities(fieldBillingAccessParams(context));
  if (capabilities.can_approve_field_charges) {
    return;
  }

  redirect(buildJobDetailHref(context.jobId, context.tab, 'not_authorized'));
}

function buildInvoiceLinePayloadFromProposal(params: {
  proposal: FieldChargeProposalRecord;
  invoiceId: string;
  sortOrder: number;
  userId: string;
}) {
  const unitPriceCents = params.proposal.proposed_unit_price_cents;
  const subtotalCents = params.proposal.proposed_subtotal_cents;
  if (unitPriceCents === null || subtotalCents === null) {
    throw new Error('Approved field charge proposals require a proposed price.');
  }

  return {
    invoice_id: params.invoiceId,
    sort_order: params.sortOrder,
    source_kind: params.proposal.source_kind,
    source_pricebook_item_id: params.proposal.source_pricebook_item_id,
    source_visit_scope_item_id: params.proposal.source_visit_scope_item_id,
    item_name_snapshot: params.proposal.proposed_name,
    description_snapshot: params.proposal.proposed_description,
    item_type_snapshot: normalizeInternalInvoiceItemType(params.proposal.proposed_item_type),
    category_snapshot: null,
    unit_label_snapshot: null,
    quantity: formatDecimalNumber(params.proposal.proposed_quantity),
    unit_price: formatMoneyForInvoiceLine(unitPriceCents),
    line_subtotal: formatMoneyForInvoiceLine(subtotalCents),
    created_by_user_id: params.userId,
    updated_by_user_id: params.userId,
  };
}

export async function approveFieldChargeProposalForDraftInvoiceFromForm(
  formData: FormData,
): Promise<FieldChargeProposalActionResult | void> {
  const context = await loadFieldChargeProposalContext(formData);
  requireFieldChargeProposalReviewAccessOrRedirect(context);

  const proposalId = getTrimmedString(formData.get('proposal_id')) || getTrimmedString(formData.get('field_charge_proposal_id'));
  if (!proposalId) {
    return resolveActionResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'field_charge_proposal_missing',
      noRedirect: context.noRedirect,
      ok: false,
      fieldErrors: { proposal_id: 'Select a field charge proposal.' },
    });
  }

  if (!context.invoice?.id || context.invoice.status !== 'draft') {
    return resolveActionResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'field_charge_draft_invoice_required',
      noRedirect: context.noRedirect,
      ok: false,
    });
  }

  const proposal = await loadScopedFieldChargeProposal({
    admin: context.admin,
    proposalId,
    accountOwnerUserId: context.internalUser.account_owner_user_id,
    jobId: context.jobId,
  });

  if (!proposal?.id) {
    return resolveActionResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'field_charge_proposal_not_found',
      noRedirect: context.noRedirect,
      ok: false,
    });
  }

  if (proposal.status !== FIELD_CHARGE_PROPOSAL_STATUS || proposal.converted_internal_invoice_line_item_id) {
    return resolveActionResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'field_charge_proposal_not_submitted',
      noRedirect: context.noRedirect,
      ok: false,
    });
  }

  let linePayload: ReturnType<typeof buildInvoiceLinePayloadFromProposal>;
  try {
    linePayload = buildInvoiceLinePayloadFromProposal({
      proposal,
      invoiceId: context.invoice.id,
      sortOrder: (context.invoice.line_items?.length ?? 0) + 1,
      userId: context.userId,
    });
  } catch {
    return resolveActionResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'field_charge_proposal_price_required',
      noRedirect: context.noRedirect,
      ok: false,
    });
  }

  const { data: insertedLine, error: insertErr } = await context.supabase
    .from('internal_invoice_line_items')
    .insert(linePayload)
    .select('id')
    .single();

  if (insertErr) throw insertErr;
  const invoiceLineItemId = String(insertedLine?.id ?? '').trim();
  if (!invoiceLineItemId) {
    throw new Error('Failed to convert field charge proposal into invoice line item.');
  }

  await syncDraftInvoiceTotalsFromLineItems({
    supabase: context.supabase,
    invoiceId: context.invoice.id,
    userId: context.userId,
  });

  const reviewedAt = new Date().toISOString();
  const reviewNote = getOptionalText(formData.get('review_note'));
  const { error: updateErr } = await context.admin
    .from('field_charge_proposals')
    .update({
      status: 'approved',
      internal_invoice_id: context.invoice.id,
      reviewed_by_user_id: context.userId,
      reviewed_at: reviewedAt,
      review_note: reviewNote,
      converted_internal_invoice_line_item_id: invoiceLineItemId,
      updated_at: reviewedAt,
    })
    .eq('id', proposal.id)
    .eq('account_owner_user_id', context.internalUser.account_owner_user_id)
    .eq('job_id', context.jobId);

  if (updateErr) throw updateErr;

  await insertJobEvent({
    supabase: context.supabase,
    jobId: context.jobId,
    event_type: 'field_charge_approved',
    userId: context.userId,
    meta: {
      proposal_id: proposal.id,
      invoice_id: context.invoice.id,
      invoice_line_item_id: invoiceLineItemId,
      source_kind: proposal.source_kind,
      source_pricebook_item_id: proposal.source_pricebook_item_id,
      source_visit_scope_item_id: proposal.source_visit_scope_item_id,
      amount_cents: proposal.proposed_subtotal_cents,
      source_action: 'approve_field_charge_proposal_for_draft_invoice',
    },
  });

  revalidatePath(`/jobs/${context.jobId}`);
  revalidatePath(`/jobs/${context.jobId}/invoice`);
  revalidatePath('/ops');

  return resolveActionResult({
    jobId: context.jobId,
    tab: context.tab,
    banner: 'field_charge_proposal_approved',
    noRedirect: context.noRedirect,
    ok: true,
    proposalId: proposal.id,
  });
}

export async function approveFieldChargeProposalForDraftInvoiceReviewForm(formData: FormData): Promise<void> {
  await approveFieldChargeProposalForDraftInvoiceFromForm(formData);
}

export async function rejectFieldChargeProposalFromForm(
  formData: FormData,
): Promise<FieldChargeProposalActionResult | void> {
  const context = await loadFieldChargeProposalContext(formData);
  requireFieldChargeProposalReviewAccessOrRedirect(context);

  const proposalId = getTrimmedString(formData.get('proposal_id')) || getTrimmedString(formData.get('field_charge_proposal_id'));
  if (!proposalId) {
    return resolveActionResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'field_charge_proposal_missing',
      noRedirect: context.noRedirect,
      ok: false,
      fieldErrors: { proposal_id: 'Select a field charge proposal.' },
    });
  }

  const proposal = await loadScopedFieldChargeProposal({
    admin: context.admin,
    proposalId,
    accountOwnerUserId: context.internalUser.account_owner_user_id,
    jobId: context.jobId,
  });

  if (!proposal?.id) {
    return resolveActionResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'field_charge_proposal_not_found',
      noRedirect: context.noRedirect,
      ok: false,
    });
  }

  if (proposal.status !== FIELD_CHARGE_PROPOSAL_STATUS) {
    return resolveActionResult({
      jobId: context.jobId,
      tab: context.tab,
      banner: 'field_charge_proposal_not_submitted',
      noRedirect: context.noRedirect,
      ok: false,
    });
  }

  const reviewedAt = new Date().toISOString();
  const reviewNote = getOptionalText(formData.get('review_note'));
  const { error: updateErr } = await context.admin
    .from('field_charge_proposals')
    .update({
      status: 'rejected',
      reviewed_by_user_id: context.userId,
      reviewed_at: reviewedAt,
      review_note: reviewNote,
      updated_at: reviewedAt,
    })
    .eq('id', proposal.id)
    .eq('account_owner_user_id', context.internalUser.account_owner_user_id)
    .eq('job_id', context.jobId);

  if (updateErr) throw updateErr;

  await insertJobEvent({
    supabase: context.supabase,
    jobId: context.jobId,
    event_type: 'field_charge_rejected',
    userId: context.userId,
    meta: {
      proposal_id: proposal.id,
      source_kind: proposal.source_kind,
      review_note: reviewNote,
      source_action: 'reject_field_charge_proposal',
    },
  });

  revalidatePath(`/jobs/${context.jobId}`);
  revalidatePath(`/jobs/${context.jobId}/invoice`);
  revalidatePath('/ops');

  return resolveActionResult({
    jobId: context.jobId,
    tab: context.tab,
    banner: 'field_charge_proposal_rejected',
    noRedirect: context.noRedirect,
    ok: true,
    proposalId: proposal.id,
  });
}

export async function rejectFieldChargeProposalReviewForm(formData: FormData): Promise<void> {
  await rejectFieldChargeProposalFromForm(formData);
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

export async function createFieldChargeProposalFromPricebookEntryForm(formData: FormData): Promise<void> {
  await createFieldChargeProposalFromPricebookForm(formData);
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

export async function createFieldChargeProposalFromVisitScopeEntryForm(formData: FormData): Promise<void> {
  await createFieldChargeProposalFromVisitScopeForm(formData);
}
