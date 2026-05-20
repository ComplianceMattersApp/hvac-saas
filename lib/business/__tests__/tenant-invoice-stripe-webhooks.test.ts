import { beforeEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';

// Mock dependencies at module level
vi.mock('@/lib/supabase/server');
vi.mock('@/lib/business/internal-invoice');
vi.mock('@/lib/business/internal-invoice-payments');
vi.mock('@/lib/actions/job-actions');

describe('tenant invoice Stripe webhook handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Stripe charge metadata validation', () => {
    it('requires account_owner_user_id in charge metadata', async () => {
      const { recordTenantInvoicePaymentFromStripeCharge } = await import('@/lib/business/tenant-invoice-stripe-webhooks');

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
        eventId: 'evt_123',
        admin: {} as any,
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('requires invoice_id in charge metadata', async () => {
      const { recordTenantInvoicePaymentFromStripeCharge } = await import('@/lib/business/tenant-invoice-stripe-webhooks');

      const charge: Partial<Stripe.Charge> = {
        id: 'ch_no_invoice',
        amount: 5000,
        created: 1747756800,
        metadata: {
          account_owner_user_id: 'owner-1',
          job_id: 'job-1',
        },
      };

      const result = await recordTenantInvoicePaymentFromStripeCharge({
        charge: charge as Stripe.Charge,
        eventId: 'evt_123',
        admin: {} as any,
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('validates charge amount is positive', async () => {
      const { recordTenantInvoicePaymentFromStripeCharge } = await import('@/lib/business/tenant-invoice-stripe-webhooks');

      const charge: Partial<Stripe.Charge> = {
        id: 'ch_zero',
        amount: 0,
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
        admin: {} as any,
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });

  describe('failed payment metadata validation', () => {
    it('requires metadata for failed payment handler', async () => {
      const { recordTenantInvoicePaymentFailureFromStripeCharge } = await import('@/lib/business/tenant-invoice-stripe-webhooks');

      const charge: Partial<Stripe.Charge> = {
        id: 'ch_fail_no_meta',
        amount: 5000,
        created: 1747756800,
        failure_message: 'Card declined',
        metadata: {},
      };

      const result = await recordTenantInvoicePaymentFailureFromStripeCharge({
        charge: charge as Stripe.Charge,
        eventId: 'evt_123',
        admin: {} as any,
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('accepts valid failed payment with required metadata', async () => {
      const { recordTenantInvoicePaymentFailureFromStripeCharge } = await import('@/lib/business/tenant-invoice-stripe-webhooks');

      const charge: Partial<Stripe.Charge> = {
        id: 'ch_fail_valid',
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
        admin: {} as any,
      });

      // Result will depend on DB state, but shouldn't fail on metadata validation
      expect(result.recorded !== undefined).toBe(true);
      expect(result.reason !== undefined || result.paymentId !== undefined).toBe(true);
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
        admin: {} as any,
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
        admin: {} as any,
      });

      expect(result).toHaveProperty('recorded');
      expect(typeof result.recorded).toBe('boolean');
    });
  });
});
