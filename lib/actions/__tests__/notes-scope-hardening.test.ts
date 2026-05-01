import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
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
}));

vi.mock('@/lib/auth/internal-user', () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

vi.mock('@/lib/business/platform-entitlement', () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

function makeSupabaseFixture() {
  const writes: Array<{ table: string; op: string }> = [];

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'internal_notes') {
        return {
          insert: vi.fn(() => {
            writes.push({ table, op: 'insert' });
            return {
              select: vi.fn(async () => ({ data: { id: 'note-1' }, error: null })),
            };
          }),
          update: vi.fn(() => {
            writes.push({ table, op: 'update' });
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ data: { id: 'note-1' }, error: null })),
              })),
            };
          }),
          delete: vi.fn(() => {
            writes.push({ table, op: 'delete' });
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ error: null })),
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

function buildCreateNoteFormData(overrides: Partial<Record<string, string>> = {}) {
  const formData = new FormData();
  formData.set('body', 'Test internal note');

  for (const [key, value] of Object.entries(overrides)) {
    if (value != null) {
      formData.set(key, value);
    }
  }

  return formData;
}

function buildTogglePinFormData(overrides: Partial<Record<string, string>> = {}) {
  const formData = new FormData();
  formData.set('note_id', 'note-1');
  formData.set('is_pinned', '0');

  for (const [key, value] of Object.entries(overrides)) {
    if (value != null) {
      formData.set(key, value);
    }
  }

  return formData;
}

function buildDeleteFormData(overrides: Partial<Record<string, string>> = {}) {
  const formData = new FormData();
  formData.set('note_id', 'note-1');

  for (const [key, value] of Object.entries(overrides)) {
    if (value != null) {
      formData.set(key, value);
    }
  }

  return formData;
}

describe('internal notes entitlement hardening', () => {
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

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: 'allowed_active',
    });
  });

  describe('createInternalNote', () => {
    it('allows active account internal note creation and writes', async () => {
      const { supabase, writes } = makeSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);

      const { createInternalNote } = await import('@/lib/actions/notes-actions');

      await createInternalNote(buildCreateNoteFormData());

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: 'owner-1' }),
      );
      expect(writes.some((w) => w.table === 'internal_notes' && w.op === 'insert')).toBe(true);
      expect(revalidatePathMock).toHaveBeenCalledWith('/notes');
    });

    it('allows valid trial internal note creation', async () => {
      const { supabase, writes } = makeSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: 'allowed_trial',
      });

      const { createInternalNote } = await import('@/lib/actions/notes-actions');

      await createInternalNote(buildCreateNoteFormData());

      expect(writes.some((w) => w.table === 'internal_notes' && w.op === 'insert')).toBe(true);
    });

    it('blocks expired trial internal note creation before writes', async () => {
      const { supabase, writes } = makeSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: 'blocked_trial_expired',
      });

      const { createInternalNote } = await import('@/lib/actions/notes-actions');

      await expect(createInternalNote(buildCreateNoteFormData())).rejects.toThrow(
        'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired',
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it('blocks null-ended trial internal note creation before writes', async () => {
      const { supabase, writes } = makeSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: 'blocked_trial_missing_end',
      });

      const { createInternalNote } = await import('@/lib/actions/notes-actions');

      await expect(createInternalNote(buildCreateNoteFormData())).rejects.toThrow(
        'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end',
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it('allows internal comped internal note creation', async () => {
      const { supabase, writes } = makeSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: 'allowed_internal_comped',
      });

      const { createInternalNote } = await import('@/lib/actions/notes-actions');

      await createInternalNote(buildCreateNoteFormData());

      expect(writes.some((w) => w.table === 'internal_notes' && w.op === 'insert')).toBe(true);
    });

    it('blocks missing entitlement internal note creation before writes', async () => {
      const { supabase, writes } = makeSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: 'blocked_missing_entitlement',
      });

      const { createInternalNote } = await import('@/lib/actions/notes-actions');

      await expect(createInternalNote(buildCreateNoteFormData())).rejects.toThrow(
        'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement',
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });

  describe('togglePinInternalNote', () => {
    it('allows active account pin toggle and writes', async () => {
      const { supabase, writes } = makeSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);

      const { togglePinInternalNote } = await import('@/lib/actions/notes-actions');

      await togglePinInternalNote(buildTogglePinFormData());

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: 'owner-1' }),
      );
      expect(writes.some((w) => w.table === 'internal_notes' && w.op === 'update')).toBe(true);
      expect(revalidatePathMock).toHaveBeenCalledWith('/notes');
    });

    it('allows valid trial pin toggle', async () => {
      const { supabase, writes } = makeSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: 'allowed_trial',
      });

      const { togglePinInternalNote } = await import('@/lib/actions/notes-actions');

      await togglePinInternalNote(buildTogglePinFormData());

      expect(writes.some((w) => w.table === 'internal_notes' && w.op === 'update')).toBe(true);
    });

    it('blocks expired trial pin toggle before writes', async () => {
      const { supabase, writes } = makeSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: 'blocked_trial_expired',
      });

      const { togglePinInternalNote } = await import('@/lib/actions/notes-actions');

      await expect(togglePinInternalNote(buildTogglePinFormData())).rejects.toThrow(
        'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired',
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it('blocks null-ended trial pin toggle before writes', async () => {
      const { supabase, writes } = makeSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: 'blocked_trial_missing_end',
      });

      const { togglePinInternalNote } = await import('@/lib/actions/notes-actions');

      await expect(togglePinInternalNote(buildTogglePinFormData())).rejects.toThrow(
        'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end',
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it('allows internal comped pin toggle', async () => {
      const { supabase, writes } = makeSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: 'allowed_internal_comped',
      });

      const { togglePinInternalNote } = await import('@/lib/actions/notes-actions');

      await togglePinInternalNote(buildTogglePinFormData());

      expect(writes.some((w) => w.table === 'internal_notes' && w.op === 'update')).toBe(true);
    });

    it('blocks missing entitlement pin toggle before writes', async () => {
      const { supabase, writes } = makeSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: 'blocked_missing_entitlement',
      });

      const { togglePinInternalNote } = await import('@/lib/actions/notes-actions');

      await expect(togglePinInternalNote(buildTogglePinFormData())).rejects.toThrow(
        'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement',
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });

  describe('deleteInternalNote', () => {
    it('allows active account note deletion and writes', async () => {
      const { supabase, writes } = makeSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);

      const { deleteInternalNote } = await import('@/lib/actions/notes-actions');

      await deleteInternalNote(buildDeleteFormData());

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: 'owner-1' }),
      );
      expect(writes.some((w) => w.table === 'internal_notes' && w.op === 'delete')).toBe(true);
      expect(revalidatePathMock).toHaveBeenCalledWith('/notes');
    });

    it('allows valid trial note deletion', async () => {
      const { supabase, writes } = makeSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: 'allowed_trial',
      });

      const { deleteInternalNote } = await import('@/lib/actions/notes-actions');

      await deleteInternalNote(buildDeleteFormData());

      expect(writes.some((w) => w.table === 'internal_notes' && w.op === 'delete')).toBe(true);
    });

    it('blocks expired trial note deletion before writes', async () => {
      const { supabase, writes } = makeSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: 'blocked_trial_expired',
      });

      const { deleteInternalNote } = await import('@/lib/actions/notes-actions');

      await expect(deleteInternalNote(buildDeleteFormData())).rejects.toThrow(
        'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired',
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it('blocks null-ended trial note deletion before writes', async () => {
      const { supabase, writes } = makeSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: 'blocked_trial_missing_end',
      });

      const { deleteInternalNote } = await import('@/lib/actions/notes-actions');

      await expect(deleteInternalNote(buildDeleteFormData())).rejects.toThrow(
        'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end',
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it('allows internal comped note deletion', async () => {
      const { supabase, writes } = makeSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: 'allowed_internal_comped',
      });

      const { deleteInternalNote } = await import('@/lib/actions/notes-actions');

      await deleteInternalNote(buildDeleteFormData());

      expect(writes.some((w) => w.table === 'internal_notes' && w.op === 'delete')).toBe(true);
    });

    it('blocks missing entitlement note deletion before writes', async () => {
      const { supabase, writes } = makeSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: 'blocked_missing_entitlement',
      });

      const { deleteInternalNote } = await import('@/lib/actions/notes-actions');

      await expect(deleteInternalNote(buildDeleteFormData())).rejects.toThrow(
        'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement',
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });
});
