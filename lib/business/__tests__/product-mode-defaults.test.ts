import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/business/internal-business-profile", () => ({
  resolveInternalBusinessIdentityByAccountOwnerId: vi.fn(),
}));

import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import {
  normalizeProductMode,
  readProductModeSettingForAccountOwnerId,
  resolveDefaultJobTypeForAccountOwnerId,
  resolveJobTypeDefaultForProductMode,
  resolveProductModeFromSignals,
} from "@/lib/business/product-mode-defaults";

const resolveInternalBusinessIdentityByAccountOwnerIdMock = vi.mocked(resolveInternalBusinessIdentityByAccountOwnerId);

function createSupabaseMock(params?: {
  productModeValue?: string | null;
  contractorCount?: number;
  accountSettingsError?: any;
  contractorsError?: any;
}) {
  const productModeValue = params?.productModeValue;
  const contractorCount = params?.contractorCount ?? 0;
  const accountSettingsError = params?.accountSettingsError ?? null;
  const contractorsError = params?.contractorsError ?? null;

  return {
    from(table: string) {
      if (table === "account_settings") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data:
                      typeof productModeValue === "undefined"
                        ? null
                        : { product_mode: productModeValue },
                    error: accountSettingsError,
                  }),
                };
              },
            };
          },
        };
      }

      if (table === "contractors") {
        return {
          select() {
            return {
              eq: async () => ({
                count: contractorCount,
                error: contractorsError,
              }),
            };
          },
        };
      }

      throw new Error(`Unexpected table query in test: ${table}`);
    },
  };
}

describe("product mode defaults", () => {
  beforeEach(() => {
    resolveInternalBusinessIdentityByAccountOwnerIdMock.mockReset();
    resolveInternalBusinessIdentityByAccountOwnerIdMock.mockResolvedValue({
      display_name: "Compliance Matters",
      support_email: null,
      support_phone: null,
      logo_url: null,
    });
  });

  it("defaults the owner brand to hybrid", () => {
    expect(
      resolveProductModeFromSignals({
        accountOwnerUserId: "owner-1",
        displayName: "Compliance Matters",
        contractorCount: 0,
      }),
    ).toBe("hybrid");
  });

  it("defaults HVAC service accounts to service when contractor signals are absent", () => {
    expect(
      resolveProductModeFromSignals({
        accountOwnerUserId: "angkor-owner",
        displayName: "Angkor Heating and Air",
        contractorCount: 0,
      }),
    ).toBe("hvac_service");
  });

  it("defaults ECC/HERS customer accounts to ECC/HERS when contractor signals exist", () => {
    expect(
      resolveProductModeFromSignals({
        accountOwnerUserId: "ecc-owner",
        displayName: "North Bay Compliance",
        contractorCount: 2,
      }),
    ).toBe("ecc_hers");
  });

  it("honors an explicit temporary override before fallback logic", () => {
    expect(
      resolveProductModeFromSignals({
        accountOwnerUserId: "explicit-owner",
        displayName: "Anything",
        contractorCount: 0,
        overridesByOwnerId: {
          "explicit-owner": "ecc_hers",
        },
      }),
    ).toBe("ecc_hers");
  });

  it("normalizes invalid product mode values to null", () => {
    expect(normalizeProductMode("hvac_service")).toBe("hvac_service");
    expect(normalizeProductMode("unknown_mode")).toBeNull();
  });

  it("reads account_settings product_mode and normalizes values", async () => {
    const supabase = createSupabaseMock({ productModeValue: "ecc_hers" });
    await expect(
      readProductModeSettingForAccountOwnerId({
        supabase,
        accountOwnerUserId: "owner-1",
      }),
    ).resolves.toBe("ecc_hers");
  });

  it("prioritizes account_settings product_mode over temporary override and signals", async () => {
    const supabase = createSupabaseMock({
      productModeValue: "hvac_service",
      contractorCount: 3,
    });

    await expect(
      resolveDefaultJobTypeForAccountOwnerId({
        supabase,
        accountOwnerUserId: "owner-1",
        overridesByOwnerId: {
          "owner-1": "ecc_hers",
        },
      }),
    ).resolves.toBe("service");

    expect(resolveInternalBusinessIdentityByAccountOwnerIdMock).not.toHaveBeenCalled();
  });

  it("uses temporary override before signal fallback when account setting is null", async () => {
    const supabase = createSupabaseMock({
      productModeValue: null,
      contractorCount: 0,
    });

    resolveInternalBusinessIdentityByAccountOwnerIdMock.mockResolvedValueOnce({
      display_name: "North Bay Compliance",
      support_email: null,
      support_phone: null,
      logo_url: null,
    });

    await expect(
      resolveDefaultJobTypeForAccountOwnerId({
        supabase,
        accountOwnerUserId: "owner-2",
        overridesByOwnerId: {
          "owner-2": "ecc_hers",
        },
      }),
    ).resolves.toBe("ecc");
  });

  it("falls through safely when setting is missing", async () => {
    const supabase = createSupabaseMock({
      contractorCount: 0,
    });

    resolveInternalBusinessIdentityByAccountOwnerIdMock.mockResolvedValueOnce({
      display_name: "Compliance Matters",
      support_email: null,
      support_phone: null,
      logo_url: null,
    });

    await expect(
      resolveDefaultJobTypeForAccountOwnerId({
        supabase,
        accountOwnerUserId: "owner-3",
      }),
    ).resolves.toBe("ecc");
  });

  it("falls through safely when account_settings table is not present yet", async () => {
    const runCase = async (code: string) => {
      const supabase = createSupabaseMock({
        accountSettingsError: {
          code,
          message: 'relation "account_settings" does not exist',
        },
        contractorCount: 0,
      });

      resolveInternalBusinessIdentityByAccountOwnerIdMock.mockResolvedValueOnce({
        display_name: "Compliance Matters",
        support_email: null,
        support_phone: null,
        logo_url: null,
      });

      await expect(
        resolveDefaultJobTypeForAccountOwnerId({
          supabase,
          accountOwnerUserId: `owner-rollout-safe-${code}`,
        }),
      ).resolves.toBe("ecc");
    };

    await runCase("42P01");
    await runCase("PGRST205");
  });

  it("falls through safely when stored value is invalid", async () => {
    const supabase = createSupabaseMock({
      productModeValue: "invalid_value",
      contractorCount: 0,
    });

    resolveInternalBusinessIdentityByAccountOwnerIdMock.mockResolvedValueOnce({
      display_name: "Angkor Heating and Air",
      support_email: null,
      support_phone: null,
      logo_url: null,
    });

    await expect(
      resolveDefaultJobTypeForAccountOwnerId({
        supabase,
        accountOwnerUserId: "owner-4",
      }),
    ).resolves.toBe("service");
  });

  it("maps product mode to the expected /jobs/new default", () => {
    expect(resolveJobTypeDefaultForProductMode("hybrid")).toBe("ecc");
    expect(resolveJobTypeDefaultForProductMode("ecc_hers")).toBe("ecc");
    expect(resolveJobTypeDefaultForProductMode("hvac_service")).toBe("service");
  });
});