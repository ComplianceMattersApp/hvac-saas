import type { ContactRecipientRole, ContactRecipientRow } from "./contact-recipients-read";

/**
 * Internal display roles only: safe to show in internal UI without SMS/email behavior.
 * Excludes customer_primary, customer_alt, contractor_contact, internal_user, account_owner, future_marketplace_participant.
 */
export const INTERNAL_DISPLAY_RECIPIENT_ROLES = [
  "homeowner",
  "tenant_or_occupant",
  "responsible_party",
  "site_access_contact",
  "billing_contact",
  "third_party_oversight",
] as const;

export type InternalDisplayRecipientRole = (typeof INTERNAL_DISPLAY_RECIPIENT_ROLES)[number];

/**
 * Format role enum to human-readable display label for internal UI.
 * Returns null for roles not intended for internal display (customer fields, contractor fields, internal fields).
 */
export function formatRoleForInternalDisplay(role: ContactRecipientRole | string): string | null {
  const lower = String(role ?? "").toLowerCase().trim();

  switch (lower) {
    case "homeowner":
      return "Homeowner";
    case "tenant_or_occupant":
      return "Tenant / Occupant";
    case "responsible_party":
      return "Responsible Party";
    case "site_access_contact":
      return "Site / Access Contact";
    case "billing_contact":
      return "Billing Contact";
    case "third_party_oversight":
      return "Third-Party Oversight";
    default:
      // Exclude customer_primary, customer_alt, contractor_contact, internal_user, account_owner, future_marketplace_participant
      return null;
  }
}

/**
 * Check if a role should be displayed in internal contact recipient card.
 */
export function isDisplayableRole(role: ContactRecipientRole | string): boolean {
  return formatRoleForInternalDisplay(role) !== null;
}

export type InternalRoleContactSection = {
  title: "Customer / Account Role Contacts" | "Job-Specific Contacts";
  recipients: ContactRecipientRow[];
};

export function buildInternalJobRoleContactSections(params: {
  customerLinkedContacts: ContactRecipientRow[];
  jobLinkedContacts: ContactRecipientRow[];
}): InternalRoleContactSection[] {
  const sections: InternalRoleContactSection[] = [];

  if (params.customerLinkedContacts.length > 0) {
    sections.push({
      title: "Customer / Account Role Contacts",
      recipients: params.customerLinkedContacts,
    });
  }

  if (params.jobLinkedContacts.length > 0) {
    sections.push({
      title: "Job-Specific Contacts",
      recipients: params.jobLinkedContacts,
    });
  }

  return sections;
}
