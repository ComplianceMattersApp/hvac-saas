import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const readinessMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/business/tenant-stripe-connect-readiness', () => ({
  resolveTenantStripeConnectReadiness: readinessMock,
}));

import { syncStripePaymentSettlementsForAccount } from '@/lib/actions/stripe-settlement-sync-actions';

type PaymentRow = {
  id: string;
  account_owner_user_id: string;
  invoice_id: string | null;
  job_id: string | null;
  payment_status: string | null;
  payment_method: string | null;
  amount_cents: number | null;
  paid_at: string | null;
  created_at: string | null;
  processor_name: string | null;
  processor_payment_reference: string | null;
  processor_charge_id: string | null;
  stripe_event_id?: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  internal_invoices?: { invoice_number?: string | null } | null;
};

const ownerUser = {
  user_id: 'owner-1',
  role: 'admin' as const,
  is_active: true,
  account_owner_user_id: 'owner-1',
  created_by: null,
};

function makePayment(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: 'pay-1',
    account_owner_user_id: 'owner-1',
    invoice_id: 'inv-1',
    job_id: 'job-1',
    payment_status: 'recorded',
    payment_method: 'card_stripe_online',
    amount_cents: 50000,
    paid_at: '2026-06-10T12:00:00.000Z',
    created_at: '2026-06-10T12:00:00.000Z',
    processor_name: 'stripe',
    processor_payment_reference: null,
    processor_charge_id: 'ch_123',
    stripe_event_id: 'evt_123',
    stripe_checkout_session_id: 'cs_123',
    stripe_payment_intent_id: 'pi_123',
    internal_invoices: { invoice_number: 'INV-1001' },
    ...overrides,
  };
}

function readyConnect() {
  readinessMock.mockResolvedValue({
    connectedAccountId: 'acct_123',
    onboardingStatus: 'complete',
    chargesEnabled: true,
    payoutsEnabled: true,
    detailsSubmitted: true,
    disabledReason: null,
    lastSyncedAt: null,
    isReady: true,
  });
}

function makeSupabase(params: {
  payments?: PaymentRow[];
  settlements?: Array<{ id: string; internal_invoice_payment_id: string; sync_status: string }>;
} = {}) {
  const payments = params.payments ?? [makePayment()];
  const settlements = params.settlements ?? [];
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];

  function query(table: string) {
    const q: any = {
      select(payload: unknown) {
        calls.push({ table, op: 'select', payload });
        return q;
      },
      eq(column: string, value: unknown) {
        calls.push({ table, op: `eq:${column}`, payload: value });
        return q;
      },
      gte(column: string, value: unknown) {
        calls.push({ table, op: `gte:${column}`, payload: value });
        return q;
      },
      lte(column: string, value: unknown) {
        calls.push({ table, op: `lte:${column}`, payload: value });
        return q;
      },
      or(payload: unknown) {
        calls.push({ table, op: 'or', payload });
        return q;
      },
      order(column: string, payload: unknown) {
        calls.push({ table, op: `order:${column}`, payload });
        return Promise.resolve({ data: payments, error: null });
      },
      in(column: string, value: unknown) {
        calls.push({ table, op: `in:${column}`, payload: value });
        return Promise.resolve({ data: settlements, error: null });
      },
      insert(payload: unknown) {
        calls.push({ table, op: 'insert', payload });
        throw new Error('unexpected insert');
      },
      update(payload: unknown) {
        calls.push({ table, op: 'update', payload });
        throw new Error('unexpected update');
      },
      upsert(payload: unknown) {
        calls.push({ table, op: 'upsert', payload });
        throw new Error('unexpected upsert');
      },
      delete() {
        calls.push({ table, op: 'delete' });
        throw new Error('unexpected delete');
      },
    };
    return q;
  }

  return {
    calls,
    client: {
      from(table: string) {
        calls.push({ table, op: 'from' });
        return query(table);
      },
    },
  };
}

async function run(overrides: Partial<Parameters<typeof syncStripePaymentSettlementsForAccount>[0]> = {}) {
  readyConnect();
  const ctx = makeSupabase(overrides.supabase ? undefined : {});
  const helper = vi.fn().mockResolvedValue({
    status: 'synced',
    code: 'synced',
    reason: 'Stripe payment settlement synced.',
    settlementId: 'set_1',
    platformFeeProven: false,
  });

  const result = await syncStripePaymentSettlementsForAccount({
    supabase: ctx.client,
    stripe: { charges: {}, balanceTransactions: {}, payouts: {} } as any,
    actorUserId: 'owner-1',
    internalUser: ownerUser,
    accountOwnerUserId: 'owner-1',
    dateFrom: '2026-06-10T00:00:00.000Z',
    dateTo: '2026-06-10T23:59:59.999Z',
    dryRun: true,
    syncPaymentSettlementForPayment: helper as any,
    ...overrides,
  });

  return { result, ctx, helper };
}

beforeEach(() => {
  readinessMock.mockReset();
});

describe('syncStripePaymentSettlementsForAccount', () => {
  it('requires internal financial authority', async () => {
    await expect(
      run({
        actorUserId: 'tech-1',
        internalUser: {
          ...ownerUser,
          user_id: 'tech-1',
          role: 'tech',
          account_owner_user_id: 'owner-1',
        },
      }),
    ).rejects.toThrow(/financial authority/i);
  });

  it('requires explicit account scope and matching actor scope', async () => {
    await expect(run({ accountOwnerUserId: '' })).rejects.toThrow(/accountOwnerUserId/i);
    await expect(run({ accountOwnerUserId: 'owner-2' })).rejects.toThrow(/financial authority/i);
  });

  it('dry-run does not call Stripe/helper or write settlements', async () => {
    const { result, ctx, helper } = await run({ dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.evaluated).toBe(1);
    expect(result.eligible).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.perCodeCounts.dry_run_only).toBe(1);
    expect(helper).not.toHaveBeenCalled();
    expect(ctx.calls.some((call) => ['insert', 'update', 'upsert', 'delete'].includes(call.op))).toBe(false);
  });

  it('dry-run classifies eligible and skipped rows from local data', async () => {
    const ctx = makeSupabase({
      payments: [
        makePayment({ id: 'pay-1', processor_charge_id: 'ch_1' }),
        makePayment({ id: 'pay-2', payment_method: 'cash', processor_name: null, processor_charge_id: null, stripe_event_id: null, stripe_checkout_session_id: null, stripe_payment_intent_id: null }),
        makePayment({ id: 'pay-3', processor_charge_id: null, processor_payment_reference: null }),
      ],
    });
    readyConnect();

    const result = await syncStripePaymentSettlementsForAccount({
      supabase: ctx.client,
      actorUserId: 'owner-1',
      internalUser: ownerUser,
      accountOwnerUserId: 'owner-1',
      dateFrom: '2026-06-10T00:00:00.000Z',
      dateTo: '2026-06-10T23:59:59.999Z',
      dryRun: true,
    });

    expect(result.eligible).toBe(1);
    expect(result.perCodeCounts.dry_run_only).toBe(1);
    expect(result.perCodeCounts.non_stripe_payment).toBe(1);
    expect(result.perCodeCounts.missing_charge_id).toBe(1);
  });

  it('commit mode calls syncStripePaymentSettlementForPayment for eligible rows', async () => {
    const { result, helper } = await run({ dryRun: false });

    expect(helper).toHaveBeenCalledWith(
      expect.objectContaining({
        accountOwnerUserId: 'owner-1',
        internalInvoicePaymentId: 'pay-1',
      }),
    );
    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('commit mode aggregates synced, skipped, and failed helper results', async () => {
    const ctx = makeSupabase({
      payments: [
        makePayment({ id: 'pay-1', processor_charge_id: 'ch_1' }),
        makePayment({ id: 'pay-2', processor_charge_id: 'ch_2' }),
        makePayment({ id: 'pay-3', processor_charge_id: 'ch_3' }),
      ],
    });
    readyConnect();
    const helper = vi
      .fn()
      .mockResolvedValueOnce({ status: 'synced', code: 'synced', reason: 'ok', settlementId: 'set_1' })
      .mockResolvedValueOnce({ status: 'skipped', code: 'already_synced_elsewhere', reason: 'skip', settlementId: null })
      .mockResolvedValueOnce({ status: 'failed', code: 'stripe_charge_fetch_failed', reason: 'nope', settlementId: null });

    const result = await syncStripePaymentSettlementsForAccount({
      supabase: ctx.client,
      stripe: { charges: {}, balanceTransactions: {}, payouts: {} } as any,
      actorUserId: 'owner-1',
      internalUser: ownerUser,
      accountOwnerUserId: 'owner-1',
      dateFrom: '2026-06-10T00:00:00.000Z',
      dateTo: '2026-06-10T23:59:59.999Z',
      dryRun: false,
      syncPaymentSettlementForPayment: helper as any,
    });

    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.perCodeCounts.synced).toBe(1);
    expect(result.perCodeCounts.already_synced_elsewhere).toBe(1);
    expect(result.perCodeCounts.stripe_charge_fetch_failed).toBe(1);
  });

  it('manual and off-platform rows are skipped', async () => {
    const ctx = makeSupabase({
      payments: [
        makePayment({ payment_method: 'cash', processor_name: null, processor_charge_id: null, stripe_event_id: null, stripe_checkout_session_id: null, stripe_payment_intent_id: null }),
      ],
    });
    readyConnect();

    const result = await syncStripePaymentSettlementsForAccount({
      supabase: ctx.client,
      actorUserId: 'owner-1',
      internalUser: ownerUser,
      accountOwnerUserId: 'owner-1',
      dateFrom: '2026-06-10T00:00:00.000Z',
      dateTo: '2026-06-10T23:59:59.999Z',
      dryRun: true,
    });

    expect(result.perCodeCounts.non_stripe_payment).toBe(1);
  });

  it('failed, pending, and reversed rows are skipped', async () => {
    const ctx = makeSupabase({
      payments: [
        makePayment({ id: 'pay-failed', payment_status: 'failed' }),
        makePayment({ id: 'pay-pending', payment_status: 'pending' }),
        makePayment({ id: 'pay-reversed', payment_status: 'reversed' }),
      ],
    });
    readyConnect();

    const result = await syncStripePaymentSettlementsForAccount({
      supabase: ctx.client,
      actorUserId: 'owner-1',
      internalUser: ownerUser,
      accountOwnerUserId: 'owner-1',
      dateFrom: '2026-06-10T00:00:00.000Z',
      dateTo: '2026-06-10T23:59:59.999Z',
      dryRun: true,
    });

    expect(result.skipped).toBe(3);
    expect(result.perCodeCounts.non_recorded_payment).toBe(3);
  });

  it('missing charge id rows are skipped', async () => {
    const ctx = makeSupabase({
      payments: [makePayment({ processor_charge_id: null, processor_payment_reference: 'pi_not_charge' })],
    });
    readyConnect();

    const result = await syncStripePaymentSettlementsForAccount({
      supabase: ctx.client,
      actorUserId: 'owner-1',
      internalUser: ownerUser,
      accountOwnerUserId: 'owner-1',
      dateFrom: '2026-06-10T00:00:00.000Z',
      dateTo: '2026-06-10T23:59:59.999Z',
      dryRun: true,
    });

    expect(result.perCodeCounts.missing_charge_id).toBe(1);
  });

  it('missing and not-ready connected accounts are skipped before helper calls', async () => {
    const helper = vi.fn();
    readinessMock.mockResolvedValueOnce({
      connectedAccountId: null,
      onboardingStatus: 'not_started',
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      disabledReason: null,
      lastSyncedAt: null,
      isReady: false,
    });
    const missing = await syncStripePaymentSettlementsForAccount({
      supabase: makeSupabase().client,
      actorUserId: 'owner-1',
      internalUser: ownerUser,
      accountOwnerUserId: 'owner-1',
      dateFrom: '2026-06-10T00:00:00.000Z',
      dateTo: '2026-06-10T23:59:59.999Z',
      dryRun: false,
      stripe: { charges: {}, balanceTransactions: {}, payouts: {} } as any,
      syncPaymentSettlementForPayment: helper as any,
    });

    readinessMock.mockResolvedValueOnce({
      connectedAccountId: 'acct_123',
      onboardingStatus: 'pending',
      chargesEnabled: true,
      payoutsEnabled: false,
      detailsSubmitted: true,
      disabledReason: null,
      lastSyncedAt: null,
      isReady: false,
    });
    const notReady = await syncStripePaymentSettlementsForAccount({
      supabase: makeSupabase().client,
      actorUserId: 'owner-1',
      internalUser: ownerUser,
      accountOwnerUserId: 'owner-1',
      dateFrom: '2026-06-10T00:00:00.000Z',
      dateTo: '2026-06-10T23:59:59.999Z',
      dryRun: false,
      stripe: { charges: {}, balanceTransactions: {}, payouts: {} } as any,
      syncPaymentSettlementForPayment: helper as any,
    });

    expect(missing.perCodeCounts.missing_connected_account).toBe(1);
    expect(notReady.perCodeCounts.connected_account_not_ready).toBe(1);
    expect(helper).not.toHaveBeenCalled();
  });

  it('detects already-synced settlements when present', async () => {
    const ctx = makeSupabase({
      settlements: [{ id: 'set_1', internal_invoice_payment_id: 'pay-1', sync_status: 'synced', stripe_payout_id: 'po_1', payout_status: 'paid' } as any],
    });
    readyConnect();

    const result = await syncStripePaymentSettlementsForAccount({
      supabase: ctx.client,
      actorUserId: 'owner-1',
      internalUser: ownerUser,
      accountOwnerUserId: 'owner-1',
      dateFrom: '2026-06-10T00:00:00.000Z',
      dateTo: '2026-06-10T23:59:59.999Z',
      dryRun: false,
      stripe: { charges: {}, balanceTransactions: {}, payouts: {} } as any,
    });

    expect(result.perCodeCounts.already_synced).toBe(1);
    expect(result.details[0]?.settlementId).toBe('set_1');
  });

  it('allows an existing synced row without a final payout to refresh', async () => {
    const ctx = makeSupabase({
      settlements: [{ id: 'set_1', internal_invoice_payment_id: 'pay-1', sync_status: 'synced', stripe_payout_id: null, payout_status: 'pending' } as any],
    });
    readyConnect();
    const helper = vi.fn().mockResolvedValue({ status: 'synced', code: 'synced', reason: 'refreshed', settlementId: 'set_1' });
    const result = await syncStripePaymentSettlementsForAccount({
      supabase: ctx.client,
      stripe: { charges: {}, balanceTransactions: {}, payouts: {} } as any,
      actorUserId: 'owner-1', internalUser: ownerUser, accountOwnerUserId: 'owner-1',
      dateFrom: '2026-06-10T00:00:00.000Z', dateTo: '2026-06-10T23:59:59.999Z',
      dryRun: false, syncPaymentSettlementForPayment: helper as any,
    });
    expect(helper).toHaveBeenCalledOnce();
    expect(result.synced).toBe(1);
  });

  it('per-row helper exception does not abort remaining rows', async () => {
    const ctx = makeSupabase({
      payments: [
        makePayment({ id: 'pay-1', processor_charge_id: 'ch_1' }),
        makePayment({ id: 'pay-2', processor_charge_id: 'ch_2' }),
      ],
    });
    readyConnect();
    const helper = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary Stripe problem'))
      .mockResolvedValueOnce({ status: 'synced', code: 'synced', reason: 'ok', settlementId: 'set_2' });

    const result = await syncStripePaymentSettlementsForAccount({
      supabase: ctx.client,
      stripe: { charges: {}, balanceTransactions: {}, payouts: {} } as any,
      actorUserId: 'owner-1',
      internalUser: ownerUser,
      accountOwnerUserId: 'owner-1',
      dateFrom: '2026-06-10T00:00:00.000Z',
      dateTo: '2026-06-10T23:59:59.999Z',
      dryRun: false,
      syncPaymentSettlementForPayment: helper as any,
    });

    expect(helper).toHaveBeenCalledTimes(2);
    expect(result.failed).toBe(1);
    expect(result.synced).toBe(1);
    expect(result.perCodeCounts.helper_exception).toBe(1);
  });

  it('does not call invoice/payment/allocation mutation paths directly', async () => {
    const { ctx } = await run({ dryRun: true });
    const forbiddenTables = new Set([
      'internal_invoices',
      'internal_invoice_allocations',
      'internal_invoice_payment_allocations',
      'jobs',
      'customers',
      'qbo',
    ]);

    expect(
      ctx.calls.some(
        (call) =>
          forbiddenTables.has(call.table) &&
          ['insert', 'update', 'upsert', 'delete'].includes(call.op),
      ),
    ).toBe(false);
  });

  it('returns scoped, safe row-level details', async () => {
    const { result } = await run({ dryRun: true });

    expect(result.details[0]).toEqual({
      paymentId: 'pay-1',
      invoiceNumber: 'INV-1001',
      chargeId: 'ch_123',
      status: 'eligible',
      code: 'dry_run_only',
      reason: expect.stringMatching(/dry-run/i),
      settlementId: null,
    });
    expect(Object.keys(result.details[0] ?? {}).sort()).toEqual(
      ['chargeId', 'code', 'invoiceNumber', 'paymentId', 'reason', 'settlementId', 'status'].sort(),
    );
  });

  it('adds only controlled report revalidation, not CSV, cron, or webhook wiring', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'lib/actions/stripe-settlement-sync-actions.ts'),
      'utf8',
    );

    expect(source).toContain("revalidatePath('/reports/deposits')");
    expect(source).not.toMatch(/csv/i);
    expect(source).not.toMatch(/cron|schedule/i);
    expect(source).not.toMatch(/webhook/i);
  });
});
