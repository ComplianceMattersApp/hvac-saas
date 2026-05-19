type AssignmentDisplayInput = {
  is_primary?: boolean;
  is_active?: boolean;
  deleted_at?: string | null;
  removed_at?: string | null;
};

type ScheduledWithoutTechJobInput = {
  id: string;
  ops_status?: string | null;
  status?: string | null;
  account_owner_user_id?: string | null;
  scheduled_date?: string | null;
  window_start?: string | null;
};

export type ScheduledWithoutTechSnapshot = {
  count: number;
  preview: ScheduledWithoutTechJobInput[];
  hasMore: boolean;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function compareScheduledJobs(left: ScheduledWithoutTechJobInput, right: ScheduledWithoutTechJobInput) {
  const leftDate = String(left.scheduled_date ?? "");
  const rightDate = String(right.scheduled_date ?? "");
  const dateDiff = leftDate.localeCompare(rightDate);
  if (dateDiff !== 0) return dateDiff;

  const leftWindow = String(left.window_start ?? "");
  const rightWindow = String(right.window_start ?? "");
  return leftWindow.localeCompare(rightWindow);
}

function isActiveAssignment(assignment: AssignmentDisplayInput | null | undefined) {
  if (!assignment) return false;
  if (assignment.is_active === false) return false;

  const deletedAt = String(assignment.deleted_at ?? "").trim();
  if (deletedAt) return false;

  const removedAt = String(assignment.removed_at ?? "").trim();
  if (removedAt) return false;

  return true;
}

function hasAnyActiveTechAssignment(assignments: AssignmentDisplayInput[]) {
  return assignments.some((assignment) => isActiveAssignment(assignment));
}

function isScheduledOpenJob(job: ScheduledWithoutTechJobInput) {
  return normalizeText(job?.ops_status) === "scheduled" && normalizeText(job?.status) === "open";
}

export function buildScheduledWithoutTechSnapshot(params: {
  jobs: ScheduledWithoutTechJobInput[];
  assignmentDisplayMap: Record<string, AssignmentDisplayInput[]>;
  previewLimit?: number;
  accountOwnerUserId?: string | null;
}): ScheduledWithoutTechSnapshot {
  const jobs = Array.isArray(params.jobs) ? params.jobs : [];
  const assignmentDisplayMap = params.assignmentDisplayMap ?? {};
  const scopedAccountOwner = String(params.accountOwnerUserId ?? "").trim();
  const previewLimit = Math.max(1, Number(params.previewLimit ?? 5) || 5);

  const filtered = jobs.filter((job) => {
    const jobId = String(job?.id ?? "").trim();
    if (!jobId) return false;

    if (scopedAccountOwner) {
      const jobAccountOwner = String(job?.account_owner_user_id ?? "").trim();
      if (jobAccountOwner !== scopedAccountOwner) return false;
    }

    if (!isScheduledOpenJob(job)) return false;

    const assignments = Array.isArray(assignmentDisplayMap[jobId]) ? assignmentDisplayMap[jobId] : [];
    return !hasAnyActiveTechAssignment(assignments);
  });

  const sorted = [...filtered].sort(compareScheduledJobs);
  const preview = sorted.slice(0, previewLimit);

  return {
    count: sorted.length,
    preview,
    hasMore: sorted.length > preview.length,
  };
}
