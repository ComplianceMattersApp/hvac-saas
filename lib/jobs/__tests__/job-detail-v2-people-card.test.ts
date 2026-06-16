import { describe, expect, it } from "vitest";

import { buildV2PulsePeopleCardModel } from "@/lib/jobs/job-detail-v2-people-card";
import type { ContactRecipientRow } from "@/lib/communications/contact-recipients-read";

function roleContact(overrides: Partial<ContactRecipientRow>): ContactRecipientRow {
  return {
    id: "contact-1",
    account_owner_user_id: "owner-1",
    linked_entity_type: "customer",
    linked_entity_id: "customer-1",
    recipient_role: "site_access_contact",
    display_name: "Access Person",
    phone_e164: null,
    phone_last10: null,
    email: null,
    status: "active",
    preferred_contact_method: "none",
    recipient_timezone: null,
    source_type: "manual",
    source_ref: null,
    notes: null,
    created_by_user_id: null,
    updated_by_user_id: null,
    deactivated_at: null,
    deactivated_by_user_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("V2 Pulse people card display", () => {
  it("builds customer and role contact rows from loaded data", () => {
    const model = buildV2PulsePeopleCardModel({
      customerName: "Grandma Castellanos",
      customerPhone: "209-475-4744",
      customerEmail: "grandma@example.test",
      roleContacts: [
        roleContact({
          recipient_role: "site_access_contact",
          display_name: "Maria Access",
          phone_e164: "209-555-0101",
        }),
      ],
    });

    expect(model.customer.name).toBe("Grandma Castellanos");
    expect(model.customer.contactLine).toBe("209-475-4744");
    expect(model.roleContacts[0]).toEqual({
      roleLabel: "Site / Access Contact",
      name: "Maria Access",
      contactLine: "209-555-0101",
    });
  });

  it("uses neutral fallbacks without inventing people data", () => {
    const model = buildV2PulsePeopleCardModel({
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      roleContacts: [],
    });

    expect(model.customer.name).toBe("No contacts recorded.");
    expect(model.customer.contactLine).toBe("No phone or email saved");
    expect(model.roleContacts).toEqual([]);
  });

  it("filters inactive and non-display role contacts", () => {
    const model = buildV2PulsePeopleCardModel({
      customerName: "Customer",
      roleContacts: [
        roleContact({ recipient_role: "billing_contact", display_name: "Billing Person", email: "billing@example.test" }),
        roleContact({ recipient_role: "customer_primary", display_name: "Hidden Customer", email: "hidden@example.test" }),
        roleContact({ recipient_role: "site_access_contact", display_name: "Inactive Access", status: "inactive" }),
      ],
    });

    expect(model.roleContacts).toHaveLength(1);
    expect(model.roleContacts[0]?.roleLabel).toBe("Billing Contact");
    expect(model.roleContacts[0]?.name).toBe("Billing Person");
  });
});
