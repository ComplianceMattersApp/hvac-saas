import { formatRoleForInternalDisplay } from "@/lib/communications/contact-recipients-display";
import type { ContactRecipientRow } from "@/lib/communications/contact-recipients-read";

function cleanText(value?: string | null) {
  const text = String(value ?? "").trim();
  if (!text || text === "—" || text === "â€”" || text === "Ã¢â‚¬â€") return "";
  return text;
}

function firstContactLine(phone?: string | null, email?: string | null) {
  return cleanText(phone) || cleanText(email) || "";
}

export function buildV2PulsePeopleCardModel({
  customerName,
  customerPhone,
  customerEmail,
  roleContacts,
  maxRoleContacts = 2,
}: {
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  roleContacts?: ContactRecipientRow[];
  maxRoleContacts?: number;
}) {
  const customerDisplayName = cleanText(customerName) || "No contacts recorded.";
  const customerContactLine = firstContactLine(customerPhone, customerEmail);

  const safeRoleContacts = Array.isArray(roleContacts) ? roleContacts : [];
  const roleContactRows = safeRoleContacts
    .filter((contact) => cleanText(contact.status).toLowerCase() !== "inactive")
    .map((contact) => {
      const roleLabel = formatRoleForInternalDisplay(contact.recipient_role) ?? "";
      const name = cleanText(contact.display_name);
      const contactLine = firstContactLine(contact.phone_e164, contact.email);
      if (!roleLabel || (!name && !contactLine)) return null;
      return {
        roleLabel,
        name: name || "Saved contact",
        contactLine,
      };
    })
    .filter((row): row is { roleLabel: string; name: string; contactLine: string } => row !== null)
    .slice(0, maxRoleContacts);

  return {
    customer: {
      label: "Customer / Account",
      name: customerDisplayName,
      contactLine: customerContactLine || "No phone or email saved",
      hasContact: Boolean(customerContactLine),
    },
    roleContacts: roleContactRows,
    hasAnyPeopleContext: customerDisplayName !== "No contacts recorded." || roleContactRows.length > 0,
  };
}
