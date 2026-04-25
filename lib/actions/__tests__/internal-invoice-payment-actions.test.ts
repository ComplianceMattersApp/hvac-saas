import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveBillingModeByAccountOwnerIdMock = vi.fn();
const resolveInternalInvoiceByJobIdMock = vi.fn();
const resolveInvoiceCollectedPaymentSummaryMock = vi.fn();
const insertJobEventMock = vi.fn();
const revalidatePathMock = vi.fn();

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

describe('recordInternalInvoicePaymentFromForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      userId: 'user-1',
      internalUser: {
        user_id: 'user-1',
        role: 'office',
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
    insertJobEventMock.mockResolvedValue(undefined);
  });

  it('allows issued internal invoice payment record and writes job event', async () => {
    const { supabase, writes } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);

    const { recordInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(recordInternalInvoicePaymentFromForm(buildFormData())).rejects.toThrow(
      'banner=internal_invoice_payment_recorded',
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
    expect(insertJobEventMock).not.toHaveBeenCalled();
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
