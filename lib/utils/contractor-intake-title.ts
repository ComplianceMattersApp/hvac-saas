import type { VisitScopeItem } from "@/lib/jobs/visit-scope";

function formatProjectTypeTitleFragment(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;

  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function deriveInternalIntakeJobTitle(input: {
  jobType: "ecc" | "service";
  projectType?: string | null;
  serviceVisitReason?: string | null;
  visitScopeSummary?: string | null;
  visitScopeItems?: VisitScopeItem[] | null;
}) {
  if (input.jobType === "service") {
    const explicitReason = String(input.serviceVisitReason ?? "").trim();
    if (explicitReason) return explicitReason;

    const summary = String(input.visitScopeSummary ?? "").trim();
    if (summary) return summary;

    const firstItemTitle = String(
      input.visitScopeItems?.find((item) => String(item?.title ?? "").trim())?.title ?? "",
    ).trim();
    if (firstItemTitle) return firstItemTitle;

    return "Service Visit";
  }

  const projectTypeLabel = formatProjectTypeTitleFragment(input.projectType);
  return projectTypeLabel ? `ECC ${projectTypeLabel} Test` : "ECC Test";
}

export function resolveCreateJobTitle(input: {
  submittedTitle?: string | null;
  isContractorUser: boolean;
  jobType: "ecc" | "service";
  projectType?: string | null;
  serviceVisitReason?: string | null;
  visitScopeSummary?: string | null;
  visitScopeItems?: VisitScopeItem[] | null;
}) {
  const submittedTitle = String(input.submittedTitle ?? "").trim();

  if (input.isContractorUser) {
    if (input.jobType === "ecc") {
      return deriveInternalIntakeJobTitle({
        jobType: "ecc",
        projectType: input.projectType,
      });
    }

    return submittedTitle;
  }

  if (submittedTitle) return submittedTitle;

  return deriveInternalIntakeJobTitle({
    jobType: input.jobType,
    projectType: input.projectType,
    serviceVisitReason: input.serviceVisitReason,
    visitScopeSummary: input.visitScopeSummary,
    visitScopeItems: input.visitScopeItems,
  });
}

export function buildContractorProposalSubmissionFields(input: {
  resolvedTitle: string;
  jobNotesRaw: string;
}) {
  return {
    proposed_title: input.resolvedTitle || null,
    proposed_job_notes: input.jobNotesRaw || null,
  };
}

export function normalizeContractorIntakeProjectType(raw: unknown) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "all_new" || value === "new_construction" || value === "alteration") {
    return value;
  }

  return "alteration";
}

export function resolveFinalizedContractorIntakeTitle(input: {
  proposedProjectType?: string | null;
  proposedTitle?: string | null;
  jobType: "ecc" | "service";
}) {
  if (input.jobType === "ecc") {
    return deriveInternalIntakeJobTitle({
      jobType: "ecc",
      projectType: normalizeContractorIntakeProjectType(input.proposedProjectType),
    });
  }

  const proposed = String(input.proposedTitle ?? "").trim();
  if (proposed) return proposed;
  return "Service Intake";
}