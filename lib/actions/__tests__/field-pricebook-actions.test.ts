import { beforeEach, describe, expect, it, vi } from 'vitest';

// Slice C: coverage for the field "save custom charge to Pricebook" actions —
// the field_billing_enabled gate, the case-insensitive duplicate guard, and the
// active-only match check. resolveFieldBillingCapabilities is used unmocked so the
// real gate is exercised.

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadFieldBillingExplicitCapabilitiesForUserMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock('@/lib/auth/internal-user', () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

vi.mock('@/lib/auth/internal-user-access-capabilities', () => ({
  loadFieldBillingExplicitCapabilitiesForUser: (...args: unknown[]) =>
    loadFieldBillingExplicitCapabilitiesForUserMock(...args),
}));

function makeSupabaseFixture(existingItems: Array<{ item_name: string; is_active: boolean }> = []) {
  const inserts: Array<Record<string, unknown>> = [];

  const supabase = {
    from: vi.fn((table: string) => {
      if (table !== 'pricebook_items') throw new Error(`Unexpected table ${table}`);
      return {
        select: () => {
          const filters: { isActive?: boolean; ilikeName?: string } = {};
          const chain: any = {
            eq: (column: string, value: unknown) => {
              if (column === 'is_active') filters.isActive = Boolean(value);
              return chain;
            },
            // Simulate ILIKE exact (case-insensitive) match after unescaping wildcards.
            ilike: (_column: string, pattern: string) => {
              filters.ilikeName = String(pattern).replace(/\\(.)/g, '$1');
              return chain;
            },
            limit: async () => {
              const matches = existingItems.filter(
                (item) =>
                  (filters.isActive === undefined || item.is_active === filters.isActive) &&
                  (filters.ilikeName === undefined ||
                    item.item_name.toLowerCase() === filters.ilikeName!.toLowerCase()),
              );
              return { data: matches.slice(0, 1).map(() => ({ id: 'pb-existing' })), error: null };
            },
          };
          return chain;
        },
        insert: (row: Record<string, unknown>) => {
          inserts.push(row);
          return {
            select: () => ({
              single: async () => ({ data: { id: 'pb-new-1' }, error: null }),
            }),
          };
        },
      };
    }),
  };

  return { supabase, inserts };
}

function saveFormData(overrides: Partial<Record<string, string>> = {}) {
  const formData = new FormData();
  formData.set('item_name', 'Duct Cleaning');
  formData.set('unit_price', '55.00');
  formData.set('item_type', 'service');
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) formData.delete(key);
    else formData.set(key, value);
  }
  return formData;
}

describe('field pricebook actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      userId: 'tech-1',
      internalUser: {
        user_id: 'tech-1',
        account_owner_user_id: 'owner-1',
        is_active: true,
        role: 'technician',
      },
    });
    // field_billing_enabled tech by default.
    loadFieldBillingExplicitCapabilitiesForUserMock.mockResolvedValue({ field_billing_enabled: true });
  });

  describe('saveFieldItemToPricebookFromForm', () => {
    it('creates a new active Pricebook item for a field_billing_enabled user', async () => {
      const fixture = makeSupabaseFixture([]);
      createClientMock.mockResolvedValue(fixture.supabase);

      const { saveFieldItemToPricebookFromForm } = await import('@/lib/actions/field-pricebook-actions');
      const result = await saveFieldItemToPricebookFromForm(saveFormData());

      expect(result).toEqual({ ok: true, status: 'saved', id: 'pb-new-1' });
      expect(fixture.inserts).toHaveLength(1);
      expect(fixture.inserts[0]).toEqual(
        expect.objectContaining({
          account_owner_user_id: 'owner-1',
          item_name: 'Duct Cleaning',
          item_type: 'service',
          default_unit_price: 55,
          is_active: true,
        }),
      );
    });

    it('does not create a duplicate when an item with the same name already exists', async () => {
      const fixture = makeSupabaseFixture([{ item_name: 'Duct Cleaning', is_active: true }]);
      createClientMock.mockResolvedValue(fixture.supabase);

      const { saveFieldItemToPricebookFromForm } = await import('@/lib/actions/field-pricebook-actions');
      const result = await saveFieldItemToPricebookFromForm(saveFormData());

      expect(result).toEqual({ ok: true, status: 'already_exists' });
      expect(fixture.inserts).toHaveLength(0);
    });

    it('treats a differently-cased existing name as a duplicate', async () => {
      const fixture = makeSupabaseFixture([{ item_name: 'Duct Cleaning', is_active: true }]);
      createClientMock.mockResolvedValue(fixture.supabase);

      const { saveFieldItemToPricebookFromForm } = await import('@/lib/actions/field-pricebook-actions');
      const result = await saveFieldItemToPricebookFromForm(saveFormData({ item_name: 'duct cleaning' }));

      expect(result).toEqual({ ok: true, status: 'already_exists' });
      expect(fixture.inserts).toHaveLength(0);
    });

    it('denies the save for a user without field_billing_enabled', async () => {
      loadFieldBillingExplicitCapabilitiesForUserMock.mockResolvedValue({});
      const fixture = makeSupabaseFixture([]);
      createClientMock.mockResolvedValue(fixture.supabase);

      const { saveFieldItemToPricebookFromForm } = await import('@/lib/actions/field-pricebook-actions');
      const result = await saveFieldItemToPricebookFromForm(saveFormData());

      expect(result).toEqual({ ok: false, status: 'not_authorized' });
      expect(fixture.inserts).toHaveLength(0);
    });

    it('rejects invalid input without creating a row', async () => {
      const fixture = makeSupabaseFixture([]);
      createClientMock.mockResolvedValue(fixture.supabase);

      const { saveFieldItemToPricebookFromForm } = await import('@/lib/actions/field-pricebook-actions');
      const result = await saveFieldItemToPricebookFromForm(saveFormData({ item_name: '' }));

      expect(result).toEqual({ ok: false, status: 'invalid' });
      expect(fixture.inserts).toHaveLength(0);
    });

    it('falls back to service for an unsupported item_type', async () => {
      const fixture = makeSupabaseFixture([]);
      createClientMock.mockResolvedValue(fixture.supabase);

      const { saveFieldItemToPricebookFromForm } = await import('@/lib/actions/field-pricebook-actions');
      await saveFieldItemToPricebookFromForm(saveFormData({ item_type: 'other' }));

      expect(fixture.inserts[0]).toEqual(expect.objectContaining({ item_type: 'service' }));
    });
  });

  describe('checkFieldPricebookItemNameExistsFromForm', () => {
    it('returns true when an active item with the name exists', async () => {
      const fixture = makeSupabaseFixture([{ item_name: 'Duct Cleaning', is_active: true }]);
      createClientMock.mockResolvedValue(fixture.supabase);

      const { checkFieldPricebookItemNameExistsFromForm } = await import('@/lib/actions/field-pricebook-actions');
      const check = new FormData();
      check.set('item_name', 'Duct Cleaning');

      expect(await checkFieldPricebookItemNameExistsFromForm(check)).toEqual({ exists: true });
    });

    it('returns false when only an inactive item with the name exists', async () => {
      const fixture = makeSupabaseFixture([{ item_name: 'Duct Cleaning', is_active: false }]);
      createClientMock.mockResolvedValue(fixture.supabase);

      const { checkFieldPricebookItemNameExistsFromForm } = await import('@/lib/actions/field-pricebook-actions');
      const check = new FormData();
      check.set('item_name', 'Duct Cleaning');

      expect(await checkFieldPricebookItemNameExistsFromForm(check)).toEqual({ exists: false });
    });

    it('returns false when no item matches', async () => {
      const fixture = makeSupabaseFixture([{ item_name: 'Coil Cleaning', is_active: true }]);
      createClientMock.mockResolvedValue(fixture.supabase);

      const { checkFieldPricebookItemNameExistsFromForm } = await import('@/lib/actions/field-pricebook-actions');
      const check = new FormData();
      check.set('item_name', 'Duct Cleaning');

      expect(await checkFieldPricebookItemNameExistsFromForm(check)).toEqual({ exists: false });
    });
  });
});
