import { describe, expect, it } from 'vitest';

import {
  FIELD_CHARGE_PROPOSAL_SOURCE_KINDS,
  FIELD_CHARGE_PROPOSAL_STATUSES,
  normalizeFieldChargeProposalRow,
  normalizeFieldChargeProposalSourceKind,
  normalizeFieldChargeProposalStatus,
} from '@/lib/business/field-charge-proposals';

describe('field charge proposal model foundation', () => {
  it('locks source kinds and statuses for proposal workflow truth', () => {
    expect(FIELD_CHARGE_PROPOSAL_SOURCE_KINDS).toEqual(['pricebook', 'visit_scope', 'manual']);
    expect(FIELD_CHARGE_PROPOSAL_STATUSES).toEqual([
      'draft',
      'submitted_for_review',
      'approved',
      'rejected',
      'voided',
    ]);
  });

  it('normalizes unknown proposal sources and statuses conservatively', () => {
    expect(normalizeFieldChargeProposalSourceKind('pricebook')).toBe('pricebook');
    expect(normalizeFieldChargeProposalSourceKind('visit_scope')).toBe('visit_scope');
    expect(normalizeFieldChargeProposalSourceKind('surprise')).toBe('manual');
    expect(normalizeFieldChargeProposalStatus('submitted_for_review')).toBe('submitted_for_review');
    expect(normalizeFieldChargeProposalStatus('approved')).toBe('approved');
    expect(normalizeFieldChargeProposalStatus('unknown')).toBe('draft');
  });

  it('normalizes proposal rows without treating them as invoice line items', () => {
    const row = normalizeFieldChargeProposalRow({
      id: 'proposal-1',
      account_owner_user_id: 'owner-1',
      job_id: 'job-1',
      internal_invoice_id: null,
      source_kind: 'pricebook',
      source_pricebook_item_id: 'pricebook-1',
      source_visit_scope_item_id: null,
      proposed_name: ' Diagnostic ',
      proposed_description: ' Check system ',
      proposed_item_type: 'diagnostic',
      proposed_quantity: '2',
      proposed_unit_price_cents: '12500',
      proposed_subtotal_cents: '25000',
      proposed_currency: 'USD',
      status: 'submitted_for_review',
      proposed_by_user_id: 'tech-1',
      submitted_at: '2026-06-05T18:00:00.000Z',
      reviewed_by_user_id: null,
      reviewed_at: null,
      review_note: '',
      converted_internal_invoice_line_item_id: null,
      created_at: '2026-06-05T18:00:00.000Z',
      updated_at: '2026-06-05T18:00:00.000Z',
    });

    expect(row.proposed_name).toBe('Diagnostic');
    expect(row.proposed_description).toBe('Check system');
    expect(row.proposed_item_type).toBe('diagnostic');
    expect(row.proposed_quantity).toBe(2);
    expect(row.proposed_unit_price_cents).toBe(12500);
    expect(row.proposed_subtotal_cents).toBe(25000);
    expect(row.proposed_currency).toBe('usd');
    expect(row.converted_internal_invoice_line_item_id).toBeNull();
  });
});
