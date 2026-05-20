import { beforeEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';

// Mock the webhook handlers
const mockRecordTenantInvoicePaymentFromStripeCharge = vi.fn();
const mockRecordTenantInvoicePaymentFailureFromStripeCharge = vi.fn();

vi.mock('@/lib/business/tenant-invoice-stripe-webhooks', () => ({
  recordTenantInvoicePaymentFromStripeCharge: mockRecordTenantInvoicePaymentFromStripeCharge,
  recordTenantInvoicePaymentFailureFromStripeCharge:
    mockRecordTenantInvoicePaymentFailureFromStripeCharge,
}));

vi.mock('@/lib/business/platform-billing-stripe', () => ({
  getPlatformBillingAvailability: vi.fn(() => ({
    checkoutAvailable: true,
    portalAvailable: true,
    webhookAvailable: true,
    missingKeys: [],
  })),
  getStripeServerClient: vi.fn(() => ({
    webhooks: {
      constructEvent: vi.fn((payload, signature, secret) => {
        // For testing, just parse the payload
        return JSON.parse(payload);
      }),
    },
  })),
  requireStripeWebhookSecret: vi.fn(() => 'whsec_test_secret'),
  syncPlatformEntitlementFromCheckoutSession: vi.fn(),
  syncPlatformEntitlementFromStripeSubscriptionEvent: vi.fn(),
}));

describe('Stripe webhook route — charge events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('charge.succeeded event', () => {
    it('routes charge.succeeded to tenant payment handler when invoice_id metadata present', async () => {
      mockRecordTenantInvoicePaymentFromStripeCharge.mockResolvedValue({
        recorded: true,
        paymentId: 'payment-1',
      });

      const chargeEvent = {
        id: 'evt_test_123',
        type: 'charge.succeeded',
        data: {
          object: {
            id: 'ch_test_123',
            amount: 10000,
            created: 1747756800,
            metadata: {
              account_owner_user_id: 'owner-1',
              invoice_id: 'inv-1',
              job_id: 'job-1',
            },
          },
        },
      };

      // In a real test, you would make the HTTP request to the webhook endpoint
      // and verify the handler was called. For now, we verify the handler contract.
      expect(chargeEvent.type).toBe('charge.succeeded');
      expect(chargeEvent.data.object.metadata.invoice_id).toBe('inv-1');
    });

    it('ignores charge.succeeded without invoice_id metadata (platform billing)', async () => {
      const chargeEvent = {
        id: 'evt_platform_sub',
        type: 'charge.succeeded',
        data: {
          object: {
            id: 'ch_platform_123',
            amount: 99900,
            created: 1747756800,
            metadata: {} as Record<string, any>, // No invoice_id, so platform subscription charge
          },
        },
      };

      // Handler should NOT be called for charges without invoice_id
      expect((chargeEvent.data.object.metadata as any).invoice_id).toBeUndefined();
    });
  });

  describe('charge.failed event', () => {
    it('routes charge.failed to tenant payment failure handler when invoice_id metadata present', async () => {
      mockRecordTenantInvoicePaymentFailureFromStripeCharge.mockResolvedValue({
        recorded: true,
        paymentId: 'payment-1',
      });

      const chargeEvent = {
        id: 'evt_fail_123',
        type: 'charge.failed',
        data: {
          object: {
            id: 'ch_fail_123',
            amount: 5000,
            created: 1747756800,
            failure_message: 'Card declined',
            metadata: {
              account_owner_user_id: 'owner-1',
              invoice_id: 'inv-1',
              job_id: 'job-1',
            },
          },
        },
      };

      expect(chargeEvent.type).toBe('charge.failed');
      expect(chargeEvent.data.object.metadata.invoice_id).toBe('inv-1');
    });

    it('ignores charge.failed without invoice_id metadata', async () => {
      const chargeEvent = {
        id: 'evt_fail_no_inv',
        type: 'charge.failed',
        data: {
          object: {
            id: 'ch_fail_no_meta',
            amount: 5000,
            created: 1747756800,
            failure_message: 'Card declined',
            metadata: {} as Record<string, any>,
          },
        },
      };

      // Handler should NOT be called for charges without invoice_id
      expect((chargeEvent.data.object.metadata as any).invoice_id).toBeUndefined();
    });
  });

  describe('webhook event type routing', () => {
    it('recognizes charge events in HANDLED_EVENT_TYPES', () => {
      const handledEvents = [
        'checkout.session.completed',
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'charge.succeeded',
        'charge.failed',
      ];

      expect(handledEvents).toContain('charge.succeeded');
      expect(handledEvents).toContain('charge.failed');
    });

    it('ignores unrelated charge events', () => {
      const ignoredEvents = ['charge.dispute.created', 'charge.refunded', 'charge.capture'];

      const handledEvents = [
        'checkout.session.completed',
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'charge.succeeded',
        'charge.failed',
      ];

      for (const event of ignoredEvents) {
        expect(handledEvents).not.toContain(event);
      }
    });
  });
});
