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
    <section className={`rounded-xl border border-slate-200/80 bg-white/85 p-3 shadow-sm sm:p-4 ${className}`}>
      <h3 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h3>
      <div className="mt-3 space-y-2.5 sm:space-y-3">
        {displayable.map((recipient) => (
          <RoleContactItem key={recipient.id} recipient={recipient} />
        ))}
      </div>
    </section>
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
    <div className="rounded-lg border border-slate-200/70 bg-white/70 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600">
          {roleLabel}
        </span>
        {isInactive && (
          <span className="inline-flex rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-700">
            Inactive
          </span>
        )}
      </div>

      {recipient.display_name && (
        <div className="mt-1 text-sm font-semibold text-slate-900">{recipient.display_name}</div>
      )}

      {(recipient.phone_e164 || recipient.email) && (
        <div className="mt-1.5 space-y-1 text-xs text-slate-600">
          {recipient.phone_e164 ? (
            <div className="break-all">
              <span className="font-medium text-slate-500">Phone:</span> {recipient.phone_e164}
            </div>
          ) : null}
          {recipient.email ? (
            <div className="break-all">
              <span className="font-medium text-slate-500">Email:</span> {recipient.email}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
