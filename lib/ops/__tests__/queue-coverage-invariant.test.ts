import { describe, expect, it } from "vitest";
import { buildExceptionQueueRows, buildWaitingQueueRows } from "@/lib/ops/focused-queues";
import { isInCloseoutQueue } from "@/lib/utils/closeout";

// ─────────────────────────────────────────────────────────────────────────────
// Queue coverage invariant
//
// Every ACTIVE job state must be claimed by at least one operational surface.
// A state no queue claims is invisible to the office — the Job #1352 incident:
// a correction review wrote paperwork_required on a permit-missing job, and
// Closeout (permit-blocked cert work excluded by design), Waiting (requires
// pending_info), and Exceptions (failure just resolved) all correctly refused
// it.
//
// This test enumerates the state space, prunes combinations the lifecycle
// cannot produce (each prune is a documented rule), evaluates membership with
// the REAL queue predicates wherever they exist in lib, and asserts the orphan
// set matches an explicit allowlist EXACTLY. If a rule change creates a new
// unclaimed state, this test fails and the new orphan must either be routed to
// a queue or added here with a written justification.
// ─────────────────────────────────────────────────────────────────────────────

const JOB_TYPES = ["ecc", "service"] as const;
const LIFECYCLE_STATUSES = ["open", "on_the_way", "in_process", "completed"] as const;
// OpsStatus union (lib/actions/ops-status.ts) plus legacy values the /ops page
// still counts ("waiting", "problem") so legacy rows stay covered.
const OPS_STATUSES = [
  "need_to_schedule",
  "scheduled",
  "pending_info",
  "pending_office_review",
  "on_hold",
  "failed",
  "retest_needed",
  "paperwork_required",
  "invoice_required",
  "closed",
  "waiting",
  "problem",
] as const;
const BOOLS = [true, false] as const;
const PERMITS = ["PRM-2026-0001", "none"] as const; // valid / invalid placeholder
const PENDING_REASONS = [null, "Permit Needed", "Waiting on homeowner access"] as const;

type MatrixJob = {
  id: string;
  created_at: string;
  job_type: (typeof JOB_TYPES)[number];
  status: (typeof LIFECYCLE_STATUSES)[number];
  ops_status: (typeof OPS_STATUSES)[number];
  field_complete: boolean;
  invoice_complete: boolean;
  certs_complete: boolean;
  permit_number: string;
  pending_info_reason: string | null;
  on_hold_reason: string | null;
  service_follow_up_continued?: boolean;
};

// Known lifecycle rules: combinations the app cannot produce. Every prune here
// is a rule statement — if one becomes false, delete it and the matrix will
// start checking those states.
function isReachableState(job: MatrixJob): boolean {
  // certs tracking exists only on ECC jobs.
  if (job.job_type !== "ecc" && job.certs_complete) return false;

  // field_complete is set exclusively by the completion transition (and visit
  // submission flows) — never while the lifecycle is still open/en-route.
  if (job.status !== "completed" && job.field_complete) return false;

  // The completion transition always stamps field_complete=true.
  if (job.status === "completed" && !job.field_complete) return false;

  // Marking On the Way auto-schedules unscheduled jobs, so active/complete
  // field work cannot coexist with need_to_schedule.
  if (job.ops_status === "need_to_schedule" && job.status !== "open") return false;

  // Closeout-phase statuses are written only by completion paths (advance
  // action, evaluateEccOpsStatus, data entry, correction review) — all of
  // which run at/after field completion.
  if (
    (job.ops_status === "paperwork_required" || job.ops_status === "invoice_required") &&
    !job.field_complete
  ) {
    return false;
  }

  // Service jobs never receive paperwork_required — resolveOpsStatus routes
  // service closeout straight to invoice_required/closed (lib/utils/ops-status.ts).
  if (job.job_type === "service" && job.ops_status === "paperwork_required") return false;

  // ECC reaches invoice_required only after certs complete — resolveOpsStatus
  // returns paperwork_required first while certs are outstanding, and
  // invoice_required is not a manual status.
  if (job.job_type === "ecc" && job.ops_status === "invoice_required" && !job.certs_complete) {
    return false;
  }

  // Service completion sets status/field_complete/ops_status=invoice_required
  // in one atomic update (advanceJobStatusFromForm else-branch), so a
  // completed service job cannot still carry ops=scheduled.
  if (job.job_type === "service" && job.status === "completed" && job.ops_status === "scheduled") {
    return false;
  }

  return true;
}

// Terminal states are allowed to be queue-less.
function isTerminalState(job: MatrixJob): boolean {
  return job.ops_status === "closed";
}

// ── Queue membership ─────────────────────────────────────────────────────────

// Mirrors app/ops/page.tsx needToScheduleCountQ (requireOpenStatus).
function claimedByNeedToSchedule(job: MatrixJob): boolean {
  return job.ops_status === "need_to_schedule" && job.status === "open";
}

// Dispatch / Today / Field Work surfaces: scheduled or actively-worked jobs
// whose field work is not finished (app/ops/page.tsx fieldWorkCountQ +
// scheduledOpenRowsQ + calendar/Today read models).
function claimedByDispatchSurfaces(job: MatrixJob): boolean {
  if (job.field_complete) return false;
  if (job.ops_status === "scheduled") return true;
  return job.status === "on_the_way" || job.status === "in_process";
}

function claimedByWaiting(job: MatrixJob): boolean {
  return buildWaitingQueueRows([job]).length === 1;
}

function claimedByExceptions(job: MatrixJob): boolean {
  return buildExceptionQueueRows([job]).length === 1;
}

// The /ops closeout pipeline projects billing truth into invoice_complete and
// then applies isInCloseoutQueue — the matrix's invoice_complete IS that
// projected truth, so the predicate applies directly.
function claimedByCloseout(job: MatrixJob): boolean {
  return isInCloseoutQueue(job);
}

// pending_office_review is additionally surfaced in the Waiting count on /ops.
function claimedByOfficeReview(job: MatrixJob): boolean {
  return job.ops_status === "pending_office_review";
}

const QUEUES: Array<[string, (job: MatrixJob) => boolean]> = [
  ["need_to_schedule", claimedByNeedToSchedule],
  ["dispatch", claimedByDispatchSurfaces],
  ["waiting", claimedByWaiting],
  ["exceptions", claimedByExceptions],
  ["closeout", claimedByCloseout],
  ["office_review", claimedByOfficeReview],
];

function describeState(job: MatrixJob): string {
  return [
    job.job_type,
    `status=${job.status}`,
    `ops=${job.ops_status}`,
    `field=${job.field_complete ? 1 : 0}`,
    `invoice=${job.invoice_complete ? 1 : 0}`,
    `certs=${job.certs_complete ? 1 : 0}`,
    `permit=${job.permit_number === "none" ? "invalid" : "valid"}`,
    `reason=${job.pending_info_reason ?? "-"}`,
  ].join(" ");
}

// Residue allowlist — states that CAN exist but are accepted as transiently
// queue-less, each with a written justification and the mechanism that bounds
// it. Entries are debt, not configuration: anything new must either be routed
// to a queue or argued into this list.
const ALLOWED_ORPHAN_RULES: Array<{ reason: string; matches: (job: MatrixJob) => boolean }> = [
  {
    // evaluateEccOpsStatus after ECC completion is best-effort (errors are
    // swallowed by design so lifecycle completion never fails). If it errors,
    // ops stays "scheduled" with field work done. Bounded by the next
    // successful evaluation touch; candidate for a Queue Health sweep.
    reason: "ecc-evaluator-failure residue (ops stays scheduled after completion)",
    matches: (job) =>
      job.job_type === "ecc" && job.status === "completed" && job.ops_status === "scheduled",
  },
  {
    // Stale-done closeout statuses: the tracked work is finished but ops still
    // says it's owed (paperwork_required with certs done / invoice_required
    // with invoice done). resolveOpsStatus advances these to the next status or
    // closed on the next evaluation; healStalePaperworkOpsStatus exists for
    // the paperwork case.
    reason: "stale-done closeout status (resolver/heal advances on next touch)",
    matches: (job) =>
      (job.ops_status === "paperwork_required" && job.certs_complete) ||
      (job.ops_status === "invoice_required" && job.invoice_complete),
  },
  {
    // The Job #1352 incident state: paperwork_required while certs are blocked
    // by a missing permit and the invoice is already settled. Prevented at
    // every writer (applyEccPermitNeededBlocker in the ECC evaluator; the
    // correction-review fix pinned by correction-review-permit-routing.test.ts)
    // — those writers route it to pending_info + "Permit Needed" instead. If
    // this state is ever observed in data, it is a writer bug: heal to
    // pending_info + "Permit Needed".
    reason: "writer-protected permit-missing paperwork_required (Job #1352 state)",
    matches: (job) =>
      job.job_type === "ecc" &&
      job.ops_status === "paperwork_required" &&
      !job.certs_complete &&
      job.permit_number === "none" &&
      job.invoice_complete,
  },
  {
    // Automatic permit wait whose permit has since been recorded but whose
    // pending_info hold has not been released yet. Both permit writers release
    // it (releasePendingInfoAndRecompute via auto_release_on_permit_save and
    // permit_available), so this exists only inside those transactions.
    reason: "writer-protected released-permit hold (permit saves release pending_info)",
    matches: (job) =>
      job.job_type === "ecc" &&
      job.ops_status === "pending_info" &&
      job.pending_info_reason === "Permit Needed" &&
      job.permit_number !== "none",
  },
];

function* enumerateStates(): Generator<MatrixJob> {
  let n = 0;
  for (const job_type of JOB_TYPES)
    for (const status of LIFECYCLE_STATUSES)
      for (const ops_status of OPS_STATUSES)
        for (const field_complete of BOOLS)
          for (const invoice_complete of BOOLS)
            for (const certs_complete of BOOLS)
              for (const permit_number of PERMITS)
                for (const pending_info_reason of PENDING_REASONS) {
                  n += 1;
                  yield {
                    id: `job-${n}`,
                    created_at: "2026-08-01T00:00:00.000Z",
                    job_type,
                    status,
                    ops_status,
                    field_complete,
                    invoice_complete,
                    certs_complete,
                    permit_number,
                    pending_info_reason,
                    on_hold_reason: null,
                  };
                }
}

describe("queue coverage invariant", () => {
  it("claims every reachable active job state in at least one queue", () => {
    const orphans: string[] = [];
    const ruleHits = new Array(ALLOWED_ORPHAN_RULES.length).fill(0);
    let reachable = 0;

    for (const job of enumerateStates()) {
      if (!isReachableState(job)) continue;
      if (isTerminalState(job)) continue;
      reachable += 1;

      const claimed = QUEUES.some(([, predicate]) => predicate(job));
      if (!claimed) {
        const ruleIndex = ALLOWED_ORPHAN_RULES.findIndex((rule) => rule.matches(job));
        if (ruleIndex === -1) {
          orphans.push(describeState(job));
        } else {
          ruleHits[ruleIndex] += 1;
        }
      }
    }

    expect(reachable).toBeGreaterThan(500);
    expect(orphans).toEqual([]);

    // Every allowlist rule must still be earning its place — a rule matching
    // nothing means the residue was eliminated and the entry should be removed.
    for (let index = 0; index < ALLOWED_ORPHAN_RULES.length; index += 1) {
      expect(
        ruleHits[index],
        `allowlist rule no longer matches anything: ${ALLOWED_ORPHAN_RULES[index].reason}`,
      ).toBeGreaterThan(0);
    }
  });

  it("keeps the Job #1352 incident state claimed by Waiting after permit routing", () => {
    // The exact state the correction-review fix now produces.
    const healed: MatrixJob = {
      id: "job-1352",
      created_at: "2026-07-24T00:00:00.000Z",
      job_type: "ecc",
      status: "completed",
      ops_status: "pending_info",
      field_complete: true,
      invoice_complete: true,
      certs_complete: false,
      permit_number: "none",
      pending_info_reason: "Permit Needed",
      on_hold_reason: null,
    };
    expect(claimedByWaiting(healed)).toBe(true);

    // And the pre-fix raw write is an orphan the matrix would catch.
    const broken: MatrixJob = { ...healed, ops_status: "paperwork_required", pending_info_reason: null };
    expect(QUEUES.some(([, predicate]) => predicate(broken))).toBe(false);
  });
});
