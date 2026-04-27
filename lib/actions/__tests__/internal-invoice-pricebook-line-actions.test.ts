import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveBillingModeByAccountOwnerIdMock = vi.fn();
const resolveInternalInvoiceByJobIdMock = vi.fn();
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
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    })),
  })),
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
  resolveInternalBusinessIdentityByAccountOwnerId: vi.fn(async () => ({
    display_name: 'Compliance Matters',
    support_email: null,
    support_phone: null,
  })),
}));

vi.mock('@/lib/business/internal-invoice', async () => {
  const actual = await vi.importActual<typeof import('@/lib/business/internal-invoice')>('@/lib/business/internal-invoice');
  return {
    ...actual,
    resolveInternalInvoiceByJobId: (...args: unknown[]) => resolveInternalInvoiceByJobIdMock(...args),
  };
});

vi.mock('@/lib/actions/job-evaluator', () => ({
  evaluateJobOpsStatus: vi.fn(async () => undefined),
  healStalePaperworkOpsStatus: vi.fn(async () => undefined),
}));

vi.mock('@/lib/actions/job-actions', () => ({
  insertJobEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/email/sendEmail', () => ({
  sendEmail: vi.fn(async () => undefined),
}));

vi.mock('@/lib/notifications/account-owner', () => ({
  resolveNotificationAccountOwnerUserId: vi.fn(async () => 'owner-1'),
}));

type SupabaseFixtureParams = {
  pricebookItem?: Record<string, unknown> | null;
};

function makeSupabaseFixture(params: SupabaseFixtureParams = {}) {
  const insertedLineItems: Array<Record<string, unknown>> = [];
  const invoiceUpdates: Array<Record<string, unknown>> = [];
  const pricebookItem = params.pricebookItem;

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'jobs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: 'job-1',
                  title: 'Job 1',
                  job_type: 'service',
                  status: 'completed',
                  field_complete: true,
                  ops_status: 'invoice_required',
                },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === 'pricebook_items') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: pricebookItem ?? null,
                  error: null,
                })),
              })),
            })),
          })),
        };
      }

      if (table === 'internal_invoice_line_items') {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            insertedLineItems.push(payload);
            return Promise.resolve({ error: null });
          }),
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: insertedLineItems.map((lineItem) => ({
                line_subtotal: lineItem.line_subtotal,
              })),
              error: null,
            })),
          })),
        };
      }

      if (table === 'internal_invoices') {
        return {
          update: vi.fn((payload: Record<string, unknown>) => {
            invoiceUpdates.push(payload);
            return {
              eq: vi.fn(async () => ({ error: null })),
            };
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { supabase, insertedLineItems, invoiceUpdates };
}

function draftInvoice(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'inv-1',
    account_owner_user_id: 'owner-1',
    job_id: 'job-1',
    invoice_number: 'INV-1',
    status: 'draft',
    total_cents: 0,
    line_items: [],
    ...overrides,
  };
}

function manualLineFormData(overrides: Partial<Record<string, string>> = {}) {
  const formData = new FormData();
  formData.set('job_id', 'job-1');
  formData.set('tab', 'info');
  formData.set('item_name_snapshot', 'Manual Service Line');
  formData.set('item_type_snapshot', 'service');
  formData.set('description_snapshot', 'Manual description');
  formData.set('quantity', '2.00');
  formData.set('unit_price', '50.00');

  for (const [key, value] of Object.entries(overrides)) {
    if (value != null) formData.set(key, value);
  }

  return formData;
}

function pricebookLineFormData(overrides: Partial<Record<string, string>> = {}) {
  const formData = new FormData();
  formData.set('job_id', 'job-1');
  formData.set('tab', 'info');
  formData.set('pricebook_item_id', 'pb-1');
  formData.set('quantity', '2.00');

  for (const [key, value] of Object.entries(overrides)) {
    if (value != null) formData.set(key, value);
  }

  return formData;
}

describe('internal invoice line item pricebook plumbing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      userId: 'internal-user-1',
      internalUser: {
        user_id: 'internal-user-1',
        role: 'office',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: 'job-1' });
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValue('internal_invoicing');
    resolveInternalInvoiceByJobIdMock.mockResolvedValue(draftInvoice());
  });

  it('manual add path still works and writes source_kind manual for new rows', async () => {
    const { supabase, insertedLineItems, invoiceUpdates } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);

    const { addInternalInvoiceLineItemFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(addInternalInvoiceLineItemFromForm(manualLineFormData())).rejects.toThrow(
      'banner=internal_invoice_line_item_added',
    );

    expect(insertedLineItems).toHaveLength(1);
    expect(insertedLineItems[0].source_kind).toBe('manual');
    expect(insertedLineItems[0].item_name_snapshot).toBe('Manual Service Line');
    expect(insertedLineItems[0].line_subtotal).toBe('100.00');
    expect(invoiceUpdates).toHaveLength(1);
    expect(invoiceUpdates[0].subtotal_cents).toBe(10000);
    expect(invoiceUpdates[0].total_cents).toBe(10000);
  });

  it('adds a pricebook-backed draft line with frozen snapshot and provenance fields', async () => {
    const pricebookItem = {
      id: 'pb-1',
      account_owner_user_id: 'owner-1',
      item_name: 'Compressor Replacement',
      item_type: 'service',
      category: 'HVAC - Repair',
      default_description: 'Replace failed compressor',
      default_unit_price: 125.5,
      unit_label: 'each',
      is_active: true,
    };

    const { supabase, insertedLineItems, invoiceUpdates } = makeSupabaseFixture({ pricebookItem });
    createClientMock.mockResolvedValue(supabase);

    const { addInternalInvoiceLineItemFromPricebookForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(addInternalInvoiceLineItemFromPricebookForm(pricebookLineFormData())).rejects.toThrow(
      'banner=internal_invoice_pricebook_line_item_added',
    );

    expect(insertedLineItems).toHaveLength(1);
    expect(insertedLineItems[0]).toEqual(
      expect.objectContaining({
        source_kind: 'pricebook',
        source_pricebook_item_id: 'pb-1',
        item_name_snapshot: 'Compressor Replacement',
        description_snapshot: 'Replace failed compressor',
        item_type_snapshot: 'service',
        category_snapshot: 'HVAC - Repair',
        unit_label_snapshot: 'each',
        quantity: '2.00',
        unit_price: '125.50',
        line_subtotal: '251.00',
      }),
    );

    expect(invoiceUpdates).toHaveLength(1);
    expect(invoiceUpdates[0].subtotal_cents).toBe(25100);
    expect(invoiceUpdates[0].total_cents).toBe(25100);
  });

  it('denies cross-account or missing scoped pricebook item', async () => {
    const { supabase, insertedLineItems } = makeSupabaseFixture({ pricebookItem: null });
    createClientMock.mockResolvedValue(supabase);

    const { addInternalInvoiceLineItemFromPricebookForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(addInternalInvoiceLineItemFromPricebookForm(pricebookLineFormData())).rejects.toThrow(
      'banner=internal_invoice_pricebook_item_not_found',
    );

    expect(insertedLineItems).toHaveLength(0);
  });

  it('denies issued invoice for pricebook-backed line insert', async () => {
    const pricebookItem = {
      id: 'pb-1',
      account_owner_user_id: 'owner-1',
      item_name: 'Compressor Replacement',
      item_type: 'service',
      category: 'HVAC - Repair',
      default_description: 'Replace failed compressor',
      default_unit_price: 125.5,
      unit_label: 'each',
      is_active: true,
    };

    const { supabase } = makeSupabaseFixture({ pricebookItem });
    createClientMock.mockResolvedValue(supabase);
    resolveInternalInvoiceByJobIdMock.mockResolvedValueOnce(draftInvoice({ status: 'issued' }));

    const { addInternalInvoiceLineItemFromPricebookForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(addInternalInvoiceLineItemFromPricebookForm(pricebookLineFormData())).rejects.toThrow(
      'banner=internal_invoice_line_items_locked',
    );
  });

  it('denies void invoice for pricebook-backed line insert', async () => {
    const pricebookItem = {
      id: 'pb-1',
      account_owner_user_id: 'owner-1',
      item_name: 'Compressor Replacement',
      item_type: 'service',
      category: 'HVAC - Repair',
      default_description: 'Replace failed compressor',
      default_unit_price: 125.5,
      unit_label: 'each',
      is_active: true,
    };

    const { supabase } = makeSupabaseFixture({ pricebookItem });
    createClientMock.mockResolvedValue(supabase);
    resolveInternalInvoiceByJobIdMock.mockResolvedValueOnce(draftInvoice({ status: 'void' }));

    const { addInternalInvoiceLineItemFromPricebookForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(addInternalInvoiceLineItemFromPricebookForm(pricebookLineFormData())).rejects.toThrow(
      'banner=internal_invoice_line_items_locked',
    );
  });

  it('denies inactive pricebook item', async () => {
    const pricebookItem = {
      id: 'pb-1',
      account_owner_user_id: 'owner-1',
      item_name: 'Inactive Item',
      item_type: 'service',
      category: 'HVAC - Repair',
      default_description: 'Inactive',
      default_unit_price: 99,
      unit_label: 'each',
      is_active: false,
    };

    const { supabase, insertedLineItems } = makeSupabaseFixture({ pricebookItem });
    createClientMock.mockResolvedValue(supabase);

    const { addInternalInvoiceLineItemFromPricebookForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(addInternalInvoiceLineItemFromPricebookForm(pricebookLineFormData())).rejects.toThrow(
      'banner=internal_invoice_pricebook_item_inactive',
    );

    expect(insertedLineItems).toHaveLength(0);
  });

  it('denies negative pricebook default unit price (deferred adjustment-credit policy)', async () => {
    const pricebookItem = {
      id: 'pb-1',
      account_owner_user_id: 'owner-1',
      item_name: 'Credit Item',
      item_type: 'adjustment',
      category: 'Adjustments',
      default_description: 'Deferred credit policy',
      default_unit_price: -10,
      unit_label: 'each',
      is_active: true,
    };

    const { supabase, insertedLineItems } = makeSupabaseFixture({ pricebookItem });
    createClientMock.mockResolvedValue(supabase);

    const { addInternalInvoiceLineItemFromPricebookForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(addInternalInvoiceLineItemFromPricebookForm(pricebookLineFormData())).rejects.toThrow(
      'banner=internal_invoice_pricebook_negative_price_deferred',
    );

    expect(insertedLineItems).toHaveLength(0);
  });

  it('denies adjustment pricebook item even when unit price is nonnegative', async () => {
    const pricebookItem = {
      id: 'pb-1',
      account_owner_user_id: 'owner-1',
      item_name: 'Adjustment Placeholder',
      item_type: 'adjustment',
      category: 'Adjustments',
      default_description: 'Adjustment behavior deferred',
      default_unit_price: 0,
      unit_label: 'flat',
      is_active: true,
    };

    const { supabase, insertedLineItems } = makeSupabaseFixture({ pricebookItem });
    createClientMock.mockResolvedValue(supabase);

    const { addInternalInvoiceLineItemFromPricebookForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(addInternalInvoiceLineItemFromPricebookForm(pricebookLineFormData())).rejects.toThrow(
      'banner=internal_invoice_pricebook_negative_price_deferred',
    );

    expect(insertedLineItems).toHaveLength(0);
  });

  it('keeps frozen inserted snapshot unchanged when source pricebook row is later edited/deactivated', async () => {
    const pricebookItem: Record<string, unknown> = {
      id: 'pb-1',
      account_owner_user_id: 'owner-1',
      item_name: 'Initial Name',
      item_type: 'service',
      category: 'HVAC - General',
      default_description: 'Initial description',
      default_unit_price: 50,
      unit_label: 'each',
      is_active: true,
    };

    const { supabase, insertedLineItems } = makeSupabaseFixture({ pricebookItem });
    createClientMock.mockResolvedValue(supabase);

    const { addInternalInvoiceLineItemFromPricebookForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(addInternalInvoiceLineItemFromPricebookForm(pricebookLineFormData())).rejects.toThrow(
      'banner=internal_invoice_pricebook_line_item_added',
    );

    pricebookItem.item_name = 'Edited Name';
    pricebookItem.default_description = 'Edited description';
    pricebookItem.is_active = false;

    await expect(addInternalInvoiceLineItemFromPricebookForm(pricebookLineFormData())).rejects.toThrow(
      'banner=internal_invoice_pricebook_item_inactive',
    );

    expect(insertedLineItems).toHaveLength(1);
    expect(insertedLineItems[0].item_name_snapshot).toBe('Initial Name');
    expect(insertedLineItems[0].description_snapshot).toBe('Initial description');
  });
});
