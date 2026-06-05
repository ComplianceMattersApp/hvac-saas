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
