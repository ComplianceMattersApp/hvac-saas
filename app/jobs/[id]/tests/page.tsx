// app/jobs/[id]/tests/page
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { markRefrigerantChargeExemptFromForm } from "@/lib/actions/job-actions";
import { resolveEccScenario } from "@/lib/ecc/scenario-resolver";
import Link from "next/link";
import PrintButton from "@/components/ui/PrintButton";

import {
  completeEccTestRunFromForm,
  addEccTestRunFromForm,
  deleteEccTestRunFromForm,
  saveDuctLeakageDataFromForm,
  saveAirflowDataFromForm,
  saveRefrigerantChargeDataFromForm,
  saveEccTestOverrideFromForm,
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

function getEffectiveResultLabel(t: any) {
  if (t.override_pass === true) return "PASS (override)";
  if (t.override_pass === false) return "FAIL (override)";
  if (t.computed?.status === "blocked") return "BLOCKED (conditions)";
  if (t.computed_pass === true) return "PASS";
  if (t.computed_pass === false) return "FAIL";
  return "Not computed";
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

  if (!run) {
    return {
      state: "missing" as const,
      label: "Missing",
      tone: "border-red-200 bg-red-50 text-red-700",
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
      state: "incomplete" as const,
      label: "In progress",
      tone: "border-amber-200 bg-amber-50 text-amber-700",
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
  if (value == null || value === "") return "-";
  if (typeof value === "number") {
    const rendered = Number.isInteger(value) ? String(value) : value.toFixed(1);
    return unit ? `${rendered} ${unit}` : rendered;
  }
  const rendered = String(value).trim();
  if (!rendered) return "-";
  return unit ? `${rendered} ${unit}` : rendered;
}

function includesFailure(computed: any, needle: string) {
  const failures = Array.isArray(computed?.failures) ? computed.failures : [];
  return failures.some((f: any) => String(f ?? "").toLowerCase().includes(needle.toLowerCase()));
}

function includesBlocked(computed: any, needle: string) {
  const blocked = Array.isArray(computed?.blocked) ? computed.blocked : [];
  return blocked.some((b: any) => String(b ?? "").toLowerCase().includes(needle.toLowerCase()));
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

  const { data: job, error } = await supabase
    .from("jobs")
    .select(
      `
      id,
      title,
      city,
      job_type,
      project_type,
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

  const systems = job.job_systems ?? [];

  const selectedSystemId =
    selectedSystemIdFromQuery &&
    systems.some((sys: any) => String(sys.id) === String(selectedSystemIdFromQuery))
      ? selectedSystemIdFromQuery
      : systems.length
      ? String(systems[0].id)
      : "";

  const runDL = selectedSystemId ? pickRunForSystem(job, "duct_leakage", selectedSystemId) : null;
  const runAF = selectedSystemId ? pickRunForSystem(job, "airflow", selectedSystemId) : null;
  const runRC = selectedSystemId ? pickRunForSystem(job, "refrigerant_charge", selectedSystemId) : null;

  const normalizedProfile = normalizeProjectTypeToRuleProfile(job.project_type);
  const manualAddTests = getActiveManualAddTests();
  const allowedFocusedTypes = new Set<string>([
    ...manualAddTests.map((t) => String(t.code)),
    "custom",
  ]);
  const focusedType = allowedFocusedTypes.has(focused)
    ? (focused as EccTestType | "custom")
    : "";

  const selectedSystemEquipment = (job.job_equipment ?? []).filter(
  (eq: any) => String(eq.system_id ?? "") === String(selectedSystemId)
    );

  const scenarioResult = resolveEccScenario({
  projectType: job.project_type,
  systemEquipment: selectedSystemEquipment,
});

  const suggestedTests = scenarioResult.suggestedTests;
  const scenarioCode = scenarioResult.scenario;
  const scenarioNotes = scenarioResult.notes;
  const isPlanDrivenNewConstruction = scenarioCode === "new_construction_plan_driven";

     const requiredTests = suggestedTests
   .filter((t) => t.required)
    .map((t) => t.testType);

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

  const visibleTestTypes = Array.from(
    new Set([...(requiredTests as string[]), ...systemRunTestTypes])
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
  selectedSystemEquipment.find((eq: any) =>
    String(eq?.component_type ?? "").toLowerCase().startsWith("package")
  ) ??
  selectedSystemEquipment.find((eq: any) => eq.equipment_role === "condenser") ??
  selectedSystemEquipment.find((eq: any) => eq.equipment_role === "air_handler") ??
  selectedSystemEquipment.find((eq: any) => eq.equipment_role === "furnace") ??
  selectedSystemEquipment[0] ??
  null;

const defaultSystemTonnage =
  primaryEquipment?.tonnage != null && primaryEquipment?.tonnage !== ""
    ? primaryEquipment.tonnage
    : "";

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
    const systemId = String(sys.id ?? "");
    const systemEquipment = (job.job_equipment ?? []).filter(
      (eq: any) => String(eq.system_id ?? "") === systemId
    );

    const runAirflow = pickLatestRunForSystem(job, "airflow", systemId);
    const runDuct = pickLatestRunForSystem(job, "duct_leakage", systemId);
    const runRefrigerant = pickLatestRunForSystem(job, "refrigerant_charge", systemId);

    const outdoorEquipment = systemEquipment.filter((eq: any) => {
      const role = String(eq?.equipment_role ?? "").toLowerCase();
      const type = String(eq?.component_type ?? "").toLowerCase();
      return role === "condenser" || type.includes("outdoor") || type.includes("package");
    });

    const indoorEquipment = systemEquipment.filter((eq: any) => {
      const role = String(eq?.equipment_role ?? "").toLowerCase();
      const type = String(eq?.component_type ?? "").toLowerCase();
      return role === "air_handler" || role === "furnace" || role === "evaporator" || type.includes("indoor") || type.includes("coil");
    });

    return {
      systemId,
      systemName: String(sys.name ?? "System").trim() || "System",
      runAirflow,
      runDuct,
      runRefrigerant,
      indoorEquipment,
      outdoorEquipment,
    };
  });

    return (
      <div className="p-6 max-w-3xl space-y-4 print:max-w-none print:p-0">
          {notice === "rc_exempt_reason_required" && (
      <div className="mb-4 rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Select <span className="font-semibold">Package unit</span> or{" "}
        <span className="font-semibold">Conditions not met</span> before marking
        refrigerant charge exempt.
      </div>
    )}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div>
          <div className="text-sm text-gray-600">Job Tests</div>
          <h1 className="text-xl font-semibold">{job.title}</h1>
          <div className="text-sm text-gray-600">{job.city ?? "—"}</div>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`#cheers-fast-view`} className="px-3 py-2 rounded border text-sm font-medium bg-white hover:bg-gray-50">
            CHEERS Fast View
          </Link>
          <PrintButton className="px-3 py-2 rounded border text-sm font-medium bg-white hover:bg-gray-50" />
          <Link href={`/jobs/${job.id}`} className="px-3 py-2 rounded border text-sm">
            ← Back to Job
          </Link>
        </div>
      </div>

      <section id="cheers-fast-view" className="rounded-lg border p-4 space-y-4 bg-white print:border-0 print:p-0">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">CHEERS Fast View</h2>
            <p className="text-sm text-gray-600">Read-only summary from ECC canonical test data, grouped by system.</p>
          </div>
        </div>

        {systemSummaries.length === 0 ? (
          <div className="text-sm text-gray-600">No systems available yet.</div>
        ) : (
          <div className="space-y-4">
            {systemSummaries.map((sys) => {
              const rcData = sys.runRefrigerant?.data ?? {};
              const rcComputed = sys.runRefrigerant?.computed ?? {};

              return (
                <div key={sys.systemId} className="rounded-md border p-3 space-y-3">
                  <div className="text-sm font-semibold">{sys.systemName}</div>

                  <div className="grid gap-2 text-sm">
                    <div>
                      <span className="font-medium">Equipment Summary:</span>
                      <div className="mt-1 text-gray-700">
                        <div>
                          Indoor: {sys.indoorEquipment.length
                            ? sys.indoorEquipment.map((eq: any) => `${eq.model ?? "Unknown model"} (S/N ${eq.serial ?? "Unknown"})`).join("; ")
                            : "Not found"}
                        </div>
                        <div>
                          Outdoor: {sys.outdoorEquipment.length
                            ? sys.outdoorEquipment.map((eq: any) => `${eq.model ?? "Unknown model"} (S/N ${eq.serial ?? "Unknown"})`).join("; ")
                            : "Not found"}
                        </div>
                      </div>
                    </div>

                    <div>
                      <span className="font-medium">Airflow Result:</span>{" "}
                      {sys.runAirflow ? getEffectiveResultLabel(sys.runAirflow) : "No run"}
                    </div>

                    <div>
                      <span className="font-medium">Duct Leakage Result:</span>{" "}
                      {sys.runDuct ? getEffectiveResultLabel(sys.runDuct) : "No run"}
                    </div>
                  </div>

                  <div className="rounded-md border bg-gray-50 p-3 space-y-3">
                    <div className="text-sm font-semibold">Refrigerant Charge — Full Detailed Result</div>

                    {!sys.runRefrigerant ? (
                      <div className="text-sm text-gray-600">No refrigerant charge run found for this system.</div>
                    ) : (
                      <>
                        <div className="space-y-1 text-sm">
                          <div className="font-medium">F. Data Collection and Calculations</div>
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

                        <div className="space-y-1 text-sm">
                          <div className="font-medium">G. Metering Device Verification</div>
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

      <section className="rounded-lg border p-4 space-y-4 print:hidden">
        <div>
          <h2 className="text-lg font-semibold">ECC Tests</h2>
          <p className="text-sm text-muted-foreground">
            Capture tests in any order. “Save” stores readings; “Complete” locks the test for the visit workflow.
          </p>
        </div>

        {/* System selector */}
        <div className="rounded-lg border bg-white p-4 space-y-2">
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
  <div className="rounded-lg border bg-white p-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="text-sm font-semibold">Detected ECC Scenario</div>
        <div className="text-xs text-muted-foreground">
          Based on project type and equipment on this system
        </div>
      </div>

      <div className="rounded-full border px-2.5 py-1 text-xs font-medium bg-slate-50 text-slate-700">
        {scenarioCode.replaceAll("_", " ")}
      </div>
    </div>

    {scenarioNotes.length > 0 ? (
      <div className="grid gap-2">
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

    {suggestedTests.length > 0 ? (
      <div className="grid gap-2">
        {suggestedTests.map((rule) => (
          <div
            key={rule.testType}
            className="flex items-center justify-between rounded-md border px-3 py-2"
          >
            <div className="min-w-0">
              <div className="font-medium">{getTestDisplayLabel(rule.testType, packageSystem)}</div>
              <div className="text-xs text-muted-foreground">
                {rule.threshold
                  ? `${String(rule.threshold.operator).toUpperCase()} ${rule.threshold.value} ${rule.threshold.unit}`
                  : "Standard verification"}
              </div>
            </div>

            <div className="rounded-full border px-2.5 py-1 text-xs font-medium bg-slate-50 text-slate-700">
              Suggested
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        {isPlanDrivenNewConstruction
          ? "New Construction is currently plan-driven/custom. Add tests manually with Add Test."
          : "No standard ECC scenario detected yet for this system."}
      </div>
    )}
  </div>
  
) : null}


                {selectedSystemId ? (
          <div className="rounded-lg border bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Tests for this system</div>
                <div className="text-xs text-muted-foreground">
                  Default required tests plus manually added tests:{" "}
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
  const testHref = `/jobs/${job.id}/tests?s=${selectedSystemId}&t=${testType}`;

  return (
    <div
      key={testType}
      className="flex items-center justify-between rounded-md border px-3 py-2 gap-3"
    >
      <div className="min-w-0">
        <div className="font-medium">{getTestDisplayLabel(testType, packageSystem)}</div>
        <div className="text-xs text-muted-foreground">
          {status.state === "missing"
            ? "No run created yet"
            : status.state === "incomplete"
            ? "Run exists but is not completed"
            : "Tracked on this system"}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {status.state === "missing" ? (
          <form action={addEccTestRunFromForm}>
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="system_id" value={selectedSystemId} />
            <input type="hidden" name="test_type" value={testType} />
            <button
              type="submit"
              className="rounded-md border px-3 py-1.5 text-xs font-medium"
            >
              Add Run
            </button>
          </form>
        ) : (
          <Link
            href={testHref}
            className="rounded-md border px-3 py-1.5 text-xs font-medium"
          >
            Open Test
          </Link>
        )}

        <div
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${status.tone}`}
        >
          {status.label}
        </div>
      </div>
    </div>
  );
})}
              </div>
            )}
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

                  {manualAddTests.map((test) => (
                    <option key={test.code} value={test.code}>
                      {test.label}
                    </option>
                  ))}
                </select>
              </div>

              <button type="submit" className="w-fit rounded-md bg-black px-4 py-2 text-white">
                Add Test
              </button>
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
                <button className="rounded-md bg-black px-4 py-2 text-white text-sm" type="submit">
                  Create Run
                </button>
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
          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">Duct Leakage</div>
                <div className="mt-1 text-sm">
                  <span className="font-medium">Result:</span> {runDL ? getEffectiveResultLabel(runDL) : "Not started"}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {runDL?.updated_at ? new Date(runDL.updated_at).toLocaleString() : null}
              </div>
            </div>

            {!runDL ? (
              <form action={addEccTestRunFromForm} className="flex items-center gap-2">
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="system_id" value={selectedSystemId} />
                <input type="hidden" name="test_type" value="duct_leakage" />
                                
                <button className="rounded-md bg-black px-4 py-2 text-white text-sm" type="submit">
                  Create Duct Leakage Run
                </button>
              </form>
            ) : (
              <>
                <form action={saveEccTestOverrideFromForm} className="grid gap-3 border-t pt-3">
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="test_run_id" value={runDL.id} />
                    <input type="hidden" name="system_id" value={selectedSystemId} />
                    <input type="hidden" name="test_type" value="duct_leakage" />



                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                        placeholder="Explain why you're overriding the computed result..."
                      />
                    </div>
                  </div>

                  <button type="submit" className="w-fit rounded-md bg-black px-4 py-2 text-white">
                    Save Override
                  </button>
                </form>

                <div className="text-sm text-muted-foreground">
                  <div>
                    Max Allowed: {runDL.computed?.max_leakage_cfm ?? "—"} CFM
                    {runDL.computed?.leakage_percent_allowed_display != null &&
                    runDL.computed?.base_airflow_cfm != null
                      ? ` (at ${runDL.computed.leakage_percent_allowed_display}% of ${runDL.computed.base_airflow_cfm} CFM base airflow)`
                      : ""}
                  </div>
                  <div>Measured: {runDL.data?.measured_duct_leakage_cfm ?? "—"} CFM</div>
                </div>

                <form action={saveDuctLeakageDataFromForm} className="grid gap-3 border-t pt-3">
                  <input type="hidden" name="system_id" value={selectedSystemId} />
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="test_run_id" value={runDL.id} />
                  <input type="hidden" name="project_type" value={job.project_type} />

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`dl-ton-${runDL.id}`}>
                        System Tonnage (auto-filled from equipment if available)
                      </label>
                      <input
                        id={`dl-ton-${runDL.id}`}
                        name="tonnage"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runDL.data?.tonnage ?? defaultSystemTonnage}
                      />
                    </div>

                    <div className="grid gap-1">
                      <label className="text-sm font-medium" htmlFor={`dl-meas-${runDL.id}`}>
                        Measured Duct Leakage (CFM)
                      </label>
                      <input
                        id={`dl-meas-${runDL.id}`}
                        name="measured_duct_leakage_cfm"
                        type="number"
                        step="1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runDL.data?.measured_duct_leakage_cfm ?? ""}
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
                  </div>
   <div className="flex flex-wrap gap-2 items-center">
  {/* SAVE */}
  <button type="submit" className="w-fit rounded-md bg-black px-4 py-2 text-white">
    Save Duct Leakage
  </button>

  {/* COMPLETE — uses SAME form payload (includes tonnage/measured/notes) */}
  <button
    type="submit"
    formAction={completeEccTestRunFromForm}
    className="px-3 py-2 rounded border text-sm"
    disabled={!!runDL.is_completed}
  >
    {runDL.is_completed ? "Completed ✅" : "Complete Duct Leakage Test"}
  </button>
</div>
</form>

{/* DELETE stays separate */}
<form action={deleteEccTestRunFromForm}>
  <input type="hidden" name="job_id" value={job.id} />
  <input type="hidden" name="test_run_id" value={runDL.id} />
  <button type="submit" className="rounded-md border px-3 py-2 text-sm">
    Delete
  </button>
</form>

              </>
            )}
          </div>
        ) : null}

        {/* =========================
            AIRFLOW
            ========================= */}
        {focusedType === "airflow" ? (
          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">Airflow</div>
                <div className="mt-1 text-sm">
                  <span className="font-medium">Result:</span> {runAF ? getEffectiveResultLabel(runAF) : "Not started"}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {runAF?.updated_at ? new Date(runAF.updated_at).toLocaleString() : null}
              </div>
            </div>

            {!runAF ? (
              <form action={addEccTestRunFromForm} className="flex items-center gap-2">
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="system_id" value={selectedSystemId} />
                <input type="hidden" name="test_type" value="airflow" />
                <button className="rounded-md bg-black px-4 py-2 text-white text-sm" type="submit">
                  Create Airflow Run
                </button>
              </form>
            ) : (
              <>
              <form action={saveAirflowDataFromForm} className="grid gap-3 border-t pt-3">
                <input type="hidden" name="system_id" value={selectedSystemId} />
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="test_run_id" value={runAF.id} />
                <input type="hidden" name="project_type" value={job.project_type} />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <label className="text-sm font-medium" htmlFor={`dl-ton-${runDL.id}`}>
                      System Tonnage (auto-filled from equipment if available)
                    </label>
                    <input
                      id={`dl-ton-${runDL.id}`}
                      name="tonnage"
                      type="number"
                      step="0.1"
                      className="w-full rounded-md border px-3 py-2"
                      defaultValue={runDL.data?.tonnage ?? defaultSystemTonnage}
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

                <button type="submit" className="w-fit rounded-md bg-black px-4 py-2 text-white">
                  Save Airflow
                </button>
              </form>

                <div className="flex flex-wrap gap-2 items-center">
                  <form action={completeEccTestRunFromForm}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="test_run_id" value={runAF.id} />
                    <input type="hidden" name="system_id" value={selectedSystemId} />
                    <button type="submit" className="px-3 py-2 rounded border text-sm" disabled={!!runAF.is_completed}>
                      {runAF.is_completed ? "Completed ✅" : "Complete Airflow Test"}
                    </button>
                  </form>

                  <form action={deleteEccTestRunFromForm}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="test_run_id" value={runAF.id} />
                    <button type="submit" className="rounded-md border px-3 py-2 text-sm">
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
          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">Refrigerant Charge</div>
                <div className="mt-1 text-sm">
                  <span className="font-medium">Result:</span> {runRC ? getEffectiveResultLabel(runRC) : "Not started"}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {runRC?.updated_at ? new Date(runRC.updated_at).toLocaleString() : null}
              </div>
            </div>

            {!runRC ? (
              <form action={addEccTestRunFromForm} className="flex items-center gap-2">
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="system_id" value={selectedSystemId} />
                <input type="hidden" name="test_type" value="refrigerant_charge" />
                <button className="rounded-md bg-black px-4 py-2 text-white text-sm" type="submit">
                  Create Refrigerant Charge Run
                </button>
              </form>
            ) : (
              <>
                <form action={saveRefrigerantChargeDataFromForm} className="grid gap-3 border-t pt-3">
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

                  <button type="submit" className="w-fit rounded-md bg-black px-4 py-2 text-white">
                    Save Refrigerant Charge Readings
                  </button>
                </form>
                
                <form action={markRefrigerantChargeExemptFromForm} className="rounded-md border p-3 mt-3 sm:col-span-2">
  <input type="hidden" name="job_id" value={job.id} />
  <input type="hidden" name="test_run_id" value={runRC.id} />
  <input type="hidden" name="system_id" value={selectedSystemId} />

  <div className="text-sm font-semibold mb-2">Charge Verification Override (if applicable)</div>

  <label className="flex items-center gap-2 text-sm">
    <input
      type="checkbox"
      name="rc_exempt_package_unit"
      defaultChecked={runRC.data?.charge_exempt_reason === "package_unit"}
    />
    Package unit — charge verification not required
  </label>

  <label className="flex items-center gap-2 text-sm mt-2">
    <input
      type="checkbox"
      name="rc_exempt_conditions"
      defaultChecked={runRC.data?.charge_exempt_reason === "conditions_not_met"}
    />
    Conditions not met / weather — override charge verification
  </label>

  <div className="mt-2">
    <label className="block text-xs mb-1">Override details (optional)</label>
    <input
      name="rc_override_details"
      className="w-full rounded-md border px-3 py-2 text-sm"
      defaultValue={runRC.data?.charge_exempt_details ?? ""}
      placeholder='Example: "Outdoor temp 48°F" or "Rain / unsafe roof access"'
    />
  </div>

  <div className="mt-3">
    <button type="submit" className="rounded-md bg-black px-4 py-2 text-white text-sm">
      Mark Exempt (Pass)
    </button>
  </div>
</form>

                <div className="flex flex-wrap gap-2 items-center">
                  <form action={completeEccTestRunFromForm}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="test_run_id" value={runRC.id} />
                    <input type="hidden" name="system_id" value={selectedSystemId} />
                    <button type="submit" className="px-3 py-2 rounded border text-sm" disabled={!!runRC.is_completed}>
                      {runRC.is_completed ? "Completed ✅" : "Complete Refrigerant Charge Test"}
                    </button>
                  </form>

                  <form action={deleteEccTestRunFromForm}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="test_run_id" value={runRC.id} />
                    <button type="submit" className="rounded-md border px-3 py-2 text-sm">
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
