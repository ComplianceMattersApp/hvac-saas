// app/jobs/[id]/tests/page
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDuctlessMiniSplitSystem, resolveEccScenario } from "@/lib/ecc/scenario-resolver";
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
  saveFanWattDrawDataFromForm,
  saveAhriVerificationDataFromForm,
  saveAirFilterDeviceDataFromForm,
  saveRefrigerantChargeDataFromForm,
  saveAndCompleteDuctLeakageFromForm,
  saveAndCompleteAirflowFromForm,
  saveAndCompleteFanWattDrawFromForm,
  saveAndCompleteAhriVerificationFromForm,
  saveAndCompleteAirFilterDeviceFromForm,
  saveLocalMechanicalExhaustDataFromForm,
  saveAndCompleteLocalMechanicalExhaustFromForm,
  saveQiiEnv22InsulationDataFromForm,
  saveAndCompleteQiiEnv22InsulationFromForm,
  saveAndCompleteRefrigerantChargeFromForm,
} from "@/lib/actions/job-actions";

import {
  getActiveManualAddTests,
  getTestDefinition,
  type EccTestType,
} from "@/lib/ecc/test-registry";
import { getEccReportScopedTestTypes, isEccTestInReportScope } from "@/lib/ecc/report-scope";
import {
  getRequiredTestsForSystem,
  normalizeProjectTypeToRuleProfile,
  isPackageSystem,
} from "@/lib/ecc/rule-profiles";
import { isEccTestApplicableToSystem } from "@/lib/ecc/test-applicability";
import { formatAreaSquareInches } from "@/lib/ecc/air-filter-device";
import { formatFanEfficacy } from "@/lib/ecc/fan-watt-draw";
import { isHeatingOnlyEquipment } from "@/lib/utils/equipment-display";
import { buildEquipmentSummaryLine } from "@/lib/utils/equipment-summary";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import { formatBusinessDateUS } from "@/lib/utils/schedule-la";

function getEffectiveResultLabel(t: any) {
  if (t.override_pass === true) return "PASS (override)";
  if (t.override_pass === false) return "FAIL (override)";
  if (t.computed?.status === "photo_evidence") return "Photo Taken (attestation)";
  if (t.computed?.status === "blocked") return "BLOCKED (conditions)";
  if (t.computed_pass === true) return "PASS";
  if (t.computed_pass === false) return "FAIL";
  if (t.is_completed === true) return "Verified";
  return "Draft";
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
      label: runDataKeys > 0 ? "Draft" : "Draft",
      tone: "border-slate-200 bg-slate-50 text-slate-600",
      run,
    };
  }

  if (run.computed?.status === "photo_evidence") {
    return {
      state: "attestation" as const,
      label: "Photo Taken",
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
    label: "Needs review",
    tone: "border-slate-200 bg-slate-50 text-slate-600",
    run,
  };
}

const eccPageShellClass =
  "mx-auto w-full min-w-0 max-w-7xl overflow-x-hidden space-y-5 px-3 py-4 text-slate-900 sm:px-5 lg:px-6 print:max-w-none print:p-0";
const eccPanelClass =
  "min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.34)] sm:p-5";
const eccSoftPanelClass =
  "rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4";
const eccWorkspaceCardClass =
  "min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.32)] space-y-4 sm:p-5";
const eccOfficeCardClass =
  "min-w-0 rounded-xl border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))] p-4 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.32)] space-y-4 sm:p-5";
const eccUtilityLabelClass =
  "text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500";
const eccActionRowClass =
  "flex flex-col gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:flex-wrap sm:items-center";
const eccSecondaryButtonClass =
  "inline-flex min-h-10 w-full items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 sm:w-auto";
const eccPrimaryButtonClass =
  "inline-flex min-h-10 w-full items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 sm:w-auto";

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

function ahriStatusLabel(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "verified_listed") return "Verified / Listed";
  if (normalized === "not_found") return "Not Found";
  if (normalized === "needs_model_correction") return "Needs Model Correction";
  if (normalized === "not_applicable") return "Not Applicable";
  if (normalized === "not_started") return "Not Started";
  return "Not Started";
}

function firstNonBlank(...values: unknown[]) {
  for (const value of values) {
    const rendered = String(value ?? "").trim();
    if (rendered) return rendered;
  }
  return "";
}

function parseQiiInsulationEntries(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry && typeof entry === "object");
}

function qiiStatusLabel(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "pass") return "Pass";
  if (normalized === "fail") return "Fail";
  if (normalized === "partial") return "Partial";
  if (normalized === "needs_correction") return "Needs Correction";
  if (normalized === "not_applicable") return "Not Applicable";
  return "Not Started";
}

function qiiYesNoLabel(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "yes") return "Yes";
  if (normalized === "no") return "No";
  return "Unknown";
}

function formatBusinessDateTimeUS(value?: string | null) {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function equipmentSummaryLine(eq: any) {
  return buildEquipmentSummaryLine(eq);
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
  const verificationMethod = run?.data?.verification_method;

  // Photo Taken is evidence-based, not numeric
  if (verificationMethod === "photo_taken") {
    return false;
  }

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
  const verificationMethod = run?.data?.verification_method;

  if (verificationMethod === "photo_taken") {
    return "User confirmed gauge photo was taken (photo attestation)";
  }

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
  const verificationMethod = run?.data?.verification_method;

  if (verificationMethod === "photo_taken") {
    return "User confirmed gauge photo was taken (photo attestation)";
  }

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
  const reportTestedDate = (() => {
    const latestCompletedRun = (job.ecc_test_runs ?? [])
      .filter((run: any) => run?.is_completed === true)
      .map((run: any) => {
        const timestamp = String(run?.updated_at ?? run?.created_at ?? "").trim();
        const ts = timestamp ? new Date(timestamp).getTime() : Number.NaN;
        return { timestamp, ts };
      })
      .filter((row: any) => Number.isFinite(row.ts))
      .sort((a: any, b: any) => b.ts - a.ts)[0];

    return formatBusinessDateTimeUS(latestCompletedRun?.timestamp ?? "");
  })();

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
            permit_number,
            jurisdiction,
            permit_date,
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

  const reportPermitNumber = firstNonBlank(job.permit_number, parentJob?.permit_number);
  const reportPermitJurisdiction = firstNonBlank((job as any).jurisdiction, parentJob?.jurisdiction);
  const reportPermitDateRaw = firstNonBlank((job as any).permit_date, parentJob?.permit_date);
  const reportPermitDate = reportPermitDateRaw ? formatBusinessDateUS(reportPermitDateRaw) : "";

  const runDL = selectedSystemId ? pickRunForSystem(job, "duct_leakage", selectedSystemId) : null;
  const runAF = selectedSystemId ? pickRunForSystem(job, "airflow", selectedSystemId) : null;
  const runFan = selectedSystemId ? pickRunForSystem(job, "fan_watt_draw", selectedSystemId) : null;
  const runAhri = selectedSystemId ? pickRunForSystem(job, "ahri_verification", selectedSystemId) : null;
  const runLocalExhaust = selectedSystemId ? pickRunForSystem(job, "local_mechanical_exhaust", selectedSystemId) : null;
  const runQiiInsulation = selectedSystemId ? pickRunForSystem(job, "qii_insulation", selectedSystemId) : null;
  const runFilter = selectedSystemId ? pickRunForSystem(job, "air_filter_device", selectedSystemId) : null;
  const runRC = selectedSystemId ? pickRunForSystem(job, "refrigerant_charge", selectedSystemId) : null;
  const ductSaveFormId = runDL ? `duct-save-${runDL.id}` : "";
  const ductDeleteFormId = runDL ? `duct-delete-${runDL.id}` : "";
  const airflowSaveFormId = runAF ? `airflow-save-${runAF.id}` : "";
  const fanSaveFormId = runFan ? `fan-save-${runFan.id}` : "";
  const fanDeleteFormId = runFan ? `fan-delete-${runFan.id}` : "";
  const ahriSaveFormId = runAhri ? `ahri-save-${runAhri.id}` : "";
  const ahriDeleteFormId = runAhri ? `ahri-delete-${runAhri.id}` : "";
  const localExhaustSaveFormId = runLocalExhaust ? `local-exhaust-save-${runLocalExhaust.id}` : "";
  const localExhaustDeleteFormId = runLocalExhaust ? `local-exhaust-delete-${runLocalExhaust.id}` : "";
  const qiiSaveFormId = runQiiInsulation ? `qii-save-${runQiiInsulation.id}` : "";
  const qiiDeleteFormId = runQiiInsulation ? `qii-delete-${runQiiInsulation.id}` : "";
  const filterSaveFormId = runFilter ? `filter-save-${runFilter.id}` : "";
  const filterDeleteFormId = runFilter ? `filter-delete-${runFilter.id}` : "";
  const rcSaveFormId = runRC ? `rc-save-${runRC.id}` : "";
  const qiiEntries = parseQiiInsulationEntries(runQiiInsulation?.data?.insulation_entries);
  const qiiRowCount = Math.max(1, qiiEntries.length + 1);

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
  const selectedSystemIsDuctlessMiniSplit = isDuctlessMiniSplitSystem(selectedSystemEquipment);
  const selectedSystemApplicability = {
    heatOnlySystem: selectedSystemIsHeatOnly,
    ductlessMiniSplit: selectedSystemIsDuctlessMiniSplit,
  };
  const manualAddTestsForSystem = manualAddTests.filter((test) =>
    isEccTestApplicableToSystem(String(test.code), selectedSystemApplicability)
  );

  const focusedType =
    focusedTypeRaw && !isEccTestApplicableToSystem(focusedTypeRaw, selectedSystemApplicability)
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
    .filter((testType) => isEccTestApplicableToSystem(testType, selectedSystemApplicability));

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
    isEccTestApplicableToSystem(testType, selectedSystemApplicability)
  );

  const visibleTestTypes = Array.from(
    new Set([...(requiredTests as string[]), ...applicableSystemRunTestTypes, ...carriedForwardPassedTypes])
  ) as EccTestType[];

  const visibleFieldTestTypes = visibleTestTypes.filter((testType) => testType !== "ahri_verification");

  const focusedCustomTestType =
    focusedType &&
    focusedType !== "custom" &&
    focusedType !== "duct_leakage" &&
    focusedType !== "airflow" &&
    focusedType !== "fan_watt_draw" &&
    focusedType !== "ahri_verification" &&
    focusedType !== "local_mechanical_exhaust" &&
    focusedType !== "qii_insulation" &&
    focusedType !== "air_filter_device" &&
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

const defaultFanActualAirflowCfm =
  runFan?.data?.actual_tested_airflow_cfm ?? runAF?.data?.measured_total_cfm ?? "";

const outdoorModelForAhri =
  selectedSystemEquipment.find((eq: any) => isOutdoorEquipment(eq))?.model ?? "";

const indoorCoilModelForAhri =
  selectedSystemEquipment.find((eq: any) => {
    const role = String(eq?.equipment_role ?? "").toLowerCase();
    const componentType = String(eq?.component_type ?? "").toLowerCase();
    return role.includes("indoor_unit") || componentType.includes("coil");
  })?.model ?? "";

const furnaceOrAirHandlerModelForAhri =
  selectedSystemEquipment.find((eq: any) => {
    const role = String(eq?.equipment_role ?? "").toLowerCase();
    return role.includes("furnace") || role.includes("air_handler");
  })?.model ?? "";

const miniSplitOutdoorModelForAhri =
  selectedSystemEquipment.find((eq: any) => {
    const role = String(eq?.equipment_role ?? "").toLowerCase();
    const componentType = String(eq?.component_type ?? "").toLowerCase();
    return role.includes("mini_split_outdoor") || componentType.includes("mini_split_outdoor");
  })?.model ?? "";

const miniSplitHeadModelForAhri =
  selectedSystemEquipment.find((eq: any) => {
    const role = String(eq?.equipment_role ?? "").toLowerCase();
    const componentType = String(eq?.component_type ?? "").toLowerCase();
    return role.includes("mini_split_head") || componentType.includes("mini_split_head");
  })?.model ?? "";

const ahriModelReadinessRows = [
  { label: "Outdoor model", value: String(outdoorModelForAhri || "").trim() },
  { label: "Indoor coil model", value: String(indoorCoilModelForAhri || "").trim() },
  { label: "Furnace / air handler model", value: String(furnaceOrAirHandlerModelForAhri || "").trim() },
  { label: "Mini-split outdoor model", value: String(miniSplitOutdoorModelForAhri || "").trim() },
  { label: "Mini-split indoor head model", value: String(miniSplitHeadModelForAhri || "").trim() },
];

const ahriMissingModelRows = ahriModelReadinessRows.filter((row) => !row.value);

  const carriedForwardDL = !runDL && carriedForwardPassedTypes.includes("duct_leakage");
  const carriedForwardAF = !runAF && carriedForwardPassedTypes.includes("airflow");
  const carriedForwardRC = !runRC && carriedForwardPassedTypes.includes("refrigerant_charge");

  const parentFailedComparisonRows = (baselineRequiredTests as EccTestType[])
    .map((testType) => ({
      testType,
      run: pickParentRunForSelectedSystem(testType),
    }))
    .filter((row) => getEffectiveResultState(row.run) === "fail");

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
    const systemIsDuctlessMiniSplit = isDuctlessMiniSplitSystem(systemEquipment);
    const systemApplicability = {
      heatOnlySystem: systemIsHeatOnly,
      ductlessMiniSplit: systemIsDuctlessMiniSplit,
    };
    const systemSuggestedTests = resolveEccScenario({
      projectType: job.project_type,
      systemEquipment,
    }).suggestedTests.filter((test) =>
      isEccTestApplicableToSystem(test.testType, systemApplicability)
    );
    const systemRunTestTypes = Array.from(
      new Set(
        (job.ecc_test_runs ?? [])
          .filter((run: any) => String(run.system_id ?? "") === String(systemId))
          .map((run: any) => String(run.test_type ?? "").trim())
          .filter((testType: string) =>
            Boolean(testType) &&
            Boolean(getTestDefinition(testType)) &&
            isEccTestApplicableToSystem(testType, systemApplicability)
          )
      )
    );
    const reportScopedTestTypes = getEccReportScopedTestTypes({
      suggestedTests: systemSuggestedTests,
      runTestTypes: systemRunTestTypes,
    });

    const runAirflow = systemIsHeatOnly || systemIsDuctlessMiniSplit ? null : pickLatestRunForSystem(job, "airflow", systemId);
    const runFan = systemIsDuctlessMiniSplit ? null : pickLatestRunForSystem(job, "fan_watt_draw", systemId);
    const runAhri = pickLatestRunForSystem(job, "ahri_verification", systemId);
    const runLocalExhaust = pickLatestRunForSystem(job, "local_mechanical_exhaust", systemId);
    const runQiiInsulation = pickLatestRunForSystem(job, "qii_insulation", systemId);
    const runFilter = systemIsDuctlessMiniSplit ? null : pickLatestRunForSystem(job, "air_filter_device", systemId);
    const runDuct = systemIsDuctlessMiniSplit ? null : pickLatestRunForSystem(job, "duct_leakage", systemId);
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
      runFan,
      runAhri,
      runLocalExhaust,
      runQiiInsulation,
      runFilter,
      runDuct,
      runRefrigerant,
      showAirflowReport: isEccTestInReportScope(reportScopedTestTypes, "airflow"),
      showFanReport: isEccTestInReportScope(reportScopedTestTypes, "fan_watt_draw"),
      showAhriReport: isEccTestInReportScope(reportScopedTestTypes, "ahri_verification"),
      showLocalExhaustReport: isEccTestInReportScope(reportScopedTestTypes, "local_mechanical_exhaust"),
      showQiiInsulationReport: isEccTestInReportScope(reportScopedTestTypes, "qii_insulation"),
      showFilterReport: isEccTestInReportScope(reportScopedTestTypes, "air_filter_device"),
      showDuctReport: isEccTestInReportScope(reportScopedTestTypes, "duct_leakage"),
      showRefrigerantReport: isEccTestInReportScope(reportScopedTestTypes, "refrigerant_charge"),
      systemIsHeatOnly,
      systemIsDuctlessMiniSplit,
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
      <div className={eccPageShellClass}>
        {notice === "rc_exempt_reason_required" && (
          <div className="mb-4 rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Select <span className="font-semibold">Package unit</span> or{" "}
            <span className="font-semibold">Conditions not met</span> before marking
            refrigerant charge exempt.
          </div>
        )}
        {notice === "airflow_override_reason_required" && (
          <div className="mb-4 rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Enter an <span className="font-semibold">override reason</span> before using
            airflow pass override.
          </div>
        )}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.36)] sm:p-5 print:hidden">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className={eccUtilityLabelClass}>ECC Workspace</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{normalizeRetestLinkedJobTitle(job.title) || "Job"}</h1>
          <div className="mt-1 text-sm text-slate-600">{job.city ?? "N/A"}</div>
        </div>

        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
          <label htmlFor="completion-report-toggle" className={eccSecondaryButtonClass}>
            View Completion Report
          </label>
          <PrintButton className={eccSecondaryButtonClass} />
          <Link href={`/jobs/${job.id}/info?f=equipment`} className={eccSecondaryButtonClass}>
            Add / View Equipment
          </Link>
          <Link href={`/jobs/${job.id}`} className={eccSecondaryButtonClass}>
            &larr; Back to Job
          </Link>
        </div>
      </div>

      </div>

      <input id="completion-report-toggle" type="checkbox" className="peer sr-only" />
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 shadow-[0_14px_30px_-30px_rgba(15,23,42,0.32)] print:hidden">
        Completion output is collapsed so the workspace stays focused.
        <label htmlFor="completion-report-toggle" className="ml-1 cursor-pointer font-medium text-slate-900 underline">
          Expand report
        </label>
      </div>

      <div className="hidden space-y-4 peer-checked:block print:block">
      <div className="hidden border-b border-slate-400 pb-2 print:block">
        <h1 className="text-lg font-bold text-slate-950">{internalBusinessDisplayName} Test Results</h1>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_18px_38px_-34px_rgba(15,23,42,0.34)] space-y-4 text-slate-900 print:rounded-none print:border-slate-500 print:p-3 print:space-y-3 print:shadow-none">
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
              <div className="text-sm font-medium text-slate-950">{fallbackText(reportPermitNumber)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Jurisdiction</div>
              <div className="text-sm font-medium text-slate-950">{fallbackText(reportPermitJurisdiction)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Permit Date</div>
              <div className="text-sm font-medium text-slate-950">{fallbackText(reportPermitDate || null)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Project Type</div>
              <div className="text-sm font-medium capitalize text-slate-950">{fallbackText(projectTypeLabel)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Date Tested</div>
              <div className="text-sm font-medium text-slate-950">{fallbackText(reportTestedDate || null)}</div>
            </div>
          </div>
        </div>
      </section>

      <section id="cheers-fast-view" className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_18px_38px_-34px_rgba(15,23,42,0.34)] space-y-5 text-slate-900 print:border-0 print:bg-white print:p-0 print:space-y-4 print:shadow-none">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-950 print:text-base">Results</h2>
            <p className="text-sm text-slate-700 print:text-xs">Read-only summary from saved ECC test results, grouped by system.</p>
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
                <div key={sys.systemId} className={`break-inside-avoid rounded-xl border border-slate-200 bg-white p-4 space-y-4 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.34)] print:rounded-none print:border-slate-500 print:p-3 print:space-y-3 print:shadow-none ${shouldForcePrintBreak ? "print:break-before-page" : ""}`}>
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
                              <div className="font-semibold text-slate-900">
                                {sys.systemIsDuctlessMiniSplit ? "Mini-Split Indoor Head Equipment" : "Indoor Equipment"}
                              </div>
                              {sys.indoorEquipment.length > 0 ? (
                                sys.indoorEquipment.map((eq: any, index: number) => (
                                  <div key={String(eq?.id ?? `indoor-${sys.systemId}-${index}`)}>
                                    {index + 1}. {equipmentSummaryLine(eq)}
                                  </div>
                                ))
                              ) : (
                                <div>—</div>
                              )}

                              <div className="font-semibold text-slate-900 pt-1 print:pt-0.5">
                                {sys.systemIsDuctlessMiniSplit ? "Mini-Split Outdoor Equipment" : "Condenser"}
                              </div>
                              {sys.outdoorEquipment.length > 0 ? (
                                sys.outdoorEquipment.map((eq: any, index: number) => (
                                  <div key={String(eq?.id ?? `outdoor-${sys.systemId}-${index}`)}>
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

                    {sys.showAhriReport ? (
                    <div>
                      <span className="font-semibold text-slate-950">AHRI Matched System Verification (Office):</span>
                      <div className="mt-1 space-y-1 text-slate-800">
                        {!sys.runAhri ? (
                          <div>No AHRI office verification run found for this system.</div>
                        ) : (
                          <>
                            <div>Status: {ahriStatusLabel(sys.runAhri?.data?.ahri_status)}</div>
                            <div>
                              AHRI Certificate / Reference Number: {fallbackText(sys.runAhri?.data?.ahri_certificate_number)}
                            </div>
                            <div>Verified Date: {fallbackText(sys.runAhri?.data?.verified_at)}</div>
                            <div>Verified By: {fallbackText(sys.runAhri?.data?.verified_by_name)}</div>
                            <div>Matched Equipment: {fallbackText(sys.runAhri?.data?.matched_equipment_summary)}</div>
                            <div>Notes: {fallbackText(sys.runAhri?.data?.verification_notes)}</div>
                          </>
                        )}
                      </div>
                    </div>
                    ) : null}

                    {sys.showLocalExhaustReport ? (
                    <div>
                      <span className="font-semibold text-slate-950">Local Mechanical Exhaust Verification:</span>
                      <div className="mt-1 space-y-1 text-slate-800">
                        {!sys.runLocalExhaust ? (
                          <div>No local mechanical exhaust verification run found for this system.</div>
                        ) : (
                          <>
                            <div>Building Type: {fallbackText(sys.runLocalExhaust?.data?.building_type)}</div>
                            <div>Kitchen Floor Area: {fmtValue(sys.runLocalExhaust?.data?.total_kitchen_floor_area, "sq ft")}</div>
                            <div>
                              Kitchen Average Ceiling Height: {fmtValue(sys.runLocalExhaust?.data?.kitchen_average_ceiling_height, "ft")}
                            </div>
                            <div>Kitchen Type: {fallbackText(sys.runLocalExhaust?.data?.kitchen_type)}</div>
                            <div>System Name: {fallbackText(sys.runLocalExhaust?.data?.system_name)}</div>
                            <div>Manufacturer: {fallbackText(sys.runLocalExhaust?.data?.manufacturer_name)}</div>
                            <div>System Type: {fallbackText(sys.runLocalExhaust?.data?.system_type)}</div>
                            <div className="text-slate-500 italic text-xs mt-2">Directory Research Values:</div>
                            <div>HVI/AHAM Directory Model Number: {fallbackText(sys.runLocalExhaust?.data?.hvi_aham_model_number)}</div>
                            <div>
                              HVI/AHAM Directory Rated Airflow: {fmtValue(sys.runLocalExhaust?.data?.hvi_aham_rated_airflow_cfm, "CFM")}
                            </div>
                            <div>HVI/AHAM Directory Sound Rating: {fallbackText(sys.runLocalExhaust?.data?.hvi_aham_sound_rating)}</div>
                            <div>Minimum Airflow: {fmtValue(sys.runLocalExhaust?.data?.minimum_airflow_cfm, "CFM")}</div>
                            <div>Operation Schedule: {fallbackText(sys.runLocalExhaust?.data?.operation_schedule)}</div>
                            <div>Notes: {fallbackText(sys.runLocalExhaust?.data?.notes)}</div>
                            <div>
                              Airflow Compliance Statement: {fallbackText(sys.runLocalExhaust?.computed?.airflow_compliance_statement)}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    ) : null}

                    {sys.showQiiInsulationReport ? (
                    <div>
                      <span className="font-semibold text-slate-950">QII / ENV-22 Insulation Verification:</span>
                      <div className="mt-1 space-y-1 text-slate-800">
                        {!sys.runQiiInsulation ? (
                          <div>No QII insulation verification run found for this system.</div>
                        ) : (
                          <>
                            <div>Project Basis Note: {fallbackText(sys.runQiiInsulation?.data?.qii_project_basis_note)}</div>
                            <div>Verified By: {fallbackText(sys.runQiiInsulation?.data?.verified_by_name)}</div>
                            <div>Verified Date: {fallbackText(sys.runQiiInsulation?.data?.verified_at)}</div>
                            <div>Overall Status: {qiiStatusLabel(sys.runQiiInsulation?.data?.overall_qii_status)}</div>
                            <div>
                              Entry Count: {fmtValue(sys.runQiiInsulation?.computed?.entry_count)}
                            </div>
                            <div>
                              Compliance Statement: {fallbackText(sys.runQiiInsulation?.computed?.compliance_statement)}
                            </div>
                            <div>
                              Failed Locations: {Array.isArray(sys.runQiiInsulation?.computed?.failed_locations) && sys.runQiiInsulation.computed.failed_locations.length > 0 ? sys.runQiiInsulation.computed.failed_locations.join(", ") : "None"}
                            </div>
                            {parseQiiInsulationEntries(sys.runQiiInsulation?.data?.insulation_entries).length > 0 ? (
                              <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
                                {parseQiiInsulationEntries(sys.runQiiInsulation?.data?.insulation_entries).map((entry: any, entryIndex: number) => (
                                  <div key={`qii-report-entry-${sys.systemId}-${entryIndex}`}>
                                    {entryIndex + 1}. {fallbackText(entry?.insulation_location)} | {fallbackText(entry?.insulation_type)} | Status: {qiiStatusLabel(entry?.verification_status)} | Required R: {fallbackText(entry?.required_r_value)} | Installed R: {fallbackText(entry?.installed_r_value)}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                    ) : null}

                    {sys.showAirflowReport ? (
                    <div>
                      <span className="font-semibold text-slate-950">Airflow Summary:</span>
                      <div className="mt-1 space-y-1 text-slate-800">
                        {sys.systemIsDuctlessMiniSplit ? (
                          <div>Not applicable for ductless mini split systems.</div>
                        ) : sys.systemIsHeatOnly ? (
                          <div>Not applicable for heat-only system (no cooling equipment).</div>
                        ) : (
                          <>
                            <div>Target Airflow: {fmtValue(sys.runAirflow?.data?.cfm_per_ton_required, "CFM/ton")}</div>
                            <div>Required Total Airflow: {fmtValue(sys.runAirflow?.computed?.required_total_cfm, "CFM")}</div>
                            <div>Measured Airflow: {fmtValue(sys.runAirflow?.data?.measured_total_cfm, "CFM")}</div>
                            <div>Result: {sys.runAirflow ? getEffectiveResultLabel(sys.runAirflow) : "No run"}</div>
                          </>
                        )}
                      </div>
                    </div>
                    ) : null}

                    {sys.showFanReport ? (
                    <div>
                      <span className="font-semibold text-slate-950">Forced Air System Fan Efficacy Measurement:</span>
                      <div className="mt-1 space-y-1 text-slate-800">
                        {sys.systemIsDuctlessMiniSplit ? (
                          <div>Not applicable for ductless mini split systems.</div>
                        ) : !sys.runFan ? (
                          <div>No fan efficacy run found for this system.</div>
                        ) : (
                          <>
                            <div>Actual Tested Watts: {fmtValue(sys.runFan?.data?.actual_tested_watts, "W")}</div>
                            <div>
                              Actual Tested Airflow from MCH-23: {fmtValue(sys.runFan?.data?.actual_tested_airflow_cfm, "CFM")}
                            </div>
                            <div>
                              Required Fan Efficacy: {formatFanEfficacy(sys.runFan?.computed?.required_fan_efficacy_w_per_cfm ?? sys.runFan?.data?.required_fan_efficacy_w_per_cfm ?? null)} W/CFM
                            </div>
                            <div>
                              Actual Fan Efficacy: {formatFanEfficacy(sys.runFan?.computed?.actual_fan_efficacy_w_per_cfm ?? null)} W/CFM
                            </div>
                            <div>Compliance Statement: {fallbackText(sys.runFan?.computed?.compliance_statement)}</div>
                          </>
                        )}
                      </div>
                    </div>
                    ) : null}

                    {sys.showFilterReport ? (
                    <div>
                      <span className="font-semibold text-slate-950">Air Filter Device Verification:</span>
                      <div className="mt-1 space-y-1 text-slate-800">
                        {sys.systemIsDuctlessMiniSplit ? (
                          <div>Not applicable for ductless mini split systems.</div>
                        ) : !sys.runFilter ? (
                          <div>No air filter device verification run found for this system.</div>
                        ) : (
                          <>
                            <div>
                              Filter Location / Description: {fallbackText(sys.runFilter?.data?.filter_location_description)}
                            </div>
                            <div>Rack Type: {fallbackText(sys.runFilter?.data?.rack_type)}</div>
                            <div>Design Airflow: {fmtValue(sys.runFilter?.data?.design_airflow_cfm, "CFM")}</div>
                            <div>Nominal Depth: {fmtValue(sys.runFilter?.data?.nominal_depth_inches, "in")}</div>
                            <div>Nominal Length: {fmtValue(sys.runFilter?.data?.nominal_length_inches, "in")}</div>
                            <div>Nominal Width: {fmtValue(sys.runFilter?.data?.nominal_width_inches, "in")}</div>
                            <div>
                              Calculated Face Area: {formatAreaSquareInches(sys.runFilter?.computed?.calculated_nominal_face_area_sq_in ?? null)} in²
                            </div>
                            <div>
                              Required Minimum Face Area: {formatAreaSquareInches(sys.runFilter?.computed?.required_minimum_face_area_sq_in ?? null)} in²
                            </div>
                            <div>
                              Face Area Compliance: {String(sys.runFilter?.computed?.face_area_compliance ?? "pending")
                                .replaceAll("_", " ")
                                .replace(/\b\w/g, (m) => m.toUpperCase())}
                            </div>
                            <div>
                              Design Allowable Pressure Drop: {fmtValue(sys.runFilter?.data?.design_allowable_pressure_drop_iwc, "in. W.C.")}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    ) : null}

                    {sys.showDuctReport ? (
                    <div>
                      <span className="font-semibold text-slate-950">Duct Leakage Summary:</span>
                      <div className="mt-1 space-y-1 text-slate-800">
                        {sys.systemIsDuctlessMiniSplit ? (
                          <div>Not applicable for ductless mini split systems.</div>
                        ) : (
                          <>
                            <div>Target Leakage Limit: {fmtValue(sys.runDuct?.computed?.leakage_percent_allowed_display, "%")}</div>
                            <div>Max Allowed Leakage: {fmtValue(sys.runDuct?.computed?.max_leakage_cfm, "CFM")}</div>
                            <div>Entered duct leakage value: {fmtValue(sys.runDuct?.data?.measured_duct_leakage_cfm, "CFM")}</div>
                            <div>Result: {sys.runDuct ? getEffectiveResultLabel(sys.runDuct) : "No run"}</div>
                          </>
                        )}
                      </div>
                    </div>
                    ) : null}
                  </div>

                  {sys.showRefrigerantReport ? (
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
                            <li>Manufacturer specification statement: Superheat manufacturer target is not stored for this run; evaluation uses the configured ECC threshold.</li>
                            <li>Compliance Statement: {refrigerantComplianceG(sys.runRefrigerant)}</li>
                          </ol>
                        </div>
                      </>
                    )}
                  </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      </div>

      <section className={`${eccPanelClass} space-y-5 print:hidden`}>
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-slate-950">ECC Tests</h2>
          <p className="text-sm text-slate-600">
            Capture tests in any order. “Save” stores readings; “Complete” locks the test for the visit workflow.
          </p>
        </div>

        {/* System selector */}
        <div className={`${eccSoftPanelClass} space-y-3`}>
          <div className={eccUtilityLabelClass}>Selected System</div>

          <div className="-mx-1 overflow-x-auto pb-1 sm:mx-0 sm:overflow-visible sm:pb-0">
            <div className="flex w-max min-w-full gap-2 px-1 sm:w-auto sm:min-w-0 sm:flex-wrap sm:px-0">
              {systems.map((sys: any) => {
                const isActive = String(sys.id) === String(selectedSystemId);
                return (
                  <Link
                    key={sys.id}
                    href={withS(focusedType || undefined, String(sys.id))}
                    className={`whitespace-nowrap rounded-full border px-3 py-2 text-sm font-semibold transition-colors ${
                      isActive
                        ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                        : "border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50"
                    }`}
                  >
                    {sys.name}
                  </Link>
                );
              })}
            </div>
          </div>

          {!systems.length ? (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                No systems/locations exist yet. Add equipment on the Job Info page first. Systems are created from
                saved equipment/locations.
              </div>
              <Link
                href={`/jobs/${job.id}/info?f=equipment`}
                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition-[background-color,border-color,transform] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]"
              >
                Add / View Equipment
              </Link>
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
          <div className={`${eccPanelClass} space-y-4`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-base font-semibold tracking-tight text-slate-950">Required and Active Tests</div>
                <div className="mt-1 text-xs text-slate-500">
                  Required tests plus any selected add-ons for this system:{" "}
                  <span className="font-medium">
                    {normalizedProfile === "alteration"
                      ? "Alteration"
                      : normalizedProfile === "new_prescriptive"
                      ? "New Prescriptive"
                      : "Other / Custom"}
                  </span>
                </div>
              </div>

              <div className="text-xs font-medium text-slate-500">
                {systems.find((s: any) => String(s.id) === String(selectedSystemId))?.name ?? "Selected system"}
              </div>
            </div>

            {visibleFieldTestTypes.length === 0 ? (
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
                {visibleFieldTestTypes.map((testType: EccTestType) => {
  const status = getRequiredTestStatusForSystem(job, selectedSystemId, testType);
  const parentRun = pickParentRunForSelectedSystem(testType);
  const parentOutcome = getEffectiveResultState(parentRun);
  const carriedForward = isRetestChild && !status.run && parentOutcome === "pass";
  const testHref = `/jobs/${job.id}/tests?s=${selectedSystemId}&t=${testType}`;
  const isRequired = requiredTests.includes(testType);

  return (
      <div
      key={testType}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-[0_12px_28px_-26px_rgba(15,23,42,0.35)] transition-colors hover:border-slate-300 hover:bg-slate-50/60 sm:flex-row sm:items-center sm:justify-between sm:px-4"
    >
      <div className="min-w-0">
        <div className="font-semibold text-slate-950">
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
        <div className="mt-1 text-xs leading-5 text-slate-500">
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
            : "Needs review before closeout"}
        </div>
      </div>

      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        {carriedForward ? (
            <span className="inline-flex w-full items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 sm:w-auto">
            No retest needed
          </span>
        ) : status.state === "required" ? (
          <form action={addEccTestRunFromForm}>
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="system_id" value={selectedSystemId} />
            <input type="hidden" name="test_type" value={testType} />
            <SubmitButton loadingText="Starting..." className="inline-flex w-full items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:w-auto">
              Start Test
            </SubmitButton>
          </form>
        ) : (
          <Link
            href={testHref}
            className="inline-flex w-full items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 sm:w-auto"
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

            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
              Rule profile: {scenarioCode.replaceAll("_", " ")}
            </div>
          </div>
        ) : null}

        {/* Add Test panel */}
        {selectedSystemId && focusedType === "custom" ? (
          <div className={`${eccPanelClass} space-y-3`}>
            <div>
              <div className="text-sm font-semibold text-slate-950">Add Test</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Add selected tests when the project scope requires extra documentation for this system.
              </p>
            </div>

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

                <div className="text-xs text-slate-500">
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
                    Select test type…
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

              <SubmitButton loadingText="Adding..." className={eccPrimaryButtonClass}>
                Add Test
              </SubmitButton>
            </form>
          </div>
        ) : null}

                {/* Add Test pill */}
        {selectedSystemId ? (
          <Link
            href={focusedType === "custom" ? withS(undefined) : withS("custom")}
            className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 shadow-sm transition-colors ${
              focusedType === "custom"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-900 hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            <div className="font-semibold">Add Test</div>
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
                <SubmitButton loadingText="Creating..." className={eccPrimaryButtonClass}>
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
          <div className={eccWorkspaceCardClass}>
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
                <div>Suggested heating input: {fmtValue(defaultHeatingCapacityKbtu, "KBTU/h")}</div>
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

                  <SubmitButton loadingText="Creating..." className={eccPrimaryButtonClass}>
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
                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`dl-target-${runDL.id}`}>
                        Duct Leakage Target (%)
                      </label>
                      <input
                        id={`dl-target-${runDL.id}`}
                        name="leakage_percent_target"
                        type="number"
                        min="0.1"
                        max="100"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={
                          runDL.data?.leakage_percent_target ??
                          runDL.computed?.leakage_percent_allowed_display ??
                          (String(job.project_type ?? "").trim().toLowerCase() === "alteration" ? 10 : 5)
                        }
                      />
                      <div className="text-xs text-slate-600">Editable per run; defaults from profile if unchanged.</div>
                    </div>

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
                        required
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
                        list={`ovr-reason-list-${runDL.id}`}
                      />
                      <datalist id={`ovr-reason-list-${runDL.id}`}>
                        <option value="Smoke Test" />
                        <option value="Asbestos" />
                      </datalist>
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
                    Target Leakage Limit: {fmtValue(runDL.computed?.leakage_percent_allowed_display, "%")}
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

                <div className={eccActionRowClass}>
                  <span className="text-sm font-medium text-emerald-700 flex items-center gap-2">
                    {runDL.is_completed && "✅ Test completed"}
                  </span>
                  <SubmitButton
                    form={ductSaveFormId}
                    formNoValidate
                    loadingText="Saving..."
                    className={eccSecondaryButtonClass}
                  >
                    Save Draft
                  </SubmitButton>
                  <SubmitButton
                    form={ductSaveFormId}
                    loadingText="Saving & completing..."
                    formAction={saveAndCompleteDuctLeakageFromForm}
                    className={eccPrimaryButtonClass}
                  >
                    Complete Test
                  </SubmitButton>
                  <button
                    type="submit"
                    form={ductDeleteFormId}
                    className={eccSecondaryButtonClass}
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
          <div className={eccWorkspaceCardClass}>
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
                  <SubmitButton loadingText="Creating..." className={eccPrimaryButtonClass}>
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
                    <label className="text-sm font-medium" htmlFor={`af-target-${runAF.id}`}>
                      Airflow Target (CFM per ton)
                    </label>
                    <input
                      id={`af-target-${runAF.id}`}
                      name="cfm_per_ton_target"
                      type="number"
                      min="1"
                      step="1"
                      className="w-full rounded-md border px-3 py-2"
                      defaultValue={runAF.data?.cfm_per_ton_required ?? (String(job.project_type ?? "").trim().toLowerCase() === "all_new" ? 350 : 300)}
                    />
                    <div className="text-xs text-slate-600">Editable per run; defaults from project profile if unchanged.</div>
                  </div>

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
                  <div>Target Airflow: {fmtValue(runAF.data?.cfm_per_ton_required, "CFM/ton")}</div>
                  <div>Required Total Airflow: {fmtValue(runAF.computed?.required_total_cfm, "CFM")}</div>
                  <div>Measured Total Airflow: {fmtValue(runAF.data?.measured_total_cfm, "CFM")}</div>
                </div>

                <div className={eccActionRowClass}>
                  <span className="text-sm font-medium text-emerald-700 flex items-center gap-2">
                    {runAF.is_completed && "✅ Test completed"}
                  </span>
                  <SubmitButton
                    form={airflowSaveFormId}
                    loadingText="Saving..."
                    className={eccSecondaryButtonClass}
                  >
                    Save Draft
                  </SubmitButton>
                  <SubmitButton
                    form={airflowSaveFormId}
                    formAction={saveAndCompleteAirflowFromForm}
                    loadingText="Saving & completing..."
                    className={eccPrimaryButtonClass}
                  >
                    Complete Test
                  </SubmitButton>
                  <form action={deleteEccTestRunFromForm}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="test_run_id" value={runAF.id} />
                    <button type="submit" className={eccSecondaryButtonClass}>
                      Delete
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        ) : null}

        {/* =========================
            FAN EFFICACY / WATT VERIFICATION
            ========================= */}
        {focusedType === "fan_watt_draw" ? (
          <div className={eccWorkspaceCardClass}>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="font-medium">Fan Efficacy / Watt Verification</div>
                <div className="mt-1 text-sm">
                  <span className="font-medium">Result:</span>{" "}
                  {runFan
                    ? getEffectiveResultLabel(runFan)
                    : "Not started"}
                </div>
              </div>
              <div className="min-h-5 shrink-0 text-xs text-muted-foreground sm:text-right">
                {runFan?.updated_at ? new Date(runFan.updated_at).toLocaleString() : null}
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <div className="font-semibold text-slate-800">System Reference</div>
              <div>{selectedSystemName}</div>
              <div>Actual Tested Airflow from MCH-23: {fmtValue(defaultFanActualAirflowCfm, "CFM")}</div>
            </div>

            {!runFan ? (
              <form action={addEccTestRunFromForm} className="flex items-center gap-2">
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="system_id" value={selectedSystemId} />
                <input type="hidden" name="test_type" value="fan_watt_draw" />
                <SubmitButton loadingText="Creating..." className={eccPrimaryButtonClass}>
                  Create Fan Efficacy Run
                </SubmitButton>
              </form>
            ) : (
              <>
                <div className="text-sm font-semibold text-slate-900">Required Inputs</div>
                <form id={fanSaveFormId} action={saveFanWattDrawDataFromForm} className="grid gap-3 border-t pt-3">
                  <input type="hidden" name="system_id" value={selectedSystemId} />
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="test_run_id" value={runFan.id} />

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`fan-watts-${runFan.id}`}>
                        Actual Tested Watts
                      </label>
                      <input
                        id={`fan-watts-${runFan.id}`}
                        name="actual_tested_watts"
                        type="number"
                        step="0.01"
                        required
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runFan.data?.actual_tested_watts ?? ""}
                        placeholder="Required for completion"
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`fan-airflow-${runFan.id}`}>
                        Actual Tested Airflow from MCH-23 (CFM)
                      </label>
                      <input
                        id={`fan-airflow-${runFan.id}`}
                        name="actual_tested_airflow_cfm"
                        type="number"
                        step="0.01"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runFan.data?.actual_tested_airflow_cfm ?? defaultFanActualAirflowCfm}
                        placeholder="Required for completion"
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`fan-required-${runFan.id}`}>
                        Required Fan Efficacy (Watts/CFM)
                      </label>
                      <input
                        id={`fan-required-${runFan.id}`}
                        name="required_fan_efficacy_w_per_cfm"
                        type="number"
                        step="0.01"
                        required
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runFan.data?.required_fan_efficacy_w_per_cfm ?? 0.45}
                        placeholder="0.45"
                      />
                    </div>

                    <div className="grid gap-1 sm:col-span-2">
                      <label className="text-sm font-medium" htmlFor={`fan-notes-${runFan.id}`}>
                        Notes (optional)
                      </label>
                      <input
                        id={`fan-notes-${runFan.id}`}
                        name="notes"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runFan.data?.notes ?? ""}
                        placeholder="Optional diagnostic notes"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input
                        type="checkbox"
                        name="registers_fully_open_attested"
                        defaultChecked={!!runFan.data?.registers_fully_open_attested}
                      />
                      All registers fully open during the diagnostic test
                    </label>

                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input
                        type="checkbox"
                        name="fan_max_speed_attested"
                        defaultChecked={!!runFan.data?.fan_max_speed_attested}
                      />
                      System fan set at maximum speed during the diagnostic test
                    </label>

                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input
                        type="checkbox"
                        name="photo_taken_attested"
                        defaultChecked={!!runFan.data?.photo_taken_attested}
                      />
                      Photo Taken — attestation only
                    </label>
                  </div>
                </form>

                <EccLivePreview mode="fan_watt_draw" formId={fanSaveFormId} projectType={job.project_type} />

                <div className="text-sm font-semibold text-slate-900">Calculated / Result</div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <div>Actual Tested Watts: {fmtValue(runFan.data?.actual_tested_watts, "W")}</div>
                  <div>Actual Tested Airflow from MCH-23: {fmtValue(runFan.data?.actual_tested_airflow_cfm, "CFM")}</div>
                  <div>Required Fan Efficacy: {formatFanEfficacy(runFan.computed?.required_fan_efficacy_w_per_cfm ?? runFan.data?.required_fan_efficacy_w_per_cfm ?? null)} W/CFM</div>
                  <div>Actual Fan Efficacy: {formatFanEfficacy(runFan.computed?.actual_fan_efficacy_w_per_cfm ?? null)} W/CFM</div>
                  <div>Compliance Statement: {fallbackText(runFan.computed?.compliance_statement)}</div>
                </div>

                <div className={eccActionRowClass}>
                  <span className="text-sm font-medium text-emerald-700 flex items-center gap-2">
                    {runFan.is_completed && "✅ Test completed"}
                  </span>
                  <SubmitButton
                    form={fanSaveFormId}
                    formNoValidate
                    loadingText="Saving..."
                    className={eccSecondaryButtonClass}
                  >
                    Save Draft
                  </SubmitButton>
                  <SubmitButton
                    form={fanSaveFormId}
                    loadingText="Saving & completing..."
                    formAction={saveAndCompleteFanWattDrawFromForm}
                    className={eccPrimaryButtonClass}
                  >
                    Complete Test
                  </SubmitButton>
                  <button
                    type="submit"
                    form={fanDeleteFormId}
                    className={eccSecondaryButtonClass}
                  >
                    Delete
                  </button>
                </div>

                <form id={fanDeleteFormId} action={deleteEccTestRunFromForm}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="test_run_id" value={runFan.id} />
                </form>
              </>
            )}
          </div>
        ) : null}

        {/* =========================
            AIR FILTER DEVICE VERIFICATION
            ========================= */}
        {focusedType === "air_filter_device" ? (
          <div className={eccWorkspaceCardClass}>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="font-medium">Air Filter Device Verification</div>
                <div className="mt-1 text-sm">
                  <span className="font-medium">Result:</span>{" "}
                  {runFilter ? getEffectiveResultLabel(runFilter) : "Not started"}
                </div>
              </div>
              <div className="min-h-5 shrink-0 text-xs text-muted-foreground sm:text-right">
                {runFilter?.updated_at ? new Date(runFilter.updated_at).toLocaleString() : null}
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <div className="font-semibold text-slate-800">System Reference</div>
              <div>{selectedSystemName}</div>
            </div>

            {!runFilter ? (
              <form action={addEccTestRunFromForm} className="flex items-center gap-2">
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="system_id" value={selectedSystemId} />
                <input type="hidden" name="test_type" value="air_filter_device" />
                <SubmitButton loadingText="Creating..." className={eccPrimaryButtonClass}>
                  Create Air Filter Run
                </SubmitButton>
              </form>
            ) : (
              <>
                <div className="text-sm font-semibold text-slate-900">Required Inputs</div>
                <form id={filterSaveFormId} action={saveAirFilterDeviceDataFromForm} className="grid gap-3 border-t pt-3">
                  <input type="hidden" name="system_id" value={selectedSystemId} />
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="test_run_id" value={runFilter.id} />

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="grid gap-1 sm:col-span-2">
                      <label className="text-sm font-medium" htmlFor={`filter-location-${runFilter.id}`}>
                        Filter Location / Description
                      </label>
                      <input
                        id={`filter-location-${runFilter.id}`}
                        name="filter_location_description"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runFilter.data?.filter_location_description ?? ""}
                        placeholder="Return grille, filter cabinet, etc."
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`filter-rack-${runFilter.id}`}>
                        Rack Type
                      </label>
                      <input
                        id={`filter-rack-${runFilter.id}`}
                        name="rack_type"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runFilter.data?.rack_type ?? ""}
                        placeholder="1-inch throwaway, media cabinet, etc."
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`filter-airflow-${runFilter.id}`}>
                        Design Airflow CFM
                      </label>
                      <input
                        id={`filter-airflow-${runFilter.id}`}
                        name="design_airflow_cfm"
                        type="number"
                        step="0.01"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runFilter.data?.design_airflow_cfm ?? ""}
                        placeholder="Required for completion"
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`filter-depth-${runFilter.id}`}>
                        Nominal Depth, inches
                      </label>
                      <input
                        id={`filter-depth-${runFilter.id}`}
                        name="nominal_depth_inches"
                        type="number"
                        step="0.01"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runFilter.data?.nominal_depth_inches ?? ""}
                        placeholder="Required for completion"
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`filter-length-${runFilter.id}`}>
                        Nominal Length, inches
                      </label>
                      <input
                        id={`filter-length-${runFilter.id}`}
                        name="nominal_length_inches"
                        type="number"
                        step="0.01"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runFilter.data?.nominal_length_inches ?? ""}
                        placeholder="Required for completion"
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`filter-width-${runFilter.id}`}>
                        Nominal Width, inches
                      </label>
                      <input
                        id={`filter-width-${runFilter.id}`}
                        name="nominal_width_inches"
                        type="number"
                        step="0.01"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runFilter.data?.nominal_width_inches ?? ""}
                        placeholder="Required for completion"
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`filter-drop-${runFilter.id}`}>
                        Design Allowable Pressure Drop, inches W.C.
                      </label>
                      <input
                        id={`filter-drop-${runFilter.id}`}
                        name="design_allowable_pressure_drop_iwc"
                        type="number"
                        step="0.01"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runFilter.data?.design_allowable_pressure_drop_iwc ?? ""}
                      />
                    </div>

                    <div className="grid gap-1 sm:col-span-2">
                      <label className="text-sm font-medium" htmlFor={`filter-notes-${runFilter.id}`}>
                        Notes (optional)
                      </label>
                      <input
                        id={`filter-notes-${runFilter.id}`}
                        name="notes"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runFilter.data?.notes ?? ""}
                        placeholder="Optional diagnostic notes"
                      />
                    </div>
                  </div>
                </form>

                <EccLivePreview mode="air_filter_device" formId={filterSaveFormId} projectType={job.project_type} />

                <div className="text-sm font-semibold text-slate-900">Calculated / Result</div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <div>Calculated Face Area: {formatAreaSquareInches(runFilter.computed?.calculated_nominal_face_area_sq_in ?? null)} in²</div>
                  <div>Required Minimum Face Area: {formatAreaSquareInches(runFilter.computed?.required_minimum_face_area_sq_in ?? null)} in²</div>
                  <div>
                    Face Area Compliance: {String(runFilter.computed?.face_area_compliance ?? "pending")
                      .replaceAll("_", " ")
                      .replace(/\b\w/g, (m) => m.toUpperCase())}
                  </div>
                  <div>Compliance Statement: {fallbackText(runFilter.computed?.compliance_statement)}</div>
                </div>

                <div className={eccActionRowClass}>
                  <span className="text-sm font-medium text-emerald-700 flex items-center gap-2">
                    {runFilter.is_completed && "✅ Test completed"}
                  </span>
                  <SubmitButton
                    form={filterSaveFormId}
                    formNoValidate
                    loadingText="Saving..."
                    className={eccSecondaryButtonClass}
                  >
                    Save Draft
                  </SubmitButton>
                  <SubmitButton
                    form={filterSaveFormId}
                    loadingText="Saving & completing..."
                    formAction={saveAndCompleteAirFilterDeviceFromForm}
                    className={eccPrimaryButtonClass}
                  >
                    Complete Test
                  </SubmitButton>
                  <button
                    type="submit"
                    form={filterDeleteFormId}
                    className={eccSecondaryButtonClass}
                  >
                    Delete
                  </button>
                </div>

                <form id={filterDeleteFormId} action={deleteEccTestRunFromForm}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="test_run_id" value={runFilter.id} />
                </form>
              </>
            )}
          </div>
        ) : null}

        {/* =========================
            AHRI MATCHED SYSTEM VERIFICATION (OFFICE)
            ========================= */}
        {focusedType === "ahri_verification" ? (
          <div className={eccOfficeCardClass}>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="font-medium text-slate-900">AHRI Matched System Verification</div>
                <div className="mt-1 text-sm text-slate-700">Office verification workflow for AHRI listed matched equipment combination.</div>
                <div className="mt-1 text-sm">
                  <span className="font-medium">Status:</span>{" "}
                  {runAhri ? ahriStatusLabel(runAhri.data?.ahri_status) : "Not started"}
                </div>
              </div>
              <div className="min-h-5 shrink-0 text-xs text-muted-foreground sm:text-right">
                {runAhri?.updated_at ? new Date(runAhri.updated_at).toLocaleString() : null}
              </div>
            </div>

            <div className="rounded-md border border-sky-200 bg-white px-3 py-2 text-xs text-slate-700 space-y-1">
              <div>Use the captured equipment model numbers to confirm the installed combination is AHRI listed.</div>
              <div>Enter the AHRI certificate/reference number used for CHEERS.</div>
              <div>This is an office verification, not a field-measured test.</div>
            </div>

            {!runAhri ? (
              <form action={addEccTestRunFromForm} className="flex items-center gap-2">
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="system_id" value={selectedSystemId} />
                <input type="hidden" name="test_type" value="ahri_verification" />
                <SubmitButton loadingText="Creating..." className={eccPrimaryButtonClass}>
                  Create AHRI Verification Run
                </SubmitButton>
              </form>
            ) : (
              <>
                <div className="text-sm font-semibold text-slate-900">Office Verification Inputs</div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                  <div className="font-semibold text-slate-900">Equipment model readiness</div>
                  <div className="mt-1 grid gap-1">
                    {ahriModelReadinessRows.map((row) => (
                      <div key={row.label}>
                        {row.label}: <span className={row.value ? "text-slate-900" : "text-amber-700"}>{row.value || "Missing"}</span>
                      </div>
                    ))}
                  </div>
                  {ahriMissingModelRows.length > 0 ? (
                    <div className="mt-2 text-amber-700">
                      Missing model information may prevent AHRI verification.
                    </div>
                  ) : (
                    <div className="mt-2 text-emerald-700">All tracked model fields are captured.</div>
                  )}
                </div>
                <form id={ahriSaveFormId} action={saveAhriVerificationDataFromForm} className="grid gap-3 border-t pt-3">
                  <input type="hidden" name="system_id" value={selectedSystemId} />
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="test_run_id" value={runAhri.id} />

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`ahri-status-${runAhri.id}`}>
                        AHRI Verification Status
                      </label>
                      <select
                        id={`ahri-status-${runAhri.id}`}
                        name="ahri_status"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runAhri.data?.ahri_status ?? "not_started"}
                      >
                        <option value="not_started">Not Started</option>
                        <option value="verified_listed">Verified / Listed</option>
                        <option value="not_found">Not Found</option>
                        <option value="needs_model_correction">Needs Model Correction</option>
                        <option value="not_applicable">Not Applicable</option>
                      </select>
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`ahri-cert-${runAhri.id}`}>
                        AHRI Certificate / Reference Number
                      </label>
                      <input
                        id={`ahri-cert-${runAhri.id}`}
                        name="ahri_certificate_number"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runAhri.data?.ahri_certificate_number ?? ""}
                        placeholder="Required when status is Verified / Listed"
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`ahri-verified-by-${runAhri.id}`}>
                        Verified By
                      </label>
                      <input
                        id={`ahri-verified-by-${runAhri.id}`}
                        name="verified_by_name"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runAhri.data?.verified_by_name ?? ""}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`ahri-verified-at-${runAhri.id}`}>
                        Verified Date
                      </label>
                      <input
                        id={`ahri-verified-at-${runAhri.id}`}
                        name="verified_at"
                        type="date"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runAhri.data?.verified_at ?? ""}
                      />
                    </div>

                    <div className="grid gap-1 sm:col-span-2">
                      <label className="text-sm font-medium" htmlFor={`ahri-summary-${runAhri.id}`}>
                        Matched Equipment Summary
                      </label>
                      <input
                        id={`ahri-summary-${runAhri.id}`}
                        name="matched_equipment_summary"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runAhri.data?.matched_equipment_summary ?? ""}
                        placeholder="Outdoor + Indoor + Furnace/Air Handler combination summary"
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`ahri-outdoor-${runAhri.id}`}>
                        Outdoor Model
                      </label>
                      <input
                        id={`ahri-outdoor-${runAhri.id}`}
                        name="outdoor_model"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runAhri.data?.outdoor_model ?? outdoorModelForAhri}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`ahri-indoor-coil-${runAhri.id}`}>
                        Indoor Coil Model
                      </label>
                      <input
                        id={`ahri-indoor-coil-${runAhri.id}`}
                        name="indoor_coil_model"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runAhri.data?.indoor_coil_model ?? indoorCoilModelForAhri}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`ahri-furnace-airhandler-${runAhri.id}`}>
                        Furnace / Air Handler Model
                      </label>
                      <input
                        id={`ahri-furnace-airhandler-${runAhri.id}`}
                        name="furnace_or_air_handler_model"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runAhri.data?.furnace_or_air_handler_model ?? furnaceOrAirHandlerModelForAhri}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`ahri-mini-outdoor-${runAhri.id}`}>
                        Mini-Split Outdoor Model
                      </label>
                      <input
                        id={`ahri-mini-outdoor-${runAhri.id}`}
                        name="mini_split_outdoor_model"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runAhri.data?.mini_split_outdoor_model ?? miniSplitOutdoorModelForAhri}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`ahri-mini-head-${runAhri.id}`}>
                        Mini-Split Indoor Head Model
                      </label>
                      <input
                        id={`ahri-mini-head-${runAhri.id}`}
                        name="mini_split_head_model"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runAhri.data?.mini_split_head_model ?? miniSplitHeadModelForAhri}
                      />
                    </div>

                    <div className="grid gap-1 sm:col-span-2">
                      <label className="text-sm font-medium" htmlFor={`ahri-notes-${runAhri.id}`}>
                        Verification Notes
                      </label>
                      <textarea
                        id={`ahri-notes-${runAhri.id}`}
                        name="verification_notes"
                        rows={3}
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runAhri.data?.verification_notes ?? ""}
                      />
                    </div>
                  </div>
                </form>

                <div className="text-sm font-semibold text-slate-900">Office Summary</div>
                <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <div>Status: {ahriStatusLabel(runAhri.data?.ahri_status)}</div>
                  <div>AHRI Certificate / Reference Number: {fallbackText(runAhri.data?.ahri_certificate_number)}</div>
                  <div>Verified By: {fallbackText(runAhri.data?.verified_by_name)}</div>
                  <div>Verified Date: {fallbackText(runAhri.data?.verified_at)}</div>
                  <div>Missing Model Fields: {Array.isArray(runAhri.computed?.missing_equipment_model_fields) && runAhri.computed?.missing_equipment_model_fields.length > 0 ? runAhri.computed.missing_equipment_model_fields.join(", ") : "None"}</div>
                  <div>Compliance Statement: {fallbackText(runAhri.computed?.compliance_statement)}</div>
                </div>

                <div className={eccActionRowClass}>
                  <span className="text-sm font-medium text-emerald-700 flex items-center gap-2">
                    {runAhri.is_completed && "✅ Verification completed"}
                  </span>
                  <SubmitButton
                    form={ahriSaveFormId}
                    formNoValidate
                    loadingText="Saving..."
                    className={eccSecondaryButtonClass}
                  >
                    Save Draft
                  </SubmitButton>
                  <SubmitButton
                    form={ahriSaveFormId}
                    loadingText="Saving & completing..."
                    formAction={saveAndCompleteAhriVerificationFromForm}
                    className={eccPrimaryButtonClass}
                  >
                    Complete Verification
                  </SubmitButton>
                  <button
                    type="submit"
                    form={ahriDeleteFormId}
                    className={eccSecondaryButtonClass}
                  >
                    Delete
                  </button>
                </div>

                <form id={ahriDeleteFormId} action={deleteEccTestRunFromForm}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="test_run_id" value={runAhri.id} />
                </form>
              </>
            )}
          </div>
        ) : null}

        {/* =========================
            LOCAL MECHANICAL EXHAUST VERIFICATION
            ========================= */}
        {focusedType === "local_mechanical_exhaust" ? (
          <div className={eccWorkspaceCardClass}>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="font-medium">Local Mechanical Exhaust Verification</div>
                <div className="mt-1 text-sm text-slate-700">
                  Use this when the project requires local mechanical exhaust documentation, such as kitchen exhaust system data.
                </div>
                <div className="mt-1 text-sm">
                  <span className="font-medium">Result:</span>{" "}
                  {runLocalExhaust ? getEffectiveResultLabel(runLocalExhaust) : "Not started"}
                </div>
              </div>
              <div className="min-h-5 shrink-0 text-xs text-muted-foreground sm:text-right">
                {runLocalExhaust?.updated_at ? new Date(runLocalExhaust.updated_at).toLocaleString() : null}
              </div>
            </div>

            {!runLocalExhaust ? (
              <form action={addEccTestRunFromForm} className="flex items-center gap-2">
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="system_id" value={selectedSystemId} />
                <input type="hidden" name="test_type" value="local_mechanical_exhaust" />
                <SubmitButton loadingText="Creating..." className={eccPrimaryButtonClass}>
                  Create Local Mechanical Exhaust Run
                </SubmitButton>
              </form>
            ) : (
              <>
                <div className="text-sm font-semibold text-slate-900">Structured Documentation Inputs</div>
                <form id={localExhaustSaveFormId} action={saveLocalMechanicalExhaustDataFromForm} className="grid gap-4 border-t pt-3">
                  <input type="hidden" name="system_id" value={selectedSystemId} />
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="test_run_id" value={runLocalExhaust.id} />

                  {/* Field Capture Section */}
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                    <div className="mb-1 text-sm font-semibold text-slate-950">Field Capture</div>
                    <div className="mb-3 text-xs text-slate-600">Kitchen and system details captured on-site during the visit.</div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="grid gap-1">
                        <label className="text-sm font-medium" htmlFor={`lme-building-type-${runLocalExhaust.id}`}>Building Type</label>
                        <input id={`lme-building-type-${runLocalExhaust.id}`} name="building_type" className="w-full rounded-md border px-3 py-2" defaultValue={runLocalExhaust.data?.building_type ?? ""} />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium" htmlFor={`lme-kitchen-area-${runLocalExhaust.id}`}>Total Kitchen Floor Area</label>
                        <input id={`lme-kitchen-area-${runLocalExhaust.id}`} name="total_kitchen_floor_area" type="number" step="0.1" className="w-full rounded-md border px-3 py-2" defaultValue={runLocalExhaust.data?.total_kitchen_floor_area ?? ""} />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium" htmlFor={`lme-ceiling-height-${runLocalExhaust.id}`}>Kitchen Average Ceiling Height</label>
                        <input id={`lme-ceiling-height-${runLocalExhaust.id}`} name="kitchen_average_ceiling_height" type="number" step="0.1" className="w-full rounded-md border px-3 py-2" defaultValue={runLocalExhaust.data?.kitchen_average_ceiling_height ?? ""} />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium" htmlFor={`lme-kitchen-type-${runLocalExhaust.id}`}>Kitchen Type</label>
                        <input id={`lme-kitchen-type-${runLocalExhaust.id}`} name="kitchen_type" className="w-full rounded-md border px-3 py-2" defaultValue={runLocalExhaust.data?.kitchen_type ?? ""} placeholder="Non-Enclosed" />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium" htmlFor={`lme-system-name-${runLocalExhaust.id}`}>System Name / Location</label>
                        <input id={`lme-system-name-${runLocalExhaust.id}`} name="system_name" className="w-full rounded-md border px-3 py-2" defaultValue={runLocalExhaust.data?.system_name ?? ""} />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium" htmlFor={`lme-manufacturer-${runLocalExhaust.id}`}>Manufacturer Name</label>
                        <input id={`lme-manufacturer-${runLocalExhaust.id}`} name="manufacturer_name" className="w-full rounded-md border px-3 py-2" defaultValue={runLocalExhaust.data?.manufacturer_name ?? ""} />
                      </div>
                      <div className="grid gap-1 sm:col-span-2">
                        <label className="text-sm font-medium" htmlFor={`lme-system-type-${runLocalExhaust.id}`}>System Type</label>
                        <input id={`lme-system-type-${runLocalExhaust.id}`} name="system_type" className="w-full rounded-md border px-3 py-2" defaultValue={runLocalExhaust.data?.system_type ?? ""} />
                      </div>
                    </div>
                  </div>

                  {/* HVI/AHAM Directory Research Section */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="mb-1 text-sm font-semibold text-slate-950">HVI/AHAM Directory Research</div>
                    <div className="mb-3 text-xs text-slate-600">Entered after HVI/AHAM directory or online verification. These values are not field measured.</div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="grid gap-1">
                        <label className="text-sm font-medium" htmlFor={`lme-model-${runLocalExhaust.id}`}>Directory Listed Model Number</label>
                        <input id={`lme-model-${runLocalExhaust.id}`} name="hvi_aham_model_number" className="w-full rounded-md border px-3 py-2" defaultValue={runLocalExhaust.data?.hvi_aham_model_number ?? ""} />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium" htmlFor={`lme-rated-airflow-${runLocalExhaust.id}`}>Directory Listed Rated Airflow (CFM)</label>
                        <input id={`lme-rated-airflow-${runLocalExhaust.id}`} name="hvi_aham_rated_airflow_cfm" type="number" step="1" className="w-full rounded-md border px-3 py-2" defaultValue={runLocalExhaust.data?.hvi_aham_rated_airflow_cfm ?? ""} />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium" htmlFor={`lme-sound-${runLocalExhaust.id}`}>Directory Listed Sound Rating</label>
                        <input id={`lme-sound-${runLocalExhaust.id}`} name="hvi_aham_sound_rating" className="w-full rounded-md border px-3 py-2" defaultValue={runLocalExhaust.data?.hvi_aham_sound_rating ?? ""} />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium" htmlFor={`lme-min-airflow-${runLocalExhaust.id}`}>Minimum Airflow (CFM)</label>
                        <input id={`lme-min-airflow-${runLocalExhaust.id}`} name="minimum_airflow_cfm" type="number" step="1" className="w-full rounded-md border px-3 py-2" defaultValue={runLocalExhaust.data?.minimum_airflow_cfm ?? ""} />
                      </div>
                    </div>
                  </div>

                  {/* Additional Notes Section */}
                  <div className="grid gap-3">
                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`lme-schedule-${runLocalExhaust.id}`}>Operation Schedule</label>
                      <input id={`lme-schedule-${runLocalExhaust.id}`} name="operation_schedule" className="w-full rounded-md border px-3 py-2" defaultValue={runLocalExhaust.data?.operation_schedule ?? ""} />
                    </div>
                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`lme-notes-${runLocalExhaust.id}`}>Notes</label>
                      <textarea id={`lme-notes-${runLocalExhaust.id}`} name="notes" rows={3} className="w-full rounded-md border px-3 py-2" defaultValue={runLocalExhaust.data?.notes ?? ""} />
                    </div>
                  </div>
                </form>

                <div className="text-sm font-semibold text-slate-900">Summary</div>
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  <div>
                    <div className="font-medium text-slate-900">Field Capture:</div>
                    <div className="ml-2 space-y-1">
                      <div>System Name: {fallbackText(runLocalExhaust.data?.system_name)}</div>
                      <div>Manufacturer: {fallbackText(runLocalExhaust.data?.manufacturer_name)}</div>
                      <div>System Type: {fallbackText(runLocalExhaust.data?.system_type)}</div>
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-slate-900">Directory Research:</div>
                    <div className="ml-2 space-y-1">
                      <div>HVI/AHAM Model Number: {fallbackText(runLocalExhaust.data?.hvi_aham_model_number)}</div>
                      <div>HVI/AHAM Rated Airflow: {fmtValue(runLocalExhaust.data?.hvi_aham_rated_airflow_cfm, "CFM")}</div>
                      <div>Minimum Airflow: {fmtValue(runLocalExhaust.data?.minimum_airflow_cfm, "CFM")}</div>
                      <div>Airflow Compliance Statement: {fallbackText(runLocalExhaust.computed?.airflow_compliance_statement)}</div>
                    </div>
                  </div>
                </div>

                <div className={eccActionRowClass}>
                  <span className="text-sm font-medium text-emerald-700 flex items-center gap-2">
                    {runLocalExhaust.is_completed && "✅ Verification completed"}
                  </span>
                  <SubmitButton
                    form={localExhaustSaveFormId}
                    formNoValidate
                    loadingText="Saving..."
                    className={eccSecondaryButtonClass}
                  >
                    Save Draft
                  </SubmitButton>
                  <SubmitButton
                    form={localExhaustSaveFormId}
                    loadingText="Saving & completing..."
                    formAction={saveAndCompleteLocalMechanicalExhaustFromForm}
                    className={eccPrimaryButtonClass}
                  >
                    Complete Verification
                  </SubmitButton>
                  <button
                    type="submit"
                    form={localExhaustDeleteFormId}
                    className={eccSecondaryButtonClass}
                  >
                    Delete
                  </button>
                </div>

                <form id={localExhaustDeleteFormId} action={deleteEccTestRunFromForm}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="test_run_id" value={runLocalExhaust.id} />
                </form>
              </>
            )}
          </div>
        ) : null}

        {/* =========================
            QII / ENV-22 INSULATION VERIFICATION
            ========================= */}
        {focusedType === "qii_insulation" ? (
          <div className={eccWorkspaceCardClass}>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="font-medium">QII / ENV-22 Insulation Verification</div>
                <div className="mt-1 text-sm text-slate-700">
                  Document each insulation location and verification outcome using ENV-22 field checks.
                </div>
                <div className="mt-1 text-sm">
                  <span className="font-medium">Result:</span>{" "}
                  {runQiiInsulation ? getEffectiveResultLabel(runQiiInsulation) : "Not started"}
                </div>
              </div>
              <div className="min-h-5 shrink-0 text-xs text-muted-foreground sm:text-right">
                {runQiiInsulation?.updated_at ? new Date(runQiiInsulation.updated_at).toLocaleString() : null}
              </div>
            </div>

            {!runQiiInsulation ? (
              <form action={addEccTestRunFromForm} className="flex items-center gap-2">
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="system_id" value={selectedSystemId} />
                <input type="hidden" name="test_type" value="qii_insulation" />
                <SubmitButton loadingText="Creating..." className={eccPrimaryButtonClass}>
                  Create QII / ENV-22 Run
                </SubmitButton>
              </form>
            ) : (
              <>
                <div className="text-sm font-semibold text-slate-900">Top-Level Verification Inputs</div>
                <form id={qiiSaveFormId} action={saveQiiEnv22InsulationDataFromForm} className="grid gap-3 border-t border-slate-200 pt-3">
                  <input type="hidden" name="system_id" value={selectedSystemId} />
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="test_run_id" value={runQiiInsulation.id} />

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="grid gap-1 sm:col-span-2">
                      <label className="text-sm font-medium" htmlFor={`qii-project-basis-${runQiiInsulation.id}`}>
                        Project Basis Note
                      </label>
                      <textarea
                        id={`qii-project-basis-${runQiiInsulation.id}`}
                        name="qii_project_basis_note"
                        rows={2}
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runQiiInsulation.data?.qii_project_basis_note ?? ""}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`qii-verified-by-${runQiiInsulation.id}`}>
                        Verified By
                      </label>
                      <input
                        id={`qii-verified-by-${runQiiInsulation.id}`}
                        name="verified_by_name"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runQiiInsulation.data?.verified_by_name ?? ""}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`qii-verified-at-${runQiiInsulation.id}`}>
                        Verified Date
                      </label>
                      <input
                        id={`qii-verified-at-${runQiiInsulation.id}`}
                        name="verified_at"
                        type="date"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runQiiInsulation.data?.verified_at ?? ""}
                      />
                    </div>

                    <div className="grid gap-1 sm:col-span-2">
                      <label className="text-sm font-medium" htmlFor={`qii-overall-status-${runQiiInsulation.id}`}>
                        Overall QII Status
                      </label>
                      <select
                        id={`qii-overall-status-${runQiiInsulation.id}`}
                        name="overall_qii_status"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runQiiInsulation.data?.overall_qii_status ?? "not_started"}
                      >
                        <option value="not_started">Not Started</option>
                        <option value="partial">Partial</option>
                        <option value="pass">Pass</option>
                        <option value="fail">Fail</option>
                        <option value="not_applicable">Not Applicable</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Insulation Entries</div>
                      <div className="mt-1 text-xs text-slate-500">Add each inspected location with status and correction notes where needed.</div>
                    </div>
                    {Array.from({ length: qiiRowCount }).map((_, rowIndex) => {
                      const row = qiiEntries[rowIndex] ?? {};
                      return (
                        <div key={`qii-row-${rowIndex}`} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="flex items-center justify-between gap-2">
                            <div className={eccUtilityLabelClass}>Entry {rowIndex + 1}</div>
                            <div className="text-xs font-medium text-slate-500">{qiiStatusLabel(row.verification_status)}</div>
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            <input name="insulation_location[]" className="w-full rounded-md border px-3 py-2" placeholder="Insulation location" defaultValue={row.insulation_location ?? ""} />
                            <input name="insulation_type[]" className="w-full rounded-md border px-3 py-2" placeholder="Insulation type" defaultValue={row.insulation_type ?? ""} />
                            <input name="insulation_brand[]" className="w-full rounded-md border px-3 py-2" placeholder="Brand" defaultValue={row.insulation_brand ?? ""} />
                            <input name="required_r_value[]" className="w-full rounded-md border px-3 py-2" placeholder="Required R-Value" defaultValue={row.required_r_value ?? ""} />
                            <input name="installed_r_value[]" className="w-full rounded-md border px-3 py-2" placeholder="Installed R-Value" defaultValue={row.installed_r_value ?? ""} />
                            <input name="required_depth[]" className="w-full rounded-md border px-3 py-2" placeholder="Required depth" defaultValue={row.required_depth ?? ""} />
                            <input name="observed_depth[]" className="w-full rounded-md border px-3 py-2" placeholder="Observed depth" defaultValue={row.observed_depth ?? ""} />
                            <input name="depth_unit[]" className="w-full rounded-md border px-3 py-2" placeholder="Depth unit" defaultValue={row.depth_unit ?? "in"} />

                            <select name="manufacturer_label_provided[]" className="w-full rounded-md border px-3 py-2" defaultValue={row.manufacturer_label_provided ?? "unknown"}>
                              <option value="unknown">Manufacturer label provided?</option>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>

                            <select name="loose_fill_coverage_chart_confirmed[]" className="w-full rounded-md border px-3 py-2" defaultValue={row.loose_fill_coverage_chart_confirmed ?? "unknown"}>
                              <option value="unknown">Coverage chart confirmed?</option>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>

                            <select name="loose_fill_density_verified[]" className="w-full rounded-md border px-3 py-2" defaultValue={row.loose_fill_density_verified ?? "unknown"}>
                              <option value="unknown">Loose-fill density verified?</option>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>

                            <input name="loose_fill_depth_locations_checked[]" className="w-full rounded-md border px-3 py-2" placeholder="Loose-fill depth locations checked" defaultValue={row.loose_fill_depth_locations_checked ?? ""} />

                            <select name="loose_fill_attic_rulers_installed[]" className="w-full rounded-md border px-3 py-2" defaultValue={row.loose_fill_attic_rulers_installed ?? "unknown"}>
                              <option value="unknown">Attic rulers installed?</option>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>

                            <select name="verification_status[]" className="w-full rounded-md border px-3 py-2" defaultValue={row.verification_status ?? "not_started"}>
                              <option value="not_started">Verification status</option>
                              <option value="pass">Pass</option>
                              <option value="fail">Fail</option>
                              <option value="needs_correction">Needs Correction</option>
                              <option value="not_applicable">Not Applicable</option>
                            </select>

                            <textarea name="correction_notes[]" rows={2} className="w-full rounded-md border px-3 py-2 sm:col-span-2 lg:col-span-3" placeholder="Correction notes (required when status is fail or needs correction)" defaultValue={row.correction_notes ?? ""} />
                            <textarea name="entry_notes[]" rows={2} className="w-full rounded-md border px-3 py-2 sm:col-span-2 lg:col-span-3" placeholder="Entry notes" defaultValue={row.entry_notes ?? ""} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid gap-1">
                    <label className="text-sm font-medium" htmlFor={`qii-general-notes-${runQiiInsulation.id}`}>
                      General Notes
                    </label>
                    <textarea
                      id={`qii-general-notes-${runQiiInsulation.id}`}
                      name="general_notes"
                      rows={3}
                      className="w-full rounded-md border px-3 py-2"
                      defaultValue={runQiiInsulation.data?.general_notes ?? ""}
                    />
                  </div>
                </form>

                <div className="text-sm font-semibold text-slate-900">QII Summary</div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 space-y-1">
                  <div>Overall QII Status: {qiiStatusLabel(runQiiInsulation.data?.overall_qii_status)}</div>
                  <div>Entry Count: {fmtValue(runQiiInsulation.computed?.entry_count)}</div>
                  <div>Compliance Statement: {fallbackText(runQiiInsulation.computed?.compliance_statement)}</div>
                  <div>
                    Failed Locations: {Array.isArray(runQiiInsulation.computed?.failed_locations) && runQiiInsulation.computed.failed_locations.length > 0 ? runQiiInsulation.computed.failed_locations.join(", ") : "None"}
                  </div>
                </div>

                {qiiEntries.length > 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 space-y-2">
                    {qiiEntries.map((entry: any, index: number) => (
                      <div key={`qii-summary-entry-${index}`} className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                        <div className="font-medium text-slate-900">{index + 1}. {fallbackText(entry?.insulation_location)}</div>
                        <div className="mt-1 text-xs text-slate-600">
                          {fallbackText(entry?.insulation_type)} &middot; Status: {qiiStatusLabel(entry?.verification_status)} &middot; Label: {qiiYesNoLabel(entry?.manufacturer_label_provided)} &middot; Coverage Chart: {qiiYesNoLabel(entry?.loose_fill_coverage_chart_confirmed)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className={eccActionRowClass}>
                  <span className="text-sm font-medium text-emerald-700 flex items-center gap-2">
                    {runQiiInsulation.is_completed && "✅ Verification completed"}
                  </span>
                  <SubmitButton
                    form={qiiSaveFormId}
                    formNoValidate
                    loadingText="Saving..."
                    className={eccSecondaryButtonClass}
                  >
                    Save Draft
                  </SubmitButton>
                  <SubmitButton
                    form={qiiSaveFormId}
                    loadingText="Saving & completing..."
                    formAction={saveAndCompleteQiiEnv22InsulationFromForm}
                    className={eccPrimaryButtonClass}
                  >
                    Complete Verification
                  </SubmitButton>
                  <button
                    type="submit"
                    form={qiiDeleteFormId}
                    className={eccSecondaryButtonClass}
                  >
                    Delete
                  </button>
                </div>

                <form id={qiiDeleteFormId} action={deleteEccTestRunFromForm}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="test_run_id" value={runQiiInsulation.id} />
                </form>
              </>
            )}
          </div>
        ) : null}

        {/* =========================
            REFRIGERANT CHARGE
            ========================= */}
        {focusedType === "refrigerant_charge" ? (
          <div className={eccWorkspaceCardClass}>
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
                  <SubmitButton loadingText="Creating..." className={eccPrimaryButtonClass}>
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
                  {runRC.data?.verification_method === "photo_taken" ? (
                    <>
                      <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                        <div className="font-medium">Photo Taken</div>
                        <div className="mt-1 text-xs">User confirmed gauge photo was captured. Numeric readings not entered.</div>
                        {runRC.data?.photo_taken_timestamp && (
                          <div className="mt-1 text-xs">
                            Attested: {new Date(runRC.data.photo_taken_timestamp).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div>Measured Subcool: {fmtValue(runRC.computed?.measured_subcool_f, "°F")}</div>
                      <div>Measured Superheat: {fmtValue(runRC.computed?.measured_superheat_f, "°F")}</div>
                    </>
                  )}
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
                  <div className="text-xs text-slate-600">
                    Select an option, then use Save Draft or Complete Test.
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      form={rcSaveFormId}
                      type="checkbox"
                      name="rc_photo_taken"
                      defaultChecked={runRC.data?.verification_method === "photo_taken"}
                    />
                    Photo Taken — user attests gauge photo was captured
                  </label>

                  <label className="flex items-center gap-2 text-sm mt-2">
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
                    <label className="block text-xs mb-1">Notes/details (optional)</label>
                    <input
                      form={rcSaveFormId}
                      name="rc_override_details"
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      defaultValue={runRC.data?.charge_exempt_details ?? ""}
                      placeholder='Example: "Photo shows both gauges stable" or "Outdoor temp 48°F"'
                    />
                  </div>
                </div>

                <div className={eccActionRowClass}>
                  <span className="text-sm font-medium text-emerald-700 flex items-center gap-2">
                    {runRC.is_completed && "✅ Test completed"}
                  </span>
                  <SubmitButton
                    form={rcSaveFormId}
                    loadingText="Saving..."
                    className={eccSecondaryButtonClass}
                  >
                    Save Draft
                  </SubmitButton>
                  <SubmitButton
                    form={rcSaveFormId}
                    formAction={saveAndCompleteRefrigerantChargeFromForm}
                    loadingText="Saving & completing..."
                    className={eccPrimaryButtonClass}
                  >
                    Complete Test
                  </SubmitButton>
                  <form action={deleteEccTestRunFromForm}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="test_run_id" value={runRC.id} />
                    <button type="submit" className={eccSecondaryButtonClass}>
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
