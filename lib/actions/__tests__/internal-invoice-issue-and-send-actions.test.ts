import { beforeEach, describe, expect, it, vi } from 'vitest';

// Slice B: coverage for the compound issueAndSendInternalInvoiceFromForm action.
// Verifies the orchestration and readiness gating: all-green issues + sends,
// a failed readiness check mutates nothing, and a missing recipient email does
// not issue (the send must be able to succeed before we issue).

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveBillingModeByAccountOwnerIdMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const resolveInternalInvoiceByJobIdMock = vi.fn();
const resolveInternalInvoiceByIdMock = vi.fn();
const resolveOperationalTenantIdentityMock = vi.fn();
const sendEmailMock = vi.fn();
const createTenantInvoicePaymentLinkMock = vi.fn();
const buildInternalInvoicePdfAttachmentMock = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: vi.fn(() => ({ from: vi.fn() })),
}));

vi.mock('@/lib/auth/internal-user', () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  isInternalAccessError: () => false,
}));

vi.mock('@/lib/auth/internal-job-scope', () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) =>
    loadScopedInternalJobForMutationMock(...args),
}));

vi.mock('@/lib/business/internal-business-profile', () => ({
  resolveBillingModeByAccountOwnerId: (...args: unknown[]) =>
    resolveBillingModeByAccountOwnerIdMock(...args),
  resolveInternalBusinessIdentityByAccountOwnerId: vi.fn(async () => ({
    display_name: 'Compliance Matters',
    support_email: null,
    support_phone: null,
  })),
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

vi.mock('@/lib/pdf/internal-invoice-pdf', () => ({
  buildInternalInvoicePdfAttachment: (...args: unknown[]) => buildInternalInvoicePdfAttachmentMock(...args),
}));

vi.mock('@/lib/notifications/account-owner', () => ({
  resolveNotificationAccountOwnerUserId: vi.fn(async () => 'owner-1'),
}));

vi.mock('@/lib/business/internal-invoice-payments', () => ({
  createTenantInvoicePaymentLink: (...args: unknown[]) => createTenantInvoicePaymentLinkMock(...args),
  resolveInvoiceCollectedPaymentLedger: vi.fn(async () => ({
    rows: [],
    summary: {
      invoiceId: 'inv-1',
      invoiceTotalCents: 25000,
      amountPaidCents: 0,
      balanceDueCents: 25000,
      paymentStatus: 'unpaid',
    },
  })),
}));

vi.mock('@/lib/actions/job-actions', () => ({
  insertJobEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/actions/job-evaluator', () => ({
  evaluateJobOpsStatus: vi.fn(async () => undefined),
  healStalePaperworkOpsStatus: vi.fn(async () => undefined),
}));

vi.mock('@/lib/actions/service-case-reconciliation', () => ({
  reconcileServiceCaseStatusAfterJobChange: vi.fn(async () => undefined),
}));

function buildJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    title: 'Service Visit',
    job_type: 'service',
    status: 'completed',
    field_complete: true,
    ops_status: 'invoice_required',
    invoice_complete: false,
    invoice_number: null,
    customer_id: 'customer-1',
    contractor_id: 'contractor-1',
    location_id: 'location-1',
    service_case_id: 'case-1',
    billing_recipient: 'customer',
    customer_first_name: 'Alex',
    customer_last_name: 'Tenant',
    billing_name: 'Alex Tenant',
    billing_email: 'billing@example.com',
    ...overrides,
  };
}

function buildDraftInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    account_owner_user_id: 'owner-1',
    job_id: 'job-1',
    invoice_display_number: '2001',
    invoice_number: 'INV-1',
    status: 'draft',
    total_cents: 9900,
    billing_name: 'Alex Tenant',
    billing_email: 'billing@example.com',
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

function makeSupabaseFixture(job: Record<string, unknown>) {
  const internalInvoiceUpdates: Array<Record<string, unknown>> = [];
  const notificationInserts: Array<Record<string, unknown>> = [];

  // Universal read chain: every terminal (single/maybeSingle/order) exists and
  // eq()/neq() are self-referential, so any eq-count query resolves.
  const readChain = (data: unknown) => {
    const chain: any = {
      eq: () => chain,
      neq: () => chain,
      order: async () => ({ data: Array.isArray(data) ? data : [], error: null }),
      single: async () => ({ data, error: null }),
      maybeSingle: async () => ({ data, error: null }),
    };
    return chain;
  };

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'jobs') {
        return {
          select: () => readChain(job),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }

      if (table === 'internal_invoices') {
        return {
          select: () => readChain(null),
          update: (patch: Record<string, unknown>) => {
            internalInvoiceUpdates.push(patch);
            const updateChain: any = { eq: () => updateChain };
            // The issue mutation awaits after `.eq('id').eq('status','draft')`.
            updateChain.then = (resolve: (value: { error: null }) => void) => resolve({ error: null });
            return updateChain;
          },
        };
      }

      if (table === 'notifications') {
        return {
          select: () => readChain([]),
          insert: (row: Record<string, unknown>) => {
            notificationInserts.push(row);
            return {
              select: () => ({
                single: async () => ({ data: { id: 'notif-1' }, error: null }),
              }),
            };
          },
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }

      // Any other table (locations, customers, contractors, ...) reads as empty.
      return {
        select: () => readChain(null),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    }),
  };

  return { supabase, internalInvoiceUpdates, notificationInserts };
}

function buildFormData(overrides: Partial<Record<string, string>> = {}) {
  const formData = new FormData();
  formData.set('job_id', 'job-1');
  formData.set('invoice_id', 'inv-1');
  formData.set('tab', 'info');
  formData.set('return_to', '/jobs/job-1/invoice?mobileLayout=v2#invoice-workspace');
  formData.set('recipient_email', 'billing@example.com');

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      formData.delete(key);
    } else {
      formData.set(key, value);
    }
  }

  return formData;
}

describe('issueAndSendInternalInvoiceFromForm', () => {
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
    resolveOperationalTenantIdentityMock.mockResolvedValue({
      displayName: 'Compliance Matters',
      logoUrl: null,
      supportEmail: 'support@cm.example',
      supportPhone: '2095550000',
    });
    sendEmailMock.mockResolvedValue(undefined);
    buildInternalInvoicePdfAttachmentMock.mockResolvedValue({
      filename: 'Invoice-INV-1.pdf',
      contentType: 'application/pdf',
      content: Buffer.from('%PDF-test'),
    });
    createTenantInvoicePaymentLinkMock.mockResolvedValue({
      paymentLinkUrl: 'https://app.example/pay/token',
      balanceDueCents: 9900,
    });
  });

  it('issues and sends the invoice in one action when all readiness checks pass and an email is present', async () => {
    const invoice = buildDraftInvoice();
    resolveInternalInvoiceByIdMock.mockResolvedValue(invoice);
    resolveInternalInvoiceByJobIdMock.mockResolvedValue(invoice);
    const fixture = makeSupabaseFixture(buildJob());
    createClientMock.mockResolvedValue(fixture.supabase);

    const { issueAndSendInternalInvoiceFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(issueAndSendInternalInvoiceFromForm(buildFormData())).rejects.toThrow(
      'banner=internal_invoice_issued_and_sent',
    );

    // Issued: the internal_invoices row was flipped to issued.
    expect(fixture.internalInvoiceUpdates.some((patch) => patch.status === 'issued')).toBe(true);
    // Sent: the email delivery ran.
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'billing@example.com',
        attachments: [{
          filename: 'Invoice-INV-1.pdf',
          contentType: 'application/pdf',
          content: Buffer.from('%PDF-test'),
        }],
      }),
    );
    expect(fixture.notificationInserts.length).toBeGreaterThan(0);
  });

  it('mutates nothing and returns a readiness error when a check is not green (zero total)', async () => {
    const invoice = buildDraftInvoice({ total_cents: 0 });
    resolveInternalInvoiceByIdMock.mockResolvedValue(invoice);
    resolveInternalInvoiceByJobIdMock.mockResolvedValue(invoice);
    const fixture = makeSupabaseFixture(buildJob());
    createClientMock.mockResolvedValue(fixture.supabase);

    const { issueAndSendInternalInvoiceFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(issueAndSendInternalInvoiceFromForm(buildFormData())).rejects.toThrow(
      'banner=internal_invoice_issue_incomplete',
    );

    expect(fixture.internalInvoiceUpdates).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('does not issue when the recipient email is absent (send must be able to succeed first)', async () => {
    const invoice = buildDraftInvoice({ billing_email: null });
    resolveInternalInvoiceByIdMock.mockResolvedValue(invoice);
    resolveInternalInvoiceByJobIdMock.mockResolvedValue(invoice);
    const fixture = makeSupabaseFixture(buildJob({ billing_email: null }));
    createClientMock.mockResolvedValue(fixture.supabase);

    const { issueAndSendInternalInvoiceFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(
      issueAndSendInternalInvoiceFromForm(buildFormData({ recipient_email: undefined })),
    ).rejects.toThrow('banner=internal_invoice_send_recipient_required');

    expect(fixture.internalInvoiceUpdates).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
