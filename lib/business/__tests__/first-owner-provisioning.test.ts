import { describe, expect, it, vi } from "vitest";
import { provisionFirstOwnerAccount, type FirstOwnerProvisioningClient } from "@/lib/business/first-owner-provisioning";
import {
  STARTER_KIT_V1_SEEDS,
  STARTER_KIT_V2_SEEDS,
  STARTER_KIT_V3_SEEDS,
  type PricebookSeedInsertRow,
} from "@/lib/business/pricebook-seeding";

type EntitlementRow = {
  account_owner_user_id: string;
  plan_key: string | null;
  entitlement_status: string | null;
  seat_limit: number | null;
  trial_ends_at: string | null;
  entitlement_valid_until: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  stripe_subscription_status: string | null;
  stripe_current_period_end: string | null;
  stripe_cancel_at_period_end: boolean | null;
  notes: string | null;
};

type Store = {
  authUsersByEmail: Record<string, { id: string; email: string }>;
  profilesById: Record<string, { id: string; email: string | null; full_name: string | null }>;
  internalUsersByUserId: Record<
    string,
    {
      user_id: string;
      account_owner_user_id: string | null;
      role: string | null;
      is_active: boolean | null;
      created_by: string | null;
    }
  >;
  businessProfilesByOwnerId: Record<
    string,
    {
      account_owner_user_id: string;
      display_name: string | null;
      support_email: string | null;
      support_phone: string | null;
      billing_mode: string | null;
    }
  >;
  entitlementsByOwnerId: Record<string, EntitlementRow>;
  pricebookSeedRowsByOwnerId: Record<string, Array<{ seed_key: string; item_name: string }>>;
  sequence: number;
};

function makeEntitlementRow(overrides: Partial<EntitlementRow>): EntitlementRow {
  return {
    account_owner_user_id: overrides.account_owner_user_id ?? "",
    plan_key: overrides.plan_key ?? "starter",
    entitlement_status: overrides.entitlement_status ?? "trial",
    seat_limit: overrides.seat_limit ?? null,
    trial_ends_at: overrides.trial_ends_at ?? null,
    entitlement_valid_until: overrides.entitlement_valid_until ?? null,
    stripe_customer_id: overrides.stripe_customer_id ?? null,
    stripe_subscription_id: overrides.stripe_subscription_id ?? null,
    stripe_price_id: overrides.stripe_price_id ?? null,
    stripe_subscription_status: overrides.stripe_subscription_status ?? null,
    stripe_current_period_end: overrides.stripe_current_period_end ?? null,
    stripe_cancel_at_period_end: overrides.stripe_cancel_at_period_end ?? false,
    notes: overrides.notes ?? null,
  };
}

function createStore(seed?: Partial<Store>): Store {
  return {
    authUsersByEmail: seed?.authUsersByEmail ?? {},
    profilesById: seed?.profilesById ?? {},
    internalUsersByUserId: seed?.internalUsersByUserId ?? {},
    businessProfilesByOwnerId: seed?.businessProfilesByOwnerId ?? {},
    entitlementsByOwnerId: seed?.entitlementsByOwnerId ?? {},
    pricebookSeedRowsByOwnerId: seed?.pricebookSeedRowsByOwnerId ?? {},
    sequence: seed?.sequence ?? 1,
  };
}

function createMockClient(store: Store): FirstOwnerProvisioningClient {
  return {
    findAuthUserByEmail: vi.fn(async (email: string) => {
      return store.authUsersByEmail[email] ?? null;
    }),

    createAuthUser: vi.fn(async ({ email }) => {
      const id = `user-${store.sequence++}`;
      const row = { id, email };
      store.authUsersByEmail[email] = row;
      return row;
    }),

    getProfileById: vi.fn(async (userId: string) => {
      return store.profilesById[userId] ?? null;
    }),

    insertProfile: vi.fn(async ({ id, email, full_name }) => {
      const row = { id, email, full_name };
      store.profilesById[id] = row;
      return row;
    }),

    getInternalUserByUserId: vi.fn(async (userId: string) => {
      return store.internalUsersByUserId[userId] ?? null;
    }),

    upsertInternalUser: vi.fn(async (input) => {
      const row = {
        user_id: input.user_id,
        account_owner_user_id: input.account_owner_user_id,
        role: input.role,
        is_active: input.is_active,
        created_by: input.created_by,
      };
      store.internalUsersByUserId[input.user_id] = row;
      return row;
    }),

    getBusinessProfileByOwnerId: vi.fn(async (ownerUserId: string) => {
      return store.businessProfilesByOwnerId[ownerUserId] ?? null;
    }),

    upsertBusinessProfile: vi.fn(async (input) => {
      const row = {
        account_owner_user_id: input.account_owner_user_id,
        display_name: input.display_name,
        support_email: input.support_email,
        support_phone: input.support_phone,
        billing_mode: input.billing_mode,
      };
      store.businessProfilesByOwnerId[input.account_owner_user_id] = row;
      return row;
    }),

    getEntitlementByOwnerId: vi.fn(async (ownerUserId: string) => {
      return store.entitlementsByOwnerId[ownerUserId] ?? null;
    }),

    upsertEntitlement: vi.fn(async (input) => {
      const row: EntitlementRow = {
        account_owner_user_id: input.account_owner_user_id,
        plan_key: input.plan_key,
        entitlement_status: input.entitlement_status,
        seat_limit: "seat_limit" in input ? input.seat_limit ?? null : null,
        trial_ends_at: "trial_ends_at" in input ? input.trial_ends_at ?? null : null,
        entitlement_valid_until:
          "entitlement_valid_until" in input ? input.entitlement_valid_until ?? null : null,
        stripe_customer_id:
          "stripe_customer_id" in input ? input.stripe_customer_id ?? null : null,
        stripe_subscription_id:
          "stripe_subscription_id" in input ? input.stripe_subscription_id ?? null : null,
        stripe_price_id: "stripe_price_id" in input ? input.stripe_price_id ?? null : null,
        stripe_subscription_status:
          "stripe_subscription_status" in input ? input.stripe_subscription_status ?? null : null,
        stripe_current_period_end:
          "stripe_current_period_end" in input ? input.stripe_current_period_end ?? null : null,
        stripe_cancel_at_period_end:
          "stripe_cancel_at_period_end" in input
            ? Boolean(input.stripe_cancel_at_period_end)
            : false,
        notes: "notes" in input ? input.notes ?? null : null,
      };
      store.entitlementsByOwnerId[input.account_owner_user_id] = row;
      return row;
    }),

    listExistingPricebookSeedRows: vi.fn(async (ownerUserId: string) => {
      return store.pricebookSeedRowsByOwnerId[ownerUserId] ?? [];
    }),

    insertPricebookSeedRows: vi.fn(async (rows: PricebookSeedInsertRow[]) => {
      rows.forEach((row) => {
        const existing = store.pricebookSeedRowsByOwnerId[row.account_owner_user_id] ?? [];
        existing.push({
          seed_key: row.seed_key,
          item_name: row.item_name,
        });
        store.pricebookSeedRowsByOwnerId[row.account_owner_user_id] = existing;
      });
    }),
  };
}

describe("provisionFirstOwnerAccount", () => {
  it("fresh provisioning path creates/confirms all required records", async () => {
    const store = createStore();
    const client = createMockClient(store);

    const result = await provisionFirstOwnerAccount({
      client,
      input: {
        targetEmail: "OWNER@EXAMPLE.COM",
        ownerDisplayName: "Owner User",
        businessDisplayName: "Owner Business",
      },
    });

    expect(result.status).toBe("provisioned");
    expect(result.errors).toEqual([]);
    expect(result.authUserId).toBeTruthy();
    expect(result.accountOwnerUserId).toBe(result.authUserId);
    expect(result.recordsCreated).toEqual(
      expect.arrayContaining([
        "auth_user",
        "profiles",
        "internal_users",
        "internal_business_profiles",
        "platform_account_entitlements",
        "pricebook_items",
      ]),
    );
    expect(result.pricebookSeeding).toEqual(
      expect.objectContaining({
        starter_kit_version: "v3",
        seed_count: STARTER_KIT_V3_SEEDS.length,
        active_seed_count: STARTER_KIT_V3_SEEDS.filter((seed) => seed.is_active).length,
        inactive_seed_count: STARTER_KIT_V3_SEEDS.filter((seed) => !seed.is_active).length,
        inserted_count: STARTER_KIT_V3_SEEDS.length,
        skipped_count: 0,
      }),
    );
    expect(result.inviteIntent.shouldSendInvite).toBe(true);
    expect(result.inviteIntent.email).toBe("owner@example.com");
  });

  it("all records already exist and compatible returns success without duplicate creation", async () => {
    const ownerId = "user-99";
    const store = createStore({
      authUsersByEmail: {
        "owner@example.com": { id: ownerId, email: "owner@example.com" },
      },
      profilesById: {
        [ownerId]: { id: ownerId, email: "owner@example.com", full_name: "Owner" },
      },
      internalUsersByUserId: {
        [ownerId]: {
          user_id: ownerId,
          account_owner_user_id: ownerId,
          role: "admin",
          is_active: true,
          created_by: ownerId,
        },
      },
      businessProfilesByOwnerId: {
        [ownerId]: {
          account_owner_user_id: ownerId,
          display_name: "Configured Business",
          support_email: "support@example.com",
          support_phone: "555-1234",
          billing_mode: "internal_invoicing",
        },
      },
      entitlementsByOwnerId: {
        [ownerId]: makeEntitlementRow({
          account_owner_user_id: ownerId,
          plan_key: "professional",
          entitlement_status: "active",
        }),
      },
      pricebookSeedRowsByOwnerId: {
        [ownerId]: STARTER_KIT_V3_SEEDS.map((seed) => ({
          seed_key: seed.seed_key,
          item_name: seed.item_name,
        })),
      },
    });

    const client = createMockClient(store);

    const result = await provisionFirstOwnerAccount({
      client,
      input: { targetEmail: "owner@example.com" },
    });

    expect(result.status).toBe("confirmed");
    expect(result.recordsCreated).toEqual([]);
    expect(result.recordsPatched).toEqual([]);
    expect(result.recordsConfirmed).toEqual(
      expect.arrayContaining([
        "auth_user",
        "profiles",
        "internal_users",
        "internal_business_profiles",
        "platform_account_entitlements",
        "pricebook_items",
      ]),
    );
    expect(result.pricebookSeeding).toEqual(
      expect.objectContaining({
        starter_kit_version: "v3",
        seed_count: STARTER_KIT_V3_SEEDS.length,
        inserted_count: 0,
        skipped_count: STARTER_KIT_V3_SEEDS.length,
      }),
    );
    expect(client.createAuthUser).not.toHaveBeenCalled();
    expect(client.insertProfile).not.toHaveBeenCalled();
  });

  it("dry run previews starter pricebook seeding for a new account", async () => {
    const store = createStore();
    const client = createMockClient(store);

    const result = await provisionFirstOwnerAccount({
      client,
      input: {
        targetEmail: "owner@example.com",
        dryRun: true,
      },
    });

    expect(result.status).toBe("dry_run");
    expect(result.accountOwnerUserId).toBeNull();
    expect(result.pricebookSeeding).toEqual(
      expect.objectContaining({
        starter_kit_version: "v3",
        seed_count: STARTER_KIT_V3_SEEDS.length,
        inserted_count: STARTER_KIT_V3_SEEDS.length,
        skipped_count: 0,
      }),
    );
  });

  it("explicit v1 starter kit still seeds v1 rows and reports selected version", async () => {
    const store = createStore();
    const client = createMockClient(store);

    const result = await provisionFirstOwnerAccount({
      client,
      input: {
        targetEmail: "owner@example.com",
        businessDisplayName: "Owner Business",
        starterKitVersion: "v1",
      },
    });

    expect(result.status).toBe("provisioned");
    expect(result.pricebookSeeding).toEqual(
      expect.objectContaining({
        starter_kit_version: "v1",
        seed_count: STARTER_KIT_V1_SEEDS.length,
        active_seed_count: STARTER_KIT_V1_SEEDS.filter((seed) => seed.is_active).length,
        inactive_seed_count: STARTER_KIT_V1_SEEDS.filter((seed) => !seed.is_active).length,
        inserted_count: STARTER_KIT_V1_SEEDS.length,
        skipped_count: 0,
      }),
    );
    expect(store.pricebookSeedRowsByOwnerId["user-1"]).toHaveLength(STARTER_KIT_V1_SEEDS.length);
  });

  it("explicit v2 starter kit seeds v2 rows and reports selected version", async () => {
    const store = createStore();
    const client = createMockClient(store);

    const result = await provisionFirstOwnerAccount({
      client,
      input: {
        targetEmail: "owner@example.com",
        businessDisplayName: "Owner Business",
        starterKitVersion: "v2",
      },
    });

    expect(result.status).toBe("provisioned");
    expect(result.pricebookSeeding).toEqual(
      expect.objectContaining({
        starter_kit_version: "v2",
        seed_count: STARTER_KIT_V2_SEEDS.length,
        active_seed_count: 21,
        inactive_seed_count: 2,
        inserted_count: STARTER_KIT_V2_SEEDS.length,
        skipped_count: 0,
      }),
    );
    expect(store.pricebookSeedRowsByOwnerId["user-1"]).toHaveLength(STARTER_KIT_V2_SEEDS.length);
  });

  it("missing business profile is reconciled", async () => {
    const ownerId = "user-101";
    const store = createStore({
      authUsersByEmail: {
        "owner@example.com": { id: ownerId, email: "owner@example.com" },
      },
      profilesById: {
        [ownerId]: { id: ownerId, email: "owner@example.com", full_name: "Owner" },
      },
      internalUsersByUserId: {
        [ownerId]: {
          user_id: ownerId,
          account_owner_user_id: ownerId,
          role: "admin",
          is_active: true,
          created_by: ownerId,
        },
      },
      entitlementsByOwnerId: {
        [ownerId]: makeEntitlementRow({
          account_owner_user_id: ownerId,
          plan_key: "starter",
          entitlement_status: "trial",
        }),
      },
    });
    const client = createMockClient(store);

    const result = await provisionFirstOwnerAccount({
      client,
      input: {
        targetEmail: "owner@example.com",
        businessDisplayName: "Recovered Business",
      },
    });

    expect(result.status).toBe("provisioned");
    expect(result.recordsCreated).toContain("internal_business_profiles");
    expect(store.businessProfilesByOwnerId[ownerId]?.display_name).toBe("Recovered Business");
  });

  it("missing entitlement row is reconciled", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T00:00:00.000Z"));

    const ownerId = "user-102";
    const store = createStore({
      authUsersByEmail: {
        "owner@example.com": { id: ownerId, email: "owner@example.com" },
      },
      profilesById: {
        [ownerId]: { id: ownerId, email: "owner@example.com", full_name: "Owner" },
      },
      internalUsersByUserId: {
        [ownerId]: {
          user_id: ownerId,
          account_owner_user_id: ownerId,
          role: "admin",
          is_active: true,
          created_by: ownerId,
        },
      },
      businessProfilesByOwnerId: {
        [ownerId]: {
          account_owner_user_id: ownerId,
          display_name: "Existing",
          support_email: null,
          support_phone: null,
          billing_mode: "external_billing",
        },
      },
    });
    const client = createMockClient(store);

    const result = await provisionFirstOwnerAccount({
      client,
      input: { targetEmail: "owner@example.com" },
    });

    try {
      expect(result.status).toBe("provisioned");
      expect(result.recordsCreated).toContain("platform_account_entitlements");
      expect(store.entitlementsByOwnerId[ownerId]?.plan_key).toBe("starter");
      expect(store.entitlementsByOwnerId[ownerId]?.entitlement_status).toBe("trial");
      expect(store.entitlementsByOwnerId[ownerId]?.trial_ends_at).toBe(
        "2026-05-14T00:00:00.000Z",
      );
      expect(store.entitlementsByOwnerId[ownerId]?.trial_ends_at).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("standard newly created entitlement does not use indefinite/null trial", async () => {
    const ownerId = "user-106";
    const store = createStore({
      authUsersByEmail: {
        "owner@example.com": { id: ownerId, email: "owner@example.com" },
      },
      profilesById: {
        [ownerId]: { id: ownerId, email: "owner@example.com", full_name: "Owner" },
      },
      internalUsersByUserId: {
        [ownerId]: {
          user_id: ownerId,
          account_owner_user_id: ownerId,
          role: "admin",
          is_active: true,
          created_by: ownerId,
        },
      },
      businessProfilesByOwnerId: {
        [ownerId]: {
          account_owner_user_id: ownerId,
          display_name: "Existing",
          support_email: null,
          support_phone: null,
          billing_mode: "external_billing",
        },
      },
    });
    const client = createMockClient(store);

    const result = await provisionFirstOwnerAccount({
      client,
      input: { targetEmail: "owner@example.com" },
    });

    expect(result.status).toBe("provisioned");
    expect(result.recordsCreated).toContain("platform_account_entitlements");
    expect(store.entitlementsByOwnerId[ownerId]?.trial_ends_at).toEqual(expect.any(String));
    expect(store.entitlementsByOwnerId[ownerId]?.trial_ends_at).not.toBeNull();
  });

  it("internal_comped preset creates entitlement with comped-safe values", async () => {
    const ownerId = "user-200";
    const store = createStore({
      authUsersByEmail: {
        "owner@example.com": { id: ownerId, email: "owner@example.com" },
      },
      profilesById: {
        [ownerId]: { id: ownerId, email: "owner@example.com", full_name: "Owner" },
      },
      internalUsersByUserId: {
        [ownerId]: {
          user_id: ownerId,
          account_owner_user_id: ownerId,
          role: "admin",
          is_active: true,
          created_by: ownerId,
        },
      },
      businessProfilesByOwnerId: {
        [ownerId]: {
          account_owner_user_id: ownerId,
          display_name: "Existing",
          support_email: null,
          support_phone: null,
          billing_mode: "external_billing",
        },
      },
    });
    const client = createMockClient(store);

    const result = await provisionFirstOwnerAccount({
      client,
      input: { targetEmail: "owner@example.com", entitlementPreset: "internal_comped" },
    });

    expect(result.status).toBe("provisioned");
    expect(store.entitlementsByOwnerId[ownerId]).toEqual(
      expect.objectContaining({
        plan_key: "starter",
        entitlement_status: "active",
        seat_limit: null,
        trial_ends_at: null,
        entitlement_valid_until: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        stripe_price_id: null,
        stripe_subscription_status: null,
        stripe_current_period_end: null,
        stripe_cancel_at_period_end: false,
        notes: "internal_comped_v1",
      }),
    );
  });

  it("internal_comped preset patches incompatible existing entitlement", async () => {
    const ownerId = "user-201";
    const store = createStore({
      authUsersByEmail: {
        "owner@example.com": { id: ownerId, email: "owner@example.com" },
      },
      profilesById: {
        [ownerId]: { id: ownerId, email: "owner@example.com", full_name: "Owner" },
      },
      internalUsersByUserId: {
        [ownerId]: {
          user_id: ownerId,
          account_owner_user_id: ownerId,
          role: "admin",
          is_active: true,
          created_by: ownerId,
        },
      },
      businessProfilesByOwnerId: {
        [ownerId]: {
          account_owner_user_id: ownerId,
          display_name: "Configured",
          support_email: null,
          support_phone: null,
          billing_mode: "external_billing",
        },
      },
      entitlementsByOwnerId: {
        [ownerId]: makeEntitlementRow({
          account_owner_user_id: ownerId,
          plan_key: "professional",
          entitlement_status: "active",
          seat_limit: 5,
          stripe_customer_id: "cus_1",
          notes: "legacy",
        }),
      },
    });
    const client = createMockClient(store);

    const result = await provisionFirstOwnerAccount({
      client,
      input: { targetEmail: "owner@example.com", entitlementPreset: "internal_comped" },
    });

    expect(result.status).toBe("provisioned");
    expect(result.recordsPatched).toContain("platform_account_entitlements");
    expect(store.entitlementsByOwnerId[ownerId]).toEqual(
      expect.objectContaining({
        plan_key: "starter",
        entitlement_status: "active",
        seat_limit: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        notes: "internal_comped_v1",
      }),
    );
  });

  it("existing internal user anchored to different owner hard fails", async () => {
    const ownerId = "user-103";
    const store = createStore({
      authUsersByEmail: {
        "owner@example.com": { id: ownerId, email: "owner@example.com" },
      },
      profilesById: {
        [ownerId]: { id: ownerId, email: "owner@example.com", full_name: "Owner" },
      },
      internalUsersByUserId: {
        [ownerId]: {
          user_id: ownerId,
          account_owner_user_id: "different-owner",
          role: "admin",
          is_active: true,
          created_by: "different-owner",
        },
      },
    });
    const client = createMockClient(store);

    const result = await provisionFirstOwnerAccount({
      client,
      input: { targetEmail: "owner@example.com" },
    });

    expect(result.status).toBe("failed");
    expect(result.errors[0]?.code).toBe("INTERNAL_OWNER_MISMATCH");
    expect(result.inviteIntent.shouldSendInvite).toBe(false);
  });

  it("existing configured business profile values are not overwritten", async () => {
    const ownerId = "user-104";
    const store = createStore({
      authUsersByEmail: {
        "owner@example.com": { id: ownerId, email: "owner@example.com" },
      },
      profilesById: {
        [ownerId]: { id: ownerId, email: "owner@example.com", full_name: "Owner" },
      },
      internalUsersByUserId: {
        [ownerId]: {
          user_id: ownerId,
          account_owner_user_id: ownerId,
          role: "admin",
          is_active: true,
          created_by: ownerId,
        },
      },
      businessProfilesByOwnerId: {
        [ownerId]: {
          account_owner_user_id: ownerId,
          display_name: "Configured Name",
          support_email: "configured-support@example.com",
          support_phone: "555-9999",
          billing_mode: "internal_invoicing",
        },
      },
      entitlementsByOwnerId: {
        [ownerId]: makeEntitlementRow({
          account_owner_user_id: ownerId,
          plan_key: "starter",
          entitlement_status: "trial",
        }),
      },
      pricebookSeedRowsByOwnerId: {
        [ownerId]: STARTER_KIT_V3_SEEDS.map((seed) => ({
          seed_key: seed.seed_key,
          item_name: seed.item_name,
        })),
      },
    });
    const client = createMockClient(store);

    const result = await provisionFirstOwnerAccount({
      client,
      input: {
        targetEmail: "owner@example.com",
        businessDisplayName: "New Name Should Not Win",
        supportEmail: "new-support@example.com",
        supportPhone: "000-0000",
        defaultBillingMode: "external_billing",
      },
    });

    expect(result.status).toBe("confirmed");
    expect(store.businessProfilesByOwnerId[ownerId]?.display_name).toBe("Configured Name");
    expect(store.businessProfilesByOwnerId[ownerId]?.support_email).toBe("configured-support@example.com");
    expect(store.businessProfilesByOwnerId[ownerId]?.support_phone).toBe("555-9999");
    expect(store.businessProfilesByOwnerId[ownerId]?.billing_mode).toBe("internal_invoicing");
  });

  it("existing compatible entitlement row is not overwritten unnecessarily", async () => {
    const ownerId = "user-105";
    const store = createStore({
      authUsersByEmail: {
        "owner@example.com": { id: ownerId, email: "owner@example.com" },
      },
      profilesById: {
        [ownerId]: { id: ownerId, email: "owner@example.com", full_name: "Owner" },
      },
      internalUsersByUserId: {
        [ownerId]: {
          user_id: ownerId,
          account_owner_user_id: ownerId,
          role: "admin",
          is_active: true,
          created_by: ownerId,
        },
      },
      businessProfilesByOwnerId: {
        [ownerId]: {
          account_owner_user_id: ownerId,
          display_name: "Configured",
          support_email: null,
          support_phone: null,
          billing_mode: "external_billing",
        },
      },
      entitlementsByOwnerId: {
        [ownerId]: makeEntitlementRow({
          account_owner_user_id: ownerId,
          plan_key: "enterprise",
          entitlement_status: "active",
        }),
      },
      pricebookSeedRowsByOwnerId: {
        [ownerId]: STARTER_KIT_V3_SEEDS.map((seed) => ({
          seed_key: seed.seed_key,
          item_name: seed.item_name,
        })),
      },
    });
    const client = createMockClient(store);

    const result = await provisionFirstOwnerAccount({
      client,
      input: {
        targetEmail: "owner@example.com",
      },
    });

    expect(result.status).toBe("confirmed");
    expect(result.recordsPatched).not.toContain("platform_account_entitlements");
    expect(store.entitlementsByOwnerId[ownerId]?.plan_key).toBe("enterprise");
    expect(store.entitlementsByOwnerId[ownerId]?.entitlement_status).toBe("active");
  });

  it("invariant failure returns explicit error", async () => {
    const store = createStore();
    const client = createMockClient(store);

    (client.upsertEntitlement as any).mockResolvedValueOnce({
      account_owner_user_id: "wrong-owner",
      plan_key: "starter",
      entitlement_status: "trial",
      seat_limit: null,
      trial_ends_at: null,
      entitlement_valid_until: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      stripe_price_id: null,
      stripe_subscription_status: null,
      stripe_current_period_end: null,
      stripe_cancel_at_period_end: false,
      notes: null,
    });

    const result = await provisionFirstOwnerAccount({
      client,
      input: { targetEmail: "owner@example.com" },
    });

    expect(result.status).toBe("failed");
    expect(result.errors[0]?.code).toBe("INVARIANT_NOT_CONFIRMED");
    expect(result.errors[0]?.message).toContain("ENTITLEMENT_INVALID");
  });

  it("does not send invite and returns invite intent only", async () => {
    const store = createStore();
    const client = createMockClient(store);

    const result = await provisionFirstOwnerAccount({
      client,
      input: { targetEmail: "owner@example.com" },
    });

    expect(result.inviteIntent).toEqual(
      expect.objectContaining({
        shouldSendInvite: true,
        reason: "ready_for_invite",
      }),
    );
    expect((client as any).sendInvite).toBeUndefined();
  });

  it("running twice remains idempotent and stable", async () => {
    const store = createStore();
    const client = createMockClient(store);

    const first = await provisionFirstOwnerAccount({
      client,
      input: { targetEmail: "owner@example.com" },
    });

    const second = await provisionFirstOwnerAccount({
      client,
      input: { targetEmail: "owner@example.com" },
    });

    expect(first.status).toBe("provisioned");
    expect(second.status).toBe("confirmed");
    expect(second.recordsCreated).toEqual([]);
    expect(Object.keys(store.internalUsersByUserId)).toHaveLength(1);
    expect(Object.keys(store.businessProfilesByOwnerId)).toHaveLength(1);
    expect(Object.keys(store.entitlementsByOwnerId)).toHaveLength(1);
    expect(store.pricebookSeedRowsByOwnerId["user-1"]).toHaveLength(STARTER_KIT_V3_SEEDS.length);
    expect(second.pricebookSeeding).toEqual(
      expect.objectContaining({
        inserted_count: 0,
        skipped_count: STARTER_KIT_V3_SEEDS.length,
      }),
    );
  });
});
