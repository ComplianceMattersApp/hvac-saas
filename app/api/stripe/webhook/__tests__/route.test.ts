import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRecordTenantInvoicePaymentFromStripeCharge = vi.fn();
const mockRecordTenantInvoicePaymentFailureFromStripeCharge = vi.fn();
const mockRecordTenantInvoicePaymentFromCheckoutSession = vi.fn();
const mockCloseTenantInvoicePendingPaymentFromExpiredCheckoutSession = vi.fn();
const mockRecordTenantInvoiceRefundFromStripeCharge = vi.fn();
const mockRecordTenantInvoiceDisputeFromStripe = vi.fn();
const mockRecordTenantSavedPaymentMethodSetupFromCheckoutSession = vi.fn();
const mockCreateAdminClient = vi.fn(() => ({ from: vi.fn() }));
const mockDeliverInternalPaymentReceivedEmail = vi.fn(async () => ({ sent: true }));
const mockAutoSyncRecordedPaymentToQbo = vi.fn(async () => undefined);
const mockAutoSyncRecordedPaymentSettlement = vi.fn(async () => ({
  status: 'synced',
  code: 'synced',
  reason: 'Settlement synchronized.',
  settlementId: 'settlement-1',
}));
const mockReleaseInvoiceCollectionReservation = vi.fn(async () => true);

vi.mock('@/lib/business/invoice-collection-reservations', () => ({
  releaseInvoiceCollectionReservation: mockReleaseInvoiceCollectionReservation,
}));

vi.mock('@/lib/business/stripe-settlement-auto-sync', () => ({
  autoSyncRecordedPaymentSettlement: mockAutoSyncRecordedPaymentSettlement,
}));

vi.mock('@/lib/qbo/qbo-payment-auto-sync', () => ({
  autoSyncRecordedPaymentToQbo: mockAutoSyncRecordedPaymentToQbo,
}));

vi.mock('@/lib/payments/payment-received-email', () => ({
  deliverInternalPaymentReceivedEmail: mockDeliverInternalPaymentReceivedEmail,
}));

vi.mock('@/lib/business/tenant-invoice-stripe-webhooks', () => ({
  recordTenantInvoicePaymentFromCheckoutSession: mockRecordTenantInvoicePaymentFromCheckoutSession,
  recordTenantInvoicePaymentFromStripeCharge: mockRecordTenantInvoicePaymentFromStripeCharge,
  recordTenantInvoicePaymentFailureFromStripeCharge:
    mockRecordTenantInvoicePaymentFailureFromStripeCharge,
  closeTenantInvoicePendingPaymentFromExpiredCheckoutSession:
    mockCloseTenantInvoicePendingPaymentFromExpiredCheckoutSession,
  recordTenantInvoiceRefundFromStripeCharge: mockRecordTenantInvoiceRefundFromStripeCharge,
  recordTenantInvoiceDisputeFromStripe: mockRecordTenantInvoiceDisputeFromStripe,
}));

vi.mock('@/lib/business/tenant-saved-payment-method-setups', () => ({
  recordTenantSavedPaymentMethodSetupFromCheckoutSession:
    mockRecordTenantSavedPaymentMethodSetupFromCheckoutSession,
}));

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: mockCreateAdminClient,
}));

const mockGetStripeWebhookSecrets = vi.fn(() => ['whsec_test_secret']);
const mockConstructEvent = vi.fn((payload: string, _signature: string, _secret: string) =>
  JSON.parse(payload),
);

vi.mock('@/lib/business/platform-billing-stripe', () => ({
  getPlatformBillingAvailability: vi.fn(() => ({
    checkoutAvailable: true,
    portalAvailable: true,
    webhookAvailable: true,
    missingKeys: [],
  })),
  getStripeServerClient: vi.fn(() => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  })),
  getStripeWebhookSecrets: mockGetStripeWebhookSecrets,
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
            collection_reservation_key: 'invoice-checkout:inv-1:10000:0',
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
    expect(mockAutoSyncRecordedPaymentToQbo).toHaveBeenCalledWith({
      paymentId: 'payment-checkout-1',
    });
    expect(mockAutoSyncRecordedPaymentSettlement).toHaveBeenCalledWith({
      paymentId: 'payment-checkout-1',
    });
    expect(mockDeliverInternalPaymentReceivedEmail).toHaveBeenCalledWith({
      paymentId: 'payment-checkout-1',
    });
    expect(mockReleaseInvoiceCollectionReservation).toHaveBeenCalledWith(expect.objectContaining({
      accountOwnerUserId: 'owner-1',
      invoiceId: 'inv-1',
      reservationKey: 'invoice-checkout:inv-1:10000:0',
    }));
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
    expect(mockAutoSyncRecordedPaymentToQbo).not.toHaveBeenCalled();
    expect(mockAutoSyncRecordedPaymentSettlement).not.toHaveBeenCalled();
  });

  it('routes setup-mode checkout.session.completed to saved-method setup recorder', async () => {
    mockRecordTenantSavedPaymentMethodSetupFromCheckoutSession.mockResolvedValue({
      recorded: true,
      setupId: 'setup-1',
      paymentMethodId: 'pm_1',
    });

    const response = await postWebhook({
      id: 'evt_checkout_setup_1',
      account: 'acct_connected_9',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_setup_1',
          mode: 'setup',
          metadata: {
            setup_id: 'setup-1',
            account_owner_user_id: 'owner-1',
            customer_id: 'cust-1',
          },
        },
      },
    });

    expect(response.status).toBe(200);
    expect(mockRecordTenantSavedPaymentMethodSetupFromCheckoutSession).toHaveBeenCalledTimes(1);
    expect(mockRecordTenantSavedPaymentMethodSetupFromCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt_checkout_setup_1',
        connectedAccountId: 'acct_connected_9',
      }),
    );
    expect(mockRecordTenantInvoicePaymentFromCheckoutSession).not.toHaveBeenCalled();
  });

  it('accepts an event that verifies only against the connect destination secret', async () => {
    mockGetStripeWebhookSecrets.mockReturnValueOnce(['whsec_account', 'whsec_connect']);
    mockConstructEvent.mockImplementation((payload: string, _signature: string, secret: string) => {
      if (secret !== 'whsec_connect') throw new Error('No signatures found matching the expected signature for payload.');
      return JSON.parse(payload);
    });
    mockRecordTenantInvoicePaymentFromStripeCharge.mockResolvedValue({
      recorded: true,
      paymentId: 'payment-connect-secret',
    });

    const response = await postWebhook({
      id: 'evt_connect_secret',
      account: 'acct_connected_1',
      type: 'charge.succeeded',
      data: {
        object: {
          id: 'ch_connect_secret',
          amount: 10000,
          created: 1747756800,
          metadata: {
            account_owner_user_id: 'owner-1',
            invoice_id: 'inv-1',
            job_id: 'job-1',
            collection_reservation_key: 'invoice-checkout:inv-1:10000:0',
          },
        },
      },
    });

    expect(response.status).toBe(200);
    expect(mockConstructEvent).toHaveBeenCalledTimes(2);
    expect(mockRecordTenantInvoicePaymentFromStripeCharge).toHaveBeenCalledTimes(1);
    mockConstructEvent.mockImplementation((payload: string) => JSON.parse(payload));
  });

  it('rejects with 400 when no configured secret verifies the signature', async () => {
    mockGetStripeWebhookSecrets.mockReturnValueOnce(['whsec_account', 'whsec_connect']);
    mockConstructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload.');
    });

    const response = await postWebhook({ id: 'evt_bad_sig', type: 'charge.succeeded', data: { object: {} } });

    expect(response.status).toBe(400);
    expect(mockConstructEvent).toHaveBeenCalledTimes(2);
    expect(mockRecordTenantInvoicePaymentFromStripeCharge).not.toHaveBeenCalled();
    mockConstructEvent.mockImplementation((payload: string) => JSON.parse(payload));
  });

  it('routes payment-mode checkout.session.expired to pending-payment close', async () => {
    mockCloseTenantInvoicePendingPaymentFromExpiredCheckoutSession.mockResolvedValue({
      closed: true,
      paymentId: 'payment-expired-1',
    });

    const response = await postWebhook({
      id: 'evt_checkout_expired_1',
      account: 'acct_connected_9',
      type: 'checkout.session.expired',
      data: {
        object: {
          id: 'cs_test_expired_1',
          mode: 'payment',
          payment_status: 'unpaid',
          metadata: {
            account_owner_user_id: 'owner-1',
            invoice_id: 'inv-1',
            job_id: 'job-1',
            collection_reservation_key: 'invoice-checkout:inv-1:10000:0',
          },
        },
      },
    });

    expect(response.status).toBe(200);
    expect(mockCloseTenantInvoicePendingPaymentFromExpiredCheckoutSession).toHaveBeenCalledTimes(1);
    expect(mockCloseTenantInvoicePendingPaymentFromExpiredCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ session: expect.objectContaining({ id: 'cs_test_expired_1' }) }),
    );
    expect(mockRecordTenantInvoicePaymentFromCheckoutSession).not.toHaveBeenCalled();
    expect(mockReleaseInvoiceCollectionReservation).toHaveBeenCalledWith(expect.objectContaining({
      reservationKey: 'invoice-checkout:inv-1:10000:0',
    }));
  });

  it('ignores setup-mode checkout.session.expired', async () => {
    const response = await postWebhook({
      id: 'evt_checkout_expired_setup',
      account: 'acct_connected_9',
      type: 'checkout.session.expired',
      data: {
        object: {
          id: 'cs_setup_expired',
          mode: 'setup',
          metadata: {},
        },
      },
    });

    expect(response.status).toBe(200);
    expect(mockCloseTenantInvoicePendingPaymentFromExpiredCheckoutSession).not.toHaveBeenCalled();
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
    expect(mockAutoSyncRecordedPaymentToQbo).toHaveBeenCalledWith({ paymentId: 'payment-1' });
    expect(mockAutoSyncRecordedPaymentSettlement).toHaveBeenCalledWith({ paymentId: 'payment-1' });
  });

  it('returns 500 so Stripe retries when tenant account readiness is temporarily unavailable', async () => {
    mockRecordTenantInvoicePaymentFromStripeCharge.mockResolvedValue({
      recorded: false,
      reason: 'Tenant connected account is not ready',
    });

    const response = await postWebhook({
      id: 'evt_retry_connect_readiness',
      account: 'acct_connected_1',
      type: 'charge.succeeded',
      data: {
        object: {
          id: 'ch_retry_connect_readiness',
          amount: 10000,
          created: 1747756800,
          metadata: {
            account_owner_user_id: 'owner-1',
            invoice_id: 'inv-1',
          },
        },
      },
    });

    expect(response.status).toBe(500);
    expect(mockAutoSyncRecordedPaymentToQbo).not.toHaveBeenCalled();
  });

  it('resumes idempotent downstream sync when payment identity is already recorded', async () => {
    mockRecordTenantInvoicePaymentFromStripeCharge.mockResolvedValue({
      recorded: false,
      reason: 'Payment already recorded for Stripe payment identity',
      paymentId: 'payment-existing',
    });

    const response = await postWebhook({
      id: 'evt_charge_existing_identity',
      account: 'acct_connected_1',
      type: 'charge.succeeded',
      data: {
        object: {
          id: 'ch_test_existing_identity',
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
    expect(mockAutoSyncRecordedPaymentToQbo).toHaveBeenCalledWith({ paymentId: 'payment-existing' });
    expect(mockAutoSyncRecordedPaymentSettlement).toHaveBeenCalledWith({ paymentId: 'payment-existing' });
  });

  it('keeps Stripe webhook acknowledgement independent from QBO sync failure', async () => {
    mockRecordTenantInvoicePaymentFromStripeCharge.mockResolvedValue({
      recorded: true,
      paymentId: 'payment-qbo-failure',
    });
    mockAutoSyncRecordedPaymentToQbo.mockRejectedValueOnce(new Error('QBO unavailable'));

    const response = await postWebhook({
      id: 'evt_qbo_failure',
      account: 'acct_connected_1',
      type: 'charge.succeeded',
      data: {
        object: {
          id: 'ch_qbo_failure',
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
    expect(mockDeliverInternalPaymentReceivedEmail).toHaveBeenCalledWith({
      paymentId: 'payment-qbo-failure',
    });
  });

  it('keeps Stripe webhook acknowledgement independent from settlement sync failure', async () => {
    mockRecordTenantInvoicePaymentFromStripeCharge.mockResolvedValue({
      recorded: true,
      paymentId: 'payment-settlement-failure',
    });
    mockAutoSyncRecordedPaymentSettlement.mockRejectedValueOnce(new Error('Stripe settlement unavailable'));

    const response = await postWebhook({
      id: 'evt_settlement_failure',
      account: 'acct_connected_1',
      type: 'charge.succeeded',
      data: {
        object: {
          id: 'ch_settlement_failure',
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
    expect(mockAutoSyncRecordedPaymentToQbo).toHaveBeenCalledWith({
      paymentId: 'payment-settlement-failure',
    });
    expect(mockDeliverInternalPaymentReceivedEmail).toHaveBeenCalledWith({
      paymentId: 'payment-settlement-failure',
    });
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

  it('returns 500 for a tenant refund that arrived before its payment row', async () => {
    mockRecordTenantInvoiceRefundFromStripeCharge.mockResolvedValue({
      applied: false,
      reason: 'No matching payment for the refunded charge',
    });

    const response = await postWebhook({
      id: 'evt_refund_before_payment',
      account: 'acct_connected_2',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_refund_before_payment',
          amount: 5000,
          amount_refunded: 5000,
          metadata: {
            account_owner_user_id: 'owner-1',
            invoice_id: 'inv-1',
          },
        },
      },
    });

    expect(response.status).toBe(500);
  });
});
