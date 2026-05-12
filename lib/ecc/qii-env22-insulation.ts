function readText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function readList(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => String(value ?? "").trim());
}

function normalizeTriState(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "yes") return "yes";
  if (normalized === "no") return "no";
  return "unknown";
}

function normalizeVerificationStatus(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "pass") return "pass";
  if (normalized === "fail") return "fail";
  if (normalized === "not_applicable") return "not_applicable";
  if (normalized === "needs_correction") return "needs_correction";
  return "not_started";
}

function normalizeOverallStatus(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "pass") return "pass";
  if (normalized === "fail") return "fail";
  if (normalized === "partial") return "partial";
  if (normalized === "not_applicable") return "not_applicable";
  return "not_started";
}

export type QiiEnv22Entry = {
  insulation_location: string | null;
  insulation_type: string | null;
  insulation_brand: string | null;
  required_r_value: string | null;
  installed_r_value: string | null;
  required_depth: string | null;
  observed_depth: string | null;
  depth_unit: string | null;
  manufacturer_label_provided: "yes" | "no" | "unknown";
  loose_fill_coverage_chart_confirmed: "yes" | "no" | "unknown";
  loose_fill_density_verified: "yes" | "no" | "unknown";
  loose_fill_depth_locations_checked: string | null;
  loose_fill_attic_rulers_installed: "yes" | "no" | "unknown";
  verification_status: "pass" | "fail" | "needs_correction" | "not_applicable" | "not_started";
  correction_notes: string | null;
  entry_notes: string | null;
};

function buildEntries(formData: FormData): QiiEnv22Entry[] {
  const locations = readList(formData, "insulation_location[]");
  const types = readList(formData, "insulation_type[]");
  const brands = readList(formData, "insulation_brand[]");
  const requiredRValues = readList(formData, "required_r_value[]");
  const installedRValues = readList(formData, "installed_r_value[]");
  const requiredDepths = readList(formData, "required_depth[]");
  const observedDepths = readList(formData, "observed_depth[]");
  const depthUnits = readList(formData, "depth_unit[]");
  const manufacturerLabels = readList(formData, "manufacturer_label_provided[]");
  const looseFillCoverage = readList(formData, "loose_fill_coverage_chart_confirmed[]");
  const looseFillDensity = readList(formData, "loose_fill_density_verified[]");
  const looseFillDepthChecks = readList(formData, "loose_fill_depth_locations_checked[]");
  const looseFillRulers = readList(formData, "loose_fill_attic_rulers_installed[]");
  const verificationStatuses = readList(formData, "verification_status[]");
  const correctionNotes = readList(formData, "correction_notes[]");
  const entryNotes = readList(formData, "entry_notes[]");

  const rowCount = Math.max(
    locations.length,
    types.length,
    brands.length,
    requiredRValues.length,
    installedRValues.length,
    requiredDepths.length,
    observedDepths.length,
    depthUnits.length,
    manufacturerLabels.length,
    looseFillCoverage.length,
    looseFillDensity.length,
    looseFillDepthChecks.length,
    looseFillRulers.length,
    verificationStatuses.length,
    correctionNotes.length,
    entryNotes.length,
  );

  const entries: QiiEnv22Entry[] = [];

  for (let index = 0; index < rowCount; index += 1) {
    const row = {
      insulation_location: locations[index] || null,
      insulation_type: types[index] || null,
      insulation_brand: brands[index] || null,
      required_r_value: requiredRValues[index] || null,
      installed_r_value: installedRValues[index] || null,
      required_depth: requiredDepths[index] || null,
      observed_depth: observedDepths[index] || null,
      depth_unit: depthUnits[index] || null,
      manufacturer_label_provided: normalizeTriState(manufacturerLabels[index] || ""),
      loose_fill_coverage_chart_confirmed: normalizeTriState(looseFillCoverage[index] || ""),
      loose_fill_density_verified: normalizeTriState(looseFillDensity[index] || ""),
      loose_fill_depth_locations_checked: looseFillDepthChecks[index] || null,
      loose_fill_attic_rulers_installed: normalizeTriState(looseFillRulers[index] || ""),
      verification_status: normalizeVerificationStatus(verificationStatuses[index] || ""),
      correction_notes: correctionNotes[index] || null,
      entry_notes: entryNotes[index] || null,
    } as QiiEnv22Entry;

    // Check if row has meaningful data (ignore depth_unit and default states)
    const hasAnyMeaningfulValue =
      (row.insulation_location && row.insulation_location.length > 0) ||
      (row.insulation_type && row.insulation_type.length > 0) ||
      (row.insulation_brand && row.insulation_brand.length > 0) ||
      (row.required_r_value && row.required_r_value.length > 0) ||
      (row.installed_r_value && row.installed_r_value.length > 0) ||
      (row.required_depth && row.required_depth.length > 0) ||
      (row.observed_depth && row.observed_depth.length > 0) ||
      (row.loose_fill_depth_locations_checked && row.loose_fill_depth_locations_checked.length > 0) ||
      (row.correction_notes && row.correction_notes.length > 0) ||
      (row.entry_notes && row.entry_notes.length > 0) ||
      (row.manufacturer_label_provided !== "unknown") ||
      (row.loose_fill_coverage_chart_confirmed !== "unknown") ||
      (row.loose_fill_density_verified !== "unknown") ||
      (row.loose_fill_attic_rulers_installed !== "unknown") ||
      (row.verification_status !== "not_started");

    if (hasAnyMeaningfulValue) {
      entries.push(row);
    }
  }

  return entries;
}

export function buildQiiEnv22InsulationPayload(formData: FormData) {
  const entries = buildEntries(formData);
  const overallStatus = normalizeOverallStatus(String(formData.get("overall_qii_status") ?? ""));

  const failedLocations = entries
    .filter(
      (entry) =>
        entry.verification_status === "fail" || entry.verification_status === "needs_correction",
    )
    .map((entry) => entry.insulation_location || "Unspecified location");

  const missingRequiredFields = entries
    .flatMap((entry, index) => {
      const missing: string[] = [];
      if (!entry.insulation_location) missing.push(`row_${index + 1}_insulation_location`);
      if (!entry.insulation_type) missing.push(`row_${index + 1}_insulation_type`);
      if (entry.verification_status === "not_started") {
        missing.push(`row_${index + 1}_verification_status`);
      }
      if (
        (entry.verification_status === "fail" ||
          entry.verification_status === "needs_correction") &&
        !entry.correction_notes
      ) {
        missing.push(`row_${index + 1}_correction_notes`);
      }
      return missing;
    })
    .filter(Boolean);

  const hasFailures = failedLocations.length > 0;
  const complianceStatement = hasFailures
    ? "One or more insulation locations require correction before closeout."
    : entries.length > 0
      ? "All documented insulation locations currently satisfy recorded checks."
      : "No insulation locations documented yet.";

  return {
    data: {
      qii_project_basis_note: readText(formData, "qii_project_basis_note"),
      verified_by_name: readText(formData, "verified_by_name"),
      verified_at: readText(formData, "verified_at"),
      overall_qii_status: overallStatus,
      insulation_entries: entries,
      general_notes: readText(formData, "general_notes"),
    },
    computed: {
      entry_count: entries.length,
      failed_locations: failedLocations,
      missing_required_fields: missingRequiredFields,
      compliance_statement: complianceStatement,
    },
    computedPass: null,
  };
}

export function ensureQiiEnv22InsulationCompletionFields(formData: FormData) {
  const overallStatus = normalizeOverallStatus(String(formData.get("overall_qii_status") ?? ""));
  const entries = buildEntries(formData);

  if (entries.length === 0) {
    throw new Error("Add at least one insulation verification row before completing this test.");
  }

  entries.forEach((entry, index) => {
    const rowNumber = index + 1;
    if (!entry.insulation_location) {
      throw new Error(`Enter insulation location for row ${rowNumber} before completing this test.`);
    }
    if (!entry.insulation_type) {
      throw new Error(`Enter insulation type for row ${rowNumber} before completing this test.`);
    }
    if (entry.verification_status === "not_started") {
      throw new Error(`Select verification status for row ${rowNumber} before completing this test.`);
    }
    if (
      (entry.verification_status === "fail" ||
        entry.verification_status === "needs_correction") &&
      !entry.correction_notes
    ) {
      throw new Error(
        `Enter correction notes for row ${rowNumber} when status is fail or needs correction.`,
      );
    }
  });

  if (
    overallStatus === "pass" &&
    entries.some(
      (entry) => entry.verification_status !== "pass" && entry.verification_status !== "not_applicable",
    )
  ) {
    throw new Error("Overall QII status cannot be pass while any row is marked fail or needs correction.");
  }
}
