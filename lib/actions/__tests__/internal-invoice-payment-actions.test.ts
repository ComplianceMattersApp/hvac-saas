import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveBillingModeByAccountOwnerIdMock = vi.fn();
const resolveInternalInvoiceByJobIdMock = vi.fn();
const resolveInvoiceCollectedPaymentSummaryMock = vi.fn();
const createTenantInvoiceCheckoutSessionMock = vi.fn();
const insertJobEventMock = vi.fn();
const revalidatePathMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock('@/lib/auth/internal-user', () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

vi.mock('@/lib/auth/internal-job-scope', () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) =>
    loadScopedInternalJobForMutationMock(...args),
}));

vi.mock('@/lib/business/internal-business-profile', () => ({
  resolveBillingModeByAccountOwnerId: (...args: unknown[]) =>
    resolveBillingModeByAccountOwnerIdMock(...args),
}));

vi.mock('@/lib/business/platform-entitlement', () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock('@/lib/business/internal-invoice', () => ({
  resolveInternalInvoiceByJobId: (...args: unknown[]) => resolveInternalInvoiceByJobIdMock(...args),
}));

vi.mock('@/lib/business/internal-invoice-payments', () => ({
  INTERNAL_INVOICE_PAYMENT_METHODS: [
    'cash',
    'check',
    'ach_off_platform',
    'card_off_platform',
    'bank_transfer',
    'other',
  ],
  resolveInvoiceCollectedPaymentSummary: (...args: unknown[]) =>
    resolveInvoiceCollectedPaymentSummaryMock(...args),
  createTenantInvoiceCheckoutSession: (...args: unknown[]) =>
    createTenantInvoiceCheckoutSessionMock(...args),
}));

vi.mock('@/lib/actions/job-actions', () => ({
  insertJobEvent: (...args: unknown[]) => insertJobEventMock(...args),
}));

function makeSupabaseFixture(params?: { insertError?: { message: string } | null }) {
  const writes: Array<{ table: string; op: string }> = [];
  const insertError = params?.insertError ?? null;

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'internal_invoice_payments') {
        return {
          insert: vi.fn(() => {
            writes.push({ table, op: 'insert' });
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: insertError ? null : { id: 'pay-1' },
                  error: insertError,
                })),
              })),
            };
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { supabase, writes };
}

function buildFormData(overrides: Partial<Record<string, string>> = {}) {
  const formData = new FormData();
  formData.set('job_id', 'job-1');
  formData.set('tab', 'info');
  formData.set('payment_amount', '25.00');
  formData.set('payment_method', 'cash');
  formData.set('received_reference', 'CHK-1001');
  formData.set('notes', 'Paid at office');

  for (const [key, value] of Object.entries(overrides)) {
    if (value != null) {
      formData.set(key, value);
    }
  }

  return formData;
}

function makeAdminSupabaseFixture(params?: {
  paymentRow?: any;
  updateError?: { message: string } | null;
  updateResult?: { id: string; amount_cents: number } | null;
}) {
  const paymentRow = params?.paymentRow ?? null;
  const updateError = params?.updateError ?? null;
  const updateResult = params?.updateResult ??
    (paymentRow
      ? {
          id: String(paymentRow.id ?? 'pay-1'),
          amount_cents: Number(paymentRow.amount_cents ?? 0),
        }
      : null);
  const writes: Array<{ table: string; op: string }> = [];

  const selectQuery: any = {
    eq: vi.fn(() => selectQuery),
    maybeSingle: vi.fn(async () => ({
      data: paymentRow,
      error: null,
    })),
  };

  const updateQuery: any = {
    eq: vi.fn(() => updateQuery),
    select: vi.fn(() => ({
      single: vi.fn(async () => ({
        data: updateError ? null : updateResult,
        error: updateError,
      })),
    })),
  };

  const admin = {
    from: vi.fn((table: string) => {
      if (table !== 'internal_invoice_payments') {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        select: vi.fn(() => selectQuery),
        update: vi.fn(() => {
          writes.push({ table, op: 'update' });
          return updateQuery;
        }),
      };
    }),
  };

  return { admin, writes };
}

function buildReverseFormData(overrides: Partial<Record<string, string>> = {}) {
  const formData = new FormData();
  formData.set('job_id', 'job-1');
  formData.set('payment_id', 'pay-1');
  formData.set('tab', 'info');
  formData.set('return_to', '/jobs/job-1/invoice#invoice-workspace');
  formData.set('reversal_reason', 'Duplicate manual entry');

  for (const [key, value] of Object.entries(overrides)) {
    if (value != null) {
      formData.set(key, value);
    }
  }

  return formData;
}

describe('recordInternalInvoicePaymentFromForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      userId: 'user-1',
      internalUser: {
        user_id: 'user-1',
        role: 'admin',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: 'job-1' });
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValue('internal_invoicing');
    resolveInternalInvoiceByJobIdMock.mockResolvedValue({
      id: 'inv-1',
      account_owner_user_id: 'owner-1',
      job_id: 'job-1',
      invoice_number: 'INV-1',
      status: 'issued',
      total_cents: 10000,
    });
    resolveInvoiceCollectedPaymentSummaryMock.mockResolvedValue({
      invoiceId: 'inv-1',
      invoiceTotalCents: 10000,
      amountPaidCents: 2000,
      balanceDueCents: 8000,
      paymentStatus: 'partial',
    });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: 'allowed_active',
    });
    insertJobEventMock.mockResolvedValue(undefined);
    createTenantInvoiceCheckoutSessionMock.mockResolvedValue({
      checkoutSessionId: 'cs_123',
      checkoutSessionUrl: 'https://checkout.stripe.com/c/pay/cs_123',
      connectedAccountId: 'acct_123',
      balanceDueCents: 8000,
    });
  });

  it('allows issued internal invoice payment record and writes job event', async () => {
    const { supabase, writes } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);

    const { recordInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(recordInternalInvoicePaymentFromForm(buildFormData())).rejects.toThrow(
      'banner=internal_invoice_payment_recorded',
    );

    expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: 'owner-1' }),
    );
    expect(writes.some((w) => w.table === 'internal_invoice_payments' && w.op === 'insert')).toBe(true);
    expect(insertJobEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'payment_recorded',
        jobId: 'job-1',
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith('/jobs/job-1');
    expect(revalidatePathMock).toHaveBeenCalledWith('/reports/invoices');
  });

  it('denies overpayment based on derived balance due', async () => {
    const { supabase, writes } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    resolveInvoiceCollectedPaymentSummaryMock.mockResolvedValueOnce({
      invoiceId: 'inv-1',
      invoiceTotalCents: 10000,
      amountPaidCents: 9900,
      balanceDueCents: 100,
      paymentStatus: 'partial',
    });

    const { recordInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      recordInternalInvoicePaymentFromForm(buildFormData({ payment_amount: '5.00' })),
    ).rejects.toThrow('banner=internal_invoice_payment_overpay_denied');

    expect(writes).toHaveLength(0);
    expect(insertJobEventMock).not.toHaveBeenCalled();
  });

  it('denies draft invoice payment create', async () => {
    const { supabase, writes } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    resolveInternalInvoiceByJobIdMock.mockResolvedValueOnce({
      id: 'inv-1',
      account_owner_user_id: 'owner-1',
      job_id: 'job-1',
      invoice_number: 'INV-1',
      status: 'draft',
      total_cents: 10000,
    });

    const { recordInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(recordInternalInvoicePaymentFromForm(buildFormData())).rejects.toThrow(
      'banner=internal_invoice_payment_requires_issued',
    );

    expect(writes).toHaveLength(0);
  });

  it('denies void invoice payment create', async () => {
    const { supabase, writes } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    resolveInternalInvoiceByJobIdMock.mockResolvedValueOnce({
      id: 'inv-1',
      account_owner_user_id: 'owner-1',
      job_id: 'job-1',
      invoice_number: 'INV-1',
      status: 'void',
      total_cents: 10000,
    });

    const { recordInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(recordInternalInvoicePaymentFromForm(buildFormData())).rejects.toThrow(
      'banner=internal_invoice_payment_requires_issued',
    );

    expect(writes).toHaveLength(0);
  });

  it('denies external-billing mode payment create', async () => {
    const { supabase, writes } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValueOnce('external_billing');

    const { recordInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(recordInternalInvoicePaymentFromForm(buildFormData())).rejects.toThrow(
      'banner=internal_invoicing_billing_pending',
    );

    expect(writes).toHaveLength(0);
  });

  it('denies cross-account/non-scoped actor before payment writes', async () => {
    const { supabase, writes } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValueOnce(null);

    const { recordInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(recordInternalInvoicePaymentFromForm(buildFormData())).rejects.toThrow(
      'banner=not_authorized',
    );

    expect(writes).toHaveLength(0);
    expect(resolveOperationalMutationEntitlementAccessMock).not.toHaveBeenCalled();
    expect(insertJobEventMock).not.toHaveBeenCalled();
  });

  it('allows structural owner to record payment even when role is office', async () => {
    const { supabase, writes } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockResolvedValueOnce({
      userId: 'owner-1',
      internalUser: {
        user_id: 'owner-1',
        role: 'office',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    const { recordInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(recordInternalInvoicePaymentFromForm(buildFormData())).rejects.toThrow(
      'banner=internal_invoice_payment_recorded',
    );

    expect(writes.some((w) => w.table === 'internal_invoice_payments' && w.op === 'insert')).toBe(true);
  });

  it('allows billing role to record payments', async () => {
    const { supabase, writes } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockResolvedValueOnce({
      userId: 'billing-1',
      internalUser: {
        user_id: 'billing-1',
        role: 'billing',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    const { recordInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(recordInternalInvoicePaymentFromForm(buildFormData())).rejects.toThrow(
      'banner=internal_invoice_payment_recorded',
    );

    expect(writes.some((w) => w.table === 'internal_invoice_payments' && w.op === 'insert')).toBe(true);
  });

  it('denies office/dispatcher from recording payments when not structural owner', async () => {
    const { supabase, writes } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockResolvedValueOnce({
      userId: 'dispatcher-1',
      internalUser: {
        user_id: 'dispatcher-1',
        role: 'office',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    const { recordInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(recordInternalInvoicePaymentFromForm(buildFormData())).rejects.toThrow('banner=not_authorized');

    expect(writes).toHaveLength(0);
    expect(resolveOperationalMutationEntitlementAccessMock).not.toHaveBeenCalled();
    expect(insertJobEventMock).not.toHaveBeenCalled();
  });

  it('denies technician from recording payments', async () => {
    const { supabase, writes } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockResolvedValueOnce({
      userId: 'tech-1',
      internalUser: {
        user_id: 'tech-1',
        role: 'tech',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    const { recordInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(recordInternalInvoicePaymentFromForm(buildFormData())).rejects.toThrow('banner=not_authorized');

    expect(writes).toHaveLength(0);
    expect(resolveOperationalMutationEntitlementAccessMock).not.toHaveBeenCalled();
    expect(insertJobEventMock).not.toHaveBeenCalled();
  });

  it('allows valid trial internal invoice payment record', async () => {
    const { supabase, writes } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: true,
      reason: 'allowed_trial',
    });

    const { recordInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(recordInternalInvoicePaymentFromForm(buildFormData())).rejects.toThrow(
      'banner=internal_invoice_payment_recorded',
    );

    expect(writes.some((w) => w.table === 'internal_invoice_payments' && w.op === 'insert')).toBe(true);
  });

  it('blocks expired trial internal invoice payment record before payment writes and job events', async () => {
    const { supabase, writes } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: 'blocked_trial_expired',
    });

    const { recordInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(recordInternalInvoicePaymentFromForm(buildFormData())).rejects.toThrow(
      'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired',
    );

    expect(writes).toHaveLength(0);
    expect(resolveBillingModeByAccountOwnerIdMock).not.toHaveBeenCalled();
    expect(resolveInternalInvoiceByJobIdMock).not.toHaveBeenCalled();
    expect(resolveInvoiceCollectedPaymentSummaryMock).not.toHaveBeenCalled();
    expect(insertJobEventMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('blocks null-ended trial internal invoice payment record before payment writes and job events', async () => {
    const { supabase, writes } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: 'blocked_trial_missing_end',
    });

    const { recordInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(recordInternalInvoicePaymentFromForm(buildFormData())).rejects.toThrow(
      'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end',
    );

    expect(writes).toHaveLength(0);
    expect(resolveBillingModeByAccountOwnerIdMock).not.toHaveBeenCalled();
    expect(resolveInternalInvoiceByJobIdMock).not.toHaveBeenCalled();
    expect(resolveInvoiceCollectedPaymentSummaryMock).not.toHaveBeenCalled();
    expect(insertJobEventMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('allows internal comped invoice payment record', async () => {
    const { supabase, writes } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: true,
      reason: 'allowed_internal_comped',
    });

    const { recordInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(recordInternalInvoicePaymentFromForm(buildFormData())).rejects.toThrow(
      'banner=internal_invoice_payment_recorded',
    );

    expect(writes.some((w) => w.table === 'internal_invoice_payments' && w.op === 'insert')).toBe(true);
  });

  it('blocks missing entitlement internal invoice payment record before payment writes and job events', async () => {
    const { supabase, writes } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: 'blocked_missing_entitlement',
    });

    const { recordInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(recordInternalInvoicePaymentFromForm(buildFormData())).rejects.toThrow(
      'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement',
    );

    expect(writes).toHaveLength(0);
    expect(resolveBillingModeByAccountOwnerIdMock).not.toHaveBeenCalled();
    expect(resolveInternalInvoiceByJobIdMock).not.toHaveBeenCalled();
    expect(resolveInvoiceCollectedPaymentSummaryMock).not.toHaveBeenCalled();
    expect(insertJobEventMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('throws on real DB insert error', async () => {
    const { supabase } = makeSupabaseFixture({ insertError: { message: 'insert failed' } });
    createClientMock.mockResolvedValue(supabase);

    const { recordInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(recordInternalInvoicePaymentFromForm(buildFormData())).rejects.toEqual({
      message: 'insert failed',
    });
  });
});

describe('createTenantInvoiceCheckoutSessionFromForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      userId: 'user-1',
      internalUser: {
        user_id: 'user-1',
        role: 'admin',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: 'job-1' });
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValue('internal_invoicing');
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: 'allowed_active',
    });
    resolveInternalInvoiceByJobIdMock.mockResolvedValue({
      id: 'inv-1',
      account_owner_user_id: 'owner-1',
      job_id: 'job-1',
      invoice_number: 'INV-1',
      status: 'issued',
      total_cents: 10000,
    });
    createTenantInvoiceCheckoutSessionMock.mockResolvedValue({
      checkoutSessionId: 'cs_123',
      checkoutSessionUrl: 'https://checkout.stripe.com/c/pay/cs_123',
      connectedAccountId: 'acct_123',
      balanceDueCents: 8000,
    });

    const fixture = makeSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);
  });

  function buildCheckoutFormData(overrides: Partial<Record<string, string>> = {}) {
    const formData = new FormData();
    formData.set('job_id', 'job-1');
    formData.set('invoice_id', 'inv-1');
    formData.set('tab', 'info');
    formData.set('return_to', '/jobs/job-1/invoice#invoice-workspace');

    for (const [key, value] of Object.entries(overrides)) {
      if (value != null) {
        formData.set(key, value);
      }
    }

    return formData;
  }

  it('blocks unauthenticated/unauthorized access via scope before helper call', async () => {
    loadScopedInternalJobForMutationMock.mockResolvedValueOnce(null);

    const { createTenantInvoiceCheckoutSessionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(createTenantInvoiceCheckoutSessionFromForm(buildCheckoutFormData())).rejects.toThrow(
      'banner=not_authorized',
    );

    expect(createTenantInvoiceCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('allows structural owner to create checkout session even when role is office', async () => {
    requireInternalUserMock.mockResolvedValueOnce({
      userId: 'owner-1',
      internalUser: {
        user_id: 'owner-1',
        role: 'office',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    const { createTenantInvoiceCheckoutSessionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      createTenantInvoiceCheckoutSessionFromForm(buildCheckoutFormData({ no_redirect: '1' })),
    ).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        checkoutSessionId: 'cs_123',
      }),
    );
  });

  it('allows billing role to create checkout session', async () => {
    requireInternalUserMock.mockResolvedValueOnce({
      userId: 'billing-1',
      internalUser: {
        user_id: 'billing-1',
        role: 'billing',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    const { createTenantInvoiceCheckoutSessionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      createTenantInvoiceCheckoutSessionFromForm(buildCheckoutFormData({ no_redirect: '1' })),
    ).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        checkoutSessionId: 'cs_123',
      }),
    );
  });

  it('denies office/dispatcher from creating checkout session when not structural owner', async () => {
    requireInternalUserMock.mockResolvedValueOnce({
      userId: 'dispatcher-1',
      internalUser: {
        user_id: 'dispatcher-1',
        role: 'office',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    const { createTenantInvoiceCheckoutSessionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(createTenantInvoiceCheckoutSessionFromForm(buildCheckoutFormData())).rejects.toThrow(
      'banner=not_authorized',
    );

    expect(createTenantInvoiceCheckoutSessionMock).not.toHaveBeenCalled();
    expect(resolveOperationalMutationEntitlementAccessMock).not.toHaveBeenCalled();
  });

  it('denies technician from creating checkout session', async () => {
    requireInternalUserMock.mockResolvedValueOnce({
      userId: 'tech-1',
      internalUser: {
        user_id: 'tech-1',
        role: 'tech',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    const { createTenantInvoiceCheckoutSessionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(createTenantInvoiceCheckoutSessionFromForm(buildCheckoutFormData())).rejects.toThrow(
      'banner=not_authorized',
    );

    expect(createTenantInvoiceCheckoutSessionMock).not.toHaveBeenCalled();
    expect(resolveOperationalMutationEntitlementAccessMock).not.toHaveBeenCalled();
  });

  it('passes correct account/job/invoice context to helper', async () => {
    const { createTenantInvoiceCheckoutSessionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      createTenantInvoiceCheckoutSessionFromForm(buildCheckoutFormData({ no_redirect: '1' })),
    ).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        checkoutSessionId: 'cs_123',
      }),
    );

    expect(createTenantInvoiceCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountOwnerUserId: 'owner-1',
        jobId: 'job-1',
        invoiceId: 'inv-1',
      }),
    );
  });

  it('issued invoice with ready connect redirects success with session details', async () => {
    const { createTenantInvoiceCheckoutSessionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(createTenantInvoiceCheckoutSessionFromForm(buildCheckoutFormData())).rejects.toThrow(
      'banner=internal_invoice_payment_checkout_session_created',
    );
  });

  it('redirects directly to Stripe checkout when redirect_to_checkout is requested', async () => {
    const { createTenantInvoiceCheckoutSessionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      createTenantInvoiceCheckoutSessionFromForm(buildCheckoutFormData({ redirect_to_checkout: '1' })),
    ).rejects.toThrow('REDIRECT:https://checkout.stripe.com/c/pay/cs_123');

    expect(createTenantInvoiceCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountOwnerUserId: 'owner-1',
        jobId: 'job-1',
        invoiceId: 'inv-1',
      }),
    );
  });

  it('not-ready connect maps to safe notice', async () => {
    createTenantInvoiceCheckoutSessionMock.mockRejectedValueOnce(
      new Error('Tenant Stripe Connect account is not ready for checkout session creation.'),
    );

    const { createTenantInvoiceCheckoutSessionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(createTenantInvoiceCheckoutSessionFromForm(buildCheckoutFormData())).rejects.toThrow(
      'banner=internal_invoice_payment_connect_not_ready',
    );
  });

  it('draft/void/paid helper errors map to safe notices', async () => {
    const { createTenantInvoiceCheckoutSessionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    createTenantInvoiceCheckoutSessionMock.mockRejectedValueOnce(
      new Error('Invoice must be issued to accept online payment'),
    );
    await expect(createTenantInvoiceCheckoutSessionFromForm(buildCheckoutFormData())).rejects.toThrow(
      'banner=internal_invoice_payment_requires_issued',
    );

    createTenantInvoiceCheckoutSessionMock.mockRejectedValueOnce(
      new Error('Invoice balance must be greater than zero'),
    );
    await expect(createTenantInvoiceCheckoutSessionFromForm(buildCheckoutFormData())).rejects.toThrow(
      'banner=internal_invoice_payment_no_balance_due',
    );
  });

  it('does not insert payment rows via checkout action', async () => {
    const fixture = makeSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);

    const { createTenantInvoiceCheckoutSessionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      createTenantInvoiceCheckoutSessionFromForm(buildCheckoutFormData({ no_redirect: '1' })),
    ).resolves.toEqual(expect.objectContaining({ ok: true }));

    expect(fixture.writes.some((w) => w.table === 'internal_invoice_payments' && w.op === 'insert')).toBe(false);
    expect(insertJobEventMock).not.toHaveBeenCalled();
  });

  it('does not insert payment rows or mark paid for direct checkout redirect action', async () => {
    const fixture = makeSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);

    const { createTenantInvoiceCheckoutSessionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      createTenantInvoiceCheckoutSessionFromForm(buildCheckoutFormData({ redirect_to_checkout: '1' })),
    ).rejects.toThrow('REDIRECT:https://checkout.stripe.com/c/pay/cs_123');

    expect(fixture.writes.some((w) => w.table === 'internal_invoice_payments' && w.op === 'insert')).toBe(false);
    expect(insertJobEventMock).not.toHaveBeenCalled();
  });

  it('action-state wrapper forces no-redirect and returns checkout URL state', async () => {
    const { createTenantInvoiceCheckoutSessionFromFormState } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      createTenantInvoiceCheckoutSessionFromFormState(
        {
          status: 'idle',
          message: '',
          checkoutSessionId: null,
          checkoutSessionUrl: null,
        },
        buildCheckoutFormData(),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'success',
        checkoutSessionId: 'cs_123',
        checkoutSessionUrl: 'https://checkout.stripe.com/c/pay/cs_123',
      }),
    );
  });

  it('collectTenantInvoicePaymentNowFromForm redirects directly to Stripe checkout', async () => {
    const { collectTenantInvoicePaymentNowFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      collectTenantInvoicePaymentNowFromForm(buildCheckoutFormData()),
    ).rejects.toThrow('REDIRECT:https://checkout.stripe.com/c/pay/cs_123');

    expect(createTenantInvoiceCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountOwnerUserId: 'owner-1',
        jobId: 'job-1',
        invoiceId: 'inv-1',
      }),
    );
  });
});

describe('reverseInternalInvoicePaymentFromForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    const fixture = makeSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);

    requireInternalUserMock.mockResolvedValue({
      userId: 'user-1',
      internalUser: {
        user_id: 'user-1',
        role: 'admin',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: 'job-1' });
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValue('internal_invoicing');
    resolveInternalInvoiceByJobIdMock.mockResolvedValue({
      id: 'inv-1',
      account_owner_user_id: 'owner-1',
      job_id: 'job-1',
      customer_id: 'cust-1',
      invoice_number: 'INV-1',
      status: 'issued',
      total_cents: 10000,
    });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: 'allowed_active',
    });
    insertJobEventMock.mockResolvedValue(undefined);

    const adminFixture = makeAdminSupabaseFixture({
      paymentRow: {
        id: 'pay-1',
        account_owner_user_id: 'owner-1',
        invoice_id: 'inv-1',
        job_id: 'job-1',
        payment_status: 'recorded',
        payment_method: 'cash',
        amount_cents: 2500,
        processor_name: null,
        stripe_event_id: null,
        stripe_checkout_session_id: null,
        stripe_payment_intent_id: null,
      },
    });
    createAdminClientMock.mockReturnValue(adminFixture.admin);
  });

  it('reverses a recorded off-platform payment and writes job event', async () => {
    const { reverseInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(reverseInternalInvoicePaymentFromForm(buildReverseFormData())).rejects.toThrow(
      'banner=internal_invoice_payment_reversed',
    );

    expect(insertJobEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'payment_reversed',
        jobId: 'job-1',
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith('/jobs/job-1/invoice');
    expect(revalidatePathMock).toHaveBeenCalledWith('/reports/payments');
    expect(createTenantInvoiceCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('requires reversal reason', async () => {
    const { reverseInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      reverseInternalInvoicePaymentFromForm(buildReverseFormData({ reversal_reason: '   ' })),
    ).rejects.toThrow('banner=internal_invoice_payment_reversal_reason_required');

    expect(insertJobEventMock).not.toHaveBeenCalled();
  });

  it('blocks office/dispatcher from reversing when not structural owner', async () => {
    requireInternalUserMock.mockResolvedValueOnce({
      userId: 'dispatcher-1',
      internalUser: {
        user_id: 'dispatcher-1',
        role: 'office',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    const { reverseInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(reverseInternalInvoicePaymentFromForm(buildReverseFormData())).rejects.toThrow(
      'banner=not_authorized',
    );
  });

  it('blocks technician from reversing payments', async () => {
    requireInternalUserMock.mockResolvedValueOnce({
      userId: 'tech-1',
      internalUser: {
        user_id: 'tech-1',
        role: 'tech',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    const { reverseInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(reverseInternalInvoicePaymentFromForm(buildReverseFormData())).rejects.toThrow(
      'banner=not_authorized',
    );
  });

  it('blocks reversal when payment is outside actor account scope', async () => {
    const adminFixture = makeAdminSupabaseFixture({
      paymentRow: {
        id: 'pay-1',
        account_owner_user_id: 'owner-2',
        invoice_id: 'inv-1',
        job_id: 'job-1',
        payment_status: 'recorded',
        payment_method: 'cash',
        amount_cents: 2500,
      },
    });
    createAdminClientMock.mockReturnValueOnce(adminFixture.admin);

    const { reverseInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(reverseInternalInvoicePaymentFromForm(buildReverseFormData())).rejects.toThrow(
      'banner=not_authorized',
    );
  });

  it('blocks failed payments from reversal', async () => {
    const adminFixture = makeAdminSupabaseFixture({
      paymentRow: {
        id: 'pay-1',
        account_owner_user_id: 'owner-1',
        invoice_id: 'inv-1',
        job_id: 'job-1',
        payment_status: 'failed',
        payment_method: 'cash',
        amount_cents: 2500,
      },
    });
    createAdminClientMock.mockReturnValueOnce(adminFixture.admin);

    const { reverseInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(reverseInternalInvoicePaymentFromForm(buildReverseFormData())).rejects.toThrow(
      'banner=internal_invoice_payment_reversal_failed_blocked',
    );
  });

  it('blocks already reversed payments', async () => {
    const adminFixture = makeAdminSupabaseFixture({
      paymentRow: {
        id: 'pay-1',
        account_owner_user_id: 'owner-1',
        invoice_id: 'inv-1',
        job_id: 'job-1',
        payment_status: 'reversed',
        payment_method: 'cash',
        amount_cents: 2500,
      },
    });
    createAdminClientMock.mockReturnValueOnce(adminFixture.admin);

    const { reverseInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(reverseInternalInvoicePaymentFromForm(buildReverseFormData())).rejects.toThrow(
      'banner=internal_invoice_payment_reversal_already_reversed',
    );
  });

  it('blocks Stripe-sourced payments from this reversal action', async () => {
    const adminFixture = makeAdminSupabaseFixture({
      paymentRow: {
        id: 'pay-1',
        account_owner_user_id: 'owner-1',
        invoice_id: 'inv-1',
        job_id: 'job-1',
        payment_status: 'recorded',
        payment_method: 'card_stripe_online',
        amount_cents: 2500,
        stripe_event_id: 'evt_123',
      },
    });
    createAdminClientMock.mockReturnValueOnce(adminFixture.admin);

    const { reverseInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(reverseInternalInvoicePaymentFromForm(buildReverseFormData())).rejects.toThrow(
      'banner=internal_invoice_payment_reversal_online_blocked',
    );
  });

  it('does not run Stripe checkout helper during reversal', async () => {
    const { reverseInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(reverseInternalInvoicePaymentFromForm(buildReverseFormData())).rejects.toThrow(
      'banner=internal_invoice_payment_reversed',
    );

    expect(createTenantInvoiceCheckoutSessionMock).not.toHaveBeenCalled();
  });
});
