import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveBillingModeByAccountOwnerIdMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
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
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/auth/internal-user', () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

vi.mock('@/lib/auth/internal-job-scope', () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) => loadScopedInternalJobForMutationMock(...args),
}));

vi.mock('@/lib/business/internal-business-profile', () => ({
  resolveBillingModeByAccountOwnerId: (...args: unknown[]) =>
    resolveBillingModeByAccountOwnerIdMock(...args),
}));

vi.mock('@/lib/business/platform-entitlement', () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock('@/lib/actions/job-actions', () => ({
  insertJobEvent: (...args: unknown[]) => insertJobEventMock(...args),
}));

type WriteCall = {
  table: string;
  op: 'insert' | 'update' | 'delete';
  payload: unknown;
};

function makeSupabaseFixture(params?: {
  parentInvoices?: Array<Record<string, unknown>>;
  insertResult?: Record<string, unknown>;
}) {
  const parentInvoices = params?.parentInvoices ?? [];
  const insertResult =
    params?.insertResult ??
    {
      id: 'inv-supp-new',
      invoice_number: 'INV-20260605-AAAAAA01',
      invoice_display_number: 'I-2002',
      status: 'draft',
      total_cents: 0,
    };

  const writes: WriteCall[] = [];

  const supabase = {
    from(table: string) {
      if (table === 'internal_invoices') {
        const eqFilters: Record<string, unknown> = {};
        const neqFilters: Record<string, unknown> = {};

        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn((column: string, value: unknown) => {
            eqFilters[column] = value;
            return query;
          }),
          neq: vi.fn((column: string, value: unknown) => {
            neqFilters[column] = value;
            return query;
          }),
          maybeSingle: vi.fn(async () => ({
            data:
              parentInvoices.find((row) => {
                const eqOk = Object.entries(eqFilters).every(([column, value]) => row[column] === value);
                const neqOk = Object.entries(neqFilters).every(([column, value]) => row[column] !== value);
                return eqOk && neqOk;
              }) ?? null,
            error: null,
          })),
          insert: vi.fn((payload: unknown) => {
            writes.push({ table, op: 'insert', payload });
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: insertResult, error: null })),
              })),
            };
          }),
          update: vi.fn((payload: unknown) => {
            writes.push({ table, op: 'update', payload });
            return query;
          }),
          delete: vi.fn((payload: unknown) => {
            writes.push({ table, op: 'delete', payload });
            return query;
          }),
        };

        return query;
      }

      if (table === 'jobs') {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          single: vi.fn(async () => ({
            data: {
              id: 'job-1',
              title: 'Main Visit',
              customer_id: 'cust-1',
              location_id: 'loc-1',
              service_case_id: 'svc-1',
            },
            error: null,
          })),
        };

        return query;
      }

      const fallback: any = {
        select: vi.fn(() => fallback),
        eq: vi.fn(() => fallback),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        single: vi.fn(async () => ({ data: null, error: null })),
        insert: vi.fn((payload: unknown) => {
          writes.push({ table, op: 'insert', payload });
          return {
            select: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: null })) })),
          };
        }),
        update: vi.fn((payload: unknown) => {
          writes.push({ table, op: 'update', payload });
          return fallback;
        }),
        delete: vi.fn((payload: unknown) => {
          writes.push({ table, op: 'delete', payload });
          return fallback;
        }),
      };

      return fallback;
    },
  };

  return { supabase, writes };
}

function buildParentInvoice(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'inv-primary-1',
    account_owner_user_id: 'owner-1',
    job_id: 'job-1',
    customer_id: 'cust-1',
    location_id: 'loc-1',
    service_case_id: 'svc-1',
    invoice_kind: 'primary',
    original_internal_invoice_id: null,
    supplemental_reason: null,
    invoice_number: 'INV-PRIMARY-1',
    status: 'issued',
    source_type: 'job',
    total_cents: 12000,
    billing_name: 'Customer One',
    billing_email: 'billing@example.com',
    billing_phone: '555-0101',
    billing_address_line1: '100 Main St',
    billing_address_line2: null,
    billing_city: 'Austin',
    billing_state: 'TX',
    billing_zip: '78701',
    ...overrides,
  };
}

function buildFormData(overrides?: Partial<Record<string, string>>) {
  const formData = new FormData();
  formData.set('job_id', 'job-1');
  formData.set('original_internal_invoice_id', 'inv-primary-1');
  formData.set('supplemental_reason', 'forgotten_charge');
  formData.set('tab', 'info');
  formData.set('return_to', '/jobs/job-1/invoice#invoice-workspace');

  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (typeof value === 'string') {
      formData.set(key, value);
    }
  }

  return formData;
}

describe('createSupplementalInternalInvoiceFromForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      userId: 'admin-1',
      internalUser: {
        user_id: 'admin-1',
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
    insertJobEventMock.mockResolvedValue(undefined);
  });

  it('creates a supplemental draft from an issued primary invoice and preserves parent linkage and context', async () => {
    const fixture = makeSupabaseFixture({
      parentInvoices: [buildParentInvoice({ status: 'issued' })],
    });
    createClientMock.mockResolvedValue(fixture.supabase);

    const { createSupplementalInternalInvoiceFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(createSupplementalInternalInvoiceFromForm(buildFormData())).rejects.toThrow(
      'REDIRECT:/jobs/job-1/invoice?banner=internal_invoice_supplemental_draft_created&supplemental_invoice_id=inv-supp-new#invoice-workspace',
    );

    const invoiceInsert = fixture.writes.find((write) => write.table === 'internal_invoices' && write.op === 'insert');
    expect(invoiceInsert).toBeDefined();
    expect(invoiceInsert?.payload).toMatchObject({
      invoice_kind: 'supplemental',
      original_internal_invoice_id: 'inv-primary-1',
      status: 'draft',
      total_cents: 0,
      subtotal_cents: 0,
      job_id: 'job-1',
      customer_id: 'cust-1',
      service_case_id: 'svc-1',
      location_id: 'loc-1',
      supplemental_reason: 'forgotten_charge',
    });

    expect(fixture.writes.some((write) => write.table === 'internal_invoice_line_items')).toBe(false);
    expect(fixture.writes.some((write) => write.table === 'internal_invoice_payments')).toBe(false);
    expect(fixture.writes.some((write) => write.table === 'internal_invoices' && write.op === 'update')).toBe(false);
  });

  it('creates a supplemental draft from a paid-equivalent primary invoice state', async () => {
    const fixture = makeSupabaseFixture({
      parentInvoices: [buildParentInvoice({ status: 'paid' })],
    });
    createClientMock.mockResolvedValue(fixture.supabase);

    const { createSupplementalInternalInvoiceFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(createSupplementalInternalInvoiceFromForm(buildFormData())).rejects.toThrow(
      'REDIRECT:/jobs/job-1/invoice?banner=internal_invoice_supplemental_draft_created&supplemental_invoice_id=inv-supp-new#invoice-workspace',
    );

    expect(fixture.writes.filter((write) => write.table === 'internal_invoices' && write.op === 'insert')).toHaveLength(1);
  });

  it('rejects a draft parent invoice', async () => {
    const fixture = makeSupabaseFixture({
      parentInvoices: [buildParentInvoice({ status: 'draft' })],
    });
    createClientMock.mockResolvedValue(fixture.supabase);

    const { createSupplementalInternalInvoiceFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(createSupplementalInternalInvoiceFromForm(buildFormData())).rejects.toThrow(
      'banner=internal_invoice_supplemental_parent_invalid_state',
    );

    expect(fixture.writes.filter((write) => write.table === 'internal_invoices' && write.op === 'insert')).toHaveLength(0);
  });

  it('rejects a voided parent invoice', async () => {
    const fixture = makeSupabaseFixture({
      parentInvoices: [buildParentInvoice({ status: 'void' })],
    });
    createClientMock.mockResolvedValue(fixture.supabase);

    const { createSupplementalInternalInvoiceFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(createSupplementalInternalInvoiceFromForm(buildFormData())).rejects.toThrow(
      'banner=internal_invoice_supplemental_parent_invalid_state',
    );

    expect(fixture.writes.filter((write) => write.table === 'internal_invoices' && write.op === 'insert')).toHaveLength(0);
  });

  it('rejects supplemental invoice as parent', async () => {
    const fixture = makeSupabaseFixture({
      parentInvoices: [buildParentInvoice({ invoice_kind: 'supplemental', original_internal_invoice_id: 'inv-root' })],
    });
    createClientMock.mockResolvedValue(fixture.supabase);

    const { createSupplementalInternalInvoiceFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(createSupplementalInternalInvoiceFromForm(buildFormData())).rejects.toThrow(
      'banner=internal_invoice_supplemental_parent_invalid',
    );

    expect(fixture.writes.filter((write) => write.table === 'internal_invoices' && write.op === 'insert')).toHaveLength(0);
  });

  it('rejects cross-account scoped access', async () => {
    const fixture = makeSupabaseFixture({
      parentInvoices: [buildParentInvoice()],
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValueOnce(null);

    const { createSupplementalInternalInvoiceFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(createSupplementalInternalInvoiceFromForm(buildFormData())).rejects.toThrow('banner=not_authorized');

    expect(fixture.writes.filter((write) => write.table === 'internal_invoices' && write.op === 'insert')).toHaveLength(0);
  });

  it('requires invoice lifecycle authority', async () => {
    const fixture = makeSupabaseFixture({
      parentInvoices: [buildParentInvoice()],
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    requireInternalUserMock.mockResolvedValueOnce({
      userId: 'office-1',
      internalUser: {
        user_id: 'office-1',
        role: 'office',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    const { createSupplementalInternalInvoiceFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(createSupplementalInternalInvoiceFromForm(buildFormData())).rejects.toThrow('banner=not_authorized');

    expect(fixture.writes.filter((write) => write.table === 'internal_invoices' && write.op === 'insert')).toHaveLength(0);
  });
});
