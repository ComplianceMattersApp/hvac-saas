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
    expect(rows[0].category_snapshot).toBeNull();
    expect(rows[0].unit_label_snapshot).toBeNull();
  });
});
