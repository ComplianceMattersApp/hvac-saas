import { describe, expect, it, vi } from 'vitest';
import {
  claimInvoiceCollectionReservation,
  releaseInvoiceCollectionReservation,
} from '@/lib/business/invoice-collection-reservations';

describe('invoice collection reservations', () => {
  it('claims one invoice-scoped reservation through the atomic database function', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    await expect(claimInvoiceCollectionReservation({
      supabase: { rpc },
      accountOwnerUserId: 'owner-1',
      invoiceId: 'invoice-1',
      sourceKind: 'stripe_checkout',
      reservationKey: 'checkout-1',
      amountCents: 85000,
      ttlSeconds: 90000,
    })).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('claim_internal_invoice_collection_reservation', expect.objectContaining({
      p_invoice_id: 'invoice-1',
      p_reservation_key: 'checkout-1',
      p_amount_cents: 85000,
    }));
  });

  it('releases only the exact reservation key', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    await expect(releaseInvoiceCollectionReservation({
      supabase: { rpc },
      accountOwnerUserId: 'owner-1',
      invoiceId: 'invoice-1',
      reservationKey: 'checkout-1',
    })).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('release_internal_invoice_collection_reservation', expect.objectContaining({
      p_reservation_key: 'checkout-1',
    }));
  });
});
