import { beforeEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';

const mockResolveInternalInvoiceByJobId = vi.fn();
const mockIsStripeEventAlreadyRecorded = vi.fn();
const mockIsStripePaymentAlreadyRecorded = vi.fn();
const mockResolveInvoiceCollectedPaymentSummary = vi.fn();
const mockValidateInvoiceEligibleForOnlinePayment = vi.fn();
const mockBuildStripePaymentReference = vi.fn();
const mockResolveTenantStripeConnectReadiness = vi.fn();
const mockInsertJobEvent = vi.fn(async () => null);
const mockGetStripeServerClient = vi.fn();
const mockUpsertInvoicePaymentAllocationForPaymentRow = vi.fn();

vi.mock('@/lib/business/internal-invoice', () => ({
  resolveInternalInvoiceByJobId: (...args: unknown[]) => mockResolveInternalInvoiceByJobId(...args),
}));

vi.mock('@/lib/business/internal-invoice-payments', () => ({
  isStripeEventAlreadyRecorded: (...args: unknown[]) => mockIsStripeEventAlreadyRecorded(...args),
  isStripePaymentAlreadyRecorded: (...args: unknown[]) =>
    mockIsStripePaymentAlreadyRecorded(...args),
  resolveInvoiceCollectedPaymentSummary: (...args: unknown[]) =>
    mockResolveInvoiceCollectedPaymentSummary(...args),
  validateInvoiceEligibleForOnlinePayment: (...args: unknown[]) =>
    mockValidateInvoiceEligibleForOnlinePayment(...args),
  buildStripePaymentReference: (...args: unknown[]) => mockBuildStripePaymentReference(...args),
}));

vi.mock('@/lib/business/tenant-stripe-connect-readiness', () => ({
  resolveTenantStripeConnectReadiness: (...args: unknown[]) =>
    mockResolveTenantStripeConnectReadiness(...args),
}));

vi.mock('@/lib/actions/job-actions', () => ({
  insertJobEvent: mockInsertJobEvent,
}));

vi.mock('@/lib/business/platform-billing-stripe', () => ({
  getStripeServerClient: (...args: unknown[]) => mockGetStripeServerClient(...args),
}));

vi.mock('@/lib/business/payment-allocations', () => ({
  upsertInvoicePaymentAllocationForPaymentRow: (...args: unknown[]) =>
    mockUpsertInvoicePaymentAllocationForPaymentRow(...args),
}));

function makeAdminInsertSuccess(opts?: { existingPaymentId?: string | null }) {
  const existingPaymentId = String(opts?.existingPaymentId ?? 'payment-existing').trim() || null;
  const single = vi.fn(async () => ({ data: { id: 'payment-1' }, error: null }));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn((table: string) => {
    if (table === 'internal_invoices') {
      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({
          data: {
            id: 'inv-1',
            account_owner_user_id: 'owner-1',
            job_id: 'job-1',
            invoice_number: 'INV-001',
            status: 'issued',
            total_cents: 5000,
          },
          error: null,
        })),
      };
      return query;
    }

    if (table === 'internal_invoice_payments') {
      const selectQuery: any = {
        eq: vi.fn(() => selectQuery),
        or: vi.fn(() => selectQuery),
        maybeSingle: vi.fn(async () => ({
          data: existingPaymentId ? { id: existingPaymentId } : null,
          error: null,
        })),
      };

      return {
        select: vi.fn(() => selectQuery),
        insert,
      };
    }

    return { insert };
  });

  return {
    admin: { from },
    from,
    insert,
  };
}

function baseCharge(overrides?: Partial<Stripe.Charge>): Stripe.Charge {
  return {
    id: 'ch_test_1',
    amount: 5000,
    created: 1747756800,
    metadata: {
      account_owner_user_id: 'owner-1',
      invoice_id: 'inv-1',
      job_id: 'job-1',
      checkout_session_id: 'cs_123',
    },
    ...overrides,
  } as Stripe.Charge;
}

function baseCheckoutSession(
  overrides?: Partial<Stripe.Checkout.Session>,
): Stripe.Checkout.Session {
  return {
    id: 'cs_test_1',
    mode: 'payment',
    payment_status: 'paid',
    amount_total: 5000,
    payment_intent: 'pi_test_1',
    metadata: {
      account_owner_user_id: 'owner-1',
      invoice_id: 'inv-1',
      job_id: 'job-1',
    },
    ...overrides,
  } as Stripe.Checkout.Session;
}

describe('tenant invoice Stripe webhook handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockIsStripeEventAlreadyRecorded.mockResolvedValue(false);
    mockIsStripePaymentAlreadyRecorded.mockResolvedValue(false);
    mockResolveInternalInvoiceByJobId.mockResolvedValue({
      id: 'inv-1',
      invoice_number: 'INV-001',
      account_owner_user_id: 'owner-1',
      status: 'issued',
    });
    mockResolveInvoiceCollectedPaymentSummary.mockResolvedValue({
      invoiceId: 'inv-1',
      invoiceTotalCents: 5000,
      amountPaidCents: 0,
      balanceDueCents: 5000,
      paymentStatus: 'unpaid',
    });
    mockValidateInvoiceEligibleForOnlinePayment.mockReturnValue({ eligible: true });
    mockBuildStripePaymentReference.mockReturnValue({
      processor_name: 'stripe',
      processor_payment_reference: 'ch_test_1',
      processor_charge_id: 'ch_test_1',
      stripe_payment_intent_id: 'pi_test_1',
      stripe_charged_at: '2026-05-19T00:00:00.000Z',
    });
    mockResolveTenantStripeConnectReadiness.mockResolvedValue({
      connectedAccountId: 'acct_connected_1',
      onboardingStatus: 'complete',
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      disabledReason: null,
      lastSyncedAt: '2026-05-19T00:00:00.000Z',
      isReady: true,
    });

    mockGetStripeServerClient.mockReturnValue({
      paymentIntents: {
        retrieve: vi.fn(async () => ({
          id: 'pi_test_1',
          created: 1747756800,
          latest_charge: 'ch_test_1',
        })),
      },
    });

    mockUpsertInvoicePaymentAllocationForPaymentRow.mockResolvedValue({
      ok: true,
      status: 'created',
      allocationId: 'alloc-1',
      allocationStatus: 'active',
      reason: null,
    });
  });

  describe('connected-account verification gate', () => {
    it('charge.succeeded with matching connected account records payment', async () => {
      const { recordTenantInvoicePaymentFromStripeCharge } = await import(
        '@/lib/business/tenant-invoice-stripe-webhooks'
      );
      const { admin, insert } = makeAdminInsertSuccess();

      const result = await recordTenantInvoicePaymentFromStripeCharge({
        charge: baseCharge(),
        eventId: 'evt_match_1',
        connectedAccountId: 'acct_connected_1',
        admin,
      });

      expect(result.recorded).toBe(true);
      expect(insert).toHaveBeenCalledTimes(1);
      expect(mockUpsertInvoicePaymentAllocationForPaymentRow).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentRow: expect.objectContaining({
            id: 'payment-1',
            account_owner_user_id: 'owner-1',
            invoice_id: 'inv-1',
            amount_cents: 5000,
            payment_status: 'recorded',
          }),
        }),
      );
    });

    it('charge.succeeded with missing connected account context does not record payment', async () => {
      const { recordTenantInvoicePaymentFromStripeCharge } = await import('@/lib/business/tenant-invoice-stripe-webhooks');
      const { admin, insert } = makeAdminInsertSuccess();

      const result = await recordTenantInvoicePaymentFromStripeCharge({
        charge: baseCharge(),
        eventId: 'evt_missing_ctx',
        connectedAccountId: '',
        admin,
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toContain('connected account context');
      expect(insert).not.toHaveBeenCalled();
    });

    it('charge.succeeded with mismatched connected account does not record payment', async () => {
      const { recordTenantInvoicePaymentFromStripeCharge } = await import(
        '@/lib/business/tenant-invoice-stripe-webhooks'
      );
      const { admin, insert } = makeAdminInsertSuccess();

      const result = await recordTenantInvoicePaymentFromStripeCharge({
        charge: baseCharge(),
        eventId: 'evt_mismatch_ctx',
        connectedAccountId: 'acct_connected_2',
        admin,
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toContain('mismatch');
      expect(insert).not.toHaveBeenCalled();
    });

    it('charge.failed with matching connected account records failed attempt', async () => {
      const { recordTenantInvoicePaymentFailureFromStripeCharge } = await import(
        '@/lib/business/tenant-invoice-stripe-webhooks'
      );
      const { admin, insert } = makeAdminInsertSuccess();

      const result = await recordTenantInvoicePaymentFailureFromStripeCharge({
        charge: baseCharge({ failure_message: 'Card declined' } as Partial<Stripe.Charge>),
        eventId: 'evt_fail_match',
        connectedAccountId: 'acct_connected_1',
        admin,
      });

      expect(result.recorded).toBe(true);
      expect(insert).toHaveBeenCalledTimes(1);
      expect(mockUpsertInvoicePaymentAllocationForPaymentRow).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentRow: expect.objectContaining({
            id: 'payment-1',
            account_owner_user_id: 'owner-1',
            invoice_id: 'inv-1',
            amount_cents: 5000,
            payment_status: 'failed',
          }),
        }),
      );
    });

    it('charge.failed with mismatched connected account does not record failed attempt', async () => {
      const { recordTenantInvoicePaymentFailureFromStripeCharge } = await import(
        '@/lib/business/tenant-invoice-stripe-webhooks'
      );
      const { admin, insert } = makeAdminInsertSuccess();

      const result = await recordTenantInvoicePaymentFailureFromStripeCharge({
        charge: baseCharge({ failure_message: 'Card declined' } as Partial<Stripe.Charge>),
        eventId: 'evt_fail_mismatch',
        connectedAccountId: 'acct_connected_2',
        admin,
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toContain('mismatch');
      expect(insert).not.toHaveBeenCalled();
    });

    it('duplicate event id still does not double record', async () => {
      const { recordTenantInvoicePaymentFromStripeCharge } = await import(
        '@/lib/business/tenant-invoice-stripe-webhooks'
      );
      const { admin, insert } = makeAdminInsertSuccess();

      mockIsStripeEventAlreadyRecorded.mockResolvedValue(true);

      const result = await recordTenantInvoicePaymentFromStripeCharge({
        charge: baseCharge(),
        eventId: 'evt_duplicate',
        connectedAccountId: 'acct_connected_1',
        admin,
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toContain('idempotency');
      expect(insert).not.toHaveBeenCalled();
      expect(mockUpsertInvoicePaymentAllocationForPaymentRow).toHaveBeenCalledWith(
        expect.objectContaining({ paymentId: 'payment-existing' }),
      );
    });

    it('charge.succeeded with existing Stripe payment identity does not double record', async () => {
      const { recordTenantInvoicePaymentFromStripeCharge } = await import(
        '@/lib/business/tenant-invoice-stripe-webhooks'
      );
      const { admin, insert } = makeAdminInsertSuccess();

      mockIsStripePaymentAlreadyRecorded.mockResolvedValueOnce(true);

      const result = await recordTenantInvoicePaymentFromStripeCharge({
        charge: baseCharge(),
        eventId: 'evt_duplicate_payment_identity',
        connectedAccountId: 'acct_connected_1',
        admin,
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toContain('Payment already recorded');
      expect(insert).not.toHaveBeenCalled();
      expect(mockUpsertInvoicePaymentAllocationForPaymentRow).toHaveBeenCalledWith(
        expect.objectContaining({ paymentId: 'payment-existing' }),
      );
    });

    it('checkout.session.completed (payment mode) with matching connected account records payment', async () => {
      const { recordTenantInvoicePaymentFromCheckoutSession } = await import(
        '@/lib/business/tenant-invoice-stripe-webhooks'
      );
      const { admin, insert } = makeAdminInsertSuccess();

      const stripe = {
        paymentIntents: {
          retrieve: vi.fn(async () => ({
            id: 'pi_test_1',
            created: 1747756800,
            latest_charge: 'ch_test_1',
          })),
        },
      } as any;

      const result = await recordTenantInvoicePaymentFromCheckoutSession({
        session: baseCheckoutSession(),
        eventId: 'evt_checkout_match_1',
        connectedAccountId: 'acct_connected_1',
        admin,
        stripe,
      });

      expect(result.recorded).toBe(true);
      expect(insert).toHaveBeenCalledTimes(1);
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          stripe_checkout_session_id: 'cs_test_1',
          stripe_payment_intent_id: 'pi_test_1',
          processor_charge_id: 'ch_test_1',
          stripe_event_id: 'evt_checkout_match_1',
        }),
      );
      expect(mockUpsertInvoicePaymentAllocationForPaymentRow).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentRow: expect.objectContaining({
            id: 'payment-1',
            account_owner_user_id: 'owner-1',
            invoice_id: 'inv-1',
            amount_cents: 5000,
            payment_status: 'recorded',
          }),
        }),
      );
    });

    it('checkout.session.completed duplicate event id is idempotent', async () => {
      const { recordTenantInvoicePaymentFromCheckoutSession } = await import(
        '@/lib/business/tenant-invoice-stripe-webhooks'
      );
      const { admin, insert } = makeAdminInsertSuccess();

      mockIsStripeEventAlreadyRecorded.mockResolvedValueOnce(true);

      const result = await recordTenantInvoicePaymentFromCheckoutSession({
        session: baseCheckoutSession(),
        eventId: 'evt_checkout_duplicate',
        connectedAccountId: 'acct_connected_1',
        admin,
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toContain('idempotency');
      expect(insert).not.toHaveBeenCalled();
      expect(mockUpsertInvoicePaymentAllocationForPaymentRow).toHaveBeenCalledWith(
        expect.objectContaining({ paymentId: 'payment-existing' }),
      );
    });

    it('checkout.session.completed with existing Stripe payment identity does not double record', async () => {
      const { recordTenantInvoicePaymentFromCheckoutSession } = await import(
        '@/lib/business/tenant-invoice-stripe-webhooks'
      );
      const { admin, insert } = makeAdminInsertSuccess();

      mockIsStripePaymentAlreadyRecorded.mockResolvedValueOnce(true);

      const result = await recordTenantInvoicePaymentFromCheckoutSession({
        session: baseCheckoutSession(),
        eventId: 'evt_checkout_duplicate_payment_identity',
        connectedAccountId: 'acct_connected_1',
        admin,
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toContain('Payment already recorded');
      expect(insert).not.toHaveBeenCalled();
      expect(mockUpsertInvoicePaymentAllocationForPaymentRow).toHaveBeenCalledWith(
        expect.objectContaining({ paymentId: 'payment-existing' }),
      );
    });

    it('checkout.session.completed missing invoice metadata is ignored without throw', async () => {
      const { recordTenantInvoicePaymentFromCheckoutSession } = await import(
        '@/lib/business/tenant-invoice-stripe-webhooks'
      );
      const { admin, insert } = makeAdminInsertSuccess();

      const result = await recordTenantInvoicePaymentFromCheckoutSession({
        session: baseCheckoutSession({ metadata: {} }),
        eventId: 'evt_checkout_missing_meta',
        connectedAccountId: 'acct_connected_1',
        admin,
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toContain('Missing metadata');
      expect(insert).not.toHaveBeenCalled();
    });

    it('checkout.session.completed with connected account mismatch is ignored', async () => {
      const { recordTenantInvoicePaymentFromCheckoutSession } = await import(
        '@/lib/business/tenant-invoice-stripe-webhooks'
      );
      const { admin, insert } = makeAdminInsertSuccess();

      const result = await recordTenantInvoicePaymentFromCheckoutSession({
        session: baseCheckoutSession(),
        eventId: 'evt_checkout_mismatch',
        connectedAccountId: 'acct_connected_2',
        admin,
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toContain('mismatch');
      expect(insert).not.toHaveBeenCalled();
    });

    it('allocation helper failure does not fail charge.succeeded webhook flow after payment row success', async () => {
      const { recordTenantInvoicePaymentFromStripeCharge } = await import(
        '@/lib/business/tenant-invoice-stripe-webhooks'
      );
      const { admin, insert } = makeAdminInsertSuccess();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      mockUpsertInvoicePaymentAllocationForPaymentRow.mockResolvedValueOnce({
        ok: false,
        status: 'failed',
        allocationId: null,
        allocationStatus: null,
        reason: 'alloc failed',
      });

      const result = await recordTenantInvoicePaymentFromStripeCharge({
        charge: baseCharge(),
        eventId: 'evt_alloc_fail_success',
        connectedAccountId: 'acct_connected_1',
        admin,
      });

      expect(result.recorded).toBe(true);
      expect(insert).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        'Stripe webhook allocation dual-write failed after payment-row success',
        expect.objectContaining({
          webhookKind: 'charge_succeeded',
          eventId: 'evt_alloc_fail_success',
          paymentId: 'payment-1',
          allocationResultStatus: 'failed',
        }),
      );

      warnSpy.mockRestore();
    });

    it('allocation helper failure does not fail charge.failed webhook flow after payment row success', async () => {
      const { recordTenantInvoicePaymentFailureFromStripeCharge } = await import(
        '@/lib/business/tenant-invoice-stripe-webhooks'
      );
      const { admin, insert } = makeAdminInsertSuccess();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      mockUpsertInvoicePaymentAllocationForPaymentRow.mockResolvedValueOnce({
        ok: false,
        status: 'failed',
        allocationId: null,
        allocationStatus: null,
        reason: 'alloc failed',
      });

      const result = await recordTenantInvoicePaymentFailureFromStripeCharge({
        charge: baseCharge({ failure_message: 'Card declined' } as Partial<Stripe.Charge>),
        eventId: 'evt_alloc_fail_failed',
        connectedAccountId: 'acct_connected_1',
        admin,
      });

      expect(result.recorded).toBe(true);
      expect(insert).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        'Stripe webhook allocation dual-write failed after payment-row success',
        expect.objectContaining({
          webhookKind: 'charge_failed',
          eventId: 'evt_alloc_fail_failed',
          paymentId: 'payment-1',
          allocationResultStatus: 'failed',
        }),
      );

      warnSpy.mockRestore();
    });
  });

  describe('existing validation behavior remains', () => {
    it('requires account_owner_user_id in charge metadata', async () => {
      const { recordTenantInvoicePaymentFromStripeCharge } = await import('@/lib/business/tenant-invoice-stripe-webhooks');
      const { admin } = makeAdminInsertSuccess();

      const charge: Partial<Stripe.Charge> = {
        id: 'ch_no_owner',
        amount: 5000,
        created: 1747756800,
        metadata: {
          invoice_id: 'inv-1',
          job_id: 'job-1',
        },
      };

      const result = await recordTenantInvoicePaymentFromStripeCharge({
        charge: charge as Stripe.Charge,
        eventId: 'evt_no_owner',
        connectedAccountId: 'acct_connected_1',
        admin,
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toContain('metadata');
    });

    it('rejects invoice ownership mismatch', async () => {
      const { recordTenantInvoicePaymentFromStripeCharge } = await import(
        '@/lib/business/tenant-invoice-stripe-webhooks'
      );
      const { admin } = makeAdminInsertSuccess();

      mockResolveInternalInvoiceByJobId.mockResolvedValue({
        id: 'inv-1',
        invoice_number: 'INV-001',
        account_owner_user_id: 'owner-2',
        status: 'issued',
      });

      const result = await recordTenantInvoicePaymentFromStripeCharge({
        charge: baseCharge(),
        eventId: 'evt_wrong_owner',
        connectedAccountId: 'acct_connected_1',
        admin,
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toContain('does not belong');
    });

    it('rejects draft/void invoices through eligibility validation', async () => {
      const { recordTenantInvoicePaymentFromStripeCharge } = await import(
        '@/lib/business/tenant-invoice-stripe-webhooks'
      );
      const { admin } = makeAdminInsertSuccess();

      mockValidateInvoiceEligibleForOnlinePayment.mockReturnValue({
        eligible: false,
        reason: 'Invoice must be issued',
      });

      const result = await recordTenantInvoicePaymentFromStripeCharge({
        charge: baseCharge(),
        eventId: 'evt_draft',
        connectedAccountId: 'acct_connected_1',
        admin,
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toContain('issued');
    });

    it('rejects over-balance charge amount', async () => {
      const { recordTenantInvoicePaymentFromStripeCharge } = await import(
        '@/lib/business/tenant-invoice-stripe-webhooks'
      );
      const { admin } = makeAdminInsertSuccess();

      mockResolveInvoiceCollectedPaymentSummary.mockResolvedValue({
        invoiceId: 'inv-1',
        invoiceTotalCents: 5000,
        amountPaidCents: 0,
        balanceDueCents: 1000,
        paymentStatus: 'unpaid',
      });

      const result = await recordTenantInvoicePaymentFromStripeCharge({
        charge: baseCharge({ amount: 5001 }),
        eventId: 'evt_over_balance',
        connectedAccountId: 'acct_connected_1',
        admin,
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toContain('exceeds balance due');
    });

    it('requires metadata for failed payment handler', async () => {
      const { recordTenantInvoicePaymentFailureFromStripeCharge } = await import(
        '@/lib/business/tenant-invoice-stripe-webhooks'
      );
      const { admin } = makeAdminInsertSuccess();

      const charge: Partial<Stripe.Charge> = {
        id: 'ch_fail_no_meta',
        amount: 5000,
        created: 1747756800,
        failure_message: 'Card declined',
        metadata: {},
      };

      const result = await recordTenantInvoicePaymentFailureFromStripeCharge({
        charge: charge as Stripe.Charge,
        eventId: 'evt_fail_no_meta',
        connectedAccountId: 'acct_connected_1',
        admin,
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toContain('metadata');
    });
  });

  describe('webhook handler contract', () => {
    it('recordTenantInvoicePaymentFromStripeCharge returns proper contract', async () => {
      const { recordTenantInvoicePaymentFromStripeCharge } = await import('@/lib/business/tenant-invoice-stripe-webhooks');

      const charge: Partial<Stripe.Charge> = {
        id: 'ch_contract',
        amount: 5000,
        created: 1747756800,
        metadata: {
          account_owner_user_id: 'owner-1',
          invoice_id: 'inv-1',
          job_id: 'job-1',
        },
      };

      const result = await recordTenantInvoicePaymentFromStripeCharge({
        charge: charge as Stripe.Charge,
        eventId: 'evt_123',
        connectedAccountId: 'acct_connected_1',
        admin: makeAdminInsertSuccess().admin,
      });

      expect(result).toHaveProperty('recorded');
      expect(typeof result.recorded).toBe('boolean');
    });

    it('recordTenantInvoicePaymentFailureFromStripeCharge returns proper contract', async () => {
      const { recordTenantInvoicePaymentFailureFromStripeCharge } = await import('@/lib/business/tenant-invoice-stripe-webhooks');

      const charge: Partial<Stripe.Charge> = {
        id: 'ch_fail_contract',
        amount: 5000,
        created: 1747756800,
        failure_message: 'Card declined',
        metadata: {
          account_owner_user_id: 'owner-1',
          invoice_id: 'inv-1',
          job_id: 'job-1',
        },
      };

      const result = await recordTenantInvoicePaymentFailureFromStripeCharge({
        charge: charge as Stripe.Charge,
        eventId: 'evt_123',
        connectedAccountId: 'acct_connected_1',
        admin: makeAdminInsertSuccess().admin,
      });

      expect(result).toHaveProperty('recorded');
      expect(typeof result.recorded).toBe('boolean');
    });
  });
});
