import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRecordTenantInvoicePaymentFromStripeCharge = vi.fn();
const mockRecordTenantInvoicePaymentFailureFromStripeCharge = vi.fn();
const mockRecordTenantInvoicePaymentFromCheckoutSession = vi.fn();

vi.mock('@/lib/business/tenant-invoice-stripe-webhooks', () => ({
  recordTenantInvoicePaymentFromCheckoutSession: mockRecordTenantInvoicePaymentFromCheckoutSession,
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
      constructEvent: vi.fn((payload: string) => JSON.parse(payload)),
    },
  })),
  requireStripeWebhookSecret: vi.fn(() => 'whsec_test_secret'),
  syncPlatformEntitlementFromCheckoutSession: vi.fn(async () => null),
  syncPlatformEntitlementFromStripeSubscriptionEvent: vi.fn(async () => null),
}));

async function postWebhook(event: Record<string, unknown>) {
  const { POST } = await import('@/app/api/stripe/webhook/route');
  const request = new Request('http://localhost:3000/api/stripe/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': 'sig_test',
    },
    body: JSON.stringify(event),
  });

  return POST(request);
}

describe('Stripe webhook route — charge events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes payment-mode checkout.session.completed to tenant invoice persistence', async () => {
    mockRecordTenantInvoicePaymentFromCheckoutSession.mockResolvedValue({
      recorded: true,
      paymentId: 'payment-checkout-1',
    });

    const response = await postWebhook({
      id: 'evt_checkout_payment_1',
      account: 'acct_connected_9',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          mode: 'payment',
          payment_status: 'paid',
          payment_intent: 'pi_test_1',
          metadata: {
            account_owner_user_id: 'owner-1',
            invoice_id: 'inv-1',
            job_id: 'job-1',
          },
        },
      },
    });

    expect(response.status).toBe(200);
    expect(mockRecordTenantInvoicePaymentFromCheckoutSession).toHaveBeenCalledTimes(1);
    expect(mockRecordTenantInvoicePaymentFromCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt_checkout_payment_1',
        connectedAccountId: 'acct_connected_9',
      }),
    );
  });

  it('acknowledges payment-mode checkout.session.completed with missing metadata without throwing', async () => {
    mockRecordTenantInvoicePaymentFromCheckoutSession.mockResolvedValue({
      recorded: false,
      reason: 'Missing metadata: account_owner_user_id or invoice_id',
    });

    const response = await postWebhook({
      id: 'evt_checkout_payment_missing_meta',
      account: 'acct_connected_9',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_missing_meta',
          mode: 'payment',
          payment_status: 'paid',
          payment_intent: 'pi_test_missing_meta',
          metadata: {},
        },
      },
    });

    expect(response.status).toBe(200);
    expect(mockRecordTenantInvoicePaymentFromCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it('routes charge.succeeded with invoice_id and forwards connected account context', async () => {
    mockRecordTenantInvoicePaymentFromStripeCharge.mockResolvedValue({
      recorded: true,
      paymentId: 'payment-1',
    });

    const response = await postWebhook({
      id: 'evt_test_123',
      account: 'acct_connected_1',
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
    });

    expect(response.status).toBe(200);
    expect(mockRecordTenantInvoicePaymentFromStripeCharge).toHaveBeenCalledTimes(1);
    expect(mockRecordTenantInvoicePaymentFromStripeCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt_test_123',
        connectedAccountId: 'acct_connected_1',
      }),
    );
  });

  it('ignores charge.succeeded without invoice_id (platform subscription preservation)', async () => {
    const response = await postWebhook({
      id: 'evt_platform_sub',
      account: 'acct_connected_1',
      type: 'charge.succeeded',
      data: {
        object: {
          id: 'ch_platform_123',
          amount: 99900,
          created: 1747756800,
          metadata: {},
        },
      },
    });

    expect(response.status).toBe(200);
    expect(mockRecordTenantInvoicePaymentFromStripeCharge).not.toHaveBeenCalled();
  });

  it('routes charge.failed with invoice_id and forwards connected account context', async () => {
    mockRecordTenantInvoicePaymentFailureFromStripeCharge.mockResolvedValue({
      recorded: true,
      paymentId: 'payment-2',
    });

    const response = await postWebhook({
      id: 'evt_fail_123',
      account: 'acct_connected_2',
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
    });

    expect(response.status).toBe(200);
    expect(mockRecordTenantInvoicePaymentFailureFromStripeCharge).toHaveBeenCalledTimes(1);
    expect(mockRecordTenantInvoicePaymentFailureFromStripeCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt_fail_123',
        connectedAccountId: 'acct_connected_2',
      }),
    );
  });
});
