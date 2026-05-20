// lib/estimates/estimate-domain.ts
// Compliance Matters: Estimate V1A domain constants, types, and helpers.
// Source-of-truth: estimates table (commercial proposed scope).
//
// Non-goals: UI, customer approval, estimate-to-invoice conversion, email,
// PDF generation, payment collection, contractor write authority.

// ---------------------------------------------------------------------------
// Status contract
// ---------------------------------------------------------------------------

export const ESTIMATE_STATUSES = [
  "draft",
  "sent",
  "approved",
  "declined",
  "expired",
  "cancelled",
  "converted",
] as const;

export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

/** Statuses where the estimate is still in flight (not yet resolved). */
export const ESTIMATE_OPEN_STATUSES: ReadonlySet<EstimateStatus> = new Set<EstimateStatus>([
  "draft",
  "sent",
]);

/** Terminal statuses — no further lifecycle transitions are permitted. */
export const ESTIMATE_TERMINAL_STATUSES: ReadonlySet<EstimateStatus> = new Set<EstimateStatus>([
  "approved",
  "declined",
  "expired",
  "cancelled",
  "converted",
]);

export function isValidEstimateStatus(value: unknown): value is EstimateStatus {
  return ESTIMATE_STATUSES.includes(value as EstimateStatus);
}

export function isTerminalEstimateStatus(status: EstimateStatus): boolean {
  return ESTIMATE_TERMINAL_STATUSES.has(status);
}

export function isOpenEstimateStatus(status: EstimateStatus): boolean {
  return ESTIMATE_OPEN_STATUSES.has(status);
}

export const ESTIMATE_STATUS_TRANSITIONS: Readonly<
  Record<EstimateStatus, readonly EstimateStatus[]>
> = {
  draft:     ["sent", "cancelled"],
  sent:      ["approved", "declined", "expired", "cancelled"],
  approved:  [],
  declined:  [],
  expired:   [],
  cancelled: [],
  converted: [],
} as const;

export function canTransitionEstimateStatus(
  currentStatus: EstimateStatus,
  nextStatus: EstimateStatus
): boolean {
  return ESTIMATE_STATUS_TRANSITIONS[currentStatus].includes(nextStatus);
}

// ---------------------------------------------------------------------------
// Status timestamp requirements
// The DB enforces these via CHECK constraints; this mirrors the contract in
// the application layer for validation before writes.
// ---------------------------------------------------------------------------

/** Which status requires which timestamp to be present on the row. */
export const ESTIMATE_STATUS_TIMESTAMP_MAP: Readonly<
  Partial<Record<EstimateStatus, keyof EstimateStatusTimestamps>>
> = {
  sent:      "sent_at",
  approved:  "approved_at",
  declined:  "declined_at",
  expired:   "expired_at",
  cancelled: "cancelled_at",
  converted: "converted_at",
} as const;

export type EstimateStatusTimestamps = {
  sent_at:      string | null;
  approved_at:  string | null;
  declined_at:  string | null;
  expired_at:   string | null;
  cancelled_at: string | null;
  converted_at: string | null;
};

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type EstimateRow = {
  id:                    string;
  account_owner_user_id: string;
  estimate_number:       string;
  customer_id:           string | null;
  location_id:           string | null;
  service_case_id:       string | null;
  origin_job_id:         string | null;
  status:                EstimateStatus;
  title:                 string;
  notes:                 string | null;
  subtotal_cents:        number;
  total_cents:           number;
  sent_at:               string | null;
  approved_at:           string | null;
  declined_at:           string | null;
  expired_at:            string | null;
  cancelled_at:          string | null;
  converted_at:          string | null;
  selected_option_id:              string | null;
  selected_option_label_snapshot:  string | null;
  selected_option_total_cents:     number | null;
  response_note:                   string | null;
  created_by_user_id:              string;
  updated_by_user_id:              string;
  created_at:                      string;
  updated_at:                      string;
};

// ---------------------------------------------------------------------------
// Approval / response read model
// ---------------------------------------------------------------------------

export type EstimateApprovalStatus =
  | "no_response"
  | "approved"
  | "declined"
  | "expired"
  | "cancelled"
  | "converted";

export type EstimateApprovalViewModel = {
  approvalStatus:            EstimateApprovalStatus;
  proposalMode:              "single_option_flat" | "multi_option_packages";
  /** ID of the option package that was approved; null for flat estimates or no response. */
  selectedOptionId:          string | null;
  /** Frozen label at approval time; null if no option was selected. */
  selectedOptionLabel:       string | null;
  /** Frozen total (cents) at approval time; null if no option was selected. */
  selectedOptionTotalCents:  number | null;
  approvedAt:                string | null;
  declinedAt:                string | null;
  /** Optional note recorded by the internal operator at response time. */
  responseNote:              string | null;
  /** For V1, all responses are internal-operator initiated. */
  responseSource:            "internal" | null;
  /** Convenience alias: true when proposalMode is single_option_flat. */
  isFlatEstimate:            boolean;
};

/**
 * Build a safe approval view model from a loaded estimate row (plus proposal mode).
 * Returns a deterministic, fully-typed read model for UI and reporting consumers.
 */
export function buildEstimateApprovalViewModel(params: {
  estimate: Pick<
    EstimateRow,
    | "status"
    | "approved_at"
    | "declined_at"
    | "selected_option_id"
    | "selected_option_label_snapshot"
    | "selected_option_total_cents"
    | "response_note"
  >;
  proposalMode: "single_option_flat" | "multi_option_packages";
}): EstimateApprovalViewModel {
  const { estimate, proposalMode } = params;

  const approvalStatus: EstimateApprovalStatus =
    estimate.status === "approved"  ? "approved"  :
    estimate.status === "declined"  ? "declined"  :
    estimate.status === "expired"   ? "expired"   :
    estimate.status === "cancelled" ? "cancelled" :
    estimate.status === "converted" ? "converted" :
    "no_response";

  const hasResponse = approvalStatus !== "no_response";

  return {
    approvalStatus,
    proposalMode,
    selectedOptionId:         estimate.selected_option_id ?? null,
    selectedOptionLabel:      estimate.selected_option_label_snapshot ?? null,
    selectedOptionTotalCents: estimate.selected_option_total_cents ?? null,
    approvedAt:               estimate.approved_at ?? null,
    declinedAt:               estimate.declined_at ?? null,
    responseNote:             estimate.response_note ?? null,
    responseSource:           hasResponse ? "internal" : null,
    isFlatEstimate:           proposalMode === "single_option_flat",
  };
}

export type EstimateLineItemRow = {
  id:                       string;
  estimate_id:              string;
  sort_order:               number;
  source_pricebook_item_id: string | null;
  item_name_snapshot:       string;
  description_snapshot:     string | null;
  item_type_snapshot:       string;
  category_snapshot:        string | null;
  unit_label_snapshot:      string | null;
  quantity:                 number;
  unit_price_cents:         number;
  line_subtotal_cents:      number;
  created_by_user_id:       string;
  updated_by_user_id:       string;
  created_at:               string;
  updated_at:               string;
};

export type EstimateOptionRow = {
  id:                 string;
  estimate_id:        string;
  slot_index:         number;
  default_label_key:  string | null;
  label:              string;
  sort_order:         number;
  summary:            string | null;
  notes:              string | null;
  subtotal_cents:     number;
  total_cents:        number;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at:         string;
  updated_at:         string;
};

export type EstimateOptionLineItemRow = {
  id:                       string;
  estimate_option_id:       string;
  estimate_id:              string;
  sort_order:               number;
  source_pricebook_item_id: string | null;
  item_name_snapshot:       string;
  description_snapshot:     string | null;
  item_type_snapshot:       string;
  category_snapshot:        string | null;
  unit_label_snapshot:      string | null;
  quantity:                 number;
  unit_price_cents:         number;
  line_subtotal_cents:      number;
  created_by_user_id:       string;
  updated_by_user_id:       string;
  created_at:               string;
  updated_at:               string;
};

export type EstimateEventRow = {
  id:          string;
  estimate_id: string;
  event_type:  string;
  meta:        Record<string, unknown> | null;
  user_id:     string | null;
  created_at:  string;
};

// ---------------------------------------------------------------------------
// Total helpers
// ---------------------------------------------------------------------------

/**
 * Compute the subtotal (sum of all line item subtotals) from a list of line
 * items. Returns an integer (cents).
 */
export function computeEstimateSubtotalCents(
  lineItems: Pick<EstimateLineItemRow, "line_subtotal_cents">[]
): number {
  return lineItems.reduce((sum, li) => sum + li.line_subtotal_cents, 0);
}

/**
 * Compute a single line item's subtotal in cents.
 * quantity is a decimal (e.g. 1.5 hours); unit_price_cents is an integer.
 * Result is floored to integer cents.
 */
export function computeLineSubtotalCents(
  quantity: number,
  unitPriceCents: number
): number {
  return Math.floor(quantity * unitPriceCents);
}

/**
 * Validate that the stored totals on an estimate are internally consistent.
 * Does NOT re-derive from line items (caller must recompute if needed).
 */
export function validateEstimateTotals(estimate: Pick<EstimateRow, "subtotal_cents" | "total_cents">): boolean {
  return (
    estimate.subtotal_cents >= 0 &&
    estimate.total_cents >= 0 &&
    estimate.total_cents >= estimate.subtotal_cents
  );
}

/**
 * Validate that an estimate's status timestamp contract is satisfied.
 * Mirrors the DB CHECK constraints for application-layer pre-validation.
 */
export function validateEstimateStatusTimestamps(
  status: EstimateStatus,
  timestamps: EstimateStatusTimestamps
): boolean {
  if (status === "draft") {
    // draft must have no terminal timestamps
    return (
      timestamps.sent_at === null &&
      timestamps.approved_at === null &&
      timestamps.declined_at === null &&
      timestamps.expired_at === null &&
      timestamps.cancelled_at === null &&
      timestamps.converted_at === null
    );
  }

  const requiredField = ESTIMATE_STATUS_TIMESTAMP_MAP[status];
  if (!requiredField) return true; // no requirement for this status
  return timestamps[requiredField] !== null;
}
