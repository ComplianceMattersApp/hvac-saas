import { afterEach, describe, expect, it, vi } from 'vitest';
import { canRecordInvoicePayment } from '@/lib/auth/financial-access';
import { resolveFieldBillingCapabilities } from '@/lib/auth/field-billing-access';
import { loadFieldBillingExplicitCapabilitiesForUser } from '@/lib/auth/internal-user-access-capabilities';

function makeSupabase(rows: Array<Record<string, unknown>>, queryError: unknown = null) {
  const filters: Array<[string, unknown]> = [];
  const tableNames: string[] = [];

  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    }),
    then: (resolve: (value: { data: Array<Record<string, unknown>> | null; error: unknown }) => unknown) => {
      const filteredRows = rows.filter((row) =>
        filters.every(([column, value]) => row[column] === value),
      );
      return Promise.resolve(resolve({ data: queryError ? null : filteredRows, error: queryError }));
    },
  };

  const supabase = {
    from: vi.fn((table: string) => {
      tableNames.push(table);
      return query;
    }),
  };

  return { supabase, filters, tableNames, query };
}

function techParams(explicitCapabilities: Record<string, unknown>) {
  return {
    actorUserId: 'tech-1',
    internalUser: {
      user_id: 'tech-1',
      role: 'tech',
      is_active: true,
      account_owner_user_id: 'owner-1',
    },
    resourceAccountOwnerUserId: 'owner-1',
    explicitCapabilities,
  };
}

describe('loadFieldBillingExplicitCapabilitiesForUser', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty capabilities when accountOwnerUserId is missing', async () => {
    const fixture = makeSupabase([]);

    await expect(loadFieldBillingExplicitCapabilitiesForUser({
      supabase: fixture.supabase,
      accountOwnerUserId: '',
      internalUserId: 'tech-1',
    })).resolves.toEqual({});

    expect(fixture.supabase.from).not.toHaveBeenCalled();
  });

  it('returns empty capabilities when internalUserId is missing', async () => {
    const fixture = makeSupabase([]);

    await expect(loadFieldBillingExplicitCapabilitiesForUser({
      supabase: fixture.supabase,
      accountOwnerUserId: 'owner-1',
      internalUserId: null,
    })).resolves.toEqual({});

    expect(fixture.supabase.from).not.toHaveBeenCalled();
  });

  it('maps enabled rows to explicit field billing capabilities', async () => {
    const fixture = makeSupabase([
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: true, capability_key: 'field_billing_enabled' },
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: true, capability_key: 'can_view_field_billing_summary' },
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: true, capability_key: 'can_collect_field_payment' },
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: true, capability_key: 'can_report_non_card_collection' },
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: true, capability_key: 'can_collect_card_payment' },
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: true, capability_key: 'can_verify_non_card_collection' },
    ]);

    const capabilities = await loadFieldBillingExplicitCapabilitiesForUser({
      supabase: fixture.supabase,
      accountOwnerUserId: 'owner-1',
      internalUserId: 'tech-1',
    });

    expect(capabilities).toEqual({
      field_billing_enabled: true,
      can_view_field_billing_summary: true,
      can_collect_field_payment: true,
      can_report_non_card_collection: true,
      can_collect_card_payment: true,
      can_verify_non_card_collection: true,
    });
    expect(fixture.tableNames).toEqual(['internal_user_access_capabilities']);
    expect(fixture.query.select).toHaveBeenCalledWith('capability_key');
    expect(fixture.filters).toEqual([
      ['account_owner_user_id', 'owner-1'],
      ['internal_user_id', 'tech-1'],
      ['enabled', true],
    ]);
  });

  it('ignores disabled rows through enabled query filter', async () => {
    const fixture = makeSupabase([
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: false, capability_key: 'can_report_non_card_collection' },
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: true, capability_key: 'field_billing_enabled' },
    ]);

    await expect(loadFieldBillingExplicitCapabilitiesForUser({
      supabase: fixture.supabase,
      accountOwnerUserId: 'owner-1',
      internalUserId: 'tech-1',
    })).resolves.toEqual({ field_billing_enabled: true });
  });

  it('ignores unknown keys defensively', async () => {
    const fixture = makeSupabase([
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: true, capability_key: 'field_billing_enabled' },
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: true, capability_key: 'can_issue_invoice' },
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: true, capability_key: 'can_record_manual_payment' },
    ]);

    await expect(loadFieldBillingExplicitCapabilitiesForUser({
      supabase: fixture.supabase,
      accountOwnerUserId: 'owner-1',
      internalUserId: 'tech-1',
    })).resolves.toEqual({ field_billing_enabled: true });
  });

  it('filters by account owner', async () => {
    const fixture = makeSupabase([
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: true, capability_key: 'field_billing_enabled' },
      { account_owner_user_id: 'other-owner', internal_user_id: 'tech-1', enabled: true, capability_key: 'can_report_non_card_collection' },
    ]);

    await expect(loadFieldBillingExplicitCapabilitiesForUser({
      supabase: fixture.supabase,
      accountOwnerUserId: 'owner-1',
      internalUserId: 'tech-1',
    })).resolves.toEqual({ field_billing_enabled: true });
  });

  it('filters by internal user', async () => {
    const fixture = makeSupabase([
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: true, capability_key: 'field_billing_enabled' },
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-2', enabled: true, capability_key: 'can_report_non_card_collection' },
    ]);

    await expect(loadFieldBillingExplicitCapabilitiesForUser({
      supabase: fixture.supabase,
      accountOwnerUserId: 'owner-1',
      internalUserId: 'tech-1',
    })).resolves.toEqual({ field_billing_enabled: true });
  });

  it('does not infer Technician authority from role or unrelated row fields', async () => {
    const fixture = makeSupabase([
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: true, role: 'tech' },
    ]);

    const explicitCapabilities = await loadFieldBillingExplicitCapabilitiesForUser({
      supabase: fixture.supabase,
      accountOwnerUserId: 'owner-1',
      internalUserId: 'tech-1',
    });

    expect(explicitCapabilities).toEqual({});
    const resolved = resolveFieldBillingCapabilities(techParams(explicitCapabilities));
    expect(resolved.can_collect_field_payment).toBe(false);
    expect(resolved.can_report_non_card_collection).toBe(false);
  });

  it('cannot grant final manual payment authority because only field billing keys are mapped', async () => {
    const fixture = makeSupabase([
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: true, capability_key: 'field_billing_enabled' },
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: true, capability_key: 'can_report_non_card_collection' },
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: true, capability_key: 'can_record_manual_payment' },
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: true, capability_key: 'can_export_financial_data' },
    ]);

    const explicitCapabilities = await loadFieldBillingExplicitCapabilitiesForUser({
      supabase: fixture.supabase,
      accountOwnerUserId: 'owner-1',
      internalUserId: 'tech-1',
    });

    expect(explicitCapabilities).toEqual({
      field_billing_enabled: true,
      can_report_non_card_collection: true,
    });
    expect(canRecordInvoicePayment(techParams(explicitCapabilities))).toBe(false);
  });

  it('lets a Technician with saved collect/report capability get field report authority without verification authority', async () => {
    const fixture = makeSupabase([
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: true, capability_key: 'field_billing_enabled' },
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: true, capability_key: 'can_view_field_billing_summary' },
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: true, capability_key: 'can_collect_field_payment' },
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: true, capability_key: 'can_report_non_card_collection' },
      { account_owner_user_id: 'owner-1', internal_user_id: 'tech-1', enabled: false, capability_key: 'can_verify_non_card_collection' },
    ]);

    const explicitCapabilities = await loadFieldBillingExplicitCapabilitiesForUser({
      supabase: fixture.supabase,
      accountOwnerUserId: 'owner-1',
      internalUserId: 'tech-1',
    });
    const resolved = resolveFieldBillingCapabilities(techParams(explicitCapabilities));

    expect(resolved.can_collect_field_payment).toBe(true);
    expect(resolved.can_report_non_card_collection).toBe(true);
    expect(resolved.can_verify_non_card_collection).toBe(false);
    expect(canRecordInvoicePayment(techParams(explicitCapabilities))).toBe(false);
  });

  it('fails closed to empty capabilities and logs read failures', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fixture = makeSupabase([], new Error('relation missing'));

    await expect(loadFieldBillingExplicitCapabilitiesForUser({
      supabase: fixture.supabase,
      accountOwnerUserId: 'owner-1',
      internalUserId: 'tech-1',
    })).resolves.toEqual({});

    expect(warn).toHaveBeenCalledWith(
      'Failed to load internal user field billing capabilities',
      expect.objectContaining({
        accountOwnerUserId: 'owner-1',
        internalUserId: 'tech-1',
        error: 'relation missing',
      }),
    );
  });
});
