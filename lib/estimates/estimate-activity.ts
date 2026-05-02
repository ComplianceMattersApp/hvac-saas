import type { EstimateStatus } from "@/lib/estimates/estimate-domain";

type EstimateActivityMeta = Record<string, unknown> | null | undefined;

function toStatusLabel(value: unknown): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;

  switch (normalized as EstimateStatus | string) {
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
    case "approved":
      return "Approved";
    case "declined":
      return "Declined";
    case "expired":
      return "Expired";
    case "cancelled":
      return "Cancelled";
    case "converted":
      return "Converted";
    default:
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
}

export function formatEstimateEventLabel(eventType: string): string {
  switch (String(eventType ?? "").trim()) {
    case "estimate_created":
      return "Estimate created";
    case "line_item_added":
    case "estimate_line_added":
      return "Line item added";
    case "line_item_removed":
    case "estimate_line_removed":
      return "Line item removed";
    case "estimate_status_transition":
      return "Status changed";
    case "estimate_sent":
      return "Estimate marked sent";
    case "estimate_approved":
      return "Estimate approved";
    case "estimate_declined":
      return "Estimate declined";
    case "estimate_expired":
      return "Estimate expired";
    case "estimate_cancelled":
      return "Estimate cancelled";
    default:
      return String(eventType ?? "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

export function formatEstimateEventSummary(
  eventType: string,
  meta?: EstimateActivityMeta,
): string | null {
  const previousStatus = toStatusLabel(meta?.previous_status);
  const nextStatus = toStatusLabel(meta?.next_status);

  if (previousStatus && nextStatus) {
    return `${previousStatus} -> ${nextStatus}`;
  }

  switch (String(eventType ?? "").trim()) {
    case "estimate_created": {
      const status = toStatusLabel(meta?.status);
      return status ? `Created as ${status}` : "Initial draft recorded";
    }
    case "line_item_added":
    case "estimate_line_added": {
      const itemName = String(meta?.item_name ?? "").trim();
      return itemName ? itemName : "Draft pricing detail added";
    }
    case "line_item_removed":
    case "estimate_line_removed": {
      const itemName = String(meta?.item_name ?? "").trim();
      return itemName ? itemName : "Draft pricing detail removed";
    }
    case "estimate_sent":
      return "Marked sent internally. No customer email or PDF was generated.";
    case "estimate_approved":
      return "Approved internally. No job, invoice, payment, or conversion record was created.";
    case "estimate_declined":
      return "Declined internally. This estimate is terminal for V1.";
    case "estimate_expired":
      return "Expired internally. This estimate is terminal for V1.";
    case "estimate_cancelled":
      return "Cancelled internally. This estimate is terminal for V1.";
    default:
      return null;
  }
}