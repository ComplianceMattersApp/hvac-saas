import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveBillingModeByAccountOwnerIdMock = vi.fn();
const resolveInternalInvoiceByJobIdMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const insertJobEventMock = vi.fn();
const revalidatePathMock = vi.fn();
const capabilityOverride = vi.hoisted(() => ({ value: null as any }));

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

vi.mock('@/lib/auth/field-billing-access', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/field-billing-access')>(
    '@/lib/auth/field-billing-access',
  );
  return {
    ...actual,
    resolveFieldBillingCapabilities: (...args: Parameters<typeof actual.resolveFieldBillingCapabilities>) =>
      capabilityOverride.value ?? actual.resolveFieldBillingCapabilities(...args),
  };
});

vi.mock('@/lib/business/internal-business-profile', () => ({
  resolveBillingModeByAccountOwnerId: (...args: unknown[]) =>
    resolveBillingModeByAccountOwnerIdMock(...args),
}));

vi.mock('@/lib/business/platform-entitlement', () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock('@/lib/business/internal-invoice', async () => {
  const actual = await vi.importActual<typeof import('@/lib/business/internal-invoice')>(
    '@/lib/business/internal-invoice',
  );
  return {
    ...actual,
    resolveInternalInvoiceByJobId: (...args: unknown[]) => resolveInternalInvoiceByJobIdMock(...args),
  };
});

vi.mock('@/lib/actions/job-actions', () => ({
  insertJobEvent: (...args: unknown[]) => insertJobEventMock(...args),
}));

type SupabaseFixtureParams = {
  pricebookItem?: Record<string, unknown> | null;
  visitScopeItems?: Array<Record<string, unknown>>;
};

function makeSupabaseFixture(params: SupabaseFixtureParams = {}) {
  const proposalInserts: Array<Record<string, unknown>> = [];
  const invoiceLineInserts: Array<Record<string, unknown>> = [];
  const invoiceUpdates: Array<Record<string, unknown>> = [];
  const paymentInserts: Array<Record<string, unknown>> = [];
  const pricebookItem = params.pricebookItem ?? null;
  const visitScopeItems = params.visitScopeItems ?? [];

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'jobs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: 'job-1',
                  account_owner_user_id: 'owner-1',
                  visit_scope_items: visitScopeItems,
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
                  data: pricebookItem,
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
            invoiceLineInserts.push(payload);
            return Promise.resolve({ error: null });
          }),
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

      if (table === 'internal_invoice_payments') {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            paymentInserts.push(payload);
            return Promise.resolve({ data: { id: 'payment-1' }, error: null });
          }),
        };
      }

      throw new Error(`Unexpected client table ${table}`);
    }),
  };

  const admin = {
    from: vi.fn((table: string) => {
      if (table !== 'field_charge_proposals') {
        throw new Error(`Unexpected admin table ${table}`);
      }

      return {
        insert: vi.fn((payload: Record<string, unknown>) => {
          proposalInserts.push(payload);
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: 'proposal-1' }, error: null })),
            })),
          };
        }),
      };
    }),
  };

  return {
    supabase,
    admin,
    proposalInserts,
    invoiceLineInserts,
    invoiceUpdates,
    paymentInserts,
  };
}

function pricebookFormData(overrides: Partial<Record<string, string>> = {}) {
  const formData = new FormData();
  formData.set('job_id', 'job-1');
  formData.set('tab', 'info');
  formData.set('pricebook_item_id', 'pb-1');
  formData.set('no_redirect', '1');

  for (const [key, value] of Object.entries(overrides)) {
    if (value != null) formData.set(key, value);
  }

  return formData;
}

function visitScopeFormData(overrides: Partial<Record<string, string>> = {}) {
  const formData = new FormData();
  formData.set('job_id', 'job-1');
  formData.set('tab', 'info');
  formData.set('visit_scope_item_id', '8e0e1a2f-fc8c-45c7-aa99-098dd1d79b1f');
  formData.set('no_redirect', '1');

  for (const [key, value] of Object.entries(overrides)) {
    if (value != null) formData.set(key, value);
  }

  return formData;
}

function pricebookItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pb-1',
    account_owner_user_id: 'owner-1',
    item_name: 'Diagnostic Visit',
    item_type: 'diagnostic',
    category: 'HVAC',
    default_description: 'System diagnostic',
    default_unit_price: 125,
    unit_label: 'each',
    is_active: true,
    ...overrides,
  };
}

function draftInvoice(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'inv-1',
    account_owner_user_id: 'owner-1',
    job_id: 'job-1',
    invoice_number: 'INV-1',
    status: 'draft',
    total_cents: 50000,
    line_items: [],
    ...overrides,
  };
}

function setInternalUser(userId: string, role: string) {
  requireInternalUserMock.mockResolvedValue({
    userId,
    internalUser: {
      user_id: userId,
      role,
      is_active: true,
      account_owner_user_id: 'owner-1',
    },
  });
}

describe('field charge proposal server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    capabilityOverride.value = null;

    setInternalUser('billing-1', 'billing');
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: 'job-1' });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: 'allowed_active',
    });
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValue('internal_invoicing');
    resolveInternalInvoiceByJobIdMock.mockResolvedValue(draftInvoice());
    insertJobEventMock.mockResolvedValue('event-1');
  });

  it('denies technician Pricebook proposal creation by default before proposal/invoice/payment writes', async () => {
    const fixture = makeSupabaseFixture({ pricebookItem: pricebookItem() });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);
    setInternalUser('tech-1', 'tech');

    const { createFieldChargeProposalFromPricebookForm } = await import(
      '@/lib/actions/field-charge-proposal-actions'
    );

    await expect(createFieldChargeProposalFromPricebookForm(pricebookFormData())).rejects.toThrow(
      'banner=not_authorized',
    );

    expect(fixture.proposalInserts).toHaveLength(0);
    expect(fixture.invoiceLineInserts).toHaveLength(0);
    expect(fixture.invoiceUpdates).toHaveLength(0);
    expect(fixture.paymentInserts).toHaveLength(0);
    expect(insertJobEventMock).not.toHaveBeenCalled();
  });

  it('denies office/dispatcher Pricebook proposal creation by default unless structurally owner-authorized', async () => {
    const fixture = makeSupabaseFixture({ pricebookItem: pricebookItem() });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);
    setInternalUser('office-1', 'office');

    const { createFieldChargeProposalFromPricebookForm } = await import(
      '@/lib/actions/field-charge-proposal-actions'
    );

    await expect(createFieldChargeProposalFromPricebookForm(pricebookFormData())).rejects.toThrow(
      'banner=not_authorized',
    );

    expect(fixture.proposalInserts).toHaveLength(0);
    expect(fixture.invoiceLineInserts).toHaveLength(0);
    expect(fixture.invoiceUpdates).toHaveLength(0);
  });

  it.each([
    ['structural owner', 'owner-1', 'office'],
    ['admin', 'admin-1', 'admin'],
    ['billing', 'billing-1', 'billing'],
  ])('allows %s to submit a Pricebook-backed proposal', async (_label, userId, role) => {
    const fixture = makeSupabaseFixture({ pricebookItem: pricebookItem() });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);
    setInternalUser(userId, role);

    const { createFieldChargeProposalFromPricebookForm } = await import(
      '@/lib/actions/field-charge-proposal-actions'
    );

    const result = await createFieldChargeProposalFromPricebookForm(pricebookFormData());

    expect(result).toEqual({
      ok: true,
      banner: 'field_charge_proposal_submitted',
      proposalId: 'proposal-1',
      fieldErrors: undefined,
    });
    expect(fixture.proposalInserts).toHaveLength(1);
    expect(fixture.proposalInserts[0]).toEqual(
      expect.objectContaining({
        account_owner_user_id: 'owner-1',
        job_id: 'job-1',
        internal_invoice_id: 'inv-1',
        source_kind: 'pricebook',
        source_pricebook_item_id: 'pb-1',
        status: 'submitted_for_review',
        proposed_by_user_id: userId,
        proposed_name: 'Diagnostic Visit',
        proposed_description: 'System diagnostic',
        proposed_item_type: 'diagnostic',
        proposed_quantity: '1.00',
        proposed_unit_price_cents: 12500,
        proposed_subtotal_cents: 12500,
        proposed_currency: 'usd',
      }),
    );
    expect(insertJobEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-1',
        event_type: 'field_charge_proposed',
        userId,
        meta: expect.objectContaining({
          proposal_id: 'proposal-1',
          source_kind: 'pricebook',
          source_pricebook_item_id: 'pb-1',
          proposed_amount_cents: 12500,
        }),
      }),
    );
    expect(fixture.invoiceLineInserts).toHaveLength(0);
    expect(fixture.invoiceUpdates).toHaveLength(0);
    expect(fixture.paymentInserts).toHaveLength(0);
  });

  it('requires can_select_pricebook_lines for Pricebook proposals', async () => {
    const fixture = makeSupabaseFixture({ pricebookItem: pricebookItem() });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);
    capabilityOverride.value = {
      field_billing_enabled: true,
      can_view_field_billing_summary: true,
      can_select_pricebook_lines: false,
      can_convert_visit_scope_to_invoice_line: true,
      can_add_manual_charge: false,
      can_edit_charge_description: false,
      can_edit_charge_quantity: false,
      can_edit_charge_price: false,
      can_remove_field_charge: false,
      can_submit_field_charges_for_review: true,
      can_approve_field_charges: false,
      can_collect_card_payment: false,
      can_report_non_card_collection: false,
      can_verify_non_card_collection: false,
    };

    const { createFieldChargeProposalFromPricebookForm } = await import(
      '@/lib/actions/field-charge-proposal-actions'
    );

    await expect(createFieldChargeProposalFromPricebookForm(pricebookFormData())).rejects.toThrow(
      'banner=not_authorized',
    );
    expect(fixture.proposalInserts).toHaveLength(0);
  });

  it('requires can_edit_charge_price for Pricebook price override', async () => {
    const fixture = makeSupabaseFixture({ pricebookItem: pricebookItem() });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);
    capabilityOverride.value = {
      field_billing_enabled: true,
      can_view_field_billing_summary: true,
      can_select_pricebook_lines: true,
      can_convert_visit_scope_to_invoice_line: false,
      can_add_manual_charge: false,
      can_edit_charge_description: false,
      can_edit_charge_quantity: false,
      can_edit_charge_price: false,
      can_remove_field_charge: false,
      can_submit_field_charges_for_review: true,
      can_approve_field_charges: false,
      can_collect_card_payment: false,
      can_report_non_card_collection: false,
      can_verify_non_card_collection: false,
    };

    const { createFieldChargeProposalFromPricebookForm } = await import(
      '@/lib/actions/field-charge-proposal-actions'
    );

    await expect(
      createFieldChargeProposalFromPricebookForm(pricebookFormData({ proposed_unit_price: '150.00' })),
    ).rejects.toThrow('banner=not_authorized');
    expect(fixture.proposalInserts).toHaveLength(0);
  });

  it('denies inactive, adjustment, or cross-account missing Pricebook sources before insert', async () => {
    const fixture = makeSupabaseFixture({ pricebookItem: pricebookItem({ is_active: false }) });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { createFieldChargeProposalFromPricebookForm } = await import(
      '@/lib/actions/field-charge-proposal-actions'
    );

    const inactiveResult = await createFieldChargeProposalFromPricebookForm(pricebookFormData());
    expect(inactiveResult).toEqual(expect.objectContaining({ ok: false, banner: 'field_charge_pricebook_item_inactive' }));
    expect(fixture.proposalInserts).toHaveLength(0);
  });

  it('allows billing to submit a Visit Scope-derived proposal without creating invoice truth', async () => {
    const scopeId = '8e0e1a2f-fc8c-45c7-aa99-098dd1d79b1f';
    const fixture = makeSupabaseFixture({
      visitScopeItems: [
        {
          id: scopeId,
          title: 'Repair blower assembly',
          details: 'Replace motor and verify airflow',
          kind: 'primary',
          item_type: 'service',
        },
      ],
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { createFieldChargeProposalFromVisitScopeForm } = await import(
      '@/lib/actions/field-charge-proposal-actions'
    );

    const result = await createFieldChargeProposalFromVisitScopeForm(visitScopeFormData());

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      banner: 'field_charge_proposal_submitted',
      proposalId: 'proposal-1',
    }));
    expect(fixture.proposalInserts).toHaveLength(1);
    expect(fixture.proposalInserts[0]).toEqual(
      expect.objectContaining({
        source_kind: 'visit_scope',
        source_visit_scope_item_id: scopeId,
        proposed_name: 'Repair blower assembly',
        proposed_description: 'Replace motor and verify airflow',
        proposed_quantity: '1.00',
        proposed_unit_price_cents: null,
        proposed_subtotal_cents: null,
        status: 'submitted_for_review',
      }),
    );
    expect(fixture.invoiceLineInserts).toHaveLength(0);
    expect(fixture.invoiceUpdates).toHaveLength(0);
    expect(fixture.paymentInserts).toHaveLength(0);
  });

  it('requires can_convert_visit_scope_to_invoice_line for Visit Scope proposals', async () => {
    const fixture = makeSupabaseFixture({
      visitScopeItems: [
        {
          id: '8e0e1a2f-fc8c-45c7-aa99-098dd1d79b1f',
          title: 'Repair blower assembly',
          kind: 'primary',
        },
      ],
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);
    capabilityOverride.value = {
      field_billing_enabled: true,
      can_view_field_billing_summary: true,
      can_select_pricebook_lines: true,
      can_convert_visit_scope_to_invoice_line: false,
      can_add_manual_charge: false,
      can_edit_charge_description: false,
      can_edit_charge_quantity: false,
      can_edit_charge_price: false,
      can_remove_field_charge: false,
      can_submit_field_charges_for_review: true,
      can_approve_field_charges: false,
      can_collect_card_payment: false,
      can_report_non_card_collection: false,
      can_verify_non_card_collection: false,
    };

    const { createFieldChargeProposalFromVisitScopeForm } = await import(
      '@/lib/actions/field-charge-proposal-actions'
    );

    await expect(createFieldChargeProposalFromVisitScopeForm(visitScopeFormData())).rejects.toThrow(
      'banner=not_authorized',
    );
    expect(fixture.proposalInserts).toHaveLength(0);
  });

  it('enforces Visit Scope source membership on the scoped job', async () => {
    const fixture = makeSupabaseFixture({
      visitScopeItems: [
        {
          id: 'f35d564e-6bcf-4cb3-bfae-9444cc7524fe',
          title: 'Different scoped item',
          kind: 'primary',
        },
      ],
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { createFieldChargeProposalFromVisitScopeForm } = await import(
      '@/lib/actions/field-charge-proposal-actions'
    );

    const result = await createFieldChargeProposalFromVisitScopeForm(visitScopeFormData());

    expect(result).toEqual(expect.objectContaining({ ok: false, banner: 'field_charge_visit_scope_item_not_found' }));
    expect(fixture.proposalInserts).toHaveLength(0);
  });

  it('denies cross-account scoped job access before proposal writes', async () => {
    const fixture = makeSupabaseFixture({ pricebookItem: pricebookItem() });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);
    loadScopedInternalJobForMutationMock.mockResolvedValueOnce(null);

    const { createFieldChargeProposalFromPricebookForm } = await import(
      '@/lib/actions/field-charge-proposal-actions'
    );

    await expect(createFieldChargeProposalFromPricebookForm(pricebookFormData())).rejects.toThrow(
      'banner=not_authorized',
    );

    expect(resolveOperationalMutationEntitlementAccessMock).not.toHaveBeenCalled();
    expect(fixture.proposalInserts).toHaveLength(0);
    expect(insertJobEventMock).not.toHaveBeenCalled();
  });
});
