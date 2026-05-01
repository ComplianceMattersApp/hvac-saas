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

vi.mock('@/lib/utils/schedule-la', () => ({
  laDateTimeToUtcIso: (date: string, time: string) => {
    return `${date}T${time}:00Z`;
  },
}));

function makeCalendarEventFixture() {
  const writes: Array<{ table: string; op: string }> = [];

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'calendar_events') {
        return {
          insert: vi.fn(() => {
            writes.push({ table, op: 'insert' });
            return { error: null };
          }),
          update: vi.fn(() => {
            writes.push({ table, op: 'update' });
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(async () => ({ error: null })),
                })),
              })),
            };
          }),
          delete: vi.fn(() => {
            writes.push({ table, op: 'delete' });
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(async () => ({ error: null })),
                })),
              })),
            };
          }),
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: 'event-1' },
                    error: null,
                  })),
                })),
              })),
            })),
          })),
        };
      }

      if (table === 'internal_users') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { user_id: 'internal-user-1' },
                    error: null,
                  })),
                })),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { supabase, writes };
}

function buildCreateFormData(overrides: Partial<Record<string, string>> = {}) {
  const formData = new FormData();
  formData.set('return_to', '/calendar');
  formData.set('internal_user_id', 'internal-user-1');
  formData.set('date', '2026-04-24');
  formData.set('start_time', '09:00');
  formData.set('end_time', '10:00');
  formData.set('title', 'Training Block');
  formData.set('description', 'Team training');

  for (const [key, value] of Object.entries(overrides)) {
    if (value != null) {
      formData.set(key, value);
    }
  }

  return formData;
}

function buildUpdateFormData(overrides: Partial<Record<string, string>> = {}) {
  const formData = new FormData();
  formData.set('return_to', '/calendar');
  formData.set('event_id', 'event-1');
  formData.set('internal_user_id', 'internal-user-1');
  formData.set('date', '2026-04-25');
  formData.set('start_time', '14:00');
  formData.set('end_time', '15:00');
  formData.set('title', 'Updated Block');
  formData.set('description', 'Updated training');

  for (const [key, value] of Object.entries(overrides)) {
    if (value != null) {
      formData.set(key, value);
    }
  }

  return formData;
}

function buildDeleteFormData(overrides: Partial<Record<string, string>> = {}) {
  const formData = new FormData();
  formData.set('return_to', '/calendar');
  formData.set('event_id', 'event-1');

  for (const [key, value] of Object.entries(overrides)) {
    if (value != null) {
      formData.set(key, value);
    }
  }

  return formData;
}

describe('calendar event entitlement hardening', () => {
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

  describe('createCalendarBlockEventFromForm', () => {
    it('allows active account calendar block creation and writes', async () => {
      const { supabase, writes } = makeCalendarEventFixture();
      createClientMock.mockResolvedValue(supabase);

      const { createCalendarBlockEventFromForm } = await import('@/lib/actions/calendar-event-actions');

      await expect(createCalendarBlockEventFromForm(buildCreateFormData())).rejects.toThrow(
        'REDIRECT:/calendar?banner=calendar_block_created',
      );

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: 'owner-1' }),
      );
      expect(writes.some((w) => w.table === 'calendar_events' && w.op === 'insert')).toBe(true);
      expect(revalidatePathMock).toHaveBeenCalledWith('/calendar');
    });

    it('allows valid trial calendar block creation', async () => {
      const { supabase, writes } = makeCalendarEventFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: 'allowed_trial',
      });

      const { createCalendarBlockEventFromForm } = await import('@/lib/actions/calendar-event-actions');

      await expect(createCalendarBlockEventFromForm(buildCreateFormData())).rejects.toThrow(
        'REDIRECT:/calendar?banner=calendar_block_created',
      );

      expect(writes.some((w) => w.table === 'calendar_events' && w.op === 'insert')).toBe(true);
    });

    it('blocks expired trial calendar block creation before writes', async () => {
      const { supabase, writes } = makeCalendarEventFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: 'blocked_trial_expired',
      });

      const { createCalendarBlockEventFromForm } = await import('@/lib/actions/calendar-event-actions');

      await expect(createCalendarBlockEventFromForm(buildCreateFormData())).rejects.toThrow(
        'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired',
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it('blocks null-ended trial calendar block creation before writes', async () => {
      const { supabase, writes } = makeCalendarEventFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: 'blocked_trial_missing_end',
      });

      const { createCalendarBlockEventFromForm } = await import('@/lib/actions/calendar-event-actions');

      await expect(createCalendarBlockEventFromForm(buildCreateFormData())).rejects.toThrow(
        'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end',
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it('allows internal comped calendar block creation', async () => {
      const { supabase, writes } = makeCalendarEventFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: 'allowed_internal_comped',
      });

      const { createCalendarBlockEventFromForm } = await import('@/lib/actions/calendar-event-actions');

      await expect(createCalendarBlockEventFromForm(buildCreateFormData())).rejects.toThrow(
        'REDIRECT:/calendar?banner=calendar_block_created',
      );

      expect(writes.some((w) => w.table === 'calendar_events' && w.op === 'insert')).toBe(true);
    });

    it('blocks missing entitlement calendar block creation before writes', async () => {
      const { supabase, writes } = makeCalendarEventFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: 'blocked_missing_entitlement',
      });

      const { createCalendarBlockEventFromForm } = await import('@/lib/actions/calendar-event-actions');

      await expect(createCalendarBlockEventFromForm(buildCreateFormData())).rejects.toThrow(
        'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement',
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });

  describe('updateCalendarBlockEventFromForm', () => {
    it('allows active account calendar block update and writes', async () => {
      const { supabase, writes } = makeCalendarEventFixture();
      createClientMock.mockResolvedValue(supabase);

      const { updateCalendarBlockEventFromForm } = await import('@/lib/actions/calendar-event-actions');

      await expect(updateCalendarBlockEventFromForm(buildUpdateFormData())).rejects.toThrow(
        'REDIRECT:/calendar?banner=calendar_block_updated',
      );

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: 'owner-1' }),
      );
      expect(writes.some((w) => w.table === 'calendar_events' && w.op === 'update')).toBe(true);
      expect(revalidatePathMock).toHaveBeenCalledWith('/calendar');
    });

    it('allows valid trial calendar block update', async () => {
      const { supabase, writes } = makeCalendarEventFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: 'allowed_trial',
      });

      const { updateCalendarBlockEventFromForm } = await import('@/lib/actions/calendar-event-actions');

      await expect(updateCalendarBlockEventFromForm(buildUpdateFormData())).rejects.toThrow(
        'REDIRECT:/calendar?banner=calendar_block_updated',
      );

      expect(writes.some((w) => w.table === 'calendar_events' && w.op === 'update')).toBe(true);
    });

    it('blocks expired trial calendar block update before writes', async () => {
      const { supabase, writes } = makeCalendarEventFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: 'blocked_trial_expired',
      });

      const { updateCalendarBlockEventFromForm } = await import('@/lib/actions/calendar-event-actions');

      await expect(updateCalendarBlockEventFromForm(buildUpdateFormData())).rejects.toThrow(
        'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired',
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it('blocks null-ended trial calendar block update before writes', async () => {
      const { supabase, writes } = makeCalendarEventFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: 'blocked_trial_missing_end',
      });

      const { updateCalendarBlockEventFromForm } = await import('@/lib/actions/calendar-event-actions');

      await expect(updateCalendarBlockEventFromForm(buildUpdateFormData())).rejects.toThrow(
        'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end',
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it('allows internal comped calendar block update', async () => {
      const { supabase, writes } = makeCalendarEventFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: 'allowed_internal_comped',
      });

      const { updateCalendarBlockEventFromForm } = await import('@/lib/actions/calendar-event-actions');

      await expect(updateCalendarBlockEventFromForm(buildUpdateFormData())).rejects.toThrow(
        'REDIRECT:/calendar?banner=calendar_block_updated',
      );

      expect(writes.some((w) => w.table === 'calendar_events' && w.op === 'update')).toBe(true);
    });

    it('blocks missing entitlement calendar block update before writes', async () => {
      const { supabase, writes } = makeCalendarEventFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: 'blocked_missing_entitlement',
      });

      const { updateCalendarBlockEventFromForm } = await import('@/lib/actions/calendar-event-actions');

      await expect(updateCalendarBlockEventFromForm(buildUpdateFormData())).rejects.toThrow(
        'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement',
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });

  describe('deleteCalendarBlockEventFromForm', () => {
    it('allows active account calendar block delete and writes', async () => {
      const { supabase, writes } = makeCalendarEventFixture();
      createClientMock.mockResolvedValue(supabase);

      const { deleteCalendarBlockEventFromForm } = await import('@/lib/actions/calendar-event-actions');

      await expect(deleteCalendarBlockEventFromForm(buildDeleteFormData())).rejects.toThrow(
        'REDIRECT:/calendar?banner=calendar_block_deleted',
      );

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: 'owner-1' }),
      );
      expect(writes.some((w) => w.table === 'calendar_events' && w.op === 'delete')).toBe(true);
      expect(revalidatePathMock).toHaveBeenCalledWith('/calendar');
    });

    it('allows valid trial calendar block delete', async () => {
      const { supabase, writes } = makeCalendarEventFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: 'allowed_trial',
      });

      const { deleteCalendarBlockEventFromForm } = await import('@/lib/actions/calendar-event-actions');

      await expect(deleteCalendarBlockEventFromForm(buildDeleteFormData())).rejects.toThrow(
        'REDIRECT:/calendar?banner=calendar_block_deleted',
      );

      expect(writes.some((w) => w.table === 'calendar_events' && w.op === 'delete')).toBe(true);
    });

    it('blocks expired trial calendar block delete before writes', async () => {
      const { supabase, writes } = makeCalendarEventFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: 'blocked_trial_expired',
      });

      const { deleteCalendarBlockEventFromForm } = await import('@/lib/actions/calendar-event-actions');

      await expect(deleteCalendarBlockEventFromForm(buildDeleteFormData())).rejects.toThrow(
        'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired',
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it('blocks null-ended trial calendar block delete before writes', async () => {
      const { supabase, writes } = makeCalendarEventFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: 'blocked_trial_missing_end',
      });

      const { deleteCalendarBlockEventFromForm } = await import('@/lib/actions/calendar-event-actions');

      await expect(deleteCalendarBlockEventFromForm(buildDeleteFormData())).rejects.toThrow(
        'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end',
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it('allows internal comped calendar block delete', async () => {
      const { supabase, writes } = makeCalendarEventFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: 'allowed_internal_comped',
      });

      const { deleteCalendarBlockEventFromForm } = await import('@/lib/actions/calendar-event-actions');

      await expect(deleteCalendarBlockEventFromForm(buildDeleteFormData())).rejects.toThrow(
        'REDIRECT:/calendar?banner=calendar_block_deleted',
      );

      expect(writes.some((w) => w.table === 'calendar_events' && w.op === 'delete')).toBe(true);
    });

    it('blocks missing entitlement calendar block delete before writes', async () => {
      const { supabase, writes } = makeCalendarEventFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: 'blocked_missing_entitlement',
      });

      const { deleteCalendarBlockEventFromForm } = await import('@/lib/actions/calendar-event-actions');

      await expect(deleteCalendarBlockEventFromForm(buildDeleteFormData())).rejects.toThrow(
        'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement',
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });
});
