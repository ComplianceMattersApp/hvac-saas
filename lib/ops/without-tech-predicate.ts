export type WithoutTechAssignmentInput = {
  is_active?: boolean;
  deleted_at?: string | null;
  removed_at?: string | null;
};

export type TodayWithoutTechJobInput = {
  id: string;
  status?: string | null;
  scheduled_date?: string | null;
  field_complete?: boolean | null;
};

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isTodayWithoutTechCandidateJob(
  job: TodayWithoutTechJobInput | null | undefined,
  today: string,
): boolean {
  if (!job) return false;
  const jobId = String(job.id ?? "").trim();
  if (!jobId) return false;
  if (String(job.scheduled_date ?? "").trim() !== today) return false;
  if (normalize(job.status) === "cancelled") return false;
  if (job.field_complete === true) return false;
  return true;
}

export function isActiveTechAssignment(
  assignment: WithoutTechAssignmentInput | null | undefined,
): boolean {
  if (!assignment) return false;
  if (assignment.is_active === false) return false;
  if (String(assignment.deleted_at ?? "").trim()) return false;
  if (String(assignment.removed_at ?? "").trim()) return false;
  return true;
}

export function hasAnyActiveTechAssignment(
  assignments: Array<WithoutTechAssignmentInput | null | undefined>,
): boolean {
  return assignments.some((assignment) => isActiveTechAssignment(assignment));
}