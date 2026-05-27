import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INTERNAL_INVOICE_PAYMENT_METHODS,
  listInvoicePaymentRows,
  resolveInvoiceCollectedPaymentSummary,
  isStripeEventAlreadyRecorded,
  isStripePaymentAlreadyRecorded,
  validateInvoiceEligibleForOnlinePayment,
  buildStripePaymentReference,
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

  describe('Stripe online payment method', () => {
    it('card_stripe_online is in payment methods enum', () => {
      expect(INTERNAL_INVOICE_PAYMENT_METHODS).toContain('card_stripe_online');
    });

    it('all legacy methods still exist', () => {
      expect(INTERNAL_INVOICE_PAYMENT_METHODS).toContain('cash');
      expect(INTERNAL_INVOICE_PAYMENT_METHODS).toContain('check');
      expect(INTERNAL_INVOICE_PAYMENT_METHODS).toContain('ach_off_platform');
      expect(INTERNAL_INVOICE_PAYMENT_METHODS).toContain('card_off_platform');
      expect(INTERNAL_INVOICE_PAYMENT_METHODS).toContain('bank_transfer');
      expect(INTERNAL_INVOICE_PAYMENT_METHODS).toContain('other');
    });

    it('accepts Stripe online payments in balance calculations', async () => {
      const supabase = makeSupabaseMock({
        invoiceTotalCents: 10000,
        payments: [
          {
            id: 'p1',
            account_owner_user_id: 'owner-1',
            invoice_id: 'inv-1',
            job_id: 'job-1',
            payment_status: 'recorded',
            payment_method: 'card_stripe_online',
            amount_cents: 10000,
            paid_at: '2026-05-19T14:00:00Z',
            received_reference: 'ch_stripe_123',
            notes: null,
            recorded_by_user_id: 'webhook',
            created_at: '2026-05-19T14:00:00Z',
            updated_at: '2026-05-19T14:00:00Z',
            stripe_event_id: 'evt_123',
            stripe_checkout_session_id: 'cs_123',
            stripe_payment_intent_id: 'pi_123',
            stripe_charged_at: '2026-05-19T14:00:00Z',
          },
        ],
      });

      const summary = await resolveInvoiceCollectedPaymentSummary('owner-1', 'inv-1', supabase);

      expect(summary.amountPaidCents).toBe(10000);
      expect(summary.balanceDueCents).toBe(0);
      expect(summary.paymentStatus).toBe('paid');
    });
  });

  describe('Stripe idempotency by event ID', () => {
    it('detects existing payment by stripe_event_id', async () => {
      const supabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: 'payment-1' },
                error: null,
              })),
            })),
          })),
        })),
      };

      const exists = await isStripeEventAlreadyRecorded('evt_123', supabase);

      expect(exists).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('internal_invoice_payments');
    });

    it('returns false when event not found', async () => {
      const supabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
              })),
            })),
          })),
        })),
      };

      const exists = await isStripeEventAlreadyRecorded('evt_999', supabase);

      expect(exists).toBe(false);
    });

    it('throws on DB error', async () => {
      const supabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: null,
                error: { message: 'query failed' },
              })),
            })),
          })),
        })),
      };

      await expect(isStripeEventAlreadyRecorded('evt_123', supabase)).rejects.toThrow(
        'Failed to check Stripe event idempotency',
      );
    });

    it('returns false for empty/null event ID', async () => {
      const supabase = {
        from: vi.fn(),
      };

      const result1 = await isStripeEventAlreadyRecorded('', supabase);
      const result2 = await isStripeEventAlreadyRecorded(null as any, supabase);

      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(supabase.from).not.toHaveBeenCalled();
    });
  });

  describe('Stripe payment identity idempotency', () => {
    it('returns true when any identity query returns a first row', async () => {
      const supabase = {
        from: vi.fn(() => {
          const query: any = {
            eq: vi.fn(() => query),
            or: vi.fn(() => query),
            limit: vi.fn(async () => ({
              data: [{ id: 'pay-1' }, { id: 'pay-2' }],
              error: null,
            })),
          };

          return {
            select: vi.fn(() => query),
          };
        }),
      };

      const exists = await isStripePaymentAlreadyRecorded({
        accountOwnerUserId: 'owner-1',
        invoiceId: 'inv-1',
        stripeCheckoutSessionId: 'cs_1',
        stripePaymentIntentId: 'pi_1',
        processorChargeId: 'ch_1',
        supabase,
      });

      expect(exists).toBe(true);
    });

    it('returns false when no identity value is provided', async () => {
      const supabase = { from: vi.fn() };

      const exists = await isStripePaymentAlreadyRecorded({
        accountOwnerUserId: 'owner-1',
        invoiceId: 'inv-1',
        stripeCheckoutSessionId: '',
        stripePaymentIntentId: null,
        processorChargeId: undefined,
        supabase,
      });

      expect(exists).toBe(false);
      expect(supabase.from).not.toHaveBeenCalled();
    });
  });

  describe('invoice online payment eligibility', () => {
    it('rejects null invoice', () => {
      const result = validateInvoiceEligibleForOnlinePayment(null, {
        invoiceId: 'inv-1',
        invoiceTotalCents: 10000,
        amountPaidCents: 0,
        balanceDueCents: 10000,
        paymentStatus: 'unpaid',
      });

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('rejects draft invoice', () => {
      const result = validateInvoiceEligibleForOnlinePayment(
        { status: 'draft' },
        {
          invoiceId: 'inv-1',
          invoiceTotalCents: 10000,
          amountPaidCents: 0,
          balanceDueCents: 10000,
          paymentStatus: 'unpaid',
        },
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('issued');
    });

    it('rejects void invoice', () => {
      const result = validateInvoiceEligibleForOnlinePayment(
        { status: 'void' },
        {
          invoiceId: 'inv-1',
          invoiceTotalCents: 10000,
          amountPaidCents: 0,
          balanceDueCents: 10000,
          paymentStatus: 'unpaid',
        },
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('issued');
    });

    it('rejects issued invoice with no balance', () => {
      const result = validateInvoiceEligibleForOnlinePayment(
        { status: 'issued' },
        {
          invoiceId: 'inv-1',
          invoiceTotalCents: 10000,
          amountPaidCents: 10000,
          balanceDueCents: 0,
          paymentStatus: 'paid',
        },
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('greater than zero');
    });

    it('accepts issued invoice with positive balance', () => {
      const result = validateInvoiceEligibleForOnlinePayment(
        { status: 'issued' },
        {
          invoiceId: 'inv-1',
          invoiceTotalCents: 10000,
          amountPaidCents: 3000,
          balanceDueCents: 7000,
          paymentStatus: 'partial',
        },
      );

      expect(result.eligible).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  describe('Stripe payment reference building', () => {
    it('extracts charge and intent IDs with timestamp', () => {
      const charge = {
        id: 'ch_1234567890',
        payment_intent: 'pi_9876543210',
        created: 1747756800, // Unix timestamp
      };

      const ref = buildStripePaymentReference(charge);

      expect(ref.processor_name).toBe('stripe');
      expect(ref.processor_payment_reference).toBe('ch_1234567890');
      expect(ref.processor_charge_id).toBe('ch_1234567890');
      expect(ref.stripe_payment_intent_id).toBe('pi_9876543210');
      expect(ref.stripe_charged_at).toBe('2025-05-20T16:00:00.000Z');
    });

    it('handles missing intent ID', () => {
      const charge = {
        id: 'ch_test_missing_intent',
        created: 1747756800,
      };

      const ref = buildStripePaymentReference(charge);

      expect(ref.processor_charge_id).toBe('ch_test_missing_intent');
      expect(ref.stripe_payment_intent_id).toBeNull();
      expect(ref.stripe_charged_at).toBe('2025-05-20T16:00:00.000Z');
    });

    it('handles null/undefined charge gracefully', () => {
      const ref1 = buildStripePaymentReference(null);
      const ref2 = buildStripePaymentReference(undefined);

      expect(ref1.processor_payment_reference).toBeNull();
      expect(ref1.stripe_payment_intent_id).toBeNull();
      expect(ref1.stripe_charged_at).toBeNull();

      expect(ref2.processor_payment_reference).toBeNull();
      expect(ref2.stripe_payment_intent_id).toBeNull();
      expect(ref2.stripe_charged_at).toBeNull();
    });

    it('normalizes whitespace in IDs', () => {
      const charge = {
        id: '  ch_whitespace_test  ',
        payment_intent: '  pi_whitespace_test  ',
        created: 1747756800,
      };

      const ref = buildStripePaymentReference(charge);

      expect(ref.processor_charge_id).toBe('ch_whitespace_test');
      expect(ref.stripe_payment_intent_id).toBe('pi_whitespace_test');
    });
  });
});
