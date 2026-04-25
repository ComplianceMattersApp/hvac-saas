import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listInvoicePaymentRows,
  resolveInvoiceCollectedPaymentSummary,
} from '@/lib/business/internal-invoice-payments';

function makeSupabaseMock(opts: {
  invoiceTotalCents?: number;
  invoiceError?: { message: string } | null;
  payments?: any[];
  paymentsError?: { message: string } | null;
}) {
  const invoiceTotalCents = opts.invoiceTotalCents ?? 0;
  const invoiceError = opts.invoiceError ?? null;
  const payments = opts.payments ?? [];
  const paymentsError = opts.paymentsError ?? null;

  return {
    from: vi.fn((table: string) => {
      if (table === 'internal_invoices') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: invoiceError ? null : { id: 'inv-1', total_cents: invoiceTotalCents },
                  error: invoiceError,
                })),
              })),
            })),
          })),
        };
      }

      if (table === 'internal_invoice_payments') {
        const order1 = {
          order: vi.fn(async () => ({
            data: payments,
            error: paymentsError,
          })),
        };

        const chain = {
          eq: vi.fn(() => chain),
          order: vi.fn(() => order1),
        } as any;

        return {
          select: vi.fn(() => chain),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe('internal invoice payment resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('missing payment rows return zero summary', async () => {
    const supabase = makeSupabaseMock({ invoiceTotalCents: 15000, payments: [] });

    const summary = await resolveInvoiceCollectedPaymentSummary('owner-1', 'inv-1', supabase);

    expect(summary.invoiceTotalCents).toBe(15000);
    expect(summary.amountPaidCents).toBe(0);
    expect(summary.balanceDueCents).toBe(15000);
    expect(summary.paymentStatus).toBe('unpaid');
  });

  it('multiple recorded payments calculate collected total correctly', async () => {
    const supabase = makeSupabaseMock({
      invoiceTotalCents: 20000,
      payments: [
        { id: 'p1', account_owner_user_id: 'owner-1', invoice_id: 'inv-1', job_id: 'job-1', payment_status: 'recorded', payment_method: 'cash', amount_cents: 4000, paid_at: '2026-04-25T00:00:00Z', received_reference: null, notes: null, recorded_by_user_id: 'u1', created_at: '2026-04-25T00:00:00Z', updated_at: '2026-04-25T00:00:00Z' },
        { id: 'p2', account_owner_user_id: 'owner-1', invoice_id: 'inv-1', job_id: 'job-1', payment_status: 'recorded', payment_method: 'check', amount_cents: 3000, paid_at: '2026-04-25T01:00:00Z', received_reference: '101', notes: null, recorded_by_user_id: 'u1', created_at: '2026-04-25T01:00:00Z', updated_at: '2026-04-25T01:00:00Z' },
      ],
    });

    const summary = await resolveInvoiceCollectedPaymentSummary('owner-1', 'inv-1', supabase);

    expect(summary.amountPaidCents).toBe(7000);
    expect(summary.balanceDueCents).toBe(13000);
    expect(summary.paymentStatus).toBe('partial');
  });

  it('pending/failed/reversed payments do not count toward collected total', async () => {
    const supabase = makeSupabaseMock({
      invoiceTotalCents: 12000,
      payments: [
        { id: 'p1', account_owner_user_id: 'owner-1', invoice_id: 'inv-1', job_id: 'job-1', payment_status: 'pending', payment_method: 'cash', amount_cents: 2000, paid_at: '2026-04-25T00:00:00Z', received_reference: null, notes: null, recorded_by_user_id: 'u1', created_at: '2026-04-25T00:00:00Z', updated_at: '2026-04-25T00:00:00Z' },
        { id: 'p2', account_owner_user_id: 'owner-1', invoice_id: 'inv-1', job_id: 'job-1', payment_status: 'failed', payment_method: 'check', amount_cents: 3000, paid_at: '2026-04-25T01:00:00Z', received_reference: null, notes: null, recorded_by_user_id: 'u1', created_at: '2026-04-25T01:00:00Z', updated_at: '2026-04-25T01:00:00Z' },
        { id: 'p3', account_owner_user_id: 'owner-1', invoice_id: 'inv-1', job_id: 'job-1', payment_status: 'reversed', payment_method: 'other', amount_cents: 4000, paid_at: '2026-04-25T02:00:00Z', received_reference: null, notes: null, recorded_by_user_id: 'u1', created_at: '2026-04-25T02:00:00Z', updated_at: '2026-04-25T02:00:00Z' },
      ],
    });

    const summary = await resolveInvoiceCollectedPaymentSummary('owner-1', 'inv-1', supabase);

    expect(summary.amountPaidCents).toBe(0);
    expect(summary.balanceDueCents).toBe(12000);
    expect(summary.paymentStatus).toBe('unpaid');
  });

  it('balance due clamps at zero when recorded exceeds invoice total', async () => {
    const supabase = makeSupabaseMock({
      invoiceTotalCents: 5000,
      payments: [
        { id: 'p1', account_owner_user_id: 'owner-1', invoice_id: 'inv-1', job_id: 'job-1', payment_status: 'recorded', payment_method: 'cash', amount_cents: 7000, paid_at: '2026-04-25T00:00:00Z', received_reference: null, notes: null, recorded_by_user_id: 'u1', created_at: '2026-04-25T00:00:00Z', updated_at: '2026-04-25T00:00:00Z' },
      ],
    });

    const summary = await resolveInvoiceCollectedPaymentSummary('owner-1', 'inv-1', supabase);

    expect(summary.amountPaidCents).toBe(7000);
    expect(summary.balanceDueCents).toBe(0);
    expect(summary.paymentStatus).toBe('paid');
  });

  it('real DB errors throw for payment row list', async () => {
    const supabase = makeSupabaseMock({
      invoiceTotalCents: 1000,
      paymentsError: { message: 'select failed' },
    });

    await expect(listInvoicePaymentRows('owner-1', 'inv-1', supabase)).rejects.toThrow(
      'Failed to list internal invoice payments',
    );
  });

  it('real DB errors throw for summary invoice lookup', async () => {
    const supabase = makeSupabaseMock({
      invoiceError: { message: 'invoice lookup failed' },
    });

    await expect(
      resolveInvoiceCollectedPaymentSummary('owner-1', 'inv-1', supabase),
    ).rejects.toThrow('Failed to resolve internal invoice payment summary');
  });
});
