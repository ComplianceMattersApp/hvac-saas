import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveBillingModeByAccountOwnerIdMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const resolveInternalInvoiceByJobIdMock = vi.fn();
const resolveInternalInvoiceByIdMock = vi.fn();
const resolveOperationalTenantIdentityMock = vi.fn();
const sendEmailMock = vi.fn();
const resolveNotificationAccountOwnerUserIdMock = vi.fn();
const createTenantInvoiceCheckoutSessionMock = vi.fn();
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
  resolveInternalInvoiceById: (...args: unknown[]) => resolveInternalInvoiceByIdMock(...args),
  normalizeInternalInvoiceItemType: (value: unknown) => value,
}));

vi.mock('@/lib/auth/internal-user-access-capabilities', () => ({
  loadFieldBillingExplicitCapabilitiesForUser: vi.fn(async () => ({})),
}));

vi.mock('@/lib/email/operational-tenant-branding', () => ({
  resolveOperationalTenantIdentity: (...args: unknown[]) =>
    resolveOperationalTenantIdentityMock(...args),
}));

vi.mock('@/lib/email/sendEmail', () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

vi.mock('@/lib/notifications/account-owner', () => ({
  resolveNotificationAccountOwnerUserId: (...args: unknown[]) =>
    resolveNotificationAccountOwnerUserIdMock(...args),
}));

vi.mock('@/lib/business/internal-invoice-payments', () => ({
  createTenantInvoiceCheckoutSession: (...args: unknown[]) =>
    createTenantInvoiceCheckoutSessionMock(...args),
}));

vi.mock('@/lib/actions/job-actions', () => ({
  insertJobEvent: (...args: unknown[]) => insertJobEventMock(...args),
}));

vi.mock('@/lib/actions/job-evaluator', () => ({
  evaluateJobOpsStatus: vi.fn(),
  healStalePaperworkOpsStatus: vi.fn(),
}));

vi.mock('@/lib/actions/service-case-reconciliation', () => ({
  reconcileServiceCaseStatusAfterJobChange: vi.fn(),
}));

vi.mock('@/lib/business/job-billing-source', () => ({
  resolveJobBillingSource: vi.fn(() => ({ billing: {} })),
}));

vi.mock('@/lib/jobs/visit-scope', () => ({
  sanitizeVisitScopeItemId: (value: unknown) => String(value ?? '').trim() || null,
  sanitizeVisitScopeItems: (items: unknown[]) => items,
}));

function buildFormData(overrides: Partial<Record<string, string>> = {}) {
  const formData = new FormData();
  formData.set('job_id', 'job-1');
  formData.set('tab', 'info');
  formData.set('recipient_email', 'billing@example.com');

  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === 'string') {
      formData.set(key, value);
    }
  }

  return formData;
}

function makeSupabaseFixture() {
  const notificationRows: Array<any> = [];
  const writes: Array<{ table: string; op: string; patch?: Record<string, unknown> }> = [];

  const notificationsApi = {
    select: vi.fn((columns: string) => {
      if (columns === 'id, payload, status, sent_at, created_at') {
        const state = {
          eqs: [] as Array<{ column: string; value: unknown }>,
        };
        const chain: any = {
          eq: vi.fn((column: string, value: unknown) => {
            state.eqs.push({ column, value });
            return chain;
          }),
          order: vi.fn(async () => ({ data: notificationRows, error: null })),
        };
        return chain;
      }

      if (columns === 'payload') {
        const state = {
          id: '',
        };
        const chain: any = {
          eq: vi.fn((column: string, value: unknown) => {
            if (column === 'id') {
              state.id = String(value ?? '');
            }
            return chain;
          }),
          maybeSingle: vi.fn(async () => {
            const found = notificationRows.find((row) => String(row.id) === state.id) ?? null;
            return { data: found ? { payload: found.payload } : null, error: null };
          }),
        };
        return chain;
      }

      throw new Error(`Unexpected notifications select columns: ${columns}`);
    }),
    insert: vi.fn((row: any) => {
      writes.push({ table: 'notifications', op: 'insert' });
      const inserted = {
        id: `notif-${notificationRows.length + 1}`,
        ...row,
      };
      notificationRows.unshift(inserted);
      return {
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: { id: inserted.id }, error: null })),
        })),
      };
    }),
    update: vi.fn((patch: Record<string, unknown>) => {
      writes.push({ table: 'notifications', op: 'update', patch });
      const state = {
        id: '',
      };
      const chain: any = {
        eq: vi.fn(async (column: string, value: unknown) => {
          if (column === 'id') {
            state.id = String(value ?? '');
            const idx = notificationRows.findIndex((row) => String(row.id) === state.id);
            if (idx >= 0) {
              notificationRows[idx] = { ...notificationRows[idx], ...patch };
            }
          }
          return { error: null };
        }),
      };
      return chain;
    }),
  };

  const jobsApi = {
    select: vi.fn(() => {
      const chain: any = {
        eq: vi.fn(() => chain),
        single: vi.fn(async () => ({
          data: {
            id: 'job-1',
            title: 'Spring tune-up',
            job_type: 'service',
            status: 'completed',
            field_complete: true,
            ops_status: 'incomplete',
            invoice_complete: false,
            invoice_number: 'INV-1',
            customer_id: 'cust-1',
            contractor_id: null,
            location_id: 'loc-1',
            service_case_id: null,
            billing_recipient: 'customer',
            customer_first_name: 'Alex',
            customer_last_name: 'Tenant',
            billing_name: 'Alex Tenant',
            billing_email: 'billing@example.com',
            billing_phone: '2095551212',
            billing_address_line1: '123 Main',
            billing_address_line2: null,
            billing_city: 'Stockton',
            billing_state: 'CA',
            billing_zip: '95212',
          },
          error: null,
        })),
      };
      return chain;
    }),
  };

  const locationsApi = {
    select: vi.fn(() => {
      const chain: any = {
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => ({
          data: {
            address_line1: '123 Main',
            address_line2: null,
            city: 'Stockton',
            state: 'CA',
            zip: '95212',
            postal_code: null,
          },
          error: null,
        })),
      };
      return chain;
    }),
  };

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'jobs') return jobsApi;
      if (table === 'notifications') return notificationsApi;
      if (table === 'locations') return locationsApi;
      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { supabase, writes, notificationRows };
}

function buildInvoice(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'inv-1',
    account_owner_user_id: 'owner-1',
    job_id: 'job-1',
    invoice_display_number: '2001',
    invoice_number: 'INV-1',
    status: 'issued',
    total_cents: 9900,
    invoice_date: '2026-05-20',
    billing_name: 'Alex Tenant',
    billing_email: 'billing@example.com',
    notes: null,
    line_items: [
      {
        id: 'line-1',
        item_name_snapshot: 'Tune-up',
        description_snapshot: 'Seasonal maintenance',
        quantity: '1.00',
        unit_price: '99.00',
        line_subtotal: '99.00',
      },
    ],
    ...overrides,
  };
}

describe('sendInternalInvoiceEmailFromForm payment link behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    createAdminClientMock.mockReturnValue({});
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
    resolveInternalInvoiceByJobIdMock.mockResolvedValue(buildInvoice());
    resolveInternalInvoiceByIdMock.mockResolvedValue(buildInvoice());
    resolveOperationalTenantIdentityMock.mockResolvedValue({
      displayName: 'Compliance Matters',
      logoUrl: null,
      supportEmail: 'support@cm.example',
      supportPhone: '2095550000',
    });
    resolveNotificationAccountOwnerUserIdMock.mockResolvedValue('owner-1');
    sendEmailMock.mockResolvedValue(undefined);
    insertJobEventMock.mockResolvedValue(undefined);
    createTenantInvoiceCheckoutSessionMock.mockResolvedValue({
      checkoutSessionId: 'cs_test_123',
      checkoutSessionUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
      connectedAccountId: 'acct_123',
      balanceDueCents: 9900,
    });
  });

  it('includes pay invoice link when checkout session is eligible', async () => {
    const fixture = makeSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);

    const { sendInternalInvoiceEmailFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(sendInternalInvoiceEmailFromForm(buildFormData())).rejects.toThrow(
      'banner=internal_invoice_email_sent',
    );

    expect(createTenantInvoiceCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountOwnerUserId: 'owner-1',
        jobId: 'job-1',
        invoiceId: 'inv-1',
      }),
    );
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('Invoice #2001'),
      }),
    );
    const firstEmailPayload = sendEmailMock.mock.calls[0]?.[0] as { html?: string; text?: string } | undefined;
    expect(firstEmailPayload?.html).toContain('Pay Invoice');
    expect(firstEmailPayload?.html).toContain('Legacy ref: INV-1');
    expect(firstEmailPayload?.text).toContain('Pay Invoice:');
    expect(firstEmailPayload?.text).toContain('Invoice: Invoice #2001');
    expect(firstEmailPayload?.text).toContain('Legacy ref: INV-1');
    expect(
      fixture.writes.some((write) => write.table === 'internal_invoice_payments'),
    ).toBe(false);
    expect(
      fixture.writes.some((write) => write.table === 'internal_invoices'),
    ).toBe(false);
  });

  it('sends without payment link when checkout helper reports zero balance', async () => {
    const fixture = makeSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);
    createTenantInvoiceCheckoutSessionMock.mockRejectedValueOnce(
      new Error('Invoice balance must be greater than zero'),
    );

    const { sendInternalInvoiceEmailFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(sendInternalInvoiceEmailFromForm(buildFormData())).rejects.toThrow(
      'banner=internal_invoice_email_sent',
    );

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('Invoice #2001'),
        html: expect.not.stringContaining('Pay Invoice'),
        text: expect.not.stringContaining('Pay Invoice:'),
      }),
    );
  });

  it('falls back to stable invoice id reference when display number is missing', async () => {
    const fixture = makeSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);
    const legacyInvoice = buildInvoice({ invoice_display_number: null, invoice_number: 'INV-LEGACY-77' });
    resolveInternalInvoiceByJobIdMock.mockResolvedValue(legacyInvoice);
    resolveInternalInvoiceByIdMock.mockResolvedValue(legacyInvoice);

    const { sendInternalInvoiceEmailFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(sendInternalInvoiceEmailFromForm(buildFormData())).rejects.toThrow(
      'banner=internal_invoice_email_sent',
    );

    expect(resolveInternalInvoiceByJobIdMock).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-1',
      }),
    );
    expect(resolveInternalInvoiceByIdMock).not.toHaveBeenCalled();
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('Invoice inv-1'),
      }),
    );
    const fallbackEmailPayload = sendEmailMock.mock.calls[0]?.[0] as { html?: string; text?: string } | undefined;
    expect(fallbackEmailPayload?.html).toContain('Invoice inv-1');
    expect(fallbackEmailPayload?.html).not.toContain('Legacy ref:');
    expect(fallbackEmailPayload?.text).toContain('Invoice: Invoice inv-1');
    expect(fallbackEmailPayload?.text).not.toContain('Legacy ref:');
  });

  it('sends without payment link when connect readiness is not ready', async () => {
    const fixture = makeSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);
    createTenantInvoiceCheckoutSessionMock.mockRejectedValueOnce(
      new Error('Tenant Stripe Connect account is not ready for checkout session creation.'),
    );

    const { sendInternalInvoiceEmailFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(sendInternalInvoiceEmailFromForm(buildFormData())).rejects.toThrow(
      'banner=internal_invoice_email_sent',
    );

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.not.stringContaining('Pay Invoice'),
      }),
    );
  });

  it('returns to invoice report with sent banner and records sent communication history', async () => {
    const fixture = makeSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);

    const { sendInternalInvoiceEmailFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(
      sendInternalInvoiceEmailFromForm(
        buildFormData({
          invoice_id: 'inv-1',
          return_to: '/reports/invoices?status=issued&communication_state=none',
        }),
      ),
    ).rejects.toThrow('/reports/invoices?status=issued&communication_state=none&banner=internal_invoice_email_sent');

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(fixture.notificationRows).toHaveLength(1);
    expect(fixture.notificationRows[0]?.status).toBe('sent');
    expect(fixture.notificationRows[0]?.sent_at).toEqual(expect.any(String));
    expect(fixture.notificationRows[0]?.payload).toEqual(
      expect.objectContaining({
        invoice_id: 'inv-1',
        recipient_email: 'billing@example.com',
        attempt_kind: 'sent',
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith('/reports/invoices');
  });

  it('provider failure returns visible failure and does not create false sent history', async () => {
    const fixture = makeSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);
    sendEmailMock.mockRejectedValueOnce(new Error('Resend API key is not configured'));

    const { sendInternalInvoiceEmailFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(
      sendInternalInvoiceEmailFromForm(
        buildFormData({
          invoice_id: 'inv-1',
          return_to: '/reports/invoices',
        }),
      ),
    ).rejects.toThrow('/reports/invoices?banner=internal_invoice_email_failed');

    expect(fixture.notificationRows).toHaveLength(1);
    expect(fixture.notificationRows[0]?.status).toBe('failed');
    expect(fixture.notificationRows[0]?.sent_at).toBeNull();
    expect(fixture.notificationRows[0]?.payload).toEqual(
      expect.objectContaining({
        invoice_id: 'inv-1',
        error_detail: 'Resend API key is not configured',
      }),
    );
  });

  it('does not attempt checkout session creation for draft invoices', async () => {
    const fixture = makeSupabaseFixture();
    createClientMock.mockResolvedValue(fixture.supabase);
    resolveInternalInvoiceByJobIdMock.mockResolvedValueOnce(buildInvoice({ status: 'draft' }));

    const { sendInternalInvoiceEmailFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(sendInternalInvoiceEmailFromForm(buildFormData())).rejects.toThrow(
      'banner=internal_invoice_send_requires_issued',
    );

    expect(createTenantInvoiceCheckoutSessionMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
