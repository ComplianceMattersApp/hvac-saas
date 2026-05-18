"use client";

import { formatRoleForInternalDisplay, isDisplayableRole } from "@/lib/communications/contact-recipients-display";
import type { ContactRecipientRow } from "@/lib/communications/contact-recipients-read";

type RoleContactsCardProps = {
  /** Internal display title; e.g., "Job Contacts" or "Role Contacts" */
  title: string;
  /** Contact recipients to display; filter before passing */
  recipients: ContactRecipientRow[];
  /** Optional additional CSS class */
  className?: string;
};

/**
 * Read-only internal display of role-labeled contact recipients.
 * Shows safe fields only: role label, display name, phone/email if present, status if inactive.
 * Filters to displayable roles; hides raw IDs, source_ref, metadata.
 * Renders nothing if no displayable recipients.
 */
export default function RoleContactsCard({
  title,
  recipients,
  className = "",
}: RoleContactsCardProps) {
  // Filter to displayable roles only
  const displayable = recipients.filter((r) => isDisplayableRole(r.recipient_role));

  // Render nothing if no displayable recipients
  if (displayable.length === 0) {
    return null;
  }

  return (
    <div className={`border border-gray-300 rounded-md p-4 ${className}`}>
      <h3 className="text-lg font-semibold mb-3">{title}</h3>
      <div className="space-y-3">
        {displayable.map((recipient) => (
          <RoleContactItem key={recipient.id} recipient={recipient} />
        ))}
      </div>
    </div>
  );
}

type RoleContactItemProps = {
  recipient: ContactRecipientRow;
};

/**
 * Single role contact display item.
 * Shows: role label, display name, phone/email (if present), status (if inactive).
 */
function RoleContactItem({ recipient }: RoleContactItemProps) {
  const roleLabel = formatRoleForInternalDisplay(recipient.recipient_role);

  // Should not reach here due to card filtering, but safeguard
  if (!roleLabel) {
    return null;
  }

  const isInactive = recipient.status === "inactive";

  return (
    <div className="flex flex-col gap-1 text-sm pb-2 border-b border-gray-200 last:border-b-0">
      {/* Role + Status Badge */}
      <div className="flex items-center gap-2">
        <span className="font-medium text-gray-800">{roleLabel}</span>
        {isInactive && (
          <span className="inline-block px-2 py-0.5 bg-gray-200 text-gray-700 text-xs rounded">
            Inactive
          </span>
        )}
      </div>

      {/* Display Name */}
      {recipient.display_name && (
        <div className="text-gray-700">{recipient.display_name}</div>
      )}

      {/* Contact Info (phone and/or email, if present) */}
      <div className="text-gray-600 flex flex-col gap-0.5">
        {recipient.phone_e164 && <div>Phone: {recipient.phone_e164}</div>}
        {recipient.email && <div>Email: {recipient.email}</div>}
      </div>
    </div>
  );
}
