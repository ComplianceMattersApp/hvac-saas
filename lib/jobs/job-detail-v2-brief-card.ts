type JobBriefContinuityInput = {
  serviceCaseVisitCount?: number | null;
  jobType?: string | null;
  opsStatus?: string | null;
  serviceVisitOutcome?: string | null;
  hasLinkedRetestVisit?: boolean;
};

function cleanText(value?: string | null) {
  return String(value ?? "").trim();
}

function normalizeText(value?: string | null) {
  return cleanText(value).toLowerCase().replace(/\s+/g, " ");
}

function removeGeneratedCitySuffix(reason: string, city?: string | null) {
  const cityText = cleanText(city);
  if (!cityText) return reason;

  const escapedCity = cityText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return reason.replace(new RegExp(`\\s+[\\u2013\\u2014-]\\s+${escapedCity}\\s*$`, "i"), "").trim();
}

function formatReasonText(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((part) => {
      if (part.toUpperCase() === "ECC") return "ECC";
      if (part.length <= 1) return part.toUpperCase();
      if (part === part.toUpperCase()) return part;
      return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
    })
    .join(" ");
}

export function buildV2PulseJobBriefPrimaryLine({
  reason,
  contractorName,
  city,
}: {
  reason?: string | null;
  contractorName?: string | null;
  city?: string | null;
}) {
  const rawReason = cleanText(reason);
  const cleanedReason = rawReason ? formatReasonText(removeGeneratedCitySuffix(rawReason, city)) : "";
  const contractor = cleanText(contractorName);

  if (!cleanedReason && !contractor) return "No visit reason recorded.";
  if (!contractor) return cleanedReason || "No visit reason recorded.";

  const normalizedReason = normalizeText(cleanedReason);
  const normalizedContractor = normalizeText(contractor);
  if (!cleanedReason || normalizedReason === normalizedContractor || normalizedReason.endsWith(` for ${normalizedContractor}`)) {
    return cleanedReason || contractor;
  }

  return `${cleanedReason} for ${contractor}`;
}

export function buildV2PulseJobBriefContinuityLine({
  serviceCaseVisitCount,
  jobType,
  opsStatus,
  serviceVisitOutcome,
  hasLinkedRetestVisit,
}: JobBriefContinuityInput) {
  const priorVisitCount = Math.max(0, Number(serviceCaseVisitCount ?? 0) - 1);
  if (hasLinkedRetestVisit) return "Linked retest visit exists";
  if (priorVisitCount <= 0) return null;

  const normalizedJobType = normalizeText(jobType);
  const normalizedOpsStatus = normalizeText(opsStatus);
  const normalizedOutcome = normalizeText(serviceVisitOutcome);

  if (
    normalizedJobType === "ecc" &&
    ["failed", "retest_needed", "pending_office_review"].includes(normalizedOpsStatus)
  ) {
    return "Last visit had a failed test";
  }
  if (normalizedOutcome === "parts_needed") return "Last visit needed parts";
  if (normalizedOutcome === "approval_needed") return "Last visit needed approval";

  return `${priorVisitCount} prior visit${priorVisitCount === 1 ? "" : "s"} linked`;
}
