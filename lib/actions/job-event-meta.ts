/**
 * PH2-A: Shared Phase 2 event meta contract helpers.
 *
 * Lives here so both job-actions.ts and job-ops-actions.ts can import it
 * without creating a circular dependency (job-actions.ts already imports
 * from job-ops-actions.ts). Extractable to lib/utils/ later without any
 * interface change.
 */

/**
 * Stub that returns the Phase 2 staffing snapshot shape.
 * Returns empty/null values until PH2-B populates it with live
 * job_assignments data.
 */
export function buildStaffingSnapshotMeta(): {
  active_assignment_user_ids: string[];
  primary_user_id: string | null;
} {
  return {
    active_assignment_user_ids: [],
    primary_user_id: null,
  };
}

/**
 * Builds the Phase 2 movement event meta contract.
 *
 * - Preserves legacy `from` / `to` top-level keys so existing consumers
 *   remain unaffected.
 * - Adds `movement_context`, `staffing_snapshot`, and `source_action`
 *   for Phase 2 consumers.
 */
export function buildMovementEventMeta(params: {
  from: string;
  to: string;
  trigger?: string;
  sourceAction?: string;
}): Record<string, any> {
  const { from, to, trigger = "field_action", sourceAction } = params;
  return {
    // Legacy keys — preserved for existing consumers
    from,
    to,
    // Phase 2 structured contract
    movement_context: {
      from_status: from,
      to_status: to,
      trigger,
    },
    staffing_snapshot: buildStaffingSnapshotMeta(),
    ...(sourceAction ? { source_action: sourceAction } : {}),
  };
}
