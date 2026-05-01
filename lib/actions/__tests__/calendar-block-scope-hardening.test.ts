import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("@/lib/utils/schedule-la", () => ({
  laDateTimeToUtcIso: (date: string, time: string) => `${date}T${time}:00.000Z`,
}));

type CalendarEventWrite = {
  method: "insert" | "update" | "delete";
  payload?: Record<string, unknown>;
};

function makeFormData(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

function makeCalendarBlockFixture(options?: {
  accountOwnerUserId?: string;
  assigneeOwnerUserId?: string | null;
  existingEventOwnerUserId?: string | null;
}) {
  const accountOwnerUserId = String(options?.accountOwnerUserId ?? "owner-1");
  const assigneeOwnerUserId = options?.assigneeOwnerUserId ?? accountOwnerUserId;
  const existingEventOwnerUserId = options?.existingEventOwnerUserId ?? accountOwnerUserId;

  const calendarEventWrites: CalendarEventWrite[] = [];

  function makeMutationResult() {
    const query: any = {
      eq: vi.fn(() => query),
      then: (onFulfilled: (value: { error: null }) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve({ error: null }).then(onFulfilled, onRejected),
    };
    return query;
  }

  const supabase = {
    from(table: string) {
      if (table === "internal_users") {
        let targetUserId = "";
        let targetOwnerUserId = "";
        let activeFilter = false;

        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn((column: string, value: unknown) => {
            if (column === "user_id") targetUserId = String(value ?? "").trim();
            if (column === "account_owner_user_id") targetOwnerUserId = String(value ?? "").trim();
            if (column === "is_active") activeFilter = value === true;
            return query;
          }),
          maybeSingle: vi.fn(async () => ({
            data:
              targetUserId &&
              activeFilter &&
              targetOwnerUserId &&
              assigneeOwnerUserId === targetOwnerUserId
                ? { user_id: targetUserId }
                : null,
            error: null,
          })),
        };

        return query;
      }

      if (table === "calendar_events") {
        let eventIdFilter = "";
        let ownerUserIdFilter = "";
        let eventTypeFilter = "";

        const selectQuery: any = {
          select: vi.fn(() => selectQuery),
          eq: vi.fn((column: string, value: unknown) => {
            if (column === "id") eventIdFilter = String(value ?? "").trim();
            if (column === "owner_user_id") ownerUserIdFilter = String(value ?? "").trim();
            if (column === "event_type") eventTypeFilter = String(value ?? "").trim();
            return selectQuery;
          }),
          maybeSingle: vi.fn(async () => ({
            data:
              eventIdFilter &&
              ownerUserIdFilter &&
              eventTypeFilter === "block" &&
              existingEventOwnerUserId === ownerUserIdFilter
                ? { id: eventIdFilter }
                : null,
            error: null,
          })),
        };

        return {
          select: selectQuery.select,
          eq: selectQuery.eq,
          maybeSingle: selectQuery.maybeSingle,
          insert: vi.fn((payload: Record<string, unknown>) => {
            calendarEventWrites.push({ method: "insert", payload });
            return Promise.resolve({ error: null });
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            calendarEventWrites.push({ method: "update", payload });
            return makeMutationResult();
          }),
          delete: vi.fn(() => {
            calendarEventWrites.push({ method: "delete" });
            return makeMutationResult();
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return {
    supabase,
    accountOwnerUserId,
    calendarEventWrites,
  };
}

describe("calendar block same-account scope hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      userId: "internal-user-1",
      internalUser: {
        user_id: "internal-user-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  it("allows same-account internal createCalendarBlockEventFromForm and writes scoped calendar event", async () => {
    const fixture = makeCalendarBlockFixture();
    createClientMock.mockResolvedValue(fixture.supabase);

    const { createCalendarBlockEventFromForm } = await import("@/lib/actions/calendar-event-actions");

    await expect(
      createCalendarBlockEventFromForm(
        makeFormData({
          return_to: "/calendar?view=week",
          internal_user_id: "internal-user-2",
          date: "2026-04-24",
          start_time: "09:00",
          end_time: "11:00",
          title: "Training Block",
          description: "Scoped block",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/calendar?view=week&banner=calendar_block_created");

    expect(fixture.calendarEventWrites).toHaveLength(1);
    expect(fixture.calendarEventWrites[0]).toMatchObject({
      method: "insert",
      payload: {
        owner_user_id: fixture.accountOwnerUserId,
        internal_user_id: "internal-user-2",
        created_by_user_id: "internal-user-1",
        event_type: "block",
        title: "Training Block",
      },
    });
  });

  it("allows same-account internal updateCalendarBlockEventFromForm past scoped event preflight", async () => {
    const fixture = makeCalendarBlockFixture();
    createClientMock.mockResolvedValue(fixture.supabase);

    const { updateCalendarBlockEventFromForm } = await import("@/lib/actions/calendar-event-actions");

    await expect(
      updateCalendarBlockEventFromForm(
        makeFormData({
          return_to: "/calendar",
          event_id: "event-1",
          internal_user_id: "internal-user-2",
          date: "2026-04-24",
          start_time: "12:00",
          end_time: "13:30",
          title: "Updated Block",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/calendar?banner=calendar_block_updated");

    expect(fixture.calendarEventWrites).toHaveLength(1);
    expect(fixture.calendarEventWrites[0]).toMatchObject({
      method: "update",
      payload: {
        title: "Updated Block",
        internal_user_id: "internal-user-2",
      },
    });
  });

  it("allows same-account internal deleteCalendarBlockEventFromForm past scoped event preflight", async () => {
    const fixture = makeCalendarBlockFixture();
    createClientMock.mockResolvedValue(fixture.supabase);

    const { deleteCalendarBlockEventFromForm } = await import("@/lib/actions/calendar-event-actions");

    await expect(
      deleteCalendarBlockEventFromForm(
        makeFormData({
          return_to: "/calendar",
          event_id: "event-1",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/calendar?banner=calendar_block_deleted");

    expect(fixture.calendarEventWrites).toHaveLength(1);
    expect(fixture.calendarEventWrites[0]).toMatchObject({ method: "delete" });
  });

  it("denies cross-account internal createCalendarBlockEventFromForm before calendar_events write", async () => {
    const fixture = makeCalendarBlockFixture({ assigneeOwnerUserId: "owner-2" });
    createClientMock.mockResolvedValue(fixture.supabase);

    const { createCalendarBlockEventFromForm } = await import("@/lib/actions/calendar-event-actions");

    await expect(
      createCalendarBlockEventFromForm(
        makeFormData({
          return_to: "/calendar",
          internal_user_id: "internal-user-cross",
          date: "2026-04-24",
          start_time: "09:00",
          end_time: "10:00",
          title: "Blocked",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/calendar?banner=calendar_block_user_required");

    expect(fixture.calendarEventWrites).toHaveLength(0);
  });

  it("denies cross-account internal updateCalendarBlockEventFromForm before calendar_events write", async () => {
    const fixture = makeCalendarBlockFixture({ existingEventOwnerUserId: "owner-2" });
    createClientMock.mockResolvedValue(fixture.supabase);

    const { updateCalendarBlockEventFromForm } = await import("@/lib/actions/calendar-event-actions");

    await expect(
      updateCalendarBlockEventFromForm(
        makeFormData({
          return_to: "/calendar",
          event_id: "event-cross",
          internal_user_id: "internal-user-2",
          date: "2026-04-24",
          start_time: "12:00",
          end_time: "13:00",
          title: "Blocked",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/calendar?banner=calendar_block_update_missing");

    expect(fixture.calendarEventWrites).toHaveLength(0);
  });

  it("denies cross-account internal deleteCalendarBlockEventFromForm before calendar_events write", async () => {
    const fixture = makeCalendarBlockFixture({ existingEventOwnerUserId: "owner-2" });
    createClientMock.mockResolvedValue(fixture.supabase);

    const { deleteCalendarBlockEventFromForm } = await import("@/lib/actions/calendar-event-actions");

    await expect(
      deleteCalendarBlockEventFromForm(
        makeFormData({
          return_to: "/calendar",
          event_id: "event-cross",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/calendar?banner=calendar_block_delete_missing");

    expect(fixture.calendarEventWrites).toHaveLength(0);
  });

  it("denies non-internal for targeted calendar block entrypoints before calendar_events write", async () => {
    const fixture = makeCalendarBlockFixture();
    createClientMock.mockResolvedValue(fixture.supabase);
    requireInternalUserMock.mockRejectedValue(new Error("Active internal user required."));

    const {
      createCalendarBlockEventFromForm,
      updateCalendarBlockEventFromForm,
      deleteCalendarBlockEventFromForm,
    } = await import("@/lib/actions/calendar-event-actions");

    await expect(
      createCalendarBlockEventFromForm(
        makeFormData({
          return_to: "/calendar",
          internal_user_id: "internal-user-2",
          date: "2026-04-24",
          start_time: "09:00",
          end_time: "10:00",
          title: "Blocked",
        }),
      ),
    ).rejects.toThrow("Active internal user required.");

    await expect(
      updateCalendarBlockEventFromForm(
        makeFormData({
          return_to: "/calendar",
          event_id: "event-1",
          internal_user_id: "internal-user-2",
          date: "2026-04-24",
          start_time: "11:00",
          end_time: "12:00",
          title: "Blocked",
        }),
      ),
    ).rejects.toThrow("Active internal user required.");

    await expect(
      deleteCalendarBlockEventFromForm(
        makeFormData({
          return_to: "/calendar",
          event_id: "event-1",
        }),
      ),
    ).rejects.toThrow("Active internal user required.");

    expect(fixture.calendarEventWrites).toHaveLength(0);
  });
});