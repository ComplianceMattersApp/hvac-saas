import { describe, expect, it } from 'vitest';
import { getDepositsReconciliationStatus } from '@/lib/reports/deposits-reconciliation-status';

function client(data: Record<string, any[]>, errors: Record<string, Error | null> = {}) {
  return {
    from(table: string) {
      const result = { data: data[table] ?? [], error: errors[table] ?? null };
      const query: any = {
        select() { return query; },
        eq() { return query; },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve(result).then(resolve); },
      };
      return query;
    },
  };
}

const payment = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, payment_status: 'recorded', payment_method: 'card_stripe_online', processor_name: 'stripe',
  processor_charge_id: `ch_${id}`, stripe_charged_at: '2026-06-10T12:00:00.000Z', paid_at: null,
  created_at: '2026-06-10T11:00:00.000Z', ...overrides,
});

describe('deposits reconciliation diagnostics', () => {
  it('distinguishes no payments, awaiting sync, pending payout, and failures', async () => {
    const status = await getDepositsReconciliationStatus({
      supabase: client({
        internal_invoice_payments: [payment('1'), payment('2'), payment('3')],
        stripe_payment_settlements: [
          { internal_invoice_payment_id: '2', stripe_payout_id: null, payout_status: 'pending', sync_status: 'synced' },
          { internal_invoice_payment_id: '3', stripe_payout_id: 'po_3', payout_status: 'failed', sync_status: 'failed' },
        ],
      }),
      accountOwnerUserId: 'owner-1', dateFrom: '2026-06-10', dateTo: '2026-06-10', filteredSettlementRows: 0,
    });
    expect(status).toMatchObject({ recordedStripePayments: 3, syncedSettlements: 2, awaitingSync: 1, pendingPayout: 2, syncFailures: 1 });
  });

  it('uses charged-at then paid-at then created-at and fails closed on query errors', async () => {
    const status = await getDepositsReconciliationStatus({
      supabase: client({ internal_invoice_payments: [payment('1', { stripe_charged_at: null, paid_at: null })], stripe_payment_settlements: [] }),
      accountOwnerUserId: 'owner-1', dateFrom: '2026-06-10', dateTo: '2026-06-10', filteredSettlementRows: 0,
    });
    expect(status.recordedStripePayments).toBe(1);
    await expect(getDepositsReconciliationStatus({
      supabase: client({}, { internal_invoice_payments: new Error('secret database error') }),
      accountOwnerUserId: 'owner-1', filteredSettlementRows: 0,
    })).rejects.toThrow('Unable to load recorded online payment diagnostics.');
  });
});
