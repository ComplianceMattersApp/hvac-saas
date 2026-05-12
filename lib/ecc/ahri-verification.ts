function readText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function normalizeStatus(value: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "verified_listed") return "verified_listed";
  if (normalized === "not_found") return "not_found";
  if (normalized === "needs_model_correction") return "needs_model_correction";
  if (normalized === "not_applicable") return "not_applicable";
  if (normalized === "not_started") return "not_started";
  return null;
}

function buildMissingModelFields(summary: {
  outdoorModel: string | null;
  indoorCoilModel: string | null;
  furnaceOrAirHandlerModel: string | null;
  miniSplitOutdoorModel: string | null;
  miniSplitHeadModel: string | null;
}) {
  const missing: string[] = [];

  if (!summary.outdoorModel) missing.push("outdoor_model");
  if (!summary.indoorCoilModel) missing.push("indoor_coil_model");
  if (!summary.furnaceOrAirHandlerModel) missing.push("furnace_or_air_handler_model");
  if (!summary.miniSplitOutdoorModel) missing.push("mini_split_outdoor_model");
  if (!summary.miniSplitHeadModel) missing.push("mini_split_head_model");

  return missing;
}

export function buildAhriVerificationPayload(formData: FormData) {
  const ahriStatus = normalizeStatus(readText(formData, "ahri_status"));
  const ahriCertificateNumber = readText(formData, "ahri_certificate_number");
  const verifiedByName = readText(formData, "verified_by_name");
  const verifiedAt = readText(formData, "verified_at");
  const verificationNotes = readText(formData, "verification_notes");
  const matchedEquipmentSummary = readText(formData, "matched_equipment_summary");

  const outdoorModel = readText(formData, "outdoor_model");
  const indoorCoilModel = readText(formData, "indoor_coil_model");
  const furnaceOrAirHandlerModel = readText(formData, "furnace_or_air_handler_model");
  const miniSplitOutdoorModel = readText(formData, "mini_split_outdoor_model");
  const miniSplitHeadModel = readText(formData, "mini_split_head_model");

  const missingEquipmentModelFields = buildMissingModelFields({
    outdoorModel,
    indoorCoilModel,
    furnaceOrAirHandlerModel,
    miniSplitOutdoorModel,
    miniSplitHeadModel,
  });

  const complianceStatement =
    ahriStatus === "verified_listed"
      ? "AHRI matched system is verified/listed using office verification."
      : ahriStatus === "not_found"
      ? "AHRI listing not found for captured equipment combination."
      : ahriStatus === "needs_model_correction"
      ? "Equipment model correction is required before AHRI verification can be completed."
      : ahriStatus === "not_applicable"
      ? "AHRI verification marked not applicable."
      : "AHRI verification not started.";

  return {
    data: {
      ahri_status: ahriStatus,
      ahri_certificate_number: ahriCertificateNumber,
      verified_by_name: verifiedByName,
      verified_at: verifiedAt,
      verification_notes: verificationNotes,
      matched_equipment_summary: matchedEquipmentSummary,
      outdoor_model: outdoorModel,
      indoor_coil_model: indoorCoilModel,
      furnace_or_air_handler_model: furnaceOrAirHandlerModel,
      mini_split_outdoor_model: miniSplitOutdoorModel,
      mini_split_head_model: miniSplitHeadModel,
    },
    computed: {
      office_verification_status: ahriStatus,
      compliance_statement: complianceStatement,
      missing_equipment_model_fields: missingEquipmentModelFields,
    },
    computedPass: null,
  };
}

export function ensureAhriVerificationCompletionFields(formData: FormData) {
  const ahriStatus = normalizeStatus(readText(formData, "ahri_status"));

  if (!ahriStatus) {
    throw new Error("Select AHRI verification status before completing this test.");
  }

  if (ahriStatus === "verified_listed") {
    const ahriCertificateNumber = readText(formData, "ahri_certificate_number");
    if (!ahriCertificateNumber) {
      throw new Error("Enter AHRI certificate/reference number before completing a verified/listed AHRI test.");
    }
  }
}
