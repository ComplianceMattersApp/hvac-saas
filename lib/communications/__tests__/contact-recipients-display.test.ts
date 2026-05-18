import { describe, expect, it } from "vitest";
import {
  formatRoleForInternalDisplay,
  isDisplayableRole,
  INTERNAL_DISPLAY_RECIPIENT_ROLES,
} from "@/lib/communications/contact-recipients-display";

describe("contact recipient display", () => {
  it("formats displayable roles correctly", () => {
    expect(formatRoleForInternalDisplay("homeowner")).toBe("Homeowner");
    expect(formatRoleForInternalDisplay("tenant_or_occupant")).toBe("Tenant / Occupant");
    expect(formatRoleForInternalDisplay("responsible_party")).toBe("Responsible Party");
    expect(formatRoleForInternalDisplay("site_access_contact")).toBe("Site Contact");
    expect(formatRoleForInternalDisplay("billing_contact")).toBe("Billing Contact");
    expect(formatRoleForInternalDisplay("third_party_oversight")).toBe("Third-Party Oversight");
  });

  it("returns null for customer and contractor roles", () => {
    expect(formatRoleForInternalDisplay("customer_primary")).toBeNull();
    expect(formatRoleForInternalDisplay("customer_alt")).toBeNull();
    expect(formatRoleForInternalDisplay("contractor_contact")).toBeNull();
  });

  it("returns null for internal roles", () => {
    expect(formatRoleForInternalDisplay("internal_user")).toBeNull();
    expect(formatRoleForInternalDisplay("account_owner")).toBeNull();
    expect(formatRoleForInternalDisplay("future_marketplace_participant")).toBeNull();
  });

  it("returns null for unknown roles", () => {
    expect(formatRoleForInternalDisplay("unknown_role")).toBeNull();
    expect(formatRoleForInternalDisplay("")).toBeNull();
    expect(formatRoleForInternalDisplay(null as any)).toBeNull();
  });

  it("handles whitespace and case variations", () => {
    expect(formatRoleForInternalDisplay("  HOMEOWNER  ")).toBe("Homeowner");
    expect(formatRoleForInternalDisplay("TENANT_OR_OCCUPANT")).toBe("Tenant / Occupant");
  });

  it("identifies displayable roles correctly", () => {
    expect(isDisplayableRole("homeowner")).toBe(true);
    expect(isDisplayableRole("tenant_or_occupant")).toBe(true);
    expect(isDisplayableRole("responsible_party")).toBe(true);
    expect(isDisplayableRole("site_access_contact")).toBe(true);
    expect(isDisplayableRole("billing_contact")).toBe(true);
    expect(isDisplayableRole("third_party_oversight")).toBe(true);

    expect(isDisplayableRole("customer_primary")).toBe(false);
    expect(isDisplayableRole("customer_alt")).toBe(false);
    expect(isDisplayableRole("contractor_contact")).toBe(false);
    expect(isDisplayableRole("internal_user")).toBe(false);
    expect(isDisplayableRole("account_owner")).toBe(false);
    expect(isDisplayableRole("unknown")).toBe(false);
  });

  it("has 6 internal display roles", () => {
    expect(INTERNAL_DISPLAY_RECIPIENT_ROLES).toHaveLength(6);
    expect(INTERNAL_DISPLAY_RECIPIENT_ROLES).toEqual([
      "homeowner",
      "tenant_or_occupant",
      "responsible_party",
      "site_access_contact",
      "billing_contact",
      "third_party_oversight",
    ]);
  });
});
