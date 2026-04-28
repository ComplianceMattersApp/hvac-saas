import { describe, expect, it } from 'vitest';

import { listInternalInvoiceLineItems } from '@/lib/business/internal-invoice';

describe('internal invoice line item provenance normalization', () => {
  it('reads legacy rows safely when provenance fields are null', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              order: async () => ({
                data: [
                  {
                    id: 'line-1',
                    invoice_id: 'inv-1',
                    sort_order: 1,
                    source_kind: null,
                    source_pricebook_item_id: null,
                    source_visit_scope_item_id: null,
                    item_name_snapshot: 'Legacy line',
                    description_snapshot: null,
                    item_type_snapshot: 'service',
                    category_snapshot: null,
                    unit_label_snapshot: null,
                    quantity: 1,
                    unit_price: 100,
                    line_subtotal: 100,
                    created_by_user_id: 'u1',
                    updated_by_user_id: 'u1',
                    created_at: '2026-04-27T00:00:00.000Z',
                    updated_at: '2026-04-27T00:00:00.000Z',
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    const rows = await listInternalInvoiceLineItems({
      supabase,
      invoiceId: 'inv-1',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].source_kind).toBeNull();
    expect(rows[0].source_pricebook_item_id).toBeNull();
    expect(rows[0].source_visit_scope_item_id).toBeNull();
    expect(rows[0].category_snapshot).toBeNull();
    expect(rows[0].unit_label_snapshot).toBeNull();
  });

  it('accepts visit_scope source kind and scope item provenance id', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              order: async () => ({
                data: [
                  {
                    id: 'line-visit-scope',
                    invoice_id: 'inv-1',
                    sort_order: 1,
                    source_kind: 'visit_scope',
                    source_pricebook_item_id: null,
                    source_visit_scope_item_id: '8e0e1a2f-fc8c-45c7-aa99-098dd1d79b1f',
                    item_name_snapshot: 'Scope-sourced line',
                    description_snapshot: 'Frozen snapshot',
                    item_type_snapshot: 'service',
                    category_snapshot: null,
                    unit_label_snapshot: null,
                    quantity: 1,
                    unit_price: 175,
                    line_subtotal: 175,
                    created_by_user_id: 'u1',
                    updated_by_user_id: 'u1',
                    created_at: '2026-04-27T00:00:00.000Z',
                    updated_at: '2026-04-27T00:00:00.000Z',
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    const rows = await listInternalInvoiceLineItems({
      supabase,
      invoiceId: 'inv-1',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].source_kind).toBe('visit_scope');
    expect(rows[0].source_visit_scope_item_id).toBe('8e0e1a2f-fc8c-45c7-aa99-098dd1d79b1f');
    expect(rows[0].source_pricebook_item_id).toBeNull();
  });

  it('continues reading manual and pricebook provenance rows safely', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              order: async () => ({
                data: [
                  {
                    id: 'line-manual',
                    invoice_id: 'inv-1',
                    sort_order: 1,
                    source_kind: 'manual',
                    source_pricebook_item_id: null,
                    source_visit_scope_item_id: null,
                    item_name_snapshot: 'Manual line',
                    description_snapshot: null,
                    item_type_snapshot: 'service',
                    category_snapshot: null,
                    unit_label_snapshot: null,
                    quantity: 1,
                    unit_price: 100,
                    line_subtotal: 100,
                    created_by_user_id: 'u1',
                    updated_by_user_id: 'u1',
                    created_at: '2026-04-27T00:00:00.000Z',
                    updated_at: '2026-04-27T00:00:00.000Z',
                  },
                  {
                    id: 'line-pricebook',
                    invoice_id: 'inv-1',
                    sort_order: 2,
                    source_kind: 'pricebook',
                    source_pricebook_item_id: 'pb-1',
                    source_visit_scope_item_id: null,
                    item_name_snapshot: 'Pricebook line',
                    description_snapshot: null,
                    item_type_snapshot: 'service',
                    category_snapshot: 'HVAC',
                    unit_label_snapshot: 'each',
                    quantity: 1,
                    unit_price: 125,
                    line_subtotal: 125,
                    created_by_user_id: 'u1',
                    updated_by_user_id: 'u1',
                    created_at: '2026-04-27T00:00:00.000Z',
                    updated_at: '2026-04-27T00:00:00.000Z',
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    const rows = await listInternalInvoiceLineItems({
      supabase,
      invoiceId: 'inv-1',
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].source_kind).toBe('manual');
    expect(rows[1].source_kind).toBe('pricebook');
    expect(rows[1].source_pricebook_item_id).toBe('pb-1');
  });
});
