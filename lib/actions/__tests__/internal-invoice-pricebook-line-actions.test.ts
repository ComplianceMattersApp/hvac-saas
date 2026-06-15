import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveBillingModeByAccountOwnerIdMock = vi.fn();
const resolveInternalInvoiceByJobIdMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
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

vi.mock('@/lib/business/platform-entitlement', () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
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
  visitScopeItems?: Array<Record<string, unknown>>;
  capabilityKeys?: string[];
};

function makeSupabaseFixture(params: SupabaseFixtureParams = {}) {
  const insertedInvoices: Array<Record<string, unknown>> = [];
  const insertedLineItems: Array<Record<string, unknown>> = [];
  const updatedLineItems: Array<Record<string, unknown>> = [];
  const deletedLineItemIds: string[] = [];
  const invoiceUpdates: Array<Record<string, unknown>> = [];
  const pricebookItem = params.pricebookItem;
  const visitScopeItems = params.visitScopeItems ?? [];
  const capabilityRows = (params.capabilityKeys ?? []).map((capabilityKey) => ({ capability_key: capabilityKey }));

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'jobs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: 'job-1',
                  visit_scope_items: visitScopeItems,
                },
                error: null,
              })),
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
          insert: vi.fn((payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
            if (Array.isArray(payload)) {
              insertedLineItems.push(...payload);
            } else {
              insertedLineItems.push(payload);
            }
            return Promise.resolve({ error: null });
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            updatedLineItems.push(payload);
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ error: null })),
              })),
            };
          }),
          delete: vi.fn(() => ({
            eq: vi.fn((lineItemId: string) => {
              deletedLineItemIds.push(lineItemId);
              return {
                eq: vi.fn(async () => ({ error: null })),
              };
            }),
          })),
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: [...insertedLineItems, ...updatedLineItems].map((lineItem) => ({
                line_subtotal: lineItem.line_subtotal,
              })),
              error: null,
            })),
          })),
        };
      }

      if (table === 'internal_invoices') {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            const insertedInvoice = {
              id: 'inv-created-1',
              invoice_number: payload.invoice_number ?? 'INV-CREATED-1',
              invoice_display_number: '1001',
              status: payload.status ?? 'draft',
              total_cents: payload.total_cents ?? 0,
              ...payload,
            };
            insertedInvoices.push(insertedInvoice);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: insertedInvoice,
                  error: null,
                })),
              })),
            };
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            invoiceUpdates.push(payload);
            return {
              eq: vi.fn(async () => ({ error: null })),
            };
          }),
        };
      }

      if (table === 'internal_user_access_capabilities') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({
                  data: capabilityRows,
                  error: null,
                })),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { supabase, insertedInvoices, insertedLineItems, updatedLineItems, deletedLineItemIds, invoiceUpdates };
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

function saveDraftFormData(overrides: Partial<Record<string, string>> = {}) {
  const formData = new FormData();
  formData.set('job_id', 'job-1');
  formData.set('tab', 'info');
  formData.set('invoice_number', 'INV-UPDATED-1');
  formData.set('invoice_date', '2026-01-01');
  formData.set('notes', 'Updated notes');

  for (const [key, value] of Object.entries(overrides)) {
    if (value != null) formData.set(key, value);
  }

  return formData;
}

function createDraftFormData(overrides: Partial<Record<string, string>> = {}) {
  const formData = new FormData();
  formData.set('job_id', 'job-1');
  formData.set('tab', 'info');
  formData.set('return_to', '/jobs/job-1/invoice#invoice-workspace');

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

function visitScopeLineFormData(itemIds: string[], overrides: Partial<Record<string, string>> = {}) {
  const formData = new FormData();
  formData.set('job_id', 'job-1');
  formData.set('tab', 'info');
  itemIds.forEach((itemId) => formData.append('visit_scope_item_ids', itemId));

  for (const [key, value] of Object.entries(overrides)) {
    if (value != null) formData.set(key, value);
  }

  return formData;
}

function lineItemMutationFormData(overrides: Partial<Record<string, string>> = {}) {
  const formData = manualLineFormData({
    line_item_id: 'line-1',
    ...overrides,
  });
  return formData;
}

describe('internal invoice line item pricebook plumbing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doUnmock('@/lib/auth/field-billing-access');

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: 'allowed_active',
    });

    requireInternalUserMock.mockResolvedValue({
      userId: 'internal-user-1',
      internalUser: {
        user_id: 'internal-user-1',
        role: 'billing',
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

  it.each([
    {
      label: 'structural owner',
      userId: 'owner-1',
      role: 'office',
    },
    {
      label: 'admin',
      userId: 'admin-1',
      role: 'admin',
    },
    {
      label: 'billing',
      userId: 'billing-1',
      role: 'billing',
    },
  ])('allows $label to add manual charge lines', async ({ userId, role }) => {
    const { supabase, insertedLineItems, invoiceUpdates } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockResolvedValueOnce({
      userId,
      internalUser: {
        user_id: userId,
        role,
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    const { addInternalInvoiceLineItemFromForm } = await import('@/lib/actions/internal-invoice-actions');

    const result = await addInternalInvoiceLineItemFromForm(
      manualLineFormData({ no_redirect: '1' }),
    );

    expect(result).toEqual({
      ok: true,
      banner: 'internal_invoice_line_item_added',
      fieldErrors: undefined,
    });
    expect(insertedLineItems).toHaveLength(1);
    expect(invoiceUpdates).toHaveLength(1);
  });

  it('denies technician manual charge creation by default before line writes', async () => {
    const { supabase, insertedLineItems, invoiceUpdates } = makeSupabaseFixture();
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

    const { addInternalInvoiceLineItemFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(addInternalInvoiceLineItemFromForm(manualLineFormData())).rejects.toThrow(
      'banner=not_authorized',
    );

    expect(insertedLineItems).toHaveLength(0);
    expect(invoiceUpdates).toHaveLength(0);
  });

  it('denies technician draft line price edits by default before line writes', async () => {
    const { supabase, insertedLineItems, updatedLineItems, invoiceUpdates } = makeSupabaseFixture();
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
    resolveInternalInvoiceByJobIdMock.mockResolvedValueOnce(
      draftInvoice({
        line_items: [
          {
            id: 'line-1',
            source_kind: 'manual',
            item_name_snapshot: 'Manual Service Line',
            quantity: 1,
            unit_price: 50,
          },
        ],
      }),
    );

    const { updateInternalInvoiceLineItemFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(
      updateInternalInvoiceLineItemFromForm(lineItemMutationFormData({ unit_price: '75.00' })),
    ).rejects.toThrow('banner=not_authorized');

    expect(insertedLineItems).toHaveLength(0);
    expect(updatedLineItems).toHaveLength(0);
    expect(invoiceUpdates).toHaveLength(0);
  });

  it('allows technician with Field Billing Access to edit imported draft line description, quantity, and unit price', async () => {
    const { supabase, updatedLineItems, invoiceUpdates } = makeSupabaseFixture({
      capabilityKeys: [
        'field_billing_enabled',
        'can_view_field_billing_summary',
        'can_collect_field_payment',
        'can_report_non_card_collection',
      ],
    });
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockResolvedValueOnce({
      userId: 'tech-field-billing-1',
      internalUser: {
        user_id: 'tech-field-billing-1',
        role: 'tech',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });
    resolveInternalInvoiceByJobIdMock.mockResolvedValueOnce(
      draftInvoice({
        line_items: [
          {
            id: 'line-1',
            source_kind: 'visit_scope',
            source_visit_scope_item_id: 'scope-1',
            item_name_snapshot: 'Imported work item',
            description_snapshot: 'Original work instruction',
            item_type_snapshot: 'service',
            quantity: 1,
            unit_price: 0,
            line_subtotal: 0,
          },
        ],
      }),
    );

    const { updateInternalInvoiceLineItemFromForm } = await import('@/lib/actions/internal-invoice-actions');

    const result = await updateInternalInvoiceLineItemFromForm(lineItemMutationFormData({
      no_redirect: '1',
      item_name_snapshot: 'Diagnostic and repair',
      description_snapshot: 'Replaced failed contactor and verified startup.',
      item_type_snapshot: 'service',
      quantity: '2.50',
      unit_price: '125.00',
    }));

    expect(result).toEqual({
      ok: true,
      banner: 'internal_invoice_line_item_saved',
      fieldErrors: undefined,
    });
    expect(updatedLineItems).toHaveLength(1);
    expect(updatedLineItems[0]).toEqual(expect.objectContaining({
      item_name_snapshot: 'Diagnostic and repair',
      description_snapshot: 'Replaced failed contactor and verified startup.',
      item_type_snapshot: 'service',
      quantity: '2.50',
      unit_price: '125.00',
      line_subtotal: '312.50',
      updated_by_user_id: 'tech-field-billing-1',
    }));
    expect(invoiceUpdates).toHaveLength(1);
    expect(invoiceUpdates[0]).toEqual(expect.objectContaining({
      subtotal_cents: 31250,
      total_cents: 31250,
      updated_by_user_id: 'tech-field-billing-1',
    }));
  });

  it('ignores forged description and price updates when actor only has quantity edit capability', async () => {
    vi.resetModules();
    const { supabase, updatedLineItems, invoiceUpdates } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockResolvedValueOnce({
      userId: 'tech-quantity-1',
      internalUser: {
        user_id: 'tech-quantity-1',
        role: 'tech',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });
    resolveInternalInvoiceByJobIdMock.mockResolvedValueOnce(
      draftInvoice({
        line_items: [
          {
            id: 'line-1',
            source_kind: 'manual',
            item_name_snapshot: 'Existing Name',
            description_snapshot: 'Existing description',
            item_type_snapshot: 'service',
            quantity: 1,
            unit_price: 50,
            line_subtotal: 50,
          },
        ],
      }),
    );

    const quantityOnlyCapabilities = {
      field_billing_enabled: true,
      can_view_field_billing_summary: true,
      can_select_pricebook_lines: false,
      can_convert_visit_scope_to_invoice_line: false,
      can_add_manual_charge: false,
      can_edit_charge_description: false,
      can_edit_charge_quantity: false,
      can_edit_charge_price: false,
      can_remove_field_charge: false,
      can_submit_field_charges_for_review: false,
      can_approve_field_charges: false,
      can_create_direct_invoice_draft: false,
      can_select_pricebook_invoice_lines: false,
      can_convert_visit_scope_to_invoice_lines: false,
      can_add_manual_invoice_line: false,
      can_edit_invoice_line_description: false,
      can_edit_invoice_line_quantity: true,
      can_edit_invoice_line_price: false,
      can_remove_invoice_line: false,
      can_issue_invoice: false,
      can_send_invoice: false,
      can_collect_card_payment: false,
      can_report_non_card_collection: false,
      can_verify_non_card_collection: false,
    } as const;

    vi.doMock('@/lib/auth/field-billing-access', async () => {
      const actual = await vi.importActual<typeof import('@/lib/auth/field-billing-access')>('@/lib/auth/field-billing-access');
      return {
        ...actual,
        resolveFieldBillingCapabilities: vi.fn(() => quantityOnlyCapabilities),
        requireFieldChargeEditAccessOrRedirect: vi.fn(() => undefined),
      };
    });

    const { updateInternalInvoiceLineItemFromForm } = await import('@/lib/actions/internal-invoice-actions');

    const result = await updateInternalInvoiceLineItemFromForm(lineItemMutationFormData({
      no_redirect: '1',
      item_name_snapshot: 'Forged Name',
      description_snapshot: 'Forged description',
      unit_price: '999.99',
      quantity: '3.00',
    }));

    expect(result).toEqual({
      ok: true,
      banner: 'internal_invoice_line_item_saved',
      fieldErrors: undefined,
    });
    expect(updatedLineItems).toHaveLength(1);
    expect(updatedLineItems[0]).toEqual(expect.objectContaining({
      item_name_snapshot: 'Existing Name',
      description_snapshot: 'Existing description',
      item_type_snapshot: 'service',
      quantity: '3.00',
      unit_price: '50.00',
      line_subtotal: '150.00',
      updated_by_user_id: 'tech-quantity-1',
    }));
    expect(invoiceUpdates).toHaveLength(1);
    expect(invoiceUpdates[0]).toEqual(expect.objectContaining({
      subtotal_cents: 15000,
      total_cents: 15000,
      updated_by_user_id: 'tech-quantity-1',
    }));
  });

  it('denies technician draft line removal by default before line writes', async () => {
    const { supabase, insertedLineItems, invoiceUpdates } = makeSupabaseFixture();
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

    const { removeInternalInvoiceLineItemFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(removeInternalInvoiceLineItemFromForm(lineItemMutationFormData())).rejects.toThrow(
      'banner=not_authorized',
    );

    expect(insertedLineItems).toHaveLength(0);
    expect(invoiceUpdates).toHaveLength(0);
  });

  it('manual add supports non-redirect mode and narrows revalidation to job detail', async () => {
    const { supabase, insertedLineItems, invoiceUpdates } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);

    const { addInternalInvoiceLineItemFromForm } = await import('@/lib/actions/internal-invoice-actions');

    const result = await addInternalInvoiceLineItemFromForm(
      manualLineFormData({ no_redirect: '1' }),
    );

    expect(result).toEqual({
      ok: true,
      banner: 'internal_invoice_line_item_added',
      fieldErrors: undefined,
    });
    expect(insertedLineItems).toHaveLength(1);
    expect(invoiceUpdates).toHaveLength(1);
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/jobs/job-1');
  });

  it('manual add returns clean validation result in non-redirect mode', async () => {
    const { supabase, insertedLineItems, invoiceUpdates } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);

    const { addInternalInvoiceLineItemFromForm } = await import('@/lib/actions/internal-invoice-actions');

    const result = await addInternalInvoiceLineItemFromForm(
      manualLineFormData({ no_redirect: '1', quantity: '0' }),
    );

    expect(result).toEqual({
      ok: false,
      banner: 'internal_invoice_line_item_invalid',
      fieldErrors: {
        _form: 'Line item fields are invalid.',
      },
    });
    expect(insertedLineItems).toHaveLength(0);
    expect(invoiceUpdates).toHaveLength(0);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('draft save supports non-redirect mode and narrows revalidation to job detail', async () => {
    const { supabase, invoiceUpdates } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);

    const { saveInternalInvoiceDraftFromForm } = await import('@/lib/actions/internal-invoice-actions');

    const result = await saveInternalInvoiceDraftFromForm(
      saveDraftFormData({ no_redirect: '1' }),
    );

    expect(result).toEqual({
      ok: true,
      banner: 'internal_invoice_draft_saved',
      fieldErrors: undefined,
    });
    expect(invoiceUpdates).toHaveLength(2);
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/jobs/job-1');
  });

  it('draft save still redirects in default mode', async () => {
    const { supabase } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);

    const { saveInternalInvoiceDraftFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(saveInternalInvoiceDraftFromForm(saveDraftFormData())).rejects.toThrow(
      'banner=internal_invoice_draft_saved',
    );
  });

  it('draft save returns clean validation result in non-redirect mode', async () => {
    const { supabase, invoiceUpdates } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);

    const { saveInternalInvoiceDraftFromForm } = await import('@/lib/actions/internal-invoice-actions');

    const result = await saveInternalInvoiceDraftFromForm(
      saveDraftFormData({ no_redirect: '1', invoice_number: '' }),
    );

    expect(result).toEqual({
      ok: false,
      banner: 'internal_invoice_required_fields',
      fieldErrors: {
        invoice_number: 'Invoice number is required.',
      },
    });
    expect(invoiceUpdates).toHaveLength(0);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('auto-imports eligible priced work items when Build Invoice creates a draft', async () => {
    const selectedScopeId = '8e0e1a2f-fc8c-45c7-aa99-098dd1d79b1f';
    const { supabase, insertedInvoices, insertedLineItems, invoiceUpdates } = makeSupabaseFixture({
      visitScopeItems: [
        {
          id: selectedScopeId,
          title: 'Replace capacitor',
          details: 'Install 45/5 capacitor and verify startup',
          kind: 'primary',
          expected_unit_price: 189.5,
        },
      ],
      capabilityKeys: ['field_billing_enabled'],
    });
    createClientMock.mockResolvedValue(supabase);
    resolveInternalInvoiceByJobIdMock.mockResolvedValueOnce(null);
    requireInternalUserMock.mockResolvedValueOnce({
      userId: 'tech-1',
      internalUser: {
        user_id: 'tech-1',
        role: 'technician',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    const { createInternalInvoiceDraftFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(
      createInternalInvoiceDraftFromForm(
        createDraftFormData({ auto_import_visit_scope_items: '1' }),
      ),
    ).rejects.toThrow('REDIRECT:/jobs/job-1/invoice?banner=internal_invoice_draft_created#invoice-workspace');

    expect(insertedInvoices).toHaveLength(1);
    expect(insertedLineItems).toHaveLength(1);
    expect(insertedLineItems[0]).toEqual(
      expect.objectContaining({
        invoice_id: 'inv-created-1',
        source_kind: 'visit_scope',
        source_visit_scope_item_id: selectedScopeId,
        item_name_snapshot: 'Replace capacitor',
        description_snapshot: 'Install 45/5 capacitor and verify startup',
        quantity: '1.00',
        unit_price: '189.50',
        line_subtotal: '189.50',
      }),
    );
    expect(invoiceUpdates).toHaveLength(1);
    expect(invoiceUpdates[0].subtotal_cents).toBe(18950);
    expect(invoiceUpdates[0].total_cents).toBe(18950);
  });

  it('opens the invoice workspace without creating a duplicate when a draft already exists', async () => {
    const { supabase, insertedInvoices, insertedLineItems } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    resolveInternalInvoiceByJobIdMock.mockResolvedValueOnce(draftInvoice());

    const { createInternalInvoiceDraftFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(
      createInternalInvoiceDraftFromForm(
        createDraftFormData({ auto_import_visit_scope_items: '1' }),
      ),
    ).rejects.toThrow('REDIRECT:/jobs/job-1/invoice?banner=internal_invoice_draft_exists#invoice-workspace');

    expect(insertedInvoices).toHaveLength(0);
    expect(insertedLineItems).toHaveLength(0);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('opens the invoice workspace without creating a duplicate when an issued invoice already exists', async () => {
    const { supabase, insertedInvoices, insertedLineItems } = makeSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    resolveInternalInvoiceByJobIdMock.mockResolvedValueOnce(draftInvoice({ status: 'issued', total_cents: 18950 }));

    const { createInternalInvoiceDraftFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(
      createInternalInvoiceDraftFromForm(
        createDraftFormData({ auto_import_visit_scope_items: '1' }),
      ),
    ).rejects.toThrow('REDIRECT:/jobs/job-1/invoice?banner=internal_invoice_draft_exists#invoice-workspace');

    expect(insertedInvoices).toHaveLength(0);
    expect(insertedLineItems).toHaveLength(0);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('auto-imports unpriced work items at zero dollars for draft review', async () => {
    const selectedScopeId = '8e0e1a2f-fc8c-45c7-aa99-098dd1d79b1f';
    const { supabase, insertedLineItems, invoiceUpdates } = makeSupabaseFixture({
      visitScopeItems: [
        {
          id: selectedScopeId,
          title: 'Inspect condensate drain',
          details: 'Clear line and verify drainage',
          kind: 'primary',
        },
      ],
    });
    createClientMock.mockResolvedValue(supabase);
    resolveInternalInvoiceByJobIdMock.mockResolvedValueOnce(null);

    const { createInternalInvoiceDraftFromForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(
      createInternalInvoiceDraftFromForm(
        createDraftFormData({ auto_import_visit_scope_items: '1' }),
      ),
    ).rejects.toThrow('REDIRECT:/jobs/job-1/invoice?banner=internal_invoice_draft_created#invoice-workspace');

    expect(insertedLineItems).toHaveLength(1);
    expect(insertedLineItems[0]).toEqual(
      expect.objectContaining({
        source_kind: 'visit_scope',
        source_visit_scope_item_id: selectedScopeId,
        item_name_snapshot: 'Inspect condensate drain',
        description_snapshot: 'Clear line and verify drainage',
        quantity: '1.00',
        unit_price: '0.00',
        line_subtotal: '0.00',
      }),
    );
    expect(invoiceUpdates).toHaveLength(1);
    expect(invoiceUpdates[0].subtotal_cents).toBe(0);
    expect(invoiceUpdates[0].total_cents).toBe(0);
  });

  it('adds selected visit scope items to draft invoice with frozen snapshots and provenance', async () => {
    const selectedScopeId = '8e0e1a2f-fc8c-45c7-aa99-098dd1d79b1f';
    const { supabase, insertedLineItems, invoiceUpdates } = makeSupabaseFixture({
      visitScopeItems: [
        {
          id: selectedScopeId,
          title: 'Repair blower assembly',
          details: 'Replace failed motor and verify airflow',
          kind: 'primary',
          expected_unit_price: 189.5,
        },
      ],
    });
    createClientMock.mockResolvedValue(supabase);

    const { addInternalInvoiceLineItemsFromVisitScopeForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(addInternalInvoiceLineItemsFromVisitScopeForm(visitScopeLineFormData([selectedScopeId]))).rejects.toThrow(
      'banner=internal_invoice_visit_scope_line_item_added',
    );

    expect(insertedLineItems).toHaveLength(1);
    expect(insertedLineItems[0]).toEqual(
      expect.objectContaining({
        source_kind: 'visit_scope',
        source_visit_scope_item_id: selectedScopeId,
        item_name_snapshot: 'Repair blower assembly',
        description_snapshot: 'Replace failed motor and verify airflow',
        item_type_snapshot: 'service',
        quantity: '1.00',
        unit_price: '189.50',
        line_subtotal: '189.50',
        category_snapshot: null,
        unit_label_snapshot: null,
      }),
    );

    expect(invoiceUpdates).toHaveLength(1);
    expect(invoiceUpdates[0].subtotal_cents).toBe(18950);
    expect(invoiceUpdates[0].total_cents).toBe(18950);
  });

  it('keeps unpriced visit scope items at zero dollars when importing draft charges', async () => {
    const selectedScopeId = '8e0e1a2f-fc8c-45c7-aa99-098dd1d79b1f';
    const { supabase, insertedLineItems, invoiceUpdates } = makeSupabaseFixture({
      visitScopeItems: [
        {
          id: selectedScopeId,
          title: 'Inspect condensate drain',
          details: 'Clear line and verify drainage',
          kind: 'primary',
        },
      ],
    });
    createClientMock.mockResolvedValue(supabase);

    const { addInternalInvoiceLineItemsFromVisitScopeForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(addInternalInvoiceLineItemsFromVisitScopeForm(visitScopeLineFormData([selectedScopeId]))).rejects.toThrow(
      'banner=internal_invoice_visit_scope_line_item_added',
    );

    expect(insertedLineItems).toHaveLength(1);
    expect(insertedLineItems[0]).toEqual(
      expect.objectContaining({
        source_kind: 'visit_scope',
        source_visit_scope_item_id: selectedScopeId,
        item_name_snapshot: 'Inspect condensate drain',
        description_snapshot: 'Clear line and verify drainage',
        quantity: '1.00',
        unit_price: '0.00',
        line_subtotal: '0.00',
      }),
    );
    expect(invoiceUpdates).toHaveLength(1);
    expect(invoiceUpdates[0].subtotal_cents).toBe(0);
    expect(invoiceUpdates[0].total_cents).toBe(0);
  });

  it('denies issued invoice for visit scope-backed line insert', async () => {
    const selectedScopeId = '8e0e1a2f-fc8c-45c7-aa99-098dd1d79b1f';
    const { supabase, insertedLineItems } = makeSupabaseFixture({
      visitScopeItems: [
        {
          id: selectedScopeId,
          title: 'Repair blower assembly',
          details: 'Replace failed motor and verify airflow',
          kind: 'primary',
        },
      ],
    });
    createClientMock.mockResolvedValue(supabase);
    resolveInternalInvoiceByJobIdMock.mockResolvedValueOnce(draftInvoice({ status: 'issued' }));

    const { addInternalInvoiceLineItemsFromVisitScopeForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(addInternalInvoiceLineItemsFromVisitScopeForm(visitScopeLineFormData([selectedScopeId]))).rejects.toThrow(
      'banner=internal_invoice_line_items_locked',
    );

    expect(insertedLineItems).toHaveLength(0);
  });

  it('denies void invoice for visit scope-backed line insert', async () => {
    const selectedScopeId = '8e0e1a2f-fc8c-45c7-aa99-098dd1d79b1f';
    const { supabase, insertedLineItems } = makeSupabaseFixture({
      visitScopeItems: [
        {
          id: selectedScopeId,
          title: 'Repair blower assembly',
          details: 'Replace failed motor and verify airflow',
          kind: 'primary',
        },
      ],
    });
    createClientMock.mockResolvedValue(supabase);
    resolveInternalInvoiceByJobIdMock.mockResolvedValueOnce(draftInvoice({ status: 'void' }));

    const { addInternalInvoiceLineItemsFromVisitScopeForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(addInternalInvoiceLineItemsFromVisitScopeForm(visitScopeLineFormData([selectedScopeId]))).rejects.toThrow(
      'banner=internal_invoice_line_items_locked',
    );

    expect(insertedLineItems).toHaveLength(0);
  });

  it('denies malformed selected visit scope item ids safely', async () => {
    const { supabase, insertedLineItems } = makeSupabaseFixture({
      visitScopeItems: [
        {
          id: '8e0e1a2f-fc8c-45c7-aa99-098dd1d79b1f',
          title: 'Repair blower assembly',
          details: 'Replace failed motor and verify airflow',
          kind: 'primary',
        },
      ],
    });
    createClientMock.mockResolvedValue(supabase);

    const { addInternalInvoiceLineItemsFromVisitScopeForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(addInternalInvoiceLineItemsFromVisitScopeForm(visitScopeLineFormData(['not-a-uuid']))).rejects.toThrow(
      'banner=internal_invoice_visit_scope_item_invalid',
    );

    expect(insertedLineItems).toHaveLength(0);
  });

  it('denies selected visit scope ids that do not belong to the job scope', async () => {
    const scopedId = '8e0e1a2f-fc8c-45c7-aa99-098dd1d79b1f';
    const nonScopedId = 'f35d564e-6bcf-4cb3-bfae-9444cc7524fe';
    const { supabase, insertedLineItems } = makeSupabaseFixture({
      visitScopeItems: [
        {
          id: scopedId,
          title: 'Repair blower assembly',
          details: 'Replace failed motor and verify airflow',
          kind: 'primary',
        },
      ],
    });
    createClientMock.mockResolvedValue(supabase);

    const { addInternalInvoiceLineItemsFromVisitScopeForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(addInternalInvoiceLineItemsFromVisitScopeForm(visitScopeLineFormData([nonScopedId]))).rejects.toThrow(
      'banner=internal_invoice_visit_scope_item_not_found',
    );

    expect(insertedLineItems).toHaveLength(0);
  });

  it('prevents duplicate visit scope lines already present on the same draft invoice', async () => {
    const selectedScopeId = '8e0e1a2f-fc8c-45c7-aa99-098dd1d79b1f';
    const { supabase, insertedLineItems, invoiceUpdates } = makeSupabaseFixture({
      visitScopeItems: [
        {
          id: selectedScopeId,
          title: 'Repair blower assembly',
          details: 'Replace failed motor and verify airflow',
          kind: 'primary',
        },
      ],
    });
    createClientMock.mockResolvedValue(supabase);
    resolveInternalInvoiceByJobIdMock.mockResolvedValueOnce(
      draftInvoice({
        line_items: [
          {
            id: 'line-existing-1',
            source_kind: 'visit_scope',
            source_visit_scope_item_id: selectedScopeId,
          },
        ],
      }),
    );

    const { addInternalInvoiceLineItemsFromVisitScopeForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(addInternalInvoiceLineItemsFromVisitScopeForm(visitScopeLineFormData([selectedScopeId]))).rejects.toThrow(
      'banner=internal_invoice_visit_scope_line_item_duplicate',
    );

    expect(insertedLineItems).toHaveLength(0);
    expect(invoiceUpdates).toHaveLength(0);
  });

  it('adds only new scope items when selection includes already-added duplicates', async () => {
    const existingScopeId = '8e0e1a2f-fc8c-45c7-aa99-098dd1d79b1f';
    const newScopeId = 'f35d564e-6bcf-4cb3-bfae-9444cc7524fe';
    const { supabase, insertedLineItems, invoiceUpdates } = makeSupabaseFixture({
      visitScopeItems: [
        {
          id: existingScopeId,
          title: 'Repair blower assembly',
          details: 'Replace failed motor and verify airflow',
          kind: 'primary',
        },
        {
          id: newScopeId,
          title: 'Re-check static pressure',
          details: 'Capture return and supply readings',
          kind: 'primary',
        },
      ],
    });
    createClientMock.mockResolvedValue(supabase);
    resolveInternalInvoiceByJobIdMock.mockResolvedValueOnce(
      draftInvoice({
        line_items: [
          {
            id: 'line-existing-1',
            source_kind: 'visit_scope',
            source_visit_scope_item_id: existingScopeId,
          },
        ],
      }),
    );

    const { addInternalInvoiceLineItemsFromVisitScopeForm } = await import('@/lib/actions/internal-invoice-actions');

    await expect(
      addInternalInvoiceLineItemsFromVisitScopeForm(visitScopeLineFormData([existingScopeId, newScopeId])),
    ).rejects.toThrow('banner=internal_invoice_visit_scope_line_item_partial_added');

    expect(insertedLineItems).toHaveLength(1);
    expect(insertedLineItems[0].source_visit_scope_item_id).toBe(newScopeId);
    expect(invoiceUpdates).toHaveLength(1);
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
