import { describe, expect, it } from "vitest";
import {
  buildInternalJobRoleContactSections,
  formatRoleForInternalDisplay,
  isDisplayableRole,
  INTERNAL_DISPLAY_RECIPIENT_ROLES,
} from "@/lib/communications/contact-recipients-display";
import type { ContactRecipientRow } from "@/lib/communications/contact-recipients-read";

function makeRecipient(overrides?: Partial<ContactRecipientRow>): ContactRecipientRow {
  return {
    id: "recipient-1",
    account_owner_user_id: "owner-1",
    linked_entity_type: "customer",
    linked_entity_id: "customer-1",
    display_name: "Contact One",
    phone_e164: "+15551234567",
    phone_last10: "5551234567",
    email: "contact@example.com",
    recipient_role: "homeowner",
    status: "active",
    preferred_contact_method: "phone",
    recipient_timezone: null,
    source_type: "manual",
    source_ref: null,
    notes: null,
    created_by_user_id: "user-1",
    updated_by_user_id: "user-1",
    deactivated_at: null,
    deactivated_by_user_id: null,
    created_at: "2026-05-18T00:00:00.000Z",
    updated_at: "2026-05-18T00:00:00.000Z",
    ...overrides,
  };
}

describe("contact recipient display", () => {
  it("formats displayable roles correctly", () => {
    expect(formatRoleForInternalDisplay("homeowner")).toBe("Homeowner");
    expect(formatRoleForInternalDisplay("tenant_or_occupant")).toBe("Tenant / Occupant");
    expect(formatRoleForInternalDisplay("responsible_party")).toBe("Responsible Party");
    expect(formatRoleForInternalDisplay("site_access_contact")).toBe("Site / Access Contact");
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

  it("builds job detail sections with customer-linked contacts when available", () => {
    const customerContact = makeRecipient({
      id: "recipient-customer-1",
      linked_entity_type: "customer",
      linked_entity_id: "customer-1",
    });

    const sections = buildInternalJobRoleContactSections({
      customerLinkedContacts: [customerContact],
      jobLinkedContacts: [],
    });

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Customer / Account Role Contacts");
    expect(sections[0].recipients).toHaveLength(1);
  });

  it("keeps job-linked contacts visible when present", () => {
    const jobContact = makeRecipient({
      id: "recipient-job-1",
      linked_entity_type: "job",
      linked_entity_id: "job-1",
      recipient_role: "site_access_contact",
    });

    const sections = buildInternalJobRoleContactSections({
      customerLinkedContacts: [],
      jobLinkedContacts: [jobContact],
    });

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Job-Specific Contacts");
    expect(sections[0].recipients).toHaveLength(1);
  });

  it("returns empty sections safely when no role contacts exist", () => {
    const sections = buildInternalJobRoleContactSections({
      customerLinkedContacts: [],
      jobLinkedContacts: [],
    });

    expect(sections).toEqual([]);
  });
});
