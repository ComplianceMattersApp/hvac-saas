import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveBillingModeByAccountOwnerIdMock = vi.fn();
const resolveInternalInvoiceByIdMock = vi.fn();
const resolveInternalInvoiceByJobIdMock = vi.fn();
const resolveInvoiceCollectedPaymentSummaryMock = vi.fn();
const createTenantInvoiceCheckoutSessionMock = vi.fn();
const upsertInvoicePaymentAllocationForPaymentRowMock = vi.fn();
const insertJobEventMock = vi.fn();
const revalidatePathMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const resolveFieldBillingCapabilitiesMock = vi.fn();
const loadFieldBillingExplicitCapabilitiesForUserMock = vi.fn();

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

vi.mock('@/lib/auth/field-billing-access', () => ({
  resolveFieldBillingCapabilities: (...args: unknown[]) =>
    resolveFieldBillingCapabilitiesMock(...args),
}));

vi.mock('@/lib/auth/internal-user-access-capabilities', () => ({
  loadFieldBillingExplicitCapabilitiesForUser: (...args: unknown[]) =>
    loadFieldBillingExplicitCapabilitiesForUserMock(...args),
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
  resolveInternalInvoiceById: (...args: unknown[]) => resolveInternalInvoiceByIdMock(...args),
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

vi.mock('@/lib/business/payment-allocations', () => ({
  upsertInvoicePaymentAllocationForPaymentRow: (...args: unknown[]) =>
    upsertInvoicePaymentAllocationForPaymentRowMock(...args),
}));

beforeEach(() => {
  loadFieldBillingExplicitCapabilitiesForUserMock.mockResolvedValue({});
});

function makeSupabaseFixture(params?: { insertError?: { message: string; code?: string } | null }) {
  const writes: Array<{ table: string; op: string; payload?: unknown }> = [];
  const insertError = params?.insertError ?? null;

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'internal_invoice_payments') {
        return {
          insert: vi.fn((payload: unknown) => {
            writes.push({ table, op: 'insert', payload });
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

      if (table === 'field_payment_collection_reports') {
        return {
          insert: vi.fn(async (payload: unknown) => {
            writes.push({ table, op: 'insert', payload });
            return {
              error: insertError,
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

function buildFieldReportFormData(overrides: Partial<Record<string, string>> = {}) {
  const formData = new FormData();
  formData.set('job_id', 'job-1');
  formData.set('invoice_id', 'inv-1');
  formData.set('tab', 'info');
  formData.set('return_to', '/jobs/job-1/invoice?invoice_id=inv-1#invoice-workspace');
  formData.set('payment_amount', '25.00');
  formData.set('payment_method', 'check');
  formData.set('reference', 'CHK-1001');
  formData.set('note', 'Collected in field');

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

function makeFieldPaymentVerificationSupabaseFixture(params?: {
  reportRow?: any;
  reportUpdateResult?: any;
  reportUpdateError?: { message: string } | null;
  paymentInsertError?: { message: string } | null;
}) {
  const reportRow = params?.reportRow ?? null;
  const reportUpdateResult = params?.reportUpdateResult ??
    (reportRow
      ? {
          id: String(reportRow.id ?? 'report-1'),
        }
      : null);
  const reportUpdateError = params?.reportUpdateError ?? null;
  const paymentInsertError = params?.paymentInsertError ?? null;

  const writes: Array<{ table: string; op: string; payload?: unknown }> = [];

  const reportSelectQuery: any = {
    eq: vi.fn(() => reportSelectQuery),
    maybeSingle: vi.fn(async () => ({
      data: reportRow,
      error: null,
    })),
  };

  const reportUpdateQuery: any = {
    eq: vi.fn(() => reportUpdateQuery),
    in: vi.fn(() => reportUpdateQuery),
    select: vi.fn(() => ({
      maybeSingle: vi.fn(async () => ({
        data: reportUpdateError ? null : reportUpdateResult,
        error: reportUpdateError,
      })),
    })),
  };

  const paymentInsertQuery: any = {
    select: vi.fn(() => ({
      single: vi.fn(async () => ({
        data: paymentInsertError ? null : { id: 'pay-verify-1' },
        error: paymentInsertError,
      })),
    })),
  };

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'field_payment_collection_reports') {
        return {
          select: vi.fn(() => reportSelectQuery),
          update: vi.fn((payload: unknown) => {
            writes.push({ table, op: 'update', payload });
            return reportUpdateQuery;
          }),
        };
      }

      if (table === 'internal_invoice_payments') {
        return {
          insert: vi.fn((payload: unknown) => {
            writes.push({ table, op: 'insert', payload });
            return paymentInsertQuery;
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { supabase, writes };
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

function buildFieldPaymentVerificationFormData(overrides: Partial<Record<string, string>> = {}) {
  const formData = new FormData();
  formData.set('job_id', 'job-1');
  formData.set('field_payment_report_id', 'report-1');
  formData.set('invoice_id', 'inv-1');
  formData.set('tab', 'info');
  formData.set('return_to', '/jobs/job-1/invoice?invoice_id=inv-1#invoice-workspace');
  formData.set('verification_note', 'Matched check image and office log.');

  for (const [key, value] of Object.entries(overrides)) {
    if (value != null) {
      formData.set(key, value);
    }
  }

  return formData;
}

function buildFieldPaymentRejectionFormData(overrides: Partial<Record<string, string>> = {}) {
  const formData = buildFieldPaymentVerificationFormData();
  formData.set('rejection_reason', 'Reference mismatch with office records.');

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
    resolveInternalInvoiceByIdMock.mockResolvedValue({
      id: 'inv-1',
      account_owner_user_id: 'owner-1',
      job_id: 'job-1',
      invoice_number: 'INV-1',
      status: 'issued',
      total_cents: 10000,
    });
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
    upsertInvoicePaymentAllocationForPaymentRowMock.mockResolvedValue({
      ok: true,
      status: 'created',
      allocationId: 'alloc-1',
      allocationStatus: 'active',
      reason: null,
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
    expect(upsertInvoicePaymentAllocationForPaymentRowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentRow: expect.objectContaining({
          id: 'pay-1',
          account_owner_user_id: 'owner-1',
          invoice_id: 'inv-1',
          amount_cents: 2500,
          payment_status: 'recorded',
        }),
      }),
    );
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

    expect(upsertInvoicePaymentAllocationForPaymentRowMock).not.toHaveBeenCalled();
  });

  it('keeps manual payment success when allocation dual-write helper fails', async () => {
    const { supabase } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    upsertInvoicePaymentAllocationForPaymentRowMock.mockResolvedValueOnce({
      ok: false,
      status: 'failed',
      allocationId: null,
      allocationStatus: null,
      reason: 'allocation insert failed',
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { recordInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(recordInternalInvoicePaymentFromForm(buildFormData())).rejects.toThrow(
      'banner=internal_invoice_payment_recorded',
    );

    expect(upsertInvoicePaymentAllocationForPaymentRowMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'Manual payment allocation dual-write failed after payment row success',
      expect.objectContaining({
        paymentId: 'pay-1',
        invoiceId: 'inv-1',
        allocationResultStatus: 'failed',
      }),
    );

    warnSpy.mockRestore();
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

describe('collectIssuedInvoiceCardPaymentFromForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      userId: 'tech-1',
      internalUser: {
        user_id: 'tech-1',
        role: 'tech',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    resolveFieldBillingCapabilitiesMock.mockReturnValue({
      can_collect_card_payment: true,
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

  function buildCollectFormData(overrides: Partial<Record<string, string>> = {}) {
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

  it('allows trusted field actor with collect-card capability to launch checkout', async () => {
    const explicitCapabilities = {
      field_billing_enabled: true,
      can_collect_field_payment: true,
      can_collect_card_payment: true,
    };
    loadFieldBillingExplicitCapabilitiesForUserMock.mockResolvedValueOnce(explicitCapabilities);
    const fixture = makeSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);

    const { collectIssuedInvoiceCardPaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      collectIssuedInvoiceCardPaymentFromForm(buildCollectFormData()),
    ).rejects.toThrow('REDIRECT:https://checkout.stripe.com/c/pay/cs_123');

    expect(createTenantInvoiceCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountOwnerUserId: 'owner-1',
        jobId: 'job-1',
        invoiceId: 'inv-1',
      }),
    );
    expect(loadFieldBillingExplicitCapabilitiesForUserMock).toHaveBeenCalledWith({
      supabase: fixture.supabase,
      accountOwnerUserId: 'owner-1',
      internalUserId: 'tech-1',
    });
    expect(resolveFieldBillingCapabilitiesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'tech-1',
        explicitCapabilities,
      }),
    );
  });

  it('rejects actor without collect-card capability', async () => {
    resolveFieldBillingCapabilitiesMock.mockReturnValueOnce({
      can_collect_card_payment: false,
    });

    const { collectIssuedInvoiceCardPaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      collectIssuedInvoiceCardPaymentFromForm(buildCollectFormData()),
    ).rejects.toThrow('banner=not_authorized');

    expect(createTenantInvoiceCheckoutSessionMock).not.toHaveBeenCalled();
    expect(resolveOperationalMutationEntitlementAccessMock).not.toHaveBeenCalled();
  });

  it('rejects actor with report-only capability when card collect capability is absent', async () => {
    resolveFieldBillingCapabilitiesMock.mockReturnValueOnce({
      can_collect_field_payment: true,
      can_report_non_card_collection: true,
      can_collect_card_payment: false,
      can_verify_non_card_collection: false,
    });

    const { collectIssuedInvoiceCardPaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      collectIssuedInvoiceCardPaymentFromForm(buildCollectFormData()),
    ).rejects.toThrow('banner=not_authorized');

    expect(createTenantInvoiceCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('rejects draft invoice collection attempts', async () => {
    createTenantInvoiceCheckoutSessionMock.mockRejectedValueOnce(
      new Error('Invoice must be issued to accept online payment'),
    );

    const { collectIssuedInvoiceCardPaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      collectIssuedInvoiceCardPaymentFromForm(buildCollectFormData()),
    ).rejects.toThrow('banner=internal_invoice_payment_requires_issued');
  });

  it('rejects zero-balance collection attempts', async () => {
    createTenantInvoiceCheckoutSessionMock.mockRejectedValueOnce(
      new Error('Invoice balance must be greater than zero'),
    );

    const { collectIssuedInvoiceCardPaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      collectIssuedInvoiceCardPaymentFromForm(buildCollectFormData()),
    ).rejects.toThrow('banner=internal_invoice_payment_no_balance_due');
  });

  it('rejects collection when Stripe readiness is missing', async () => {
    createTenantInvoiceCheckoutSessionMock.mockRejectedValueOnce(
      new Error('Tenant Stripe Connect account is not ready for checkout session creation.'),
    );

    const { collectIssuedInvoiceCardPaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      collectIssuedInvoiceCardPaymentFromForm(buildCollectFormData()),
    ).rejects.toThrow('banner=internal_invoice_payment_connect_not_ready');
  });

  it('does not insert payment rows when launching field checkout', async () => {
    const fixture = makeSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);

    const { collectIssuedInvoiceCardPaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      collectIssuedInvoiceCardPaymentFromForm(buildCollectFormData()),
    ).rejects.toThrow('REDIRECT:https://checkout.stripe.com/c/pay/cs_123');

    expect(fixture.writes.some((w) => w.table === 'internal_invoice_payments' && w.op === 'insert')).toBe(false);
    expect(insertJobEventMock).not.toHaveBeenCalled();
  });
});

describe('reportNonCardFieldPaymentCollectionFromForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      userId: 'tech-1',
      internalUser: {
        user_id: 'tech-1',
        role: 'tech',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    resolveFieldBillingCapabilitiesMock.mockReturnValue({
      can_collect_field_payment: true,
      can_collect_card_payment: false,
      can_report_non_card_collection: true,
      can_verify_non_card_collection: false,
    });
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: 'job-1' });
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValue('internal_invoicing');
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: 'allowed_active',
    });
    resolveInternalInvoiceByIdMock.mockResolvedValue({
      id: 'inv-1',
      account_owner_user_id: 'owner-1',
      job_id: 'job-1',
      customer_id: 'cust-1',
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

    const fixture = makeSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);
  });

  it('allows authorized field collector to report check payment on issued invoice with balance', async () => {
    const explicitCapabilities = {
      field_billing_enabled: true,
      can_collect_field_payment: true,
      can_report_non_card_collection: true,
    };
    loadFieldBillingExplicitCapabilitiesForUserMock.mockResolvedValueOnce(explicitCapabilities);
    const fixture = makeSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    const { reportNonCardFieldPaymentCollectionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      reportNonCardFieldPaymentCollectionFromForm(buildFieldReportFormData({ payment_method: 'check' })),
    ).rejects.toThrow('banner=field_payment_reported');

    const reportWrite = fixture.writes.find(
      (w) => w.table === 'field_payment_collection_reports' && w.op === 'insert',
    );
    expect(reportWrite).toBeTruthy();
    expect(reportWrite?.payload).toEqual(
      expect.objectContaining({
        account_owner_user_id: 'owner-1',
        job_id: 'job-1',
        internal_invoice_id: 'inv-1',
        customer_id: 'cust-1',
        reported_by_user_id: 'tech-1',
        payment_method: 'check',
        amount_cents: 2500,
        currency: 'usd',
        reference: 'CHK-1001',
        note: 'Collected in field',
        status: 'reported',
      }),
    );
    const payload = reportWrite?.payload as Record<string, unknown> | undefined;
    expect(payload?.verified_by_user_id).toBeUndefined();
    expect(payload?.verified_at).toBeUndefined();
    expect(payload?.final_internal_invoice_payment_id).toBeUndefined();
    expect(fixture.writes.some((w) => w.table === 'internal_invoice_payments' && w.op === 'insert')).toBe(false);
    expect(upsertInvoicePaymentAllocationForPaymentRowMock).not.toHaveBeenCalled();
    expect(insertJobEventMock).not.toHaveBeenCalled();
    expect(loadFieldBillingExplicitCapabilitiesForUserMock).toHaveBeenCalledWith({
      supabase: fixture.supabase,
      accountOwnerUserId: 'owner-1',
      internalUserId: 'tech-1',
    });
    expect(resolveFieldBillingCapabilitiesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'tech-1',
        explicitCapabilities,
      }),
    );
  });

  it('allows authorized field collector to report cash payment', async () => {
    const fixture = makeSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    const { reportNonCardFieldPaymentCollectionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      reportNonCardFieldPaymentCollectionFromForm(buildFieldReportFormData({ payment_method: 'cash' })),
    ).rejects.toThrow('banner=field_payment_reported');

    const reportWrite = fixture.writes.find(
      (w) => w.table === 'field_payment_collection_reports' && w.op === 'insert',
    );
    expect(reportWrite?.payload).toEqual(
      expect.objectContaining({
        payment_method: 'cash',
      }),
    );
  });

  it('allows authorized field collector to report other payment', async () => {
    const fixture = makeSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    const { reportNonCardFieldPaymentCollectionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      reportNonCardFieldPaymentCollectionFromForm(buildFieldReportFormData({ payment_method: 'other' })),
    ).rejects.toThrow('banner=field_payment_reported');

    const reportWrite = fixture.writes.find(
      (w) => w.table === 'field_payment_collection_reports' && w.op === 'insert',
    );
    expect(reportWrite?.payload).toEqual(
      expect.objectContaining({
        payment_method: 'other',
      }),
    );
  });

  it('converts raw report insert permission errors into a safe failure banner', async () => {
    const fixture = makeSupabaseFixture({
      insertError: {
        code: '42501',
        message: 'new row violates row-level security policy for table "field_payment_collection_reports"',
      },
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    const { reportNonCardFieldPaymentCollectionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      reportNonCardFieldPaymentCollectionFromForm(buildFieldReportFormData({ payment_method: 'cash' })),
    ).rejects.toThrow('banner=field_payment_report_failed');

    expect(fixture.writes.some((w) => w.table === 'field_payment_collection_reports' && w.op === 'insert')).toBe(true);
    expect(fixture.writes.some((w) => w.table === 'internal_invoice_payments' && w.op === 'insert')).toBe(false);
    expect(upsertInvoicePaymentAllocationForPaymentRowMock).not.toHaveBeenCalled();
  });

  it('rejects draft invoice reporting attempts', async () => {
    resolveInternalInvoiceByIdMock.mockResolvedValueOnce({
      id: 'inv-1',
      account_owner_user_id: 'owner-1',
      job_id: 'job-1',
      customer_id: 'cust-1',
      status: 'draft',
      total_cents: 10000,
    });

    const { reportNonCardFieldPaymentCollectionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      reportNonCardFieldPaymentCollectionFromForm(buildFieldReportFormData()),
    ).rejects.toThrow('banner=field_payment_report_requires_issued');
  });

  it('rejects void invoice reporting attempts', async () => {
    resolveInternalInvoiceByIdMock.mockResolvedValueOnce({
      id: 'inv-1',
      account_owner_user_id: 'owner-1',
      job_id: 'job-1',
      customer_id: 'cust-1',
      status: 'void',
      total_cents: 10000,
    });

    const { reportNonCardFieldPaymentCollectionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      reportNonCardFieldPaymentCollectionFromForm(buildFieldReportFormData()),
    ).rejects.toThrow('banner=field_payment_report_requires_issued');
  });

  it('rejects paid or zero-balance invoice reporting attempts', async () => {
    resolveInvoiceCollectedPaymentSummaryMock.mockResolvedValueOnce({
      invoiceId: 'inv-1',
      invoiceTotalCents: 10000,
      amountPaidCents: 10000,
      balanceDueCents: 0,
      paymentStatus: 'paid',
    });

    const { reportNonCardFieldPaymentCollectionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      reportNonCardFieldPaymentCollectionFromForm(buildFieldReportFormData()),
    ).rejects.toThrow('banner=field_payment_report_no_balance_due');
  });

  it('rejects over-balance reporting attempts', async () => {
    resolveInvoiceCollectedPaymentSummaryMock.mockResolvedValueOnce({
      invoiceId: 'inv-1',
      invoiceTotalCents: 10000,
      amountPaidCents: 9500,
      balanceDueCents: 500,
      paymentStatus: 'partial',
    });

    const { reportNonCardFieldPaymentCollectionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      reportNonCardFieldPaymentCollectionFromForm(buildFieldReportFormData({ payment_amount: '6.00' })),
    ).rejects.toThrow('banner=field_payment_report_overpay_denied');
  });

  it('rejects invalid non-card method', async () => {
    const { reportNonCardFieldPaymentCollectionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      reportNonCardFieldPaymentCollectionFromForm(buildFieldReportFormData({ payment_method: 'bank_transfer' })),
    ).rejects.toThrow('banner=field_payment_report_method_invalid');
  });

  it('rejects missing selected invoice id', async () => {
    const { reportNonCardFieldPaymentCollectionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      reportNonCardFieldPaymentCollectionFromForm(buildFieldReportFormData({ invoice_id: '' })),
    ).rejects.toThrow('banner=field_payment_report_invalid');
  });

  it('rejects unauthorized actor without non-card reporting authority', async () => {
    resolveFieldBillingCapabilitiesMock.mockReturnValueOnce({
      can_collect_field_payment: false,
      can_collect_card_payment: false,
      can_report_non_card_collection: false,
      can_verify_non_card_collection: false,
    });

    const { reportNonCardFieldPaymentCollectionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      reportNonCardFieldPaymentCollectionFromForm(buildFieldReportFormData()),
    ).rejects.toThrow('banner=not_authorized');
  });

  it('rejects collect-card-only actor when non-card reporting capability is absent', async () => {
    resolveFieldBillingCapabilitiesMock.mockReturnValueOnce({
      can_collect_field_payment: true,
      can_collect_card_payment: true,
      can_report_non_card_collection: false,
      can_verify_non_card_collection: false,
    });

    const { reportNonCardFieldPaymentCollectionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      reportNonCardFieldPaymentCollectionFromForm(buildFieldReportFormData()),
    ).rejects.toThrow('banner=not_authorized');
  });

  it('preserves selected supplemental invoice routing in redirect', async () => {
    const fixture = makeSupabaseFixture();
    createAdminClientMock.mockReturnValue(fixture.supabase);

    const { reportNonCardFieldPaymentCollectionFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      reportNonCardFieldPaymentCollectionFromForm(
        buildFieldReportFormData({
          invoice_id: 'inv-supp-1',
          return_to: '/jobs/job-1/invoice?invoice_id=inv-supp-1#invoice-workspace',
        }),
      ),
    ).rejects.toThrow('/jobs/job-1/invoice?invoice_id=inv-supp-1&banner=field_payment_reported#invoice-workspace');
  });
});

describe('verifyFieldPaymentCollectionReportFromForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      userId: 'billing-1',
      internalUser: {
        user_id: 'billing-1',
        role: 'billing',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    resolveFieldBillingCapabilitiesMock.mockReturnValue({
      can_collect_field_payment: false,
      can_collect_card_payment: false,
      can_report_non_card_collection: false,
      can_verify_non_card_collection: true,
    });
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: 'job-1' });
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValue('internal_invoicing');
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: 'allowed_active',
    });
    resolveInternalInvoiceByIdMock.mockResolvedValue({
      id: 'inv-1',
      account_owner_user_id: 'owner-1',
      job_id: 'job-1',
      customer_id: 'cust-1',
      invoice_number: 'INV-1',
      status: 'issued',
      total_cents: 10000,
    });
    resolveInvoiceCollectedPaymentSummaryMock.mockResolvedValue({
      invoiceId: 'inv-1',
      invoiceTotalCents: 10000,
      amountPaidCents: 3000,
      balanceDueCents: 7000,
      paymentStatus: 'partial',
    });
    upsertInvoicePaymentAllocationForPaymentRowMock.mockResolvedValue({
      ok: true,
      status: 'created',
      allocationId: 'alloc-verify-1',
      allocationStatus: 'active',
      reason: null,
    });
    insertJobEventMock.mockResolvedValue(undefined);

    const fixture = makeFieldPaymentVerificationSupabaseFixture({
      reportRow: {
        id: 'report-1',
        account_owner_user_id: 'owner-1',
        job_id: 'job-1',
        internal_invoice_id: 'inv-1',
        reported_by_user_id: 'tech-1',
        payment_method: 'check',
        amount_cents: 2500,
        reference: 'CHK-1001',
        note: 'Collected in field',
        status: 'reported',
      },
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);
  });

  it('authorized verifier can verify reported check payment', async () => {
    const fixture = makeFieldPaymentVerificationSupabaseFixture({
      reportRow: {
        id: 'report-1',
        account_owner_user_id: 'owner-1',
        job_id: 'job-1',
        internal_invoice_id: 'inv-1',
        reported_by_user_id: 'tech-1',
        payment_method: 'check',
        amount_cents: 2500,
        reference: 'CHK-1001',
        note: 'Collected in field',
        status: 'reported',
      },
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    const { verifyFieldPaymentCollectionReportFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      verifyFieldPaymentCollectionReportFromForm(buildFieldPaymentVerificationFormData()),
    ).rejects.toThrow('banner=field_payment_verification_verified');

    const paymentWrites = fixture.writes.filter(
      (w) => w.table === 'internal_invoice_payments' && w.op === 'insert',
    );
    expect(paymentWrites).toHaveLength(1);
    expect(paymentWrites[0]?.payload).toEqual(
      expect.objectContaining({
        account_owner_user_id: 'owner-1',
        invoice_id: 'inv-1',
        job_id: 'job-1',
        payment_status: 'recorded',
        payment_method: 'check',
        amount_cents: 2500,
        recorded_by_user_id: 'billing-1',
      }),
    );

    expect(upsertInvoicePaymentAllocationForPaymentRowMock).toHaveBeenCalledTimes(1);
    expect(upsertInvoicePaymentAllocationForPaymentRowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentRow: expect.objectContaining({
          id: 'pay-verify-1',
          invoice_id: 'inv-1',
          payment_status: 'recorded',
          amount_cents: 2500,
        }),
      }),
    );

    const reportUpdateWrite = fixture.writes.find(
      (w) => w.table === 'field_payment_collection_reports' && w.op === 'update',
    );
    expect(reportUpdateWrite?.payload).toEqual(
      expect.objectContaining({
        status: 'verified',
        verified_by_user_id: 'billing-1',
        verification_note: 'Matched check image and office log.',
        final_internal_invoice_payment_id: 'pay-verify-1',
      }),
    );
  });

  it('authorized verifier can verify reported cash payment', async () => {
    const fixture = makeFieldPaymentVerificationSupabaseFixture({
      reportRow: {
        id: 'report-1',
        account_owner_user_id: 'owner-1',
        job_id: 'job-1',
        internal_invoice_id: 'inv-1',
        reported_by_user_id: 'tech-1',
        payment_method: 'cash',
        amount_cents: 2500,
        status: 'reported',
      },
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    const { verifyFieldPaymentCollectionReportFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      verifyFieldPaymentCollectionReportFromForm(buildFieldPaymentVerificationFormData()),
    ).rejects.toThrow('banner=field_payment_verification_verified');

    const paymentWrite = fixture.writes.find(
      (w) => w.table === 'internal_invoice_payments' && w.op === 'insert',
    );
    expect(paymentWrite?.payload).toEqual(
      expect.objectContaining({
        payment_method: 'cash',
      }),
    );
  });

  it('authorized verifier can verify reported other payment', async () => {
    const fixture = makeFieldPaymentVerificationSupabaseFixture({
      reportRow: {
        id: 'report-1',
        account_owner_user_id: 'owner-1',
        job_id: 'job-1',
        internal_invoice_id: 'inv-1',
        reported_by_user_id: 'tech-1',
        payment_method: 'other',
        amount_cents: 2500,
        status: 'reported',
      },
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    const { verifyFieldPaymentCollectionReportFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      verifyFieldPaymentCollectionReportFromForm(buildFieldPaymentVerificationFormData()),
    ).rejects.toThrow('banner=field_payment_verification_verified');

    const paymentWrite = fixture.writes.find(
      (w) => w.table === 'internal_invoice_payments' && w.op === 'insert',
    );
    expect(paymentWrite?.payload).toEqual(
      expect.objectContaining({
        payment_method: 'other',
      }),
    );
  });

  it('verification rejects terminal report statuses', async () => {
    const fixture = makeFieldPaymentVerificationSupabaseFixture({
      reportRow: {
        id: 'report-1',
        account_owner_user_id: 'owner-1',
        job_id: 'job-1',
        internal_invoice_id: 'inv-1',
        reported_by_user_id: 'tech-1',
        payment_method: 'check',
        amount_cents: 2500,
        status: 'verified',
      },
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    const { verifyFieldPaymentCollectionReportFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      verifyFieldPaymentCollectionReportFromForm(buildFieldPaymentVerificationFormData()),
    ).rejects.toThrow('banner=field_payment_verification_terminal');

    expect(fixture.writes.some((w) => w.table === 'internal_invoice_payments' && w.op === 'insert')).toBe(false);
  });

  it('verification rejects when invoice balance is zero', async () => {
    resolveInvoiceCollectedPaymentSummaryMock.mockResolvedValueOnce({
      invoiceId: 'inv-1',
      invoiceTotalCents: 10000,
      amountPaidCents: 10000,
      balanceDueCents: 0,
      paymentStatus: 'paid',
    });

    const { verifyFieldPaymentCollectionReportFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      verifyFieldPaymentCollectionReportFromForm(buildFieldPaymentVerificationFormData()),
    ).rejects.toThrow('banner=field_payment_verification_no_balance_due');
  });

  it('verification rejects when report amount exceeds current balance', async () => {
    const fixture = makeFieldPaymentVerificationSupabaseFixture({
      reportRow: {
        id: 'report-1',
        account_owner_user_id: 'owner-1',
        job_id: 'job-1',
        internal_invoice_id: 'inv-1',
        reported_by_user_id: 'tech-1',
        payment_method: 'check',
        amount_cents: 2600,
        status: 'reported',
      },
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);
    resolveInvoiceCollectedPaymentSummaryMock.mockResolvedValueOnce({
      invoiceId: 'inv-1',
      invoiceTotalCents: 10000,
      amountPaidCents: 7600,
      balanceDueCents: 2400,
      paymentStatus: 'partial',
    });

    const { verifyFieldPaymentCollectionReportFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      verifyFieldPaymentCollectionReportFromForm(buildFieldPaymentVerificationFormData()),
    ).rejects.toThrow('banner=field_payment_verification_overpay_denied');
  });

  it('verification rejects without financial authority or explicit verification capability', async () => {
    requireInternalUserMock.mockResolvedValueOnce({
      userId: 'tech-2',
      internalUser: {
        user_id: 'tech-2',
        role: 'tech',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });
    resolveFieldBillingCapabilitiesMock.mockReturnValueOnce({
      can_collect_field_payment: false,
      can_collect_card_payment: false,
      can_report_non_card_collection: false,
      can_verify_non_card_collection: false,
    });

    const { verifyFieldPaymentCollectionReportFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      verifyFieldPaymentCollectionReportFromForm(buildFieldPaymentVerificationFormData()),
    ).rejects.toThrow('banner=not_authorized');
  });

  it('verification rejects self-verification by the reporter', async () => {
    const fixture = makeFieldPaymentVerificationSupabaseFixture({
      reportRow: {
        id: 'report-1',
        account_owner_user_id: 'owner-1',
        job_id: 'job-1',
        internal_invoice_id: 'inv-1',
        reported_by_user_id: 'billing-1',
        payment_method: 'check',
        amount_cents: 2500,
        status: 'reported',
      },
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    const { verifyFieldPaymentCollectionReportFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      verifyFieldPaymentCollectionReportFromForm(buildFieldPaymentVerificationFormData()),
    ).rejects.toThrow('banner=field_payment_verification_self_denied');
  });

  it('verification rejects cross-account report access', async () => {
    const fixture = makeFieldPaymentVerificationSupabaseFixture({
      reportRow: {
        id: 'report-1',
        account_owner_user_id: 'owner-2',
        job_id: 'job-1',
        internal_invoice_id: 'inv-1',
        reported_by_user_id: 'tech-1',
        payment_method: 'check',
        amount_cents: 2500,
        status: 'reported',
      },
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    const { verifyFieldPaymentCollectionReportFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      verifyFieldPaymentCollectionReportFromForm(buildFieldPaymentVerificationFormData()),
    ).rejects.toThrow('banner=not_authorized');
  });
});

describe('rejectFieldPaymentCollectionReportFromForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      userId: 'billing-1',
      internalUser: {
        user_id: 'billing-1',
        role: 'billing',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    resolveFieldBillingCapabilitiesMock.mockReturnValue({
      can_collect_field_payment: false,
      can_collect_card_payment: false,
      can_report_non_card_collection: false,
      can_verify_non_card_collection: true,
    });
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: 'job-1' });
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValue('internal_invoicing');
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: 'allowed_active',
    });

    const fixture = makeFieldPaymentVerificationSupabaseFixture({
      reportRow: {
        id: 'report-1',
        account_owner_user_id: 'owner-1',
        job_id: 'job-1',
        internal_invoice_id: 'inv-1',
        reported_by_user_id: 'tech-1',
        payment_method: 'check',
        amount_cents: 2500,
        status: 'reported',
      },
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);
  });

  it('rejection updates report status and rejection fields', async () => {
    const fixture = makeFieldPaymentVerificationSupabaseFixture({
      reportRow: {
        id: 'report-1',
        account_owner_user_id: 'owner-1',
        job_id: 'job-1',
        internal_invoice_id: 'inv-1',
        reported_by_user_id: 'tech-1',
        status: 'reported',
      },
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    const { rejectFieldPaymentCollectionReportFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      rejectFieldPaymentCollectionReportFromForm(buildFieldPaymentRejectionFormData()),
    ).rejects.toThrow('banner=field_payment_verification_rejected');

    const reportUpdateWrite = fixture.writes.find(
      (w) => w.table === 'field_payment_collection_reports' && w.op === 'update',
    );
    expect(reportUpdateWrite?.payload).toEqual(
      expect.objectContaining({
        status: 'rejected',
        rejected_by_user_id: 'billing-1',
        rejection_reason: 'Reference mismatch with office records.',
      }),
    );
  });

  it('rejection does not create final payment truth rows', async () => {
    const fixture = makeFieldPaymentVerificationSupabaseFixture({
      reportRow: {
        id: 'report-1',
        account_owner_user_id: 'owner-1',
        job_id: 'job-1',
        internal_invoice_id: 'inv-1',
        reported_by_user_id: 'tech-1',
        status: 'reported',
      },
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.supabase);

    const { rejectFieldPaymentCollectionReportFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(
      rejectFieldPaymentCollectionReportFromForm(buildFieldPaymentRejectionFormData()),
    ).rejects.toThrow('banner=field_payment_verification_rejected');

    expect(fixture.writes.some((w) => w.table === 'internal_invoice_payments' && w.op === 'insert')).toBe(false);
    expect(upsertInvoicePaymentAllocationForPaymentRowMock).not.toHaveBeenCalled();
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
    upsertInvoicePaymentAllocationForPaymentRowMock.mockResolvedValue({
      ok: true,
      status: 'updated',
      allocationId: 'alloc-1',
      allocationStatus: 'reversed',
      reason: null,
    });
  });

  it('reverses a recorded off-platform payment and writes job event', async () => {
    const { reverseInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(reverseInternalInvoicePaymentFromForm(buildReverseFormData())).rejects.toThrow(
      'banner=internal_invoice_payment_reversed',
    );

    expect(upsertInvoicePaymentAllocationForPaymentRowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentRow: expect.objectContaining({
          id: 'pay-1',
          account_owner_user_id: 'owner-1',
          invoice_id: 'inv-1',
          amount_cents: 2500,
          payment_status: 'reversed',
        }),
      }),
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

    expect(upsertInvoicePaymentAllocationForPaymentRowMock).not.toHaveBeenCalled();
  });

  it('does not run Stripe checkout helper during reversal', async () => {
    const { reverseInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(reverseInternalInvoicePaymentFromForm(buildReverseFormData())).rejects.toThrow(
      'banner=internal_invoice_payment_reversed',
    );

    expect(createTenantInvoiceCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('keeps manual reversal success when allocation dual-write helper fails', async () => {
    upsertInvoicePaymentAllocationForPaymentRowMock.mockResolvedValueOnce({
      ok: false,
      status: 'failed',
      allocationId: null,
      allocationStatus: null,
      reason: 'allocation update failed',
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { reverseInternalInvoicePaymentFromForm } = await import('@/lib/actions/internal-invoice-payment-actions');

    await expect(reverseInternalInvoicePaymentFromForm(buildReverseFormData())).rejects.toThrow(
      'banner=internal_invoice_payment_reversed',
    );

    expect(upsertInvoicePaymentAllocationForPaymentRowMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'Manual payment reversal allocation dual-write failed after payment row success',
      expect.objectContaining({
        paymentId: 'pay-1',
        invoiceId: 'inv-1',
        allocationResultStatus: 'failed',
      }),
    );

    warnSpy.mockRestore();
  });
});
