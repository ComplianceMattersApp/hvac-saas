import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { markRefrigerantChargeExemptFromForm } from "@/lib/actions/job-actions";

import {
  completeEccTestRunFromForm,
  addEccTestRunFromForm,
  deleteEccTestRunFromForm,
  saveDuctLeakageDataFromForm,
  saveAirflowDataFromForm,
  saveRefrigerantChargeDataFromForm,
  saveEccTestOverrideFromForm,
} from "@/lib/actions/job-actions";

function getEffectiveResultLabel(t: any) {
  if (t.override_pass === true) return "PASS (override)";
  if (t.override_pass === false) return "FAIL (override)";
  if (t.computed?.status === "blocked") return "BLOCKED (conditions)";
  if (t.computed_pass === true) return "PASS";
  if (t.computed_pass === false) return "FAIL";
  return "Not computed";
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

export default async function JobTestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ t?: string; s?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};

  const focused = String(sp.t ?? "").trim();
  const selectedSystemIdFromQuery = String(sp.s ?? "").trim();

  type FocusedType = "refrigerant_charge" | "airflow" | "duct_leakage" | "custom" | "";
  const focusedType: FocusedType =
    focused === "refrigerant_charge" ||
    focused === "airflow" ||
    focused === "duct_leakage" ||
    focused === "custom"
      ? (focused as FocusedType)
      : "";

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

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-gray-600">Job Tests</div>
          <h1 className="text-xl font-semibold">{job.title}</h1>
          <div className="text-sm text-gray-600">{job.city ?? "—"}</div>
        </div>

        <Link href={`/jobs/${job.id}`} className="px-3 py-2 rounded border text-sm">
          ← Back to Job
        </Link>
      </div>

      <section className="rounded-lg border p-4 space-y-4">
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
                  <option value="duct_leakage">Duct Leakage</option>
                  <option value="airflow">Airflow</option>
                  <option value="refrigerant_charge">Refrigerant Charge</option>
                  <option value="custom">Custom (notes only)</option>
                </select>
              </div>

              <button type="submit" className="w-fit rounded-md bg-black px-4 py-2 text-white">
                Add Test
              </button>
            </form>
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
                    Max Allowed: {runDL.computed?.max_leakage_cfm ?? "—"} CFM{" "}
                    {runDL.computed?.max_cfm_per_ton ? `(at ${runDL.computed.max_cfm_per_ton} CFM/ton max)` : ""}
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
                        System Tonnage
                      </label>
                      <input
                        id={`dl-ton-${runDL.id}`}
                        name="tonnage"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runDL.data?.tonnage ?? ""}
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
                      <label className="text-sm font-medium" htmlFor={`af-ton-${runAF.id}`}>
                        System Tonnage
                      </label>
                      <input
                        id={`af-ton-${runAF.id}`}
                        name="tonnage"
                        type="number"
                        step="0.1"
                        className="w-full rounded-md border px-3 py-2"
                        defaultValue={runAF.data?.tonnage ?? ""}
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
