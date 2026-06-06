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
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveAccountEntitlement: vi.fn(),
}));

vi.mock("@/lib/business/platform-billing-stripe", () => ({
  reconcilePlatformSubscriptionSeatQuantity: vi.fn(),
}));

function buildCapabilityFormData(keys: string[]) {
  const formData = new FormData();
  formData.set("user_id", "tech-1");
  for (const key of keys) {
    formData.append("capability_key", key);
  }
  return formData;
}

function adminActor(role = "admin") {
  return {
    userId: `${role}-1`,
    internalUser: {
      user_id: `${role}-1`,
      role,
      is_active: true,
      account_owner_user_id: "owner-1",
      created_by: null,
    },
  };
}

function makeAdminFixture() {
  const writes = {
    upsertedCapabilityRows: [] as Array<Record<string, unknown>>,
    updatedInternalUsers: [] as Array<Record<string, unknown>>,
  };

  const internalUsersById: Record<string, Record<string, unknown>> = {
    "tech-1": {
      user_id: "tech-1",
      role: "tech",
      is_active: true,
      account_owner_user_id: "owner-1",
      created_by: "admin-1",
    },
  };

  const admin = {
    from: vi.fn((table: string) => {
      if (table === "internal_users") {
        const filters: Record<string, unknown> = {};
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn((column: string, value: unknown) => {
            filters[column] = value;
            return query;
          }),
          maybeSingle: vi.fn(async () => {
            const row = internalUsersById[String(filters.user_id ?? "")] ?? null;
            if (!row) return { data: null, error: null };
            if (
              filters.account_owner_user_id &&
              row.account_owner_user_id !== filters.account_owner_user_id
            ) {
              return { data: null, error: null };
            }
            return { data: row, error: null };
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            writes.updatedInternalUsers.push(payload);
            return query;
          }),
          single: vi.fn(async () => ({ data: { user_id: "tech-1" }, error: null })),
        };
        return query;
      }

      if (table === "internal_user_access_capabilities") {
        return {
          upsert: vi.fn(async (payload: Array<Record<string, unknown>>) => {
            writes.upsertedCapabilityRows.push(...payload);
            return { data: null, error: null };
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { admin, writes };
}

function capabilityRow(rows: Array<Record<string, unknown>>, key: string) {
  return rows.find((row) => row.capability_key === key);
}

describe("updateInternalUserFieldBillingCapabilitiesFromForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    createClientMock.mockResolvedValue({});
    requireInternalRoleMock.mockResolvedValue(adminActor("admin"));
  });

  it("saving Enable field billing access on upserts the included field billing/payment rows without changing the Technician role", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(
      mod.updateInternalUserFieldBillingCapabilitiesFromForm(
        buildCapabilityFormData(["field_billing_enabled"]),
      ),
    ).resolves.toBeUndefined();

    expect(requireInternalRoleMock).toHaveBeenCalledWith("admin", { supabase: {} });
    expect(fixture.writes.updatedInternalUsers).toHaveLength(0);
    expect(fixture.writes.upsertedCapabilityRows).toHaveLength(6);
    for (const key of [
      "field_billing_enabled",
      "can_view_field_billing_summary",
      "can_collect_field_payment",
      "can_collect_card_payment",
      "can_report_non_card_collection",
    ]) {
      expect(capabilityRow(fixture.writes.upsertedCapabilityRows, key)).toEqual(
        expect.objectContaining({
          account_owner_user_id: "owner-1",
          internal_user_id: "tech-1",
          capability_key: key,
          enabled: true,
          updated_by_user_id: "admin-1",
        }),
      );
    }
    expect(capabilityRow(fixture.writes.upsertedCapabilityRows, "can_verify_non_card_collection")).toEqual(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("saving Enable field billing access off persists the included field billing/payment rows as disabled", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(
      mod.updateInternalUserFieldBillingCapabilitiesFromForm(
        buildCapabilityFormData([]),
      ),
    ).resolves.toBeUndefined();

    for (const key of [
      "field_billing_enabled",
      "can_view_field_billing_summary",
      "can_collect_field_payment",
      "can_collect_card_payment",
      "can_report_non_card_collection",
    ]) {
      expect(capabilityRow(fixture.writes.upsertedCapabilityRows, key)).toEqual(
        expect.objectContaining({ enabled: false }),
      );
    }
  });

  it("persists Confirm field-reported payments independently from field billing access", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(
      mod.updateInternalUserFieldBillingCapabilitiesFromForm(
        buildCapabilityFormData(["can_verify_non_card_collection"]),
      ),
    ).resolves.toBeUndefined();

    expect(capabilityRow(fixture.writes.upsertedCapabilityRows, "can_verify_non_card_collection")).toEqual(
      expect.objectContaining({ enabled: true }),
    );
    expect(capabilityRow(fixture.writes.upsertedCapabilityRows, "field_billing_enabled")).toEqual(
      expect.objectContaining({ enabled: false }),
    );
    expect(capabilityRow(fixture.writes.upsertedCapabilityRows, "can_report_non_card_collection")).toEqual(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("rejects unknown capability keys before writing capability rows", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(
      mod.updateInternalUserFieldBillingCapabilitiesFromForm(
        buildCapabilityFormData(["field_billing_enabled", "can_record_manual_payment"]),
      ),
    ).rejects.toThrow("UNKNOWN_FIELD_BILLING_CAPABILITY");

    expect(fixture.writes.upsertedCapabilityRows).toHaveLength(0);
    expect(fixture.writes.updatedInternalUsers).toHaveLength(0);
  });

  it("does not allow Billing role actors to manage capability rows", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);
    requireInternalRoleMock.mockRejectedValueOnce(new Error("INTERNAL_ROLE_REQUIRED"));

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(
      mod.updateInternalUserFieldBillingCapabilitiesFromForm(
        buildCapabilityFormData(["field_billing_enabled"]),
      ),
    ).rejects.toThrow("INTERNAL_ROLE_REQUIRED");

    expect(requireInternalRoleMock).toHaveBeenCalledWith("admin", { supabase: {} });
    expect(fixture.writes.upsertedCapabilityRows).toHaveLength(0);
  });

  it("does not allow Technician actors to manage capability rows", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);
    requireInternalRoleMock.mockRejectedValueOnce(new Error("INTERNAL_ROLE_REQUIRED"));

    const mod = await import("@/lib/actions/internal-user-actions");

    await expect(
      mod.updateInternalUserFieldBillingCapabilitiesFromForm(
        buildCapabilityFormData(["field_billing_enabled"]),
      ),
    ).rejects.toThrow("INTERNAL_ROLE_REQUIRED");

    expect(requireInternalRoleMock).toHaveBeenCalledWith("admin", { supabase: {} });
    expect(fixture.writes.upsertedCapabilityRows).toHaveLength(0);
  });
});
