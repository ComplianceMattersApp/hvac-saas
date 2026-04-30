//lib utils ops-status

export type ResolveOpsStatusInput = {
  status: string | null;
  job_type: string | null;
  scheduled_date?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  field_complete?: boolean | null;
  certs_complete?: boolean | null;
  invoice_complete?: boolean | null;
  current_ops_status?: string | null;
};

export function resolveOpsStatus(job: ResolveOpsStatusInput): string {
  const status = (job.status ?? "").toLowerCase();
  const jobType = (job.job_type ?? "").toLowerCase();
  const currentOps = (job.current_ops_status ?? "").toLowerCase();

  const isScheduled =
    !!job.scheduled_date || !!job.window_start || !!job.window_end;

  const fieldComplete = !!job.field_complete || status === "completed";
  const certsComplete = !!job.certs_complete;
  const invoiceComplete = !!job.invoice_complete;

  // Pre-field workflow
  if (!fieldComplete) {
    return isScheduled ? "scheduled" : "need_to_schedule";
  }

  // Preserve unresolved ECC failure states.
  // Failed originals and retest-needed jobs should not be auto-resolved
  // by generic closeout actions.
  if (
    jobType === "ecc" &&
    (currentOps === "failed" ||
      currentOps === "retest_needed" ||
      currentOps === "pending_office_review")
  ) {
    return currentOps;
  }

  // Post-field / closeout workflow
  if (jobType === "ecc") {
    if (!certsComplete) return "paperwork_required";
    if (!invoiceComplete) return "invoice_required";
    return "closed";
  }

  if (jobType === "service") {
    if (!invoiceComplete) return "invoice_required";
    return "closed";
  }

  // Fallback
  return job.current_ops_status ?? "need_to_schedule";
}

export type PendingInfoSignalInput = {
  ops_status?: string | null;
  pending_info_reason?: string | null;
  follow_up_date?: string | null;
  next_action_note?: string | null;
  action_required_by?: string | null;
};

function hasSignalValue(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function getPendingInfoSignal(input: PendingInfoSignalInput): boolean {
  const legacyPendingInfo =
    String(input.ops_status ?? "").trim().toLowerCase() === "pending_info";

  const derivedPendingInfo =
    hasSignalValue(input.pending_info_reason) ||
    hasSignalValue(input.follow_up_date) ||
    hasSignalValue(input.next_action_note) ||
    hasSignalValue(input.action_required_by);

  return legacyPendingInfo || derivedPendingInfo;
}

export const WAITING_STATE_TYPES = [
  "waiting_on_part",
  "waiting_on_customer_approval",
  "estimate_needed",
  "waiting_on_access",
  "waiting_on_information",
  "other",
] as const;

export type WaitingStateType = (typeof WAITING_STATE_TYPES)[number];

const WAITING_STATE_LABELS: Record<WaitingStateType, string> = {
  waiting_on_part: "Waiting on part",
  waiting_on_customer_approval: "Waiting on customer approval",
  estimate_needed: "Estimate needed",
  waiting_on_access: "Waiting on access",
  waiting_on_information: "Waiting on information",
  other: "Other",
};

const WAITING_STATE_LEGACY_LABEL_ALIASES: Partial<Record<WaitingStateType, readonly string[]>> = {
  waiting_on_customer_approval: ["Waiting on approval"],
};

type ActiveWaitingStatus = "pending_info" | "on_hold";

export type InterruptState = "pending_info" | "on_hold" | "waiting";

export function getInterruptClearActionLabel(state: InterruptState): string {
  if (state === "pending_info") return "Mark Info Received";
  if (state === "on_hold") return "Resume Job";
  return "Mark Ready to Continue";
}

export function isActiveWaitingOpsStatus(value: unknown): value is ActiveWaitingStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "pending_info" || normalized === "on_hold";
}

export function getWaitingStateLabel(type: WaitingStateType): string {
  return WAITING_STATE_LABELS[type];
}

export function parseWaitingStateType(value: unknown): WaitingStateType | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if ((WAITING_STATE_TYPES as readonly string[]).includes(normalized)) {
    return normalized as WaitingStateType;
  }
  return null;
}

export function formatWaitingStateReason(type: WaitingStateType, reason: string): string {
  const body = String(reason ?? "").trim();
  if (!body) return "";
  return `${WAITING_STATE_LABELS[type]}: ${body}`;
}

export type ParsedWaitingStateReason = {
  blockerType: WaitingStateType;
  blockerLabel: string;
  blockerReason: string;
};

export function parseWaitingStateReason(raw: unknown): ParsedWaitingStateReason | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;

  const lowered = text.toLowerCase();
  for (const type of WAITING_STATE_TYPES) {
    const aliases = WAITING_STATE_LEGACY_LABEL_ALIASES[type] ?? [];
    const candidateLabels = [WAITING_STATE_LABELS[type], ...aliases];

    for (const candidateLabel of candidateLabels) {
      const prefix = `${candidateLabel}:`.toLowerCase();
      if (!lowered.startsWith(prefix)) continue;

      const blockerReason = text.slice(prefix.length).trim();
      if (!blockerReason) return null;

      return {
        blockerType: type,
        blockerLabel: WAITING_STATE_LABELS[type],
        blockerReason,
      };
    }

    if (type !== "other" && candidateLabels.some((label) => lowered === label.toLowerCase())) {
      return {
        blockerType: type,
        blockerLabel: WAITING_STATE_LABELS[type],
        blockerReason: WAITING_STATE_LABELS[type],
      };
    }
  }

  return null;
}

export type ActiveWaitingState = ParsedWaitingStateReason & {
  status: ActiveWaitingStatus;
  parsed: boolean;
};

export function getActiveWaitingState(input: {
  ops_status?: string | null;
  pending_info_reason?: string | null;
  on_hold_reason?: string | null;
}): ActiveWaitingState | null {
  const statusRaw = String(input.ops_status ?? "").trim().toLowerCase();
  if (!isActiveWaitingOpsStatus(statusRaw)) return null;

  const rawReason = statusRaw === "pending_info"
    ? String(input.pending_info_reason ?? "").trim()
    : String(input.on_hold_reason ?? "").trim();

  if (!rawReason) return null;

  const parsed = parseWaitingStateReason(rawReason);
  if (parsed) {
    return {
      ...parsed,
      status: statusRaw,
      parsed: true,
    };
  }

  return null;
}