import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalRole: (...args: unknown[]) => requireInternalRoleMock(...args),
  requireInternalUser: vi.fn(),
}));

function buildFixture(options?: { scopedRead?: boolean }) {
  const scopedRead = options?.scopedRead !== false;
  const updates: Array<Record<string, unknown>> = [];

  const admin = {
    from(table: string) {
      if (table !== "internal_user_time_entries") {
        throw new Error(`Unexpected table: ${table}`);
      }

      const eqFilters: Record<string, unknown> = {};
      let pendingUpdate: Record<string, unknown> | null = null;

      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          eqFilters[column] = value;
          return query;
        }),
        maybeSingle: vi.fn(async () => {
          if (!scopedRead) return { data: null, error: null };
          if (eqFilters.account_owner_user_id !== "owner-1") return { data: null, error: null };
          return {
            data: {
              id: eqFilters.id,
              account_owner_user_id: "owner-1",
            },
            error: null,
          };
        }),
        update: vi.fn((payload: Record<string, unknown>) => {
          pendingUpdate = payload;
          return query;
        }),
        single: vi.fn(async () => {
          if (!pendingUpdate) return { data: null, error: new Error("MISSING_UPDATE") };
          updates.push({ ...pendingUpdate, ...eqFilters });
          return { data: { id: eqFilters.id }, error: null };
        }),
      };

      return query;
    },
  };

  return { admin, updates };
}

describe("time clock admin correction action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    createClientMock.mockResolvedValue({});
    requireInternalRoleMock.mockResolvedValue({
      internalUser: {
        user_id: "admin-1",
        role: "admin",
        account_owner_user_id: "owner-1",
      },
    });
  });

  it("blocks correction when adjustment reason is missing", async () => {
    const fixture = buildFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { correctTimeEntryFromForm } = await import("@/lib/actions/time-clock-actions");
    const formData = new FormData();
    formData.set("entry_id", "entry-1");
    formData.set("status", "closed");

    await expect(correctTimeEntryFromForm(formData)).rejects.toThrow(
      "REDIRECT:/ops/admin/time-clock?notice=reason_required",
    );

    expect(fixture.updates).toHaveLength(0);
  });

  it("updates a scoped entry and revalidates review surfaces", async () => {
    const fixture = buildFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { correctTimeEntryFromForm } = await import("@/lib/actions/time-clock-actions");
    const formData = new FormData();
    formData.set("entry_id", "entry-1");
    formData.set("status", "closed");
    formData.set("clock_out_at_local", "2026-05-24T15:30");
    formData.set("lunch_end_at_local", "2026-05-24T12:45");
    formData.set("adjustment_reason", "Dispatcher confirmed missed clock-out.");

    await expect(correctTimeEntryFromForm(formData)).rejects.toThrow(
      "REDIRECT:/ops/admin/time-clock?notice=entry_corrected",
    );

    expect(fixture.updates).toHaveLength(1);
    expect(fixture.updates[0]?.status).toBe("closed");
    expect(fixture.updates[0]?.adjusted_by_user_id).toBe("admin-1");
    expect(fixture.updates[0]?.adjustment_reason).toBe("Dispatcher confirmed missed clock-out.");
    expect(revalidatePathMock).toHaveBeenCalledWith("/ops/admin/time-clock");
    expect(revalidatePathMock).toHaveBeenCalledWith("/ops");
    expect(revalidatePathMock).toHaveBeenCalledWith("/time-clock");
  });

  it("blocks correction when entry is outside account scope", async () => {
    const fixture = buildFixture({ scopedRead: false });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { correctTimeEntryFromForm } = await import("@/lib/actions/time-clock-actions");
    const formData = new FormData();
    formData.set("entry_id", "foreign-entry");
    formData.set("status", "needs_review");
    formData.set("adjustment_reason", "Out-of-scope test");

    await expect(correctTimeEntryFromForm(formData)).rejects.toThrow(
      "REDIRECT:/ops/admin/time-clock?notice=entry_not_found",
    );

    expect(fixture.updates).toHaveLength(0);
  });
});