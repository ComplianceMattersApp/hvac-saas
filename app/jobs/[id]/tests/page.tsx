import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

import {
  completeEccTestRunFromForm,
  addAlterationCoreTestsFromForm,
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


export default async function JobTestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const focused = sp.t ?? "";
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
      ecc_test_runs (
        id,
        test_type,
        data,
        computed,
        computed_pass,
        override_pass,
        override_reason,
        created_at,
        updated_at
      )
    `
    )
    .eq("id", id)
    .single();

  if (error || !job) return notFound();

  const focusedType =
    focused === "refrigerant_charge" ||
    focused === "airflow" ||
    focused === "duct_leakage"
      ? focused
      : null;

  const runsToShow = focusedType
    ? (job.ecc_test_runs ?? []).filter((r: any) => r.test_type === focusedType)
    : [];

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



        <section className="rounded-lg border p-4">
  <h2 className="text-lg font-semibold">ECC Tests</h2>
  <p className="text-sm text-muted-foreground">
    Tests can be captured in any order. Results will compute from entered data, with optional override later.
  </p>

  {/* Which tests apply */}
  <div className="mt-4 rounded-md border p-3">
    <div className="text-sm font-medium">Applies to this job</div>

    {job.project_type === "alteration" ? (
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li>Duct Leakage (10% / 400 CFM per ton basis)</li>
        <li>Airflow (300 CFM per ton minimum)</li>
        <li>Refrigerant Charge (target subcool based)</li>
      </ul>
    ) : (
      <div className="mt-2 text-sm text-muted-foreground">
        All New: tests vary by job. You’ll select which tests to capture in the next step.
      </div>
    )}
  </div>

  {/* Add tests */}

  <div className="rounded-lg border bg-white p-4 space-y-3">
  <div className="text-sm font-semibold">Test Hub</div>

  {job.project_type === "alteration" ? (
    <div className="grid gap-2">
      <Link
  href={
    focused === "refrigerant_charge"
      ? `/jobs/${job.id}/tests`
      : `/jobs/${job.id}/tests?t=refrigerant_charge`
  }
  className={`w-full px-4 py-3 rounded text-center ${
    focused === "refrigerant_charge"
      ? "bg-blue-800 text-white"
      : "bg-blue-600 text-white"
  }`}
>
  Refrigerant Charge
</Link>

      <Link
  href={
    focused === "airflow"
      ? `/jobs/${job.id}/tests`
      : `/jobs/${job.id}/tests?t=airflow`
  }
  className={`w-full px-4 py-3 rounded text-center ${
    focused === "airflow"
      ? "bg-blue-800 text-white"
      : "bg-blue-600 text-white"
  }`}
>
  Airflow
</Link>

      <Link
  href={
    focused === "duct_leakage"
      ? `/jobs/${job.id}/tests`
      : `/jobs/${job.id}/tests?t=duct_leakage`
  }
  className={`w-full px-4 py-3 rounded text-center ${
    focused === "duct_leakage"
      ? "bg-blue-800 text-white"
      : "bg-blue-600 text-white"
  }`}
>
  Duct Leakage
</Link>


     <Link
  href={
    focused === "custom"
      ? `/jobs/${job.id}/tests`
      : `/jobs/${job.id}/tests?t=custom`
  }
  className={`w-full px-4 py-3 rounded text-center ${
    focused === "custom"
      ? "border bg-gray-200 text-gray-900"
      : "border text-center"
  }`}
>
  Custom / Other Tests
</Link>

    </div>
  ) : (
    <div className="grid gap-2">
      <Link
        href={`/jobs/${job.id}/tests?t=custom`}
        className="w-full px-4 py-3 rounded bg-blue-600 text-white text-center"
      >
        Select Tests
      </Link>
    </div>
  )}
</div>

{focused === "custom" ? (
<form className="mt-4 grid gap-3">
  <input type="hidden" name="job_id" value={job.id} />

  {job.project_type === "alteration" ? (
    <button
      type="submit"
      formAction={addAlterationCoreTestsFromForm}
      className="w-fit rounded-md border px-4 py-2 text-sm"
    >
      Add Alteration Core Tests
    </button>
  ) : null}

  <div className="grid gap-1">
    <label className="text-sm font-medium" htmlFor="test_type">
      Add a test
    </label>

    

    <select
      id="test_type"
      name="test_type"
      className="rounded-md border px-3 py-2"
      defaultValue=""
    >
      <option value="" disabled>
        Select test…
      </option>

      {/* Alteration core */}
      <option value="refrigerant_charge">Refrigerant Charge</option>
      <option value="airflow">Airflow</option>
      <option value="duct_leakage">Duct Leakage</option>
      <option value="whole_house_fan">Whole House Fan</option>
      <option value="mch_26">MCH 26</option>
    </select>
  </div>

  <button
    type="submit"
    formAction={addEccTestRunFromForm}
    className="w-fit rounded-md bg-black px-4 py-2 text-white"
  >
    Add Test
  </button>
</form>
) : null}

  <div className="mt-6 space-y-3">
    {runsToShow.length > 0 ? (
  runsToShow.map((t: any) => (

        <div key={t.id} className="rounded-md border p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium">
                {(t.test_type || "test").replaceAll("_", " ")}
              </div>

              <form action={saveEccTestOverrideFromForm} className="mt-3 grid gap-3 border-t pt-3">
  <input type="hidden" name="job_id" value={job.id} />
  <input type="hidden" name="test_run_id" value={t.id} />

  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <div className="grid gap-1">
      <label className="text-sm font-medium" htmlFor={`ovr-${t.id}`}>
        Manual Override
      </label>
      <select
        id={`ovr-${t.id}`}
        name="override"
        className="w-full rounded-md border px-3 py-2"
          defaultValue={
    t.override_pass === true ? "pass" : t.override_pass === false ? "fail" : "none"
  }
>

  defaultValue={
    t.override_pass === true ? "pass" : t.override_pass === false ? "fail" : "none"
  }

        <option value="none">None</option>
        <option value="pass">Override PASS</option>
        <option value="fail">Override FAIL</option>
      </select>
    </div>

    <div className="grid gap-1">
      <label className="text-sm font-medium" htmlFor={`ovr-reason-${t.id}`}>
        Override Reason (required if override set)
      </label>
      <input
        id={`ovr-reason-${t.id}`}
        name="override_reason"
        className="w-full rounded-md border px-3 py-2"
        defaultValue={t.override_reason ?? ""}
        placeholder="Explain why you're overriding the computed result..."
      />
    </div>
  </div>

  <button type="submit" className="w-fit rounded-md bg-black px-4 py-2 text-white">
    Save Override
  </button>
</form>

{t.test_type === "duct_leakage" ? (
  <div className="mt-3 border-t pt-3">
    <div className="text-sm text-muted-foreground">
      <div>
        Max Allowed: {t.computed?.max_leakage_cfm ?? "—"} CFM{" "}
        {t.computed?.max_cfm_per_ton ? `(at ${t.computed.max_cfm_per_ton} CFM/ton max)` : ""}
      </div>
      <div>Measured: {t.data?.measured_duct_leakage_cfm ?? "—"} CFM</div>

      {t.computed?.failures?.length ? (
        <div className="mt-2">
          <div className="font-medium">Failures</div>
          <ul className="list-disc pl-5">
            {t.computed.failures.map((f: string, i: number) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {t.computed?.warnings?.length ? (
        <div className="mt-2">
          <div className="font-medium">Missing / Warnings</div>
          <ul className="list-disc pl-5">
            {t.computed.warnings.map((w: string, i: number) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>

    <form action={saveDuctLeakageDataFromForm} className="mt-3 grid gap-3">
      <input type="hidden" name="job_id" value={job.id} />
      <input type="hidden" name="test_run_id" value={t.id} />
      <input type="hidden" name="project_type" value={job.project_type} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor={`dl-ton-${t.id}`}>
            System Tonnage
          </label>
          <input
            id={`dl-ton-${t.id}`}
            name="tonnage"
            type="number"
            step="0.1"
            className="w-full rounded-md border px-3 py-2"
            defaultValue={t.data?.tonnage ?? ""}
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor={`dl-meas-${t.id}`}>
            Measured Duct Leakage (CFM)
          </label>
          <input
            id={`dl-meas-${t.id}`}
            name="measured_duct_leakage_cfm"
            type="number"
            step="1"
            className="w-full rounded-md border px-3 py-2"
            defaultValue={t.data?.measured_duct_leakage_cfm ?? ""}
          />
        </div>

        <div className="grid gap-1 sm:col-span-2">
          <label className="text-sm font-medium" htmlFor={`dl-notes-${t.id}`}>
            Notes (optional)
          </label>
          <input
            id={`dl-notes-${t.id}`}
            name="notes"
            className="w-full rounded-md border px-3 py-2"
            defaultValue={t.data?.notes ?? ""}
          />
        </div>
      </div>

      <button type="submit" className="w-fit rounded-md bg-black px-4 py-2 text-white">
        Save Duct Leakage
      </button>
 </form>

<form action={completeEccTestRunFromForm} className="mt-2">
  <input type="hidden" name="job_id" value={job.id} />
  <input type="hidden" name="test_run_id" value={t.id} />
  <button type="submit" className="px-3 py-2 rounded border text-sm">
    Complete Duct Leakage Test
  </button>
</form>
</div>
) : null}




<div key={t.id} className="rounded-md border p-3">
  {/* Header row */}
  <div className="flex items-start justify-between gap-3">
    <div>
      <div className="font-medium">
        {(t.test_type || "test").replaceAll("_", " ")}
      </div>




      <div className="mt-1 text-sm text-muted-foreground">
        Computed:{" "}
        {t.computed_pass === true
          ? "PASS"
          : t.computed_pass === false
          ? "FAIL"
          : "Not computed"}
      </div>

      <div className="text-sm text-muted-foreground">
        Override:{" "}
        {t.override_pass === true
          ? "PASS"
          : t.override_pass === false
          ? "FAIL"
          : "None"}
      </div>
    </div>

    <div className="mt-1 text-sm">
  <span className="font-medium">Result:</span> {getEffectiveResultLabel(t)}


</div>


    <div className="flex items-center gap-2">
      <div className="text-xs text-muted-foreground">
        {t.updated_at ? new Date(t.updated_at).toLocaleString() : null}
      </div>

      {/* Delete is its own tiny form (ONLY the button) */}
      <form action={deleteEccTestRunFromForm}>
        <input type="hidden" name="job_id" value={job.id} />
        <input type="hidden" name="test_run_id" value={t.id} />
        <button type="submit" className="rounded-md border px-3 py-1 text-sm">
          Delete
        </button>
      </form>
    </div>
  </div>

  {/* Computed details (you already added) */}
  {t.test_type === "refrigerant_charge" ? (
    <div className="mt-2 text-sm text-muted-foreground">
      <div>
        Measured Subcool: {t.computed?.measured_subcool_f ?? "—"} °F
      </div>
      <div>Measured Superheat: {t.computed?.measured_superheat_f ?? "—"} °F</div>
    </div>
  ) : null}


</div>

{t.test_type === "airflow" ? (
  <div className="mt-3 border-t pt-3">
    <div className="text-sm text-muted-foreground">
      <div>
        Required: {t.computed?.required_total_cfm ?? "—"} CFM{" "}
        {t.computed?.cfm_per_ton_required
          ? `(at ${t.computed.cfm_per_ton_required} CFM/ton)`
          : ""}
      </div>
      <div>Measured: {t.data?.measured_total_cfm ?? "—"} CFM</div>

      {t.computed?.failures?.length ? (
        <div className="mt-2">
          <div className="font-medium">Failures</div>
          <ul className="list-disc pl-5">
            {t.computed.failures.map((f: string, i: number) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {t.computed?.warnings?.length ? (
        <div className="mt-2">
          <div className="font-medium">Missing / Warnings</div>
          <ul className="list-disc pl-5">
            {t.computed.warnings.map((w: string, i: number) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>

    <form action={saveAirflowDataFromForm} className="mt-3 grid gap-3">
      <input type="hidden" name="job_id" value={job.id} />
      <input type="hidden" name="test_run_id" value={t.id} />
      <input type="hidden" name="project_type" value={job.project_type} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor={`ton-${t.id}`}>
            System Tonnage
          </label>
          <input
            id={`ton-${t.id}`}
            name="tonnage"
            type="number"
            step="0.1"
            className="w-full rounded-md border px-3 py-2"
            defaultValue={t.data?.tonnage ?? ""}
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor={`cfm-${t.id}`}>
            Measured Total Airflow (CFM)
          </label>
          <input
            id={`cfm-${t.id}`}
            name="measured_total_cfm"
            type="number"
            step="1"
            className="w-full rounded-md border px-3 py-2"
            defaultValue={t.data?.measured_total_cfm ?? ""}
          />
        </div>

        <div className="grid gap-1 sm:col-span-2">
          <label className="text-sm font-medium" htmlFor={`air-notes-${t.id}`}>
            Notes (optional)
          </label>
          <input
            id={`air-notes-${t.id}`}
            name="notes"
            className="w-full rounded-md border px-3 py-2"
            defaultValue={t.data?.notes ?? ""}
          />
        </div>
      </div>

      <button
        type="submit"
        className="w-fit rounded-md bg-black px-4 py-2 text-white"
      >
        Save Airflow
      </button>
    </form>

    <form action={completeEccTestRunFromForm} className="mt-2">
      <input type="hidden" name="job_id" value={job.id} />
      <input type="hidden" name="test_run_id" value={t.id} />
      <button
        type="submit"
        className="px-3 py-2 rounded border text-sm"
        disabled={t.is_completed}
      >
        {t.is_completed ? "Completed ✅" : "Complete Airflow Test"}
      </button>
    </form>
  </div>
) : null}



  {/* ✅ Refrigerant Charge entry form goes HERE (separate form, not nested) */}
{t.test_type === "refrigerant_charge" ? (
  <div className="mt-3 border-t pt-3">
    <form action={saveRefrigerantChargeDataFromForm} className="grid gap-3">
      <input type="hidden" name="job_id" value={job.id} />
      <input type="hidden" name="test_run_id" value={t.id} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor={`lrdb-${t.id}`}>
            Lowest Return Air Dry Bulb (°F)
          </label>
          <input
            id={`lrdb-${t.id}`}
            name="lowest_return_air_db_f"
            type="number"
            step="0.1"
            className="w-full rounded-md border px-3 py-2"
            defaultValue={t.data?.lowest_return_air_db_f ?? ""}
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor={`tcondb-${t.id}`}>
            Condenser Air Entering DB (°F)
          </label>
          <input
            id={`tcondb-${t.id}`}
            name="condenser_air_entering_db_f"
            type="number"
            step="0.1"
            className="w-full rounded-md border px-3 py-2"
            defaultValue={t.data?.condenser_air_entering_db_f ?? ""}
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor={`out-${t.id}`}>
            Outdoor Temp (°F)
          </label>
          <input
            id={`out-${t.id}`}
            name="outdoor_temp_f"
            type="number"
            step="0.1"
            className="w-full rounded-md border px-3 py-2"
            defaultValue={t.data?.outdoor_temp_f ?? ""}
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor={`ref-${t.id}`}>
            Refrigerant Type
          </label>
          <select
            id={`ref-${t.id}`}
            name="refrigerant_type"
            className="w-full rounded-md border px-3 py-2"
            defaultValue={t.data?.refrigerant_type ?? ""}
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
          <label className="text-sm font-medium" htmlFor={`llt-${t.id}`}>
            Liquid Line Temp (°F)
          </label>
          <input
            id={`llt-${t.id}`}
            name="liquid_line_temp_f"
            type="number"
            step="0.1"
            className="w-full rounded-md border px-3 py-2"
            defaultValue={t.data?.liquid_line_temp_f ?? ""}
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor={`llp-${t.id}`}>
            Liquid Line Pressure (psig)
          </label>
          <input
            id={`llp-${t.id}`}
            name="liquid_line_pressure_psig"
            type="number"
            step="0.1"
            className="w-full rounded-md border px-3 py-2"
            defaultValue={t.data?.liquid_line_pressure_psig ?? ""}
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor={`tcsat-${t.id}`}>
            Condenser Saturation Temp (°F)
          </label>
          <input
            id={`tcsat-${t.id}`}
            name="condenser_sat_temp_f"
            type="number"
            step="0.1"
            className="w-full rounded-md border px-3 py-2"
            defaultValue={t.data?.condenser_sat_temp_f ?? ""}
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor={`tsc-${t.id}`}>
            Target Subcool (°F)
          </label>
          <input
            id={`tsc-${t.id}`}
            name="target_subcool_f"
            type="number"
            step="0.1"
            className="w-full rounded-md border px-3 py-2"
            defaultValue={t.data?.target_subcool_f ?? ""}
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor={`suctt-${t.id}`}>
            Suction Line Temp (°F)
          </label>
          <input
            id={`suctt-${t.id}`}
            name="suction_line_temp_f"
            type="number"
            step="0.1"
            className="w-full rounded-md border px-3 py-2"
            defaultValue={t.data?.suction_line_temp_f ?? ""}
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor={`suctp-${t.id}`}>
            Suction Line Pressure (psig)
          </label>
          <input
            id={`suctp-${t.id}`}
            name="suction_line_pressure_psig"
            type="number"
            step="0.1"
            className="w-full rounded-md border px-3 py-2"
            defaultValue={t.data?.suction_line_pressure_psig ?? ""}
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor={`tesat-${t.id}`}>
            Evaporator Saturation Temp (°F)
          </label>
          <input
            id={`tesat-${t.id}`}
            name="evaporator_sat_temp_f"
            type="number"
            step="0.1"
            className="w-full rounded-md border px-3 py-2"
            defaultValue={t.data?.evaporator_sat_temp_f ?? ""}
          />
        </div>

        <div className="flex items-center gap-2 sm:col-span-2">
          <input
            id={`fd-${t.id}`}
            name="filter_drier_installed"
            type="checkbox"
            defaultChecked={!!t.data?.filter_drier_installed}
          />
          <label className="text-sm font-medium" htmlFor={`fd-${t.id}`}>
            Filter drier installed
          </label>
        </div>

        <div className="grid gap-1 sm:col-span-2">
          <label className="text-sm font-medium" htmlFor={`notes-${t.id}`}>
            Notes (optional)
          </label>
          <input
            id={`notes-${t.id}`}
            name="notes"
            className="w-full rounded-md border px-3 py-2"
            defaultValue={t.data?.notes ?? ""}
          />
        </div>
      </div>

      <button
        type="submit"
        className="w-fit rounded-md bg-black px-4 py-2 text-white"
      >
        Save Refrigerant Charge Readings
      </button>
    </form>

    <form action={completeEccTestRunFromForm} className="mt-2">
      <input type="hidden" name="job_id" value={job.id} />
      <input type="hidden" name="test_run_id" value={t.id} />
      <button
        type="submit"
        className="px-3 py-2 rounded border text-sm"
        disabled={t.is_completed}
      >
        {t.is_completed ? "Completed ✅" : "Complete Refrigerant Charge Test"}
      </button>
    </form>
  </div>
) : null}




<form action={deleteEccTestRunFromForm}>
  <input type="hidden" name="job_id" value={job.id} />
  <input type="hidden" name="test_run_id" value={t.id} />
  <button type="submit" className="rounded-md border px-3 py-1 text-sm">
    Delete
  </button>
</form>

              <div className="mt-1 text-sm text-muted-foreground">
                Computed:{" "}
                {t.computed_pass === true
                  ? "PASS"
                  : t.computed_pass === false
                  ? "FAIL"
                  : "Not computed"}
              </div>

              <div className="text-sm text-muted-foreground">
                Override:{" "}
                {t.override_pass === true
                  ? "PASS"
                  : t.override_pass === false
                  ? "FAIL"
                  : "None"}
              </div>

              {t.override_reason ? (
                <div className="mt-2 text-sm">
                  <span className="font-medium">Override reason:</span>{" "}
                  {t.override_reason}
                </div>
              ) : null}
            </div>

            {t.test_type === "refrigerant_charge" ? (
  <div className="mt-2 text-sm text-muted-foreground">
    <div>
      Measured Subcool: {t.computed?.measured_subcool_f ?? "—"} °F
      {t.computed?.subcool_delta_f != null ? ` (Δ ${t.computed.subcool_delta_f}°F)` : ""}
    </div>
    <div>Measured Superheat: {t.computed?.measured_superheat_f ?? "—"} °F</div>

{t.computed?.blocked?.length ? (
  <div className="mt-2">
    <div className="font-medium">Blocked</div>
    <ul className="list-disc pl-5">
      {t.computed.blocked.map((b: string, i: number) => (
        <li key={i}>{b}</li>
      ))}
    </ul>
  </div>
) : null}


    {t.computed?.failures?.length ? (
      <div className="mt-2">
        <div className="font-medium">Failures</div>
        <ul className="list-disc pl-5">
          {t.computed.failures.map((f: string, i: number) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      </div>
    ) : null}

    {t.computed?.warnings?.length ? (
      <div className="mt-2">
        <div className="font-medium">Missing / Warnings</div>
        <ul className="list-disc pl-5">
          {t.computed.warnings.map((w: string, i: number) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      </div>
    ) : null}
  </div>
) : null}


            <div className="text-xs text-muted-foreground">
              {t.updated_at ? new Date(t.updated_at).toLocaleString() : null}
            </div>
          </div>
        </div>
      ))
   ) : focusedType ? (
  <div className="text-sm text-gray-600">
    No {focusedType.replaceAll("_", " ")} test run exists yet.
    Use Custom / Other Tests to add it.
  </div>
) : (
  <div className="text-sm text-gray-600">
    Choose a test above to begin.
  </div>
)}

  </div>
</section>
    </div>
  );
}
