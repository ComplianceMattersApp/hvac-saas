import { normalizeInternalInvoiceItemType, type InternalInvoiceItemType } from '@/lib/business/internal-invoice';

export const FIELD_CHARGE_PROPOSAL_SOURCE_KINDS = ['pricebook', 'visit_scope', 'manual'] as const;
export const FIELD_CHARGE_PROPOSAL_STATUSES = [
  'draft',
  'submitted_for_review',
  'approved',
  'rejected',
  'voided',
] as const;

export type FieldChargeProposalSourceKind = (typeof FIELD_CHARGE_PROPOSAL_SOURCE_KINDS)[number];
export type FieldChargeProposalStatus = (typeof FIELD_CHARGE_PROPOSAL_STATUSES)[number];

export type FieldChargeProposalRecord = {
  id: string;
  account_owner_user_id: string;
  job_id: string;
  internal_invoice_id: string | null;
  source_kind: FieldChargeProposalSourceKind;
  source_pricebook_item_id: string | null;
  source_visit_scope_item_id: string | null;
  proposed_name: string;
  proposed_description: string | null;
  proposed_item_type: InternalInvoiceItemType;
  proposed_quantity: number;
  proposed_unit_price_cents: number | null;
  proposed_subtotal_cents: number | null;
  proposed_currency: string;
  status: FieldChargeProposalStatus;
  proposed_by_user_id: string;
  submitted_at: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  converted_internal_invoice_line_item_id: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeFieldChargeProposalSourceKind(value: unknown): FieldChargeProposalSourceKind {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'pricebook') return 'pricebook';
  if (normalized === 'visit_scope') return 'visit_scope';
  return 'manual';
}

export function normalizeFieldChargeProposalStatus(value: unknown): FieldChargeProposalStatus {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'submitted_for_review') return 'submitted_for_review';
  if (normalized === 'approved') return 'approved';
  if (normalized === 'rejected') return 'rejected';
  if (normalized === 'voided') return 'voided';
  return 'draft';
}

export function normalizeFieldChargeProposalRow(row: any): FieldChargeProposalRecord {
  return {
    id: String(row?.id ?? '').trim(),
    account_owner_user_id: String(row?.account_owner_user_id ?? '').trim(),
    job_id: String(row?.job_id ?? '').trim(),
    internal_invoice_id: String(row?.internal_invoice_id ?? '').trim() || null,
    source_kind: normalizeFieldChargeProposalSourceKind(row?.source_kind),
    source_pricebook_item_id: String(row?.source_pricebook_item_id ?? '').trim() || null,
    source_visit_scope_item_id: String(row?.source_visit_scope_item_id ?? '').trim() || null,
    proposed_name: String(row?.proposed_name ?? '').trim(),
    proposed_description: String(row?.proposed_description ?? '').trim() || null,
    proposed_item_type: normalizeInternalInvoiceItemType(row?.proposed_item_type),
    proposed_quantity: Number(row?.proposed_quantity ?? 0) || 0,
    proposed_unit_price_cents:
      row?.proposed_unit_price_cents === null || row?.proposed_unit_price_cents === undefined
        ? null
        : Number(row.proposed_unit_price_cents),
    proposed_subtotal_cents:
      row?.proposed_subtotal_cents === null || row?.proposed_subtotal_cents === undefined
        ? null
        : Number(row.proposed_subtotal_cents),
    proposed_currency: String(row?.proposed_currency ?? 'usd').trim().toLowerCase() || 'usd',
    status: normalizeFieldChargeProposalStatus(row?.status),
    proposed_by_user_id: String(row?.proposed_by_user_id ?? '').trim(),
    submitted_at: String(row?.submitted_at ?? '').trim() || null,
    reviewed_by_user_id: String(row?.reviewed_by_user_id ?? '').trim() || null,
    reviewed_at: String(row?.reviewed_at ?? '').trim() || null,
    review_note: String(row?.review_note ?? '').trim() || null,
    converted_internal_invoice_line_item_id:
      String(row?.converted_internal_invoice_line_item_id ?? '').trim() || null,
    created_at: String(row?.created_at ?? '').trim(),
    updated_at: String(row?.updated_at ?? '').trim(),
  };
}

const FIELD_CHARGE_PROPOSAL_SELECT = [
  'id',
  'account_owner_user_id',
  'job_id',
  'internal_invoice_id',
  'source_kind',
  'source_pricebook_item_id',
  'source_visit_scope_item_id',
  'proposed_name',
  'proposed_description',
  'proposed_item_type',
  'proposed_quantity',
  'proposed_unit_price_cents',
  'proposed_subtotal_cents',
  'proposed_currency',
  'status',
  'proposed_by_user_id',
  'submitted_at',
  'reviewed_by_user_id',
  'reviewed_at',
  'review_note',
  'converted_internal_invoice_line_item_id',
  'created_at',
  'updated_at',
].join(', ');

function buildFieldChargeProposalReadError(error: unknown, context: { accountOwnerUserId: string; jobId: string }) {
  const candidate = (error && typeof error === 'object' ? error : {}) as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };

  const code = String(candidate.code ?? '').trim() || 'unknown';
  const message = String(candidate.message ?? '').trim() || String(error);
  const details = String(candidate.details ?? '').trim();
  const hint = String(candidate.hint ?? '').trim();

  const wrappedMessage = [
    '[field-charge-proposals:list] read failed',
    `code=${code}`,
    `message=${message}`,
    details ? `details=${details}` : '',
    hint ? `hint=${hint}` : '',
    `accountOwnerUserId=${context.accountOwnerUserId}`,
    `jobId=${context.jobId}`,
  ]
    .filter(Boolean)
    .join(' | ');

  const wrapped = new Error(wrappedMessage);
  (wrapped as any).cause = error;
  (wrapped as any).code = code;
  (wrapped as any).details = details || null;
  (wrapped as any).hint = hint || null;
  return wrapped;
}

export async function listFieldChargeProposalsForJob(params: {
  supabase: any;
  accountOwnerUserId: string;
  jobId: string;
}): Promise<FieldChargeProposalRecord[]> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? '').trim();
  const jobId = String(params.jobId ?? '').trim();
  if (!accountOwnerUserId || !jobId) return [];

  const { data, error } = await params.supabase
    .from('field_charge_proposals')
    .select(FIELD_CHARGE_PROPOSAL_SELECT)
    .eq('account_owner_user_id', accountOwnerUserId)
    .eq('job_id', jobId)
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw buildFieldChargeProposalReadError(error, {
      accountOwnerUserId,
      jobId,
    });
  }
  return Array.isArray(data) ? data.map(normalizeFieldChargeProposalRow) : [];
}
