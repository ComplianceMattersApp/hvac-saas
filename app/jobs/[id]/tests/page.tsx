// app/jobs/[id]/tests/page
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveEccScenario } from "@/lib/ecc/scenario-resolver";
import Link from "next/link";
import PrintButton from "@/components/ui/PrintButton";
import SubmitButton from "@/components/SubmitButton";
import EccLivePreview from "@/components/jobs/EccLivePreview";
import DuctLeakageMethodFields from "@/components/jobs/DuctLeakageMethodFields";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";

import {
  completeEccTestRunFromForm,
  addEccTestRunFromForm,
  deleteEccTestRunFromForm,
  saveDuctLeakageDataFromForm,
  saveAirflowDataFromForm,
  saveRefrigerantChargeDataFromForm,
  saveAndCompleteDuctLeakageFromForm,
  saveAndCompleteAirflowFromForm,
  saveAndCompleteRefrigerantChargeFromForm,
} from "@/lib/actions/job-actions";

import {
  getActiveManualAddTests,
  getTestDefinition,
  type EccTestType,
} from "@/lib/ecc/test-registry";
import {
  getRequiredTestsForSystem,
  normalizeProjectTypeToRuleProfile,
  isPackageSystem,
} from "@/lib/ecc/rule-profiles";
import { equipmentRoleLabel, isHeatingOnlyEquipment } from "@/lib/utils/equipment-display";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import { formatBusinessDateUS } from "@/lib/utils/schedule-la";

function getEffectiveResultLabel(t: any) {
  if (t.override_pass === true) return "PASS (override)";
  if (t.override_pass === false) return "FAIL (override)";
  if (t.computed?.status === "blocked") return "BLOCKED (conditions)";
  if (t.computed_pass === true) return "PASS";
  if (t.computed_pass === false) return "FAIL";
  return "Not computed";
}

function getEffectiveResultState(run: any): "pass" | "fail" | "unknown" {
  if (!run) return "unknown";
  if (run.override_pass === true) return "pass";
  if (run.override_pass === false) return "fail";
  if (run.computed_pass === true) return "pass";
  if (run.computed_pass === false) return "fail";
  return "unknown";
}

function getPrimaryEquipment(systemEquipment: any[]) {
  return (
    systemEquipment.find((eq) => eq.component_type?.startsWith("package")) ??
    systemEquipment.find((eq) => eq.equipment_role === "condenser") ??
    systemEquipment.find((eq) => eq.equipment_role === "air_handler") ??
    systemEquipment.find((eq) => eq.equipment_role === "furnace") ??
    systemEquipment[0] ??
    null
  );
}

function getTestDisplayLabel(testType: string, packageSystem: boolean) {
  const baseLabel = getTestDefinition(testType)?.shortLabel ?? testType;

  if (packageSystem && testType === "refrigerant_charge") {
    return `${baseLabel} — Not Required (Package Unit)`;
  }

  return baseLabel;
}

function isTestExcludedForHeatOnly(testType: string) {
  const normalized = String(testType ?? "").trim().toLowerCase();
  return normalized === "airflow" || normalized === "refrigerant_charge";
}

function isTestApplicableToSystem(testType: string, heatOnlySystem: boolean) {
  if (!heatOnlySystem) return true;
  return !isTestExcludedForHeatOnly(testType);
}

function getRequiredTestStatusForSystem(job: any, systemId: string, testType: EccTestType) {
  const run = pickRunForSystem(job, testType, systemId);
  const runDataKeys = run?.data && typeof run.data === "object" ? Object.keys(run.data).length : 0;

  if (!run) {
    return {
      state: "required" as const,
      label: "Required",
      tone: "border-amber-200 bg-amber-50 text-amber-700",
      run,
    };
  }

  if (run.override_pass === true) {
    return {
      state: "pass_override" as const,
      label: "Pass (override)",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
      run,
    };
  }

  if (run.override_pass === false) {
    return {
      state: "fail_override" as const,
      label: "Fail (override)",
      tone: "border-red-200 bg-red-50 text-red-700",
      run,
    };
  }

  if (run.is_completed !== true) {
    return {
      state: runDataKeys > 0 ? ("saved" as const) : ("open" as const),
      label: runDataKeys > 0 ? "Saved" : "Open",
      tone: "border-blue-200 bg-blue-50 text-blue-700",
      run,
    };
  }

  if (run.computed_pass === true) {
    return {
      state: "pass" as const,
      label: "Pass",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
      run,
    };
  }

  if (run.computed_pass === false) {
    return {
      state: "fail" as const,
      label: "Fail",
      tone: "border-red-200 bg-red-50 text-red-700",
      run,
    };
  }

  return {
    state: "unknown" as const,
    label: "Not computed",
    tone: "border-slate-200 bg-slate-50 text-slate-700",
    run,
  };
}

function pickRunForSystem(job: any, testType: string, systemId: string) {
  const runs = (job?.ecc_test_runs ?? []).filter(
    (r: any) => r.test_type === testType && String(r.system_id ?? "") === String(systemId)
  );

  // newest first
  runs.sort((a: any, b: any) => {
    const at = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
    const bt = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
    return bt - at;
  });

  // prefer an incomplete run if one exists
  const active = runs.find((r: any) => r.is_completed !== true);
  return active ?? runs[0] ?? null;
}

function pickLatestRunForSystem(job: any, testType: string, systemId: string) {
  const runs = (job?.ecc_test_runs ?? [])
    .filter(
      (r: any) => r.test_type === testType && String(r.system_id ?? "") === String(systemId)
    )
    .sort((a: any, b: any) => {
      const at = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
      const bt = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
      return bt - at;
    });

  const completed = runs.find((r: any) => r.is_completed === true);
  return completed ?? runs[0] ?? null;
}

function fmtValue(value: unknown, unit?: string) {
  if (value == null || value === "") return "—";
  if (typeof value === "number") {
    const rendered = Number.isInteger(value) ? String(value) : value.toFixed(1);
    return unit ? `${rendered} ${unit}` : rendered;
  }
  const rendered = String(value).trim();
  if (!rendered) return "—";
  return unit ? `${rendered} ${unit}` : rendered;
}

function fallbackText(value: unknown) {
  const rendered = String(value ?? "").trim();
  return rendered || "—";
}

function equipmentSummaryLine(eq: any) {
  const rawType = String(eq?.equipment_role ?? eq?.component_type ?? "").trim();
  const equipmentType = rawType ? equipmentRoleLabel(rawType) : "—";
  const manufacturer = fallbackText(eq?.manufacturer);
  const model = fallbackText(eq?.model);
  const serial = fallbackText(eq?.serial);
  return `${equipmentType} | Manufacturer: ${manufacturer} | Model: ${model} | Serial: ${serial}`;
}

function canonicalId(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function aggregateField(items: any[], getter: (item: any) => unknown) {
  const values = Array.from(
    new Set(
      items
        .map((item) => String(getter(item) ?? "").trim())
        .filter(Boolean)
    )
  );

  return values.length ? values.join("; ") : "—";
}

function normalizeToken(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function equipmentKindTokens(eq: any) {
  return [normalizeToken(eq?.equipment_role), normalizeToken(eq?.component_type)]
    .map((token) => token.replace(/[\s-]+/g, "_"))
    .filter(Boolean);
}

function isPackageEquipment(eq: any) {
  const tokens = equipmentKindTokens(eq);
  return tokens.some(
    (token) =>
      token === "package_unit" ||
      token === "pack_unit" ||
      token === "package_gas_electric" ||
      token === "package_heat_pump" ||
      token.includes("package")
  );
}

function isOutdoorEquipment(eq: any) {
  if (isPackageEquipment(eq)) return true;
  const tokens = equipmentKindTokens(eq);
  return tokens.some(
    (token) =>
      token.includes("outdoor") ||
      token.includes("condenser") ||
      token.includes("heat_pump") ||
      token.includes("heat pump") ||
      token.includes("compressor")
  );
}

function isIndoorEquipment(eq: any) {
  const tokens = equipmentKindTokens(eq);
  return tokens.some(
    (token) =>
      token.includes("indoor") ||
      token.includes("air_handler") ||
      token.includes("air handler") ||
      token.includes("furnace") ||
      token.includes("evaporator") ||
      token.includes("coil") ||
      token.includes("fan_coil") ||
      token.includes("fan coil")
  );
}

function hasCoolingEquipmentForSystem(systemEquipment: any[]) {
  return systemEquipment.some((eq: any) => {
    if (isPackageEquipment(eq) || isOutdoorEquipment(eq)) return true;
    const role = normalizeToken(eq?.equipment_role);
    return role.includes("condenser") || role.includes("heat_pump") || role.includes("heat pump");
  });
}

function isHeatOnlySystemEquipment(systemEquipment: any[]) {
  const hasHeatingOnlyEquipment = systemEquipment.some((eq: any) =>
    isHeatingOnlyEquipment(String(eq?.equipment_role ?? ""))
  );
  const hasCoolingEquipment = hasCoolingEquipmentForSystem(systemEquipment);
  return hasHeatingOnlyEquipment && !hasCoolingEquipment;
}

function exceptionReasonLabel(run: any) {
  const reason = String(run?.data?.charge_exempt_reason ?? "").trim().toLowerCase();
  if (reason === "package_unit") return "Package Unit";
  if (reason === "conditions_not_met") return "Weather";

  const overrideReason = String(run?.override_reason ?? "").toLowerCase();
  if (overrideReason.includes("package unit")) return "Package Unit";
  if (overrideReason.includes("weather") || overrideReason.includes("conditions not met")) return "Weather";

  return "—";
}

function includesFailure(computed: any, needle: string) {
  const failures = Array.isArray(computed?.failures) ? computed.failures : [];
  return failures.some((f: any) => String(f ?? "").toLowerCase().includes(needle.toLowerCase()));
}

function includesBlocked(computed: any, needle: string) {
  const blocked = Array.isArray(computed?.blocked) ? computed.blocked : [];
  return blocked.some((b: any) => String(b ?? "").toLowerCase().includes(needle.toLowerCase()));
}

function getComputedFailures(run: any) {
  const failures: string[] = Array.isArray(run?.computed?.failures)
    ? run.computed.failures.map((value: any) => String(value ?? "").trim()).filter(Boolean)
    : [];
  return Array.from(new Set<string>(failures));
}

function hasFilterDrierFailure(run: any) {
  return getComputedFailures(run).some((failure) => failure.toLowerCase().includes("filter drier"));
}

function refrigerantNumericChecksPassing(run: any) {
  const computed = run?.computed ?? {};
  const measuredSubcool = computed?.measured_subcool_f;
  const targetSubcool = run?.data?.target_subcool_f;
  const measuredSuperheat = computed?.measured_superheat_f;

  return (
    measuredSubcool != null &&
    targetSubcool != null &&
    measuredSuperheat != null &&
    !includesFailure(computed, "subcool") &&
    !includesFailure(computed, "superheat")
  );
}

function outdoorQualificationStatus(run: any) {
  const computed = run?.computed ?? {};
  if (includesBlocked(computed, "outdoor temp below")) {
    return "Not Qualified";
  }

  const outdoor = run?.data?.outdoor_temp_f;
  if (outdoor != null && outdoor !== "") {
    return "Qualified";
  }

  return "Unknown";
}

function refrigerantComplianceF(run: any) {
  const computed = run?.computed ?? {};
  if (includesBlocked(computed, "indoor temp below") || includesBlocked(computed, "outdoor temp below")) {
    return "Not compliant (temperature qualification not met)";
  }
  if (includesFailure(computed, "subcool")) {
    return "Not compliant (subcool outside allowed tolerance)";
  }

  const measured = computed?.measured_subcool_f;
  const target = run?.data?.target_subcool_f;
  if (measured != null && target != null) {
    return "Compliant (subcool within stored tolerance check)";
  }

  return "Insufficient data for compliance determination";
}

function refrigerantRequirementResultG(run: any) {
  const computed = run?.computed ?? {};
  if (includesFailure(computed, "superheat")) return "Failed ECC superheat requirement";

  const measured = computed?.measured_superheat_f;
  if (measured != null) return "Passed ECC superheat requirement";

  return "Insufficient data for ECC superheat requirement";
}

function refrigerantComplianceG(run: any) {
  const computed = run?.computed ?? {};
  if (includesFailure(computed, "superheat")) {
    return "Not compliant (superheat threshold exceeded)";
  }

  const measured = computed?.measured_superheat_f;
  if (measured != null) {
    return "Compliant (superheat within stored ECC threshold)";
  }

  return "Insufficient data for compliance determination";
}

export default async function JobTestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ t?: string; s?: string; notice?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};

  const focused = String(sp.t ?? "").trim();
  const selectedSystemIdFromQuery = String(sp.s ?? "").trim();
  const notice = String(sp.notice ?? "").trim();

  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user ?? null;

  if (!user) redirect("/login");

  let internalUser: Awaited<ReturnType<typeof requireInternalUser>>["internalUser"] | null = null;

  try {
    const internalAccess = await requireInternalUser({ supabase, userId: user.id });
    internalUser = internalAccess.internalUser;
  } catch (error) {
    if (isInternalAccessError(error)) {
      const { data: contractorUser, error: contractorUserErr } = await supabase
        .from("contractor_users")
        .select("contractor_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (contractorUserErr) throw contractorUserErr;

      if (contractorUser?.contractor_id) {
        redirect(`/portal/jobs/${id}`);
      }

      redirect("/login");
    }

    throw error;
  }

  const { data: job, error } = await supabase
    .from("jobs")
    .select(
      `
      id,
      title,
      parent_job_id,
      job_address,
      city,
      job_type,
      project_type,
      permit_number,
      jurisdiction,
      permit_date,
      contractor_id,
      contractors (
        owner_user_id
      ),
      customer_first_name,
      customer_last_name,
      customer_phone,
      customer_email,
      locations:location_id (
        address_line1,
        city,
        state,
        zip
      ),
      job_systems (
        id,
        name,
        created_at
      ),
      job_equipment (
        id,
        system_id,
        component_type,
        equipment_role,
        system_location,
        manufacturer,
        model,
        serial,
        tonnage,
        heating_capacity_kbtu,
        heating_output_btu,
        heating_efficiency_percent,
        refrigerant_type,
        notes,
        created_at,
        updated_at
      ),
      ecc_test_runs (
        id,
        test_type,
        system_id,
        equipment_id,
        system_key,
        data,
        computed,
        computed_pass,
        override_pass,
        override_reason,
        created_at,
        updated_at,
        is_completed,
        visit_id
      )
    `
    )
    .eq("id", id)
    .single();

  if (error) throw error;
  if (!job) return notFound();

  if (String(job.job_type ?? "").trim().toLowerCase() !== "ecc") {
    redirect(`/jobs/${id}?tab=ops`);
  }

  let internalBusinessDisplayName = "";
  const jobOwnerUserId = String((job as any)?.contractors?.owner_user_id ?? "").trim();
  const internalBusinessOwnerId = jobOwnerUserId || String(internalUser?.account_owner_user_id ?? "").trim();

  const internalBusinessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    supabase,
    accountOwnerUserId: internalBusinessOwnerId,
  });
  internalBusinessDisplayName = internalBusinessIdentity.display_name;

  const contractorId = String(job.contractor_id ?? "").trim();
  let contractorName = internalBusinessDisplayName;

  if (contractorId) {
    const { data: contractor, error: contractorError } = await supabase
      .from("contractors")
      .select("name")
      .eq("id", contractorId)
      .maybeSingle();

    if (contractorError) throw contractorError;
    contractorName = fallbackText(contractor?.name);
  }

  const reportBusinessLabel = contractorId ? "Contractor Attached To" : "Internal Business";
  const reportBusinessName = contractorId ? contractorName : internalBusinessDisplayName;
  const reportTestedDates = aggregateField(
    (job.ecc_test_runs ?? []).filter((run: any) => run?.is_completed === true),
    (run: any) => {
      const timestamp = String(run?.updated_at ?? run?.created_at ?? "").trim();
      return timestamp ? formatBusinessDateUS(timestamp) : "";
    }
  );

  const customerName =
    [job.customer_first_name, job.customer_last_name]
      .map((value: unknown) => String(value ?? "").trim())
      .filter(Boolean)
      .join(" ") || "—";

  const locationSnapshot = Array.isArray((job as any)?.locations)
    ? ((job as any).locations.find((row: any) => row) ?? null)
    : ((job as any)?.locations ?? null);
  const reportAddress =
    String(locationSnapshot?.address_line1 ?? "").trim() ||
    String(job.job_address ?? "").trim();
  const reportCityStateZip = [
    String(locationSnapshot?.city ?? "").trim() || String(job.city ?? "").trim(),
    [String(locationSnapshot?.state ?? "").trim(), String(locationSnapshot?.zip ?? "").trim()]
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  const projectTypeLabel = String(job.project_type ?? "")
    .trim()
    .replaceAll("_", " ");

  const systems = (job.job_systems ?? [])
    .slice()
    .sort((a: any, b: any) => {
      const at = new Date(a?.created_at ?? 0).getTime();
      const bt = new Date(b?.created_at ?? 0).getTime();
      if (at !== bt) return at - bt;
      return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
    });

  const equipmentBySystemId = new Map<string, any[]>();
  for (const eq of job.job_equipment ?? []) {
    const sid = canonicalId(eq?.system_id);
    if (!sid) continue;
    const rows = equipmentBySystemId.get(sid) ?? [];
    rows.push(eq);
    equipmentBySystemId.set(sid, rows);
  }

  const selectedSystemId =
    selectedSystemIdFromQuery &&
    systems.some((sys: any) => String(sys.id) === String(selectedSystemIdFromQuery))
      ? selectedSystemIdFromQuery
      : systems.length
      ? String(systems[0].id)
      : "";

  const selectedSystemMeta = systems.find(
    (sys: any) => String(sys.id) === String(selectedSystemId)
  );
  const selectedSystemName = selectedSystemMeta?.name ?? "Selected system";

  const parentJobId = String((job as any)?.parent_job_id ?? "").trim();
  const isRetestChild = Boolean(parentJobId);

  const parentJob = isRetestChild
    ? (
        await supabase
          .from("jobs")
          .select(
            `
            id,
            title,
            job_systems (
              id,
              name,
              created_at
            ),
            ecc_test_runs (
              id,
              test_type,
              system_id,
              equipment_id,
              system_key,
              data,
              computed,
              computed_pass,
              override_pass,
              override_reason,
              created_at,
              updated_at,
              is_completed,
              visit_id
            )
          `
          )
          .eq("id", parentJobId)
          .maybeSingle()
      ).data
    : null;

  const parentSystems = (parentJob?.job_systems ?? []) as any[];
  const parentSystemIdByName = new Map<string, string>();
  for (const parentSystem of parentSystems) {
    const key = canonicalId(parentSystem?.name);
    const value = String(parentSystem?.id ?? "").trim();
    if (!key || !value || parentSystemIdByName.has(key)) continue;
    parentSystemIdByName.set(key, value);
  }

  const matchedParentSystemId = parentSystemIdByName.get(canonicalId(selectedSystemName)) ?? "";

  const pickParentRunForSelectedSystem = (testType: EccTestType) => {
    if (!parentJob || !matchedParentSystemId) return null;
    return pickLatestRunForSystem(parentJob, testType, matchedParentSystemId);
  };

  const parentRunDL = pickParentRunForSelectedSystem("duct_leakage");
  const parentRunAF = pickParentRunForSelectedSystem("airflow");
  const parentRunRC = pickParentRunForSelectedSystem("refrigerant_charge");

  const runDL = selectedSystemId ? pickRunForSystem(job, "duct_leakage", selectedSystemId) : null;
  const runAF = selectedSystemId ? pickRunForSystem(job, "airflow", selectedSystemId) : null;
  const runRC = selectedSystemId ? pickRunForSystem(job, "refrigerant_charge", selectedSystemId) : null;
  const ductSaveFormId = runDL ? `duct-save-${runDL.id}` : "";
  const ductDeleteFormId = runDL ? `duct-delete-${runDL.id}` : "";
  const airflowSaveFormId = runAF ? `airflow-save-${runAF.id}` : "";
  const rcSaveFormId = runRC ? `rc-save-${runRC.id}` : "";

  const normalizedProfile = normalizeProjectTypeToRuleProfile(job.project_type);
  const manualAddTests = getActiveManualAddTests();
  const allowedFocusedTypes = new Set<string>([
    ...manualAddTests.map((t) => String(t.code)),
    "custom",
  ]);
  const focusedTypeRaw = allowedFocusedTypes.has(focused)
    ? (focused as EccTestType | "custom")
    : "";

  const selectedSystemEquipment =
    equipmentBySystemId.get(canonicalId(selectedSystemId)) ?? [];
  const selectedSystemIsHeatOnly = isHeatOnlySystemEquipment(selectedSystemEquipment);
  const manualAddTestsForSystem = manualAddTests.filter((test) =>
    isTestApplicableToSystem(String(test.code), selectedSystemIsHeatOnly)
  );

  const focusedType =
    focusedTypeRaw && !isTestApplicableToSystem(focusedTypeRaw, selectedSystemIsHeatOnly)
      ? ""
      : focusedTypeRaw;

  const scenarioResult = resolveEccScenario({
  projectType: job.project_type,
  systemEquipment: selectedSystemEquipment,
});

  const suggestedTests = scenarioResult.suggestedTests;
  const scenarioCode = scenarioResult.scenario;
  const scenarioNotes = scenarioResult.notes;
  const isPlanDrivenNewConstruction = scenarioCode === "new_construction_plan_driven";

  const baselineRequiredTests = suggestedTests
    .filter((t) => t.required)
    .map((t) => t.testType)
    .filter((testType) => isTestApplicableToSystem(testType, selectedSystemIsHeatOnly));

  const parentRequiredOutcomes = new Map<EccTestType, "pass" | "fail" | "unknown">();
  for (const testType of baselineRequiredTests) {
    const parentRun = pickParentRunForSelectedSystem(testType as EccTestType);
    parentRequiredOutcomes.set(testType as EccTestType, getEffectiveResultState(parentRun));
  }

  const carriedForwardPassedTypes = isRetestChild
    ? baselineRequiredTests.filter(
        (testType) => parentRequiredOutcomes.get(testType as EccTestType) === "pass"
      )
    : [];

  const requiredTests = isRetestChild
    ? baselineRequiredTests.filter(
        (testType) => parentRequiredOutcomes.get(testType as EccTestType) !== "pass"
      )
    : baselineRequiredTests;

  const systemRunTestTypes = selectedSystemId
    ? Array.from(
        new Set(
          (job.ecc_test_runs ?? [])
            .filter((r: any) => String(r.system_id ?? "") === String(selectedSystemId))
            .map((r: any) => String(r.test_type ?? "").trim())
            .filter((testType) => Boolean(testType) && Boolean(getTestDefinition(testType)))
        )
      )
    : [];

  const applicableSystemRunTestTypes = systemRunTestTypes.filter((testType) =>
    isTestApplicableToSystem(testType, selectedSystemIsHeatOnly)
  );

  const visibleTestTypes = Array.from(
    new Set([...(requiredTests as string[]), ...applicableSystemRunTestTypes, ...carriedForwardPassedTypes])
  ) as EccTestType[];

  const focusedCustomTestType =
    focusedType &&
    focusedType !== "custom" &&
    focusedType !== "duct_leakage" &&
    focusedType !== "airflow" &&
    focusedType !== "refrigerant_charge"
      ? (focusedType as EccTestType)
      : null;

  const focusedCustomRun =
    selectedSystemId && focusedCustomTestType
      ? pickRunForSystem(job, focusedCustomTestType, selectedSystemId)
      : null;

  const packageSystem = isPackageSystem(selectedSystemEquipment);

const primaryEquipment =
  selectedSystemEquipment.find((eq: any) => isPackageEquipment(eq)) ??
  selectedSystemEquipment.find((eq: any) => eq.equipment_role === "condenser") ??
  selectedSystemEquipment.find((eq: any) => eq.equipment_role === "air_handler") ??
  selectedSystemEquipment.find((eq: any) => eq.equipment_role === "furnace") ??
  selectedSystemEquipment[0] ??
  null;

const fallbackTonnageEquipment =
  selectedSystemEquipment.find((eq: any) => eq?.tonnage != null && String(eq.tonnage).trim() !== "") ?? null;

const fallbackHeatingCapacityEquipment =
  selectedSystemEquipment.find(
    (eq: any) => eq?.heating_capacity_kbtu != null && String(eq.heating_capacity_kbtu).trim() !== ""
  ) ?? null;

const fallbackHeatingCapacityFromTonnageEquipment =
  selectedSystemEquipment.find(
    (eq: any) =>
      isHeatingOnlyEquipment(String(eq?.equipment_role ?? "")) &&
      eq?.tonnage != null &&
      String(eq.tonnage).trim() !== ""
  ) ?? null;

const fallbackHeatingEfficiencyEquipment =
  selectedSystemEquipment.find(
    (eq: any) =>
      eq?.heating_efficiency_percent != null &&
      String(eq.heating_efficiency_percent).trim() !== ""
  ) ?? null;

const defaultHeatingEfficiencyFromEquipment =
  primaryEquipment?.heating_efficiency_percent != null &&
  String(primaryEquipment.heating_efficiency_percent).trim() !== ""
    ? primaryEquipment.heating_efficiency_percent
    : fallbackHeatingEfficiencyEquipment?.heating_efficiency_percent ?? "";

const fallbackHeatingOutputEquipment =
  selectedSystemEquipment.find(
    (eq: any) =>
      eq?.heating_output_btu != null &&
      String(eq.heating_output_btu).trim() !== ""
  ) ?? null;

const defaultHeatingOutputBtuFromEquipment =
  primaryEquipment?.heating_output_btu != null &&
  String(primaryEquipment.heating_output_btu).trim() !== ""
    ? primaryEquipment.heating_output_btu
    : fallbackHeatingOutputEquipment?.heating_output_btu ?? "";

const defaultSystemTonnage =
  primaryEquipment?.tonnage != null && primaryEquipment?.tonnage !== ""
    ? primaryEquipment.tonnage
    : fallbackTonnageEquipment?.tonnage != null && String(fallbackTonnageEquipment.tonnage).trim() !== ""
    ? fallbackTonnageEquipment.tonnage
    : "";

const defaultHeatingCapacityKbtu =
  primaryEquipment?.heating_capacity_kbtu != null && primaryEquipment?.heating_capacity_kbtu !== ""
    ? primaryEquipment.heating_capacity_kbtu
    : fallbackHeatingCapacityEquipment?.heating_capacity_kbtu != null &&
      String(fallbackHeatingCapacityEquipment.heating_capacity_kbtu).trim() !== ""
    ? fallbackHeatingCapacityEquipment.heating_capacity_kbtu
    : fallbackHeatingCapacityFromTonnageEquipment?.tonnage != null &&
      String(fallbackHeatingCapacityFromTonnageEquipment.tonnage).trim() !== ""
    ? fallbackHeatingCapacityFromTonnageEquipment.tonnage
    : "";

const isHeatOnlySystem = selectedSystemIsHeatOnly;

const savedDuctMethodRaw = String(runDL?.data?.airflow_method ?? "").trim().toLowerCase();
const defaultDuctAirflowMethod =
  isHeatOnlySystem
    ? "heating"
    : savedDuctMethodRaw === "heating" || savedDuctMethodRaw === "cooling"
    ? savedDuctMethodRaw
    : "cooling";

const defaultHeatingOutputBtu =
  runDL?.data?.heating_output_btu ??
  (defaultHeatingOutputBtuFromEquipment !== "" ? defaultHeatingOutputBtuFromEquipment :
  (isHeatOnlySystem && defaultHeatingCapacityKbtu !== ""
    ? Number(defaultHeatingCapacityKbtu) * 1000
    : ""));

  const carriedForwardDL = !runDL && carriedForwardPassedTypes.includes("duct_leakage");
  const carriedForwardAF = !runAF && carriedForwardPassedTypes.includes("airflow");
  const carriedForwardRC = !runRC && carriedForwardPassedTypes.includes("refrigerant_charge");

  const parentFailedComparisonRows = (baselineRequiredTests as EccTestType[])
    .map((testType) => ({
      testType,
      run: pickParentRunForSelectedSystem(testType),
    }))
    .filter((row) => getEffectiveResultState(row.run) === "fail");

  const equipmentReferenceItems = selectedSystemEquipment
    .slice()
    .sort((a: any, b: any) => {
      const at = new Date(a?.created_at ?? 0).getTime();
      const bt = new Date(b?.created_at ?? 0).getTime();
      if (at !== bt) return at - bt;
      return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
    })
    .slice(0, 3);

  function effectiveResult(run: any): "pass" | "fail" | "unknown" {
    if (!run) return "unknown";
    if (run.override_pass === true) return "pass";
    if (run.override_pass === false) return "fail";
    if (run.computed_pass === true) return "pass";
    if (run.computed_pass === false) return "fail";
    return "unknown";
  }

  function statusLabel(run: any) {
    if (!run) return "Not added";
    if (run.is_completed === true) return "Completed";
    return "In progress";
  }

  const baseHref = `/jobs/${job.id}/tests`;
  const withS = (t?: string, s?: string) => {
    const q = new URLSearchParams();

    const sys = String((s ?? selectedSystemId) ?? "").trim();

    if (t) q.set("t", t);
    if (sys) q.set("s", sys); // ✅ only set if non-empty

    const qs = q.toString();
    return qs ? `${baseHref}?${qs}` : baseHref;
  };

  const systemSummaries = systems.map((sys: any) => {
    const systemId = canonicalId(sys.id);
    const systemEquipment = (equipmentBySystemId.get(systemId) ?? [])
      .slice()
      .sort((a: any, b: any) => {
        const at = new Date(a?.created_at ?? 0).getTime();
        const bt = new Date(b?.created_at ?? 0).getTime();
        if (at !== bt) return at - bt;
        return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
      });

    const systemIsHeatOnly = isHeatOnlySystemEquipment(systemEquipment);

    const runAirflow = systemIsHeatOnly ? null : pickLatestRunForSystem(job, "airflow", systemId);
    const runDuct = pickLatestRunForSystem(job, "duct_leakage", systemId);
    const runRefrigerant = systemIsHeatOnly ? null : pickLatestRunForSystem(job, "refrigerant_charge", systemId);

    const packageSystem = isPackageSystem(systemEquipment);
    const packageEquipment = systemEquipment.filter((eq: any) => isPackageEquipment(eq));

    const outdoorEquipment = systemEquipment.filter((eq: any) => isOutdoorEquipment(eq));
    const indoorEquipment = systemEquipment.filter((eq: any) => isIndoorEquipment(eq));
    const otherEquipment = packageSystem
      ? systemEquipment.filter((eq: any) => !isPackageEquipment(eq))
      : systemEquipment.filter((eq: any) => !isOutdoorEquipment(eq) && !isIndoorEquipment(eq));

    const systemLocations = Array.from(
      new Set(
        systemEquipment
          .map((eq: any) => String(eq?.system_location ?? "").trim())
          .filter(Boolean)
      )
    );

    return {
      systemId,
      systemName: String(sys.name ?? "System").trim() || "System",
      runAirflow,
      runDuct,
      runRefrigerant,
      systemIsHeatOnly,
      packageSystem,
      packageEquipment,
      indoorEquipment,
      outdoorEquipment,
      otherEquipment,
      hasEquipment: systemEquipment.length > 0,
      systemLocationLabel: systemLocations.length ? systemLocations.join("; ") : "—",
    };
  });

    return (
      <div className="w-full min-w-0 max-w-3xl overflow-x-hidden rounded-xl border border-gray-200 bg-slate-50 p-6 shadow-sm space-y-6 print:max-w-none print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none">
          {notice === "rc_exempt_reason_required" && (
      <div className="mb-4 rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Select <span className="font-semibold">Package unit</span> or{" "}
        <span className="font-semibold">Conditions not met</span> before marking
        refrigerant charge exempt.
      </div>
    )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between print:hidden">
        <div className="min-w-0">
          <div className="text-sm text-slate-700">Job Tests</div>
          <h1 className="text-xl font-semibold">{normalizeRetestLinkedJobTitle(job.title) || "Job"}</h1>
          <div className="text-sm text-slate-700">{job.city ?? "—"}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="completion-report-toggle" className="cursor-pointer px-3 py-2 rounded border text-sm font-medium bg-white hover:bg-gray-50">
            View Completion Report
          </label>
          <PrintButton className="px-3 py-2 rounded border text-sm font-medium bg-white hover:bg-gray-50" />
          <Link href={`/jobs/${job.id}`} className="px-3 py-2 rounded border text-sm">
            ← Back to Job
          </Link>
        </div>
      </div>

      <input id="completion-report-toggle" type="checkbox" className="peer sr-only" />
      <div className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700 print:hidden">
        Completion report is collapsed by default to keep test entry focused.
        <label htmlFor="completion-report-toggle" className="ml-1 cursor-pointer font-medium text-slate-900 underline">
          Expand report
        </label>
      </div>

      <div className="hidden space-y-4 peer-checked:block print:block">
      <div className="hidden border-b border-slate-400 pb-2 print:block">
        <h1 className="text-lg font-bold text-slate-950">{internalBusinessDisplayName} Test Results</h1>
      </div>
      <section className="rounded-lg border border-slate-400 bg-white p-5 space-y-4 text-slate-900 print:rounded-none print:border-slate-500 print:p-3 print:space-y-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950 print:text-base">Customer / Job Info</h2>
          <p className="text-sm text-slate-700 print:text-xs">Who and where for this CHEERS packet.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2 print:gap-x-6 print:gap-y-2">
          <div className="space-y-3 print:space-y-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Customer Name</div>
              <div className="text-sm font-medium text-slate-950">{customerName}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Address</div>
              <div className="text-sm font-medium text-slate-950">{fallbackText(reportAddress)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Phone</div>
              <div className="text-sm font-medium text-slate-950">{fallbackText(job.customer_phone)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Email</div>
              <div className="text-sm font-medium text-slate-950 break-all">{fallbackText(job.customer_email)}</div>
            </div>
          </div>

          <div className="space-y-3 print:space-y-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">{reportBusinessLabel}</div>
              <div className="text-sm font-medium text-slate-950">{reportBusinessName}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">City / State / ZIP</div>
              <div className="text-sm font-medium text-slate-950">{fallbackText(reportCityStateZip)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Permit Number</div>
              <div className="text-sm font-medium text-slate-950">{fallbackText(job.permit_number)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Jurisdiction</div>
              <div className="text-sm font-medium text-slate-950">{fallbackText((job as any).jurisdiction)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Permit Date</div>
              <div className="text-sm font-medium text-slate-950">{fallbackText((job as any).permit_date ? formatBusinessDateUS((job as any).permit_date) : null)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Project Type</div>
              <div className="text-sm font-medium capitalize text-slate-950">{fallbackText(projectTypeLabel)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Date Tested</div>
              <div className="text-sm font-medium text-slate-950">{reportTestedDates}</div>
            </div>
          </div>
        </div>
      </section>

      <section id="cheers-fast-view" className="rounded-lg border border-slate-400 bg-slate-50 p-5 space-y-5 text-slate-900 print:border-0 print:bg-white print:p-0 print:space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-950 print:text-base">Results</h2>
            <p className="text-sm text-slate-700 print:text-xs">Read-only summary from ECC canonical test data, grouped by system.</p>
          </div>
        </div>

        {systemSummaries.length === 0 ? (
          <div className="text-sm text-slate-700">No systems available yet.</div>
        ) : (
          <div className="space-y-5 print:space-y-4">
            {systemSummaries.map((sys, index) => {
              const rcData = sys.runRefrigerant?.data ?? {};
              const rcComputed = sys.runRefrigerant?.computed ?? {};
              const isRefrigerantException =
                Boolean(sys.runRefrigerant?.data?.charge_exempt) ||
                Boolean(sys.runRefrigerant?.data?.charge_exempt_reason) ||
                String(sys.runRefrigerant?.computed?.status ?? "").toLowerCase() === "exempt";
              const shouldForcePrintBreak =
                index > 0 && Boolean(sys.runRefrigerant) && !isRefrigerantException;

              return (
                <div key={sys.systemId} className={`break-inside-avoid rounded-md border border-slate-300 bg-white p-4 space-y-4 shadow-sm print:rounded-none print:border-slate-500 print:p-3 print:space-y-3 print:shadow-none ${shouldForcePrintBreak ? "print:break-before-page" : ""}`}>
                  <div className="text-sm font-bold text-slate-950 print:text-[13px]">{sys.systemName}</div>

                  <div className="grid gap-3 text-sm text-slate-900 print:gap-2 print:text-[12px]">
                    <div>
                      <span className="font-semibold text-slate-950">System:</span> {fallbackText(sys.systemLocationLabel)}
                    </div>

                    <div>
                      <span className="font-semibold text-slate-950">Equipment Summary:</span>
                      {sys.hasEquipment ? (
                        <div className="mt-1 space-y-1 text-slate-800 print:text-slate-950">
                          {sys.packageSystem ? (
                            <>
                              <div className="font-semibold text-slate-900">Package Unit</div>
                              {sys.packageEquipment.length > 0 ? (
                                sys.packageEquipment.map((eq: any, index: number) => (
                                  <div key={String(eq?.id ?? `package-${sys.systemId}-${index}`)}>
                                    {index + 1}. {equipmentSummaryLine(eq)}
                                  </div>
                                ))
                              ) : (
                                <div>—</div>
                              )}
                            </>
                          ) : (
                            <>
                              <div className="font-semibold text-slate-900">Condenser</div>
                              {sys.outdoorEquipment.length > 0 ? (
                                sys.outdoorEquipment.map((eq: any, index: number) => (
                                  <div key={String(eq?.id ?? `outdoor-${sys.systemId}-${index}`)}>
                                    {index + 1}. {equipmentSummaryLine(eq)}
                                  </div>
                                ))
                              ) : (
                                <div>—</div>
                              )}

                              <div className="font-semibold text-slate-900 pt-1 print:pt-0.5">Indoor Equipment</div>
                              {sys.indoorEquipment.length > 0 ? (
                                sys.indoorEquipment.map((eq: any, index: number) => (
                                  <div key={String(eq?.id ?? `indoor-${sys.systemId}-${index}`)}>
                                    {index + 1}. {equipmentSummaryLine(eq)}
                                  </div>
                                ))
                              ) : (
                                <div>—</div>
                              )}
                            </>
                          )}

                          {sys.otherEquipment.length > 0 ? (
                            <>
                              <div className="font-semibold text-slate-900 pt-1 print:pt-0.5">Other Equipment</div>
                              {sys.otherEquipment.map((eq: any, index: number) => (
                                <div key={String(eq?.id ?? `other-${sys.systemId}-${index}`)}>
                                  {index + 1}. {equipmentSummaryLine(eq)}
                                </div>
                              ))}
                            </>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-1 text-slate-900">Equipment not located</div>
                      )}
                    </div>

                    <div>
                      <span className="font-semibold text-slate-950">Airflow Summary:</span>
                      <div className="mt-1 space-y-1 text-slate-800">
                        {sys.systemIsHeatOnly ? (
                          <div>Not applicable for heat-only system (no cooling equipment).</div>
                        ) : (
                          <>
                            <div>Measured Airflow: {fmtValue(sys.runAirflow?.data?.measured_total_cfm, "CFM")}</div>
                            <div>Result: {sys.runAirflow ? getEffectiveResultLabel(sys.runAirflow) : "No run"}</div>
                          </>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="font-semibold text-slate-950">Duct Leakage Summary:</span>
                      <div className="mt-1 space-y-1 text-slate-800">
                        <div>Entered duct leakage value: {fmtValue(sys.runDuct?.data?.measured_duct_leakage_cfm, "CFM")}</div>
                        <div>Result: {sys.runDuct ? getEffectiveResultLabel(sys.runDuct) : "No run"}</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border border-slate-300 bg-slate-100 p-3 space-y-3 print:rounded-none print:border-slate-400 print:bg-white print:p-2.5 print:space-y-2">
                    <div className="text-sm font-bold text-slate-950 print:text-[13px]">Refrigerant Charge — Full Detailed Result</div>

                    {sys.systemIsHeatOnly ? (
                      <div className="text-sm text-slate-700 print:text-[12px]">
                        Not applicable for heat-only system (no cooling equipment).
                      </div>
                    ) : !sys.runRefrigerant ? (
                      <div className="text-sm text-slate-700 print:text-[12px]">No refrigerant charge run found for this system.</div>
                    ) : isRefrigerantException ? (
                      <div className="text-sm text-slate-800 space-y-1 print:text-[12px]">
                        <div>Result: Exception</div>
                        <div>Reason: {exceptionReasonLabel(sys.runRefrigerant)}</div>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1 text-sm text-slate-900 print:text-[12px]">
                          <div className="font-semibold text-slate-950">F. Data Collection and Calculations</div>
                          <ol className="list-decimal pl-5 space-y-1">
                            <li>Lowest Return Air Dry Bulb Temperature: {fmtValue(rcData.lowest_return_air_db_f, "°F")}</li>
                            <li>Measured Condenser Air Entering Dry-Bulb Temperature: {fmtValue(rcData.condenser_air_entering_db_f, "°F")}</li>
                            <li>Outdoor Temperature Qualification Status: {outdoorQualificationStatus(sys.runRefrigerant)}</li>
                            <li>Measured Liquid Line Temperature: {fmtValue(rcData.liquid_line_temp_f, "°F")}</li>
                            <li>Measured Liquid Line Pressure: {fmtValue(rcData.liquid_line_pressure_psig, "psig")}</li>
                            <li>Condenser Saturation Temperature: {fmtValue(rcData.condenser_sat_temp_f, "°F")}</li>
                            <li>Measured Subcooling: {fmtValue(rcComputed.measured_subcool_f, "°F")}</li>
                            <li>Target Subcooling from Manufacturer: {fmtValue(rcData.target_subcool_f, "°F")}</li>
                            <li>Compliance Statement: {refrigerantComplianceF(sys.runRefrigerant)}</li>
                          </ol>
                        </div>

                        <div className="space-y-1 text-sm text-slate-900 print:text-[12px]">
                          <div className="font-semibold text-slate-950">G. Metering Device Verification</div>
                          <ol className="list-decimal pl-5 space-y-1">
                            <li>Measured Suction Line Temperature: {fmtValue(rcData.suction_line_temp_f, "°F")}</li>
                            <li>Measured Suction Line Pressure: {fmtValue(rcData.suction_line_pressure_psig, "psig")}</li>
                            <li>Evaporator Saturation Temperature: {fmtValue(rcData.evaporator_sat_temp_f, "°F")}</li>
                            <li>Measured Superheat: {fmtValue(rcComputed.measured_superheat_f, "°F")}</li>
                            <li>ECC requirement result: {refrigerantRequirementResultG(sys.runRefrigerant)}</li>
                            <li>Manufacturer specification statement: Superheat manufacturer target is not stored in canonical ECC run data; evaluation uses the configured ECC threshold in computed rules.</li>
                            <li>Compliance Statement: {refrigerantComplianceG(sys.runRefrigerant)}</li>
                          </ol>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      </div>

      <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-5 print:hidden">
        <div>
          <h2 className="text-lg font-semibold">ECC Tests</h2>
          <p className="text-sm text-muted-foreground">
            Capture tests in any order. “Save” stores readings; “Complete” locks the test for the visit workflow.
          </p>
        </div>

        {/* System selector */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <div className="text-sm font-semibold mb-1 text-gray-900">Select Location</div>

          <div className="flex flex-wrap gap-2 pt-1">
            {systems.map((sys: any) => {
              const isActive = String(sys.id) === String(selectedSystemId);
              return (
                <Link
                  key={sys.id}
                  href={withS(focusedType || undefined, String(sys.id))}
                  className={`rounded-full border px-3 py-2 text-sm ${
                    isActive ? "bg-gray-900 text-white" : "bg-white text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {sys.name}
                </Link>
              );
            })}
          </div>

          {!systems.length ? (
            <div className="text-sm text-muted-foreground">
              No systems/locations exist yet. Add equipment on the Job Info page first (systems are created from
              locations).
            </div>
          ) : null}
        </div>
        {false && (
  <div className="rounded-lg border bg-white p-4">
        {/* Test pills */}
        <div className="rounded-lg border bg-white p-4">
          <div className="text-sm font-semibold mb-3 text-gray-900">ECC Tests</div>

          {!selectedSystemId ? (
            <div className="text-sm text-muted-foreground">Select a system to begin.</div>
          ) : (
            <div className="grid gap-2">
              {[
                { key: "duct_leakage", label: "Duct Leakage", run: runDL },
                { key: "airflow", label: "Airflow", run: runAF },
                { key: "refrigerant_charge", label: "Refrigerant Charge", run: runRC },
              ].map((x) => {
                const open = focusedType === x.key;
                const res = effectiveResult(x.run);
                const badge = res === "pass" ? "PASS" : res === "fail" ? "FAIL" : "—";

                const tone =
                  res === "pass"
                    ? "border-green-300 bg-green-50"
                    : res === "fail"
                    ? "border-red-300 bg-red-50"
                    : "border-gray-200 bg-white";

                return (
                  <Link
                    key={x.key}
                    href={open ? withS(undefined) : withS(x.key)}
                    className={`w-full rounded border px-4 py-3 flex items-center justify-between hover:bg-gray-50 ${
                      open ? "ring-2 ring-gray-300" : ""
                    } ${tone}`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{x.label}</div>
                      <div className="text-xs text-muted-foreground">{statusLabel(x.run)}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs rounded border bg-white px-2 py-1">{badge}</span>
                      <span className="text-xs">{x.run?.is_completed === true ? "✅" : ""}</span>
                      <span className="text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
                  </div>
)}

                {selectedSystemId ? (
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Required and active tests</div>
                <div className="text-xs text-muted-foreground">
                  Unified lifecycle list for this system:{" "}
                  <span className="font-medium">
                    {normalizedProfile === "alteration"
                      ? "Alteration"
                      : normalizedProfile === "new_prescriptive"
                      ? "New Prescriptive"
                      : "Other / Custom"}
                  </span>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                {systems.find((s: any) => String(s.id) === String(selectedSystemId))?.name ?? "Selected system"}
              </div>
            </div>

            {visibleTestTypes.length === 0 ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {isPlanDrivenNewConstruction
                  ? "New Construction is currently plan-driven/custom. No default required tests are preloaded yet. Use Add Test to build the custom set."
                  : "No default required tests for this profile. Use Add Test to build the custom set."}
                <div className="text-xs text-muted-foreground">
                  Required for this project type:{" "}
                  <span className="font-medium">
                    {normalizedProfile === "alteration"
                      ? "Alteration"
                      : normalizedProfile === "new_prescriptive"
                      ? "New Prescriptive"
                      : "Other / Custom"}
                  </span>
                  {packageSystem ? (
                    <span> · Package system: refrigerant charge excluded</span>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                {visibleTestTypes.map((testType: EccTestType) => {
  const status = getRequiredTestStatusForSystem(job, selectedSystemId, testType);
  const parentRun = pickParentRunForSelectedSystem(testType);
  const parentOutcome = getEffectiveResultState(parentRun);
  const carriedForward = isRetestChild && !status.run && parentOutcome === "pass";
  const testHref = `/jobs/${job.id}/tests?s=${selectedSystemId}&t=${testType}`;
  const isRequired = requiredTests.includes(testType);

  return (
    <div
      key={testType}
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm transition-all duration-150 hover:bg-gray-50 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <div className="font-medium">
          {getTestDisplayLabel(testType, packageSystem)}
          {carriedForward ? (
            <span className="ml-2 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              Carried Forward
            </span>
          ) : isRequired ? (
            <span className="ml-2 rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              Required
            </span>
          ) : (
            <span className="ml-2 rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              Added
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {carriedForward
            ? "Passed on parent visit; no retest entry required"
            : status.state === "required"
            ? "Required test is not started yet"
            : status.state === "open"
            ? "Run opened and ready for readings"
            : status.state === "saved"
            ? "Readings saved, waiting for completion"
            : status.state === "pass_override"
            ? "Completed with pass override"
            : status.state === "fail_override"
            ? "Completed with fail override"
            : status.state === "pass"
            ? "Completed and passed"
            : status.state === "fail"
            ? "Completed and failed"
            : "Tracked on this system"}
        </div>
      </div>

      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
        {carriedForward ? (
          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            No retest needed
          </span>
        ) : status.state === "required" ? (
          <form action={addEccTestRunFromForm}>
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="system_id" value={selectedSystemId} />
            <input type="hidden" name="test_type" value={testType} />
            <SubmitButton loadingText="Starting..." className="rounded-md border px-3 py-1.5 text-xs font-medium bg-white hover:bg-gray-50">
              Start Test
            </SubmitButton>
          </form>
        ) : (
          <Link
            href={testHref}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-100"
          >
            Open Workspace
          </Link>
        )}

        <div
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
            carriedForward ? "border-emerald-200 bg-emerald-50 text-emerald-700" : status.tone
          }`}
        >
          {carriedForward ? "Pass (parent)" : status.label}
        </div>
      </div>
    </div>
  );
})}
              </div>
            )}

            {isRetestChild && parentFailedComparisonRows.length > 0 ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-red-800">Parent Failed Results (Read-only)</div>
                {parentFailedComparisonRows.map((row) => (
                  <div key={`parent-failed-${row.testType}`} className="rounded-md border border-red-200 bg-white px-3 py-2 text-xs text-slate-700">
                    <div className="font-medium text-slate-900">{getTestDisplayLabel(row.testType, packageSystem)}</div>
                    <div>Result on parent: {getEffectiveResultLabel(row.run)}</div>
                    <div>
                      Updated: {row.run?.updated_at ? new Date(row.run.updated_at).toLocaleString() : "—"}
                    </div>
                    {row.run?.data?.notes ? (
                      <div className="break-words">Notes: {String(row.run.data.notes)}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {scenarioNotes.length > 0 ? (
              <div className="grid gap-2 pt-1">
                {scenarioNotes.map((note) => (
                  <div
                    key={note}
                    className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                  >
                    {note}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Scenario: {scenarioCode.replaceAll("_", " ")}
            </div>
          </div>
        ) : null}

        {selectedSystemId ? (
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Equipment Reference</div>
            <div className="text-sm font-medium text-slate-900">System: {selectedSystemName}</div>
            {equipmentReferenceItems.length > 0 ? (
              <div className="space-y-1 text-xs text-slate-700">
                {equipmentReferenceItems.map((eq: any, index: number) => (
                  <div key={String(eq?.id ?? `${selectedSystemId}-ref-${index}`)} className="break-words">
                    {equipmentSummaryLine(eq)}
                  </div>
                ))}
                {selectedSystemEquipment.length > equipmentReferenceItems.length ? (
                  <div className="text-slate-600">+{selectedSystemEquipment.length - equipmentReferenceItems.length} more item(s)</div>
                ) : null}
              </div>
            ) : (
              <div className="text-xs text-slate-600">No equipment linked to this system yet.</div>
            )}
            <div className="text-xs text-slate-700">
              {isHeatOnlySystem ? (
                <>
                  Suggested heating capacity: <span className="font-medium">{fmtValue(defaultHeatingCapacityKbtu, "KBTU/h")}</span>
                </>
              ) : (
                <>
                  Suggested tonnage default: <span className="font-medium">{fmtValue(defaultSystemTonnage, "ton")}</span>
                </>
              )}
            </div>
          </div>
        ) : null}

        {/* Add Test panel */}
        {selectedSystemId && focusedType === "custom" ? (
          <div className="rounded-lg border bg-white p-4 space-y-3">
            <div className="text-sm font-semibold">Add Test</div>

            <form action={addEccTestRunFromForm} className="grid gap-3">
              <input type="hidden" name="job_id" value={job.id} />

              <div className="grid gap-1">
                <label className="text-sm font-medium" htmlFor="system_id">
                  Location
                </label>

                <select
                  id="system_id"
                  name="system_id"
                  className="w-full rounded-md border px-3 py-2"
                  defaultValue={selectedSystemId}
                  required
                >
                  <option value="" disabled>
                    Select location…
                  </option>

                  {systems.map((sys: any) => (
                    <option key={sys.id} value={sys.id}>
                      {sys.name}
                    </option>
                  ))}
                </select>

                <div className="text-xs text-muted-foreground">
                  This ties the new test run to a specific system/location.
                </div>
              </div>

              <div className="grid gap-1">
                <label className="text-sm font-medium" htmlFor="test_type">
                  Test Type
                </label>
                <select
                  id="test_type"
                  name="test_type"
                  className="w-full rounded-md border px-3 py-2"
                  defaultValue=""
                  required
                >
                  <option value="" disabled>
                    Select a test
                  </option>

                  {manualAddTestsForSystem.map((test) => (
                    <option key={test.code} value={test.code}>
                      {test.label}
                    </option>
                  ))}
                </select>
                {manualAddTestsForSystem.length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    No additional test types apply to this heat-only system.
                  </div>
                ) : null}
              </div>

              <SubmitButton loadingText="Adding..." className="w-fit rounded-md bg-black px-4 py-2 text-white">
                Add Test
              </SubmitButton>
            </form>
          </div>
        ) : null}

                {/* Add Test pill */}
        {selectedSystemId ? (
          <Link
            href={focusedType === "custom" ? withS(undefined) : withS("custom")}
            className={`w-full rounded px-4 py-3 flex items-center justify-between border ${
              focusedType === "custom"
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-900 hover:bg-gray-50"
            }`}
          >
            <div className="font-medium">Add Test</div>
            <span className="text-xs">{focusedType === "custom" ? "▲" : "▼"}</span>
          </Link>
        ) : (
          <div className="w-full rounded border px-4 py-3 text-sm text-muted-foreground">
            Select a system first to add tests.
          </div>
        )}

        {focusedCustomTestType ? (
          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">
                  {getTestDisplayLabel(focusedCustomTestType, packageSystem)}
                </div>
                <div className="mt-1 text-sm">
                  <span className="font-medium">Result:</span>{" "}
                  {focusedCustomRun ? getEffectiveResultLabel(focusedCustomRun) : "Not started"}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {focusedCustomRun?.updated_at
                  ? new Date(focusedCustomRun.updated_at).toLocaleString()
                  : null}
              </div>
            </div>

            {!focusedCustomRun ? (
              <form action={addEccTestRunFromForm} className="flex items-center gap-2">
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="system_id" value={selectedSystemId} />
                <input type="hidden" name="test_type" value={focusedCustomTestType} />
                <SubmitButton loadingText="Creating..." className="rounded-md bg-black px-4 py-2 text-white text-sm">
                  Create Run
                </SubmitButton>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2 items-center border-t pt-3">
                <form action={completeEccTestRunFromForm}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="test_run_id" value={focusedCustomRun.id} />
                  <input type="hidden" name="system_id" value={selectedSystemId} />
                  <button
                    type="submit"
                    className="px-3 py-2 rounded border text-sm"
                    disabled={!!focusedCustomRun.is_completed}
                  >
                    {focusedCustomRun.is_completed ? "Completed ✅" : "Complete Test"}
                  </button>
                </form>

                <form action={deleteEccTestRunFromForm}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="test_run_id" value={focusedCustomRun.id} />
                  <button type="submit" className="rounded-md border px-3 py-2 text-sm">
                    Delete
                  </button>
                </form>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              This ad hoc test is tracked for this system. Detailed data entry for this test type is not configured yet.
            </div>
          </div>
        ) : null}

        {/* =========================
            DUCT LEAKAGE
            ========================= */}
        {focusedType === "duct_leakage" ? (
          <div className="min-w-0 rounded-lg border bg-white p-4 space-y-4">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="font-medium">Duct Leakage</div>
                <div className="mt-1 text-sm">
                  <span className="font-medium">Result:</span>{" "}
                  {runDL
                    ? getEffectiveResultLabel(runDL)
                    : carriedForwardDL
                    ? `PASS (carried from parent${parentRunDL ? ` · ${getEffectiveResultLabel(parentRunDL)}` : ""})`
                    : "Not started"}
                </div>
              </div>
              <div className="min-h-5 shrink-0 text-xs text-muted-foreground sm:text-right">
                {runDL?.updated_at ? new Date(runDL.updated_at).toLocaleString() : null}
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <div className="font-semibold text-slate-800">System Reference</div>
              <div>{selectedSystemName}</div>
              {isHeatOnlySystem ? (
                <div>Suggested heating capacity: {fmtValue(defaultHeatingCapacityKbtu, "KBTU/h")}</div>
              ) : (
                <div>Suggested tonnage: {fmtValue(defaultSystemTonnage, "ton")}</div>
              )}
            </div>

            {!runDL ? (
              carriedForwardDL ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                  <div className="font-medium">Passed on parent visit; carried forward.</div>
                  <div className="mt-1 text-xs text-emerald-700">
                    Parent result: {getEffectiveResultLabel(parentRunDL)}
                    {parentRunDL?.updated_at ? ` · Updated ${new Date(parentRunDL.updated_at).toLocaleString()}` : ""}
                  </div>
                </div>
              ) : (
                <form action={addEccTestRunFromForm} className="flex items-center gap-2">
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="system_id" value={selectedSystemId} />
                  <input type="hidden" name="test_type" value="duct_leakage" />

                  <SubmitButton loadingText="Creating..." className="rounded-md bg-black px-4 py-2 text-white text-sm">
                    Create Duct Leakage Run
                  </SubmitButton>
                </form>
              )
            ) : (
              <>
                <div className="text-sm font-semibold text-slate-900">Required Inputs</div>
                <form
                  id={ductSaveFormId}
                  action={saveDuctLeakageDataFromForm}
                  className="grid gap-3 border-t pt-3"
                >
                  <input type="hidden" name="system_id" value={selectedSystemId} />
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="test_run_id" value={runDL.id} />
                  <input type="hidden" name="project_type" value={job.project_type} />

                  <div className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-500">
                    Cooling Method uses tonnage-based airflow. Heating Method uses Heating Output, or Heating Input +
                    Efficiency. Enter measured leakage to calculate result.
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <DuctLeakageMethodFields
                      runId={runDL.id}
                      defaultMethod={defaultDuctAirflowMethod === "heating" ? "heating" : "cooling"}
                      forceHeatOnly={isHeatOnlySystem}
                      defaultHeatingOutputBtu={defaultHeatingOutputBtu}
                      defaultHeatingInputBtu={runDL.data?.heating_input_btu ?? ""}
                      defaultHeatingEfficiencyPercent={runDL.data?.heating_efficiency_percent ?? defaultHeatingEfficiencyFromEquipment}
                      defaultTonnage={runDL.data?.tonnage ?? defaultSystemTonnage}
                    />

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`dl-meas-${runDL.id}`}>
                        Measured Duct Leakage (CFM)
                      </label>
                      <input
                        id={`dl-meas-${runDL.id}`}
                        name="measured_duct_leakage_cfm"
                        type="number"
                        step="1"
                        className="w-full rounded-md border px-3 py-2 placeholder:text-slate-400"
                        defaultValue={runDL.data?.measured_duct_leakage_cfm ?? ""}
                        placeholder="Required for result"
                      />
                    </div>

                    <div className="grid gap-1 sm:col-span-2">
                      <label className="text-sm font-medium" htmlFor={`dl-notes-${runDL.id}`}>
                        Notes (optional)
                      </label>
                      <input
                        id={`dl-notes-${runDL.id}`}
                        name="notes"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runDL.data?.notes ?? ""}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`ovr-${runDL.id}`}>
                        Manual Override
                      </label>
                      <select
                        id={`ovr-${runDL.id}`}
                        name="override"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={
                          runDL.override_pass === true ? "pass" : runDL.override_pass === false ? "fail" : "none"
                        }
                      >
                        <option value="none">None</option>
                        <option value="pass">Smoke Test (Pass)</option>
                      </select>
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`ovr-reason-${runDL.id}`}>
                        Override Reason (required if override set)
                      </label>
                      <input
                        id={`ovr-reason-${runDL.id}`}
                        name="override_reason"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runDL.override_reason ?? ""}
                        placeholder="Explain override"
                      />
                    </div>
                  </div>
                </form>

                <EccLivePreview mode="duct_leakage" formId={ductSaveFormId} projectType={job.project_type} />

                <div className="text-sm font-semibold text-slate-900">Calculated / Result</div>
                <div className="text-sm text-muted-foreground rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div>
                    Method: {(savedDuctMethodRaw === "heating" || savedDuctMethodRaw === "cooling" ? savedDuctMethodRaw : defaultDuctAirflowMethod) === "heating" ? "Heating Method" : "Cooling Method"}
                  </div>
                  <div>
                    Max Allowed: {runDL.computed?.max_leakage_cfm ?? "—"} CFM
                  </div>
                  <div>Measured: {runDL.data?.measured_duct_leakage_cfm ?? "—"} CFM</div>
                </div>

                <form id={ductDeleteFormId} action={deleteEccTestRunFromForm}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="test_run_id" value={runDL.id} />
                </form>

                <div className="flex flex-wrap gap-2 items-center pt-3 border-t">
                  <span className="text-sm font-medium text-emerald-700 flex items-center gap-2">
                    {runDL.is_completed && "✅ Test completed"}
                  </span>
                  <SubmitButton
                    form={ductSaveFormId}
                    loadingText="Saving..."
                    className="inline-flex min-h-10 items-center rounded-md border px-3 py-2 text-sm bg-white hover:bg-gray-50"
                  >
                    Save Draft
                  </SubmitButton>
                  <SubmitButton
                    form={ductSaveFormId}
                    loadingText="Saving & completing..."
                    formAction={saveAndCompleteDuctLeakageFromForm}
                    className="inline-flex min-h-10 items-center rounded-md bg-black px-3 py-2 text-sm text-white hover:bg-slate-800"
                  >
                    Complete Test
                  </SubmitButton>
                  <button
                    type="submit"
                    form={ductDeleteFormId}
                    className="inline-flex min-h-10 items-center rounded-md border px-3 py-2 text-sm bg-white hover:bg-gray-50"
                  >
                    Delete
                  </button>
                </div>

              </>
            )}
          </div>
        ) : null}

        {/* =========================
            AIRFLOW
            ========================= */}
        {focusedType === "airflow" ? (
          <div className="min-w-0 rounded-lg border bg-white p-4 space-y-4">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="font-medium">Airflow</div>
                <div className="mt-1 text-sm">
                  <span className="font-medium">Result:</span>{" "}
                  {runAF
                    ? getEffectiveResultLabel(runAF)
                    : carriedForwardAF
                    ? `PASS (carried from parent${parentRunAF ? ` · ${getEffectiveResultLabel(parentRunAF)}` : ""})`
                    : "Not started"}
                </div>
              </div>
              <div className="min-h-5 shrink-0 text-xs text-muted-foreground sm:text-right">
                {runAF?.updated_at ? new Date(runAF.updated_at).toLocaleString() : null}
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <div className="font-semibold text-slate-800">System Reference</div>
              <div>{selectedSystemName}</div>
              <div>Suggested tonnage: {fmtValue(defaultSystemTonnage, "ton")}</div>
            </div>

            {!runAF ? (
              carriedForwardAF ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                  <div className="font-medium">Passed on parent visit; carried forward.</div>
                  <div className="mt-1 text-xs text-emerald-700">
                    Parent result: {getEffectiveResultLabel(parentRunAF)}
                    {parentRunAF?.updated_at ? ` · Updated ${new Date(parentRunAF.updated_at).toLocaleString()}` : ""}
                  </div>
                </div>
              ) : (
                <form action={addEccTestRunFromForm} className="flex items-center gap-2">
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="system_id" value={selectedSystemId} />
                  <input type="hidden" name="test_type" value="airflow" />
                  <SubmitButton loadingText="Creating..." className="rounded-md bg-black px-4 py-2 text-white text-sm">
                    Create Airflow Run
                  </SubmitButton>
                </form>
              )
            ) : (
              <>
              <div className="text-sm font-semibold text-slate-900">Required Inputs</div>
              <form
                id={airflowSaveFormId}
                action={saveAirflowDataFromForm}
                className="grid gap-3 border-t pt-3"
              >
                <input type="hidden" name="system_id" value={selectedSystemId} />
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="test_run_id" value={runAF.id} />
                <input type="hidden" name="project_type" value={job.project_type} />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <label className="text-sm font-medium" htmlFor={`af-ton-${runAF.id}`}>
                      System Tonnage (auto-filled from equipment if available)
                    </label>
                    <input
                      id={`af-ton-${runAF.id}`}
                      name="tonnage"
                      type="number"
                      step="0.1"
                      className="w-full rounded-md border px-3 py-2"
                      defaultValue={runAF.data?.tonnage ?? defaultSystemTonnage}
                    />
                  </div>

                  <div className="grid gap-1">
                    <label className="text-sm font-medium" htmlFor={`af-meas-${runAF.id}`}>
                      Measured Total Airflow (CFM)
                    </label>
                    <input
                      id={`af-meas-${runAF.id}`}
                      name="measured_total_cfm"
                      type="number"
                      step="1"
                      className="w-full rounded-md border px-3 py-2"
                      defaultValue={runAF.data?.measured_total_cfm ?? ""}
                    />
                  </div>

                  <div className="grid gap-1 sm:col-span-2">
                    <label className="text-sm font-medium" htmlFor={`af-notes-${runAF.id}`}>
                      Notes (optional)
                    </label>
                    <input
                      id={`af-notes-${runAF.id}`}
                      name="notes"
                      className="w-full rounded-md border px-3 py-2"
                      defaultValue={runAF.data?.notes ?? ""}
                    />
                  </div>

                  <div className="grid gap-1 sm:col-span-2">
                    <div className="text-sm font-semibold text-slate-900">Override (Optional)</div>
                    <div className="text-xs text-slate-600">Use only when manual pass override is required.</div>
                  </div>

                  <div className="grid gap-1">
                    <label className="text-sm font-medium" htmlFor={`af-override-${runAF.id}`}>
                      Airflow Override Pass
                    </label>
                    <select
                      id={`af-override-${runAF.id}`}
                      name="airflow_override_pass"
                      className="w-full rounded-md border px-3 py-2"
                      defaultValue={runAF.override_pass === true ? "true" : "false"}
                    >
                      <option value="false">No</option>
                      <option value="true">Yes — Mark as Pass</option>
                    </select>
                  </div>

                  <div className="grid gap-1 sm:col-span-2">
                    <label className="text-sm font-medium" htmlFor={`af-override-reason-${runAF.id}`}>
                      Override Reason
                    </label>
                    <textarea
                      id={`af-override-reason-${runAF.id}`}
                      name="airflow_override_reason"
                      rows={3}
                      className="w-full rounded-md border px-3 py-2"
                      defaultValue={runAF.override_pass === true ? runAF.override_reason ?? "" : ""}
                      placeholder="Required only when override pass is used"
                    />
                  </div>
                </div>

              </form>

                <EccLivePreview mode="airflow" formId={airflowSaveFormId} projectType={job.project_type} />

                <div className="text-sm font-semibold text-slate-900">Calculated / Result</div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <div>Required Total Airflow: {fmtValue(runAF.computed?.required_total_cfm, "CFM")}</div>
                  <div>Measured Total Airflow: {fmtValue(runAF.data?.measured_total_cfm, "CFM")}</div>
                </div>

                <div className="flex flex-wrap gap-2 items-center pt-3 border-t">
                  <span className="text-sm font-medium text-emerald-700 flex items-center gap-2">
                    {runAF.is_completed && "✅ Test completed"}
                  </span>
                  <SubmitButton
                    form={airflowSaveFormId}
                    loadingText="Saving..."
                    className="inline-flex min-h-10 items-center rounded-md border px-3 py-2 text-sm bg-white hover:bg-gray-50"
                  >
                    Save Draft
                  </SubmitButton>
                  <SubmitButton
                    form={airflowSaveFormId}
                    formAction={saveAndCompleteAirflowFromForm}
                    loadingText="Saving & completing..."
                    className="inline-flex min-h-10 items-center rounded-md bg-black px-3 py-2 text-sm text-white hover:bg-slate-800"
                  >
                    Complete Test
                  </SubmitButton>
                  <form action={deleteEccTestRunFromForm}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="test_run_id" value={runAF.id} />
                    <button type="submit" className="inline-flex min-h-10 items-center rounded-md border px-3 py-2 text-sm bg-white hover:bg-gray-50">
                      Delete
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        ) : null}

        {/* =========================
            REFRIGERANT CHARGE
            ========================= */}
        {focusedType === "refrigerant_charge" ? (
          <div className="min-w-0 rounded-lg border bg-white p-4 space-y-4">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="font-medium">Refrigerant Charge</div>
                <div className="mt-1 text-sm">
                  <span className="font-medium">Result:</span>{" "}
                  {runRC
                    ? getEffectiveResultLabel(runRC)
                    : carriedForwardRC
                    ? `PASS (carried from parent${parentRunRC ? ` · ${getEffectiveResultLabel(parentRunRC)}` : ""})`
                    : "Not started"}
                </div>
              </div>
              <div className="min-h-5 shrink-0 text-xs text-muted-foreground sm:text-right">
                {runRC?.updated_at ? new Date(runRC.updated_at).toLocaleString() : null}
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <div className="font-semibold text-slate-800">System Reference</div>
              <div>{selectedSystemName}</div>
              <div>Refrigerant type on run: {fallbackText(runRC?.data?.refrigerant_type)}</div>
            </div>

            {!runRC ? (
              carriedForwardRC ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                  <div className="font-medium">Passed on parent visit; carried forward.</div>
                  <div className="mt-1 text-xs text-emerald-700">
                    Parent result: {getEffectiveResultLabel(parentRunRC)}
                    {parentRunRC?.updated_at ? ` · Updated ${new Date(parentRunRC.updated_at).toLocaleString()}` : ""}
                  </div>
                </div>
              ) : (
                <form action={addEccTestRunFromForm} className="flex items-center gap-2">
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="system_id" value={selectedSystemId} />
                  <input type="hidden" name="test_type" value="refrigerant_charge" />
                  <SubmitButton loadingText="Creating..." className="rounded-md bg-black px-4 py-2 text-white text-sm">
                    Create Refrigerant Charge Run
                  </SubmitButton>
                </form>
              )
            ) : (
              <>
                <div className="text-sm font-semibold text-slate-900">Required Inputs</div>
                <form
                  id={rcSaveFormId}
                  action={saveRefrigerantChargeDataFromForm}
                  className="grid gap-3 border-t pt-3"
                >
                  {/* ✅ critical: system_id must be included or server redirect can produce &s= */}
                  <input type="hidden" name="system_id" value={selectedSystemId} />
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="test_run_id" value={runRC.id} />

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`lrdb-${runRC.id}`}>
                        Lowest Return Air Dry Bulb (°F)
                      </label>
                      <input
                        id={`lrdb-${runRC.id}`}
                        name="lowest_return_air_db_f"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runRC.data?.lowest_return_air_db_f ?? ""}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`tcondb-${runRC.id}`}>
                        Condenser Air Entering DB (°F)
                      </label>
                      <input
                        id={`tcondb-${runRC.id}`}
                        name="condenser_air_entering_db_f"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runRC.data?.condenser_air_entering_db_f ?? ""}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`out-${runRC.id}`}>
                        Outdoor Temp (°F)
                      </label>
                      <input
                        id={`out-${runRC.id}`}
                        name="outdoor_temp_f"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runRC.data?.outdoor_temp_f ?? ""}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`ref-${runRC.id}`}>
                        Refrigerant Type
                      </label>
                      <select
                        id={`ref-${runRC.id}`}
                        name="refrigerant_type"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runRC.data?.refrigerant_type ?? ""}
                      >
                        <option value="">Select</option>
                        <option value="R-410A">R-410A</option>
                        <option value="R-32">R-32</option>
                        <option value="R-454B">R-454B</option>
                        <option value="R-22">R-22</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`llt-${runRC.id}`}>
                        Liquid Line Temp (°F)
                      </label>
                      <input
                        id={`llt-${runRC.id}`}
                        name="liquid_line_temp_f"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runRC.data?.liquid_line_temp_f ?? ""}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`llp-${runRC.id}`}>
                        Liquid Line Pressure (psig)
                      </label>
                      <input
                        id={`llp-${runRC.id}`}
                        name="liquid_line_pressure_psig"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runRC.data?.liquid_line_pressure_psig ?? ""}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`tcsat-${runRC.id}`}>
                        Condenser Saturation Temp (°F)
                      </label>
                      <input
                        id={`tcsat-${runRC.id}`}
                        name="condenser_sat_temp_f"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runRC.data?.condenser_sat_temp_f ?? ""}
                      />
                    </div>


                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`tsc-${runRC.id}`}>
                        Target Subcool (°F)
                      </label>
                      <input
                        id={`tsc-${runRC.id}`}
                        name="target_subcool_f"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runRC.data?.target_subcool_f ?? ""}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`suctt-${runRC.id}`}>
                        Suction Line Temp (°F)
                      </label>
                      <input
                        id={`suctt-${runRC.id}`}
                        name="suction_line_temp_f"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runRC.data?.suction_line_temp_f ?? ""}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`suctp-${runRC.id}`}>
                        Suction Line Pressure (psig)
                      </label>
                      <input
                        id={`suctp-${runRC.id}`}
                        name="suction_line_pressure_psig"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runRC.data?.suction_line_pressure_psig ?? ""}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`tesat-${runRC.id}`}>
                        Evaporator Saturation Temp (°F)
                      </label>
                      <input
                        id={`tesat-${runRC.id}`}
                        name="evaporator_sat_temp_f"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runRC.data?.evaporator_sat_temp_f ?? ""}
                      />
                    </div>

                    <div className="flex items-center gap-2 sm:col-span-2">
                      <input
                        id={`fd-${runRC.id}`}
                        name="filter_drier_installed"
                        type="checkbox"
                        defaultChecked={!!runRC.data?.filter_drier_installed}
                      />
                      <label className="text-sm font-medium" htmlFor={`fd-${runRC.id}`}>
                        Filter drier installed
                      </label>
                    </div>
                  </div>

                </form>

                <EccLivePreview mode="refrigerant_charge" formId={rcSaveFormId} projectType={job.project_type} />

                <div className="text-sm font-semibold text-slate-900">Calculated / Result</div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <div>Overall Result: {getEffectiveResultLabel(runRC)}</div>
                  <div>Measured Subcool: {fmtValue(runRC.computed?.measured_subcool_f, "°F")}</div>
                  <div>Measured Superheat: {fmtValue(runRC.computed?.measured_superheat_f, "°F")}</div>
                  <div>Status: {fallbackText(runRC.computed?.status)}</div>
                  {getComputedFailures(runRC).length > 0 ? (
                    <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                      <div className="font-medium">Why overall result is failing</div>
                      <ul className="mt-1 list-disc pl-5">
                        {getComputedFailures(runRC).map((failure) => (
                          <li key={failure}>{failure}</li>
                        ))}
                      </ul>
                      {hasFilterDrierFailure(runRC) && refrigerantNumericChecksPassing(runRC) ? (
                        <div className="mt-2">
                          Subcool and superheat are passing. Overall result still fails until Filter drier installed is confirmed.
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                
                <div className="text-sm font-semibold text-slate-900">Override (Optional)</div>
                <div className="rounded-md border p-3 mt-3 sm:col-span-2 space-y-2">
                  <div className="text-sm font-semibold">Charge Verification Override (if applicable)</div>
                  <div className="text-xs text-slate-600">
                    Select exemption as needed, then use Save Draft or Complete Test.
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      form={rcSaveFormId}
                      type="checkbox"
                      name="rc_exempt_package_unit"
                      defaultChecked={runRC.data?.charge_exempt_reason === "package_unit"}
                    />
                    Package unit — charge verification not required
                  </label>

                  <label className="flex items-center gap-2 text-sm mt-2">
                    <input
                      form={rcSaveFormId}
                      type="checkbox"
                      name="rc_exempt_conditions"
                      defaultChecked={runRC.data?.charge_exempt_reason === "conditions_not_met"}
                    />
                    Conditions not met / weather — override charge verification
                  </label>

                  <div className="mt-2">
                    <label className="block text-xs mb-1">Override details (optional)</label>
                    <input
                      form={rcSaveFormId}
                      name="rc_override_details"
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      defaultValue={runRC.data?.charge_exempt_details ?? ""}
                      placeholder='Example: "Outdoor temp 48°F" or "Rain / unsafe roof access"'
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 items-center pt-3 border-t">
                  <span className="text-sm font-medium text-emerald-700 flex items-center gap-2">
                    {runRC.is_completed && "✅ Test completed"}
                  </span>
                  <SubmitButton
                    form={rcSaveFormId}
                    loadingText="Saving..."
                    className="inline-flex min-h-10 items-center rounded-md border px-3 py-2 text-sm bg-white hover:bg-gray-50"
                  >
                    Save Draft
                  </SubmitButton>
                  <SubmitButton
                    form={rcSaveFormId}
                    formAction={saveAndCompleteRefrigerantChargeFromForm}
                    loadingText="Saving & completing..."
                    className="inline-flex min-h-10 items-center rounded-md bg-black px-3 py-2 text-sm text-white hover:bg-slate-800"
                  >
                    Complete Test
                  </SubmitButton>
                  <form action={deleteEccTestRunFromForm}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="test_run_id" value={runRC.id} />
                    <button type="submit" className="inline-flex min-h-10 items-center rounded-md border px-3 py-2 text-sm bg-white hover:bg-gray-50">
                      Delete
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
