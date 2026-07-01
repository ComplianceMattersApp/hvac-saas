"use client";

import { useState } from "react";

// Human-readable copy for known banner slugs.
const BANNER_COPY: Record<string, string> = {
  // status transitions
  status_updated: "Status updated.",
  status_already_updated: "Already up to date — no change needed.",
  status_update_failed: "Status update failed — please try again.",
  // schedule
  schedule_saved: "Schedule saved.",
  schedule_required: "A full schedule (date + arrival window) is required before marking on the way.",
  // notes
  note_added: "Note saved.",
  note_already_added: "Note already saved — duplicate skipped.",
  note_add_failed: "Note could not be saved — please try again.",
  // team
  assignment_updated: "Team updated.",
  assignment_team_target_invalid: "Team assignment is invalid — please try again.",
  assignment_primary_target_invalid: "Primary assignee selection is invalid.",
  // work scope
  visit_scope_saved: "Work saved.",
  visit_scope_payload_invalid: "Work items payload is invalid — please try again.",
  visit_scope_required: "Work summary is required for service jobs.",
  // location
  service_location_updated: "Service location updated.",
  service_location_change_invalid: "Invalid location — please select a different location.",
  service_location_already_selected: "That location is already set for this job.",
  // permit & compliance
  permit_available_saved: "Permit number saved.",
  permit_number_required: "Permit number is required.",
  ecc_test_required: "ECC tests must be completed and recorded before this step.",
  // field completion / finish outcomes
  field_complete: "Visit marked complete.",
  parts_needed_saved: "Parts needed — job routed to dispatch.",
  parts_needed_note_required: "A note is required when flagging Parts Needed.",
  approval_needed_saved: "Approval needed — job routed to dispatch.",
  approval_needed_note_required: "A note is required when flagging Approval Needed.",
  unable_to_complete_saved: "Unable to complete — job routed to dispatch.",
  unable_to_complete_note_required: "A note is required when flagging Unable to Complete.",
  // follow-up
  next_service_visit_reason_required: "Return visit reason is required.",
  callback_visit_reason_required: "Callback reason is required.",
  // contact logging
  contact_attempt_logged: "Contact attempt logged.",
  // parts & approval tracker
  service_part_ordered_saved: "Part marked as ordered.",
  service_part_ordered_wrong_follow_up: "This job isn't currently waiting on a part.",
  service_part_arrived_saved: "Part marked as arrived.",
  service_approval_received_saved: "Approval marked as received.",
  service_approval_received_wrong_follow_up: "This job isn't currently waiting on approval.",
  service_follow_up_progress_invalid_state: "Job is not in the right state for this action.",
  // auth
  not_authorized: "You're not authorized to perform this action.",
  not_eligible: "This action isn't available for this job.",
};

// Slugs that indicate a guard/rejection (shown in amber).
const GUARD_SLUGS = new Set([
  "schedule_required",
  "ecc_test_required",
  "permit_number_required",
  "parts_needed_note_required",
  "approval_needed_note_required",
  "unable_to_complete_note_required",
  "note_add_failed",
  "status_update_failed",
  "service_location_change_invalid",
  "service_location_already_selected",
  "next_service_visit_reason_required",
  "callback_visit_reason_required",
  "not_authorized",
  "not_eligible",
  "service_follow_up_progress_invalid_state",
  "assignment_team_target_invalid",
  "assignment_primary_target_invalid",
  "visit_scope_payload_invalid",
  "visit_scope_required",
  "service_part_ordered_wrong_follow_up",
  "service_approval_received_wrong_follow_up",
]);

function classifySlug(slug: string): "success" | "guard" {
  if (GUARD_SLUGS.has(slug)) return "guard";
  if (
    slug.endsWith("_required") ||
    slug.endsWith("_invalid") ||
    slug.endsWith("_failed") ||
    slug.startsWith("not_") ||
    slug.includes("wrong_") ||
    slug.includes("cannot_")
  )
    return "guard";
  return "success";
}

function humanizeCopy(slug: string): string {
  if (BANNER_COPY[slug]) return BANNER_COPY[slug];
  // Fallback: convert slug to readable sentence.
  return slug.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) + ".";
}

// Design tokens by tone
const TOKENS = {
  success: {
    bg: "oklch(0.97 0.03 150)",
    border: "oklch(0.89 0.05 150)",
    dot: "oklch(0.6 0.14 150)",
    text: "oklch(0.4 0.05 150)",
    dismiss: "oklch(0.5 0.04 150)",
  },
  guard: {
    bg: "oklch(0.97 0.045 75)",
    border: "oklch(0.88 0.1 70)",
    dot: "oklch(0.72 0.15 70)",
    text: "oklch(0.42 0.1 65)",
    dismiss: "oklch(0.55 0.08 65)",
  },
};

export default function AlertBanner({ slug }: { slug: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const tone = classifySlug(slug);
  const t = TOKENS[tone];
  const copy = humanizeCopy(slug);

  return (
    <div
      style={{
        marginTop: "20px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "11px 16px",
        borderRadius: "11px",
        background: t.bg,
        border: `1px solid ${t.border}`,
      }}
    >
      <span
        style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          background: t.dot,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          flex: 1,
          fontSize: "13px",
          fontWeight: 500,
          color: t.text,
        }}
      >
        {copy}
      </span>
      <button
        onClick={() => setDismissed(true)}
        style={{
          border: "none",
          background: "none",
          cursor: "pointer",
          fontFamily: "var(--font-ibm-plex-mono), monospace",
          fontSize: "11px",
          fontWeight: 600,
          color: t.dismiss,
          padding: 0,
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
