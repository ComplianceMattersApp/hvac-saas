import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SystemLocationPicker from "@/components/jobs/SystemLocationPicker";

import {
  addJobEquipmentFromForm,
  deleteJobEquipmentFromForm,
} from "@/lib/actions/job-actions";

export default async function JobInfoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ f?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const focused = sp.f ?? "";

  const supabase = await createClient();

const { data: job, error } = await supabase
  .from("jobs")
  .select(
    `
    id,
    title,
    city,
    job_equipment (
      id,
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
    )
  `
  )
  .eq("id", id)
  .single();

if (error || !job) return notFound();


  const { data: systems, error: systemsErr } = await supabase
    .from("job_systems")
    .select("id, name")
    .eq("job_id", id)
    .order("name", { ascending: true });

  if (systemsErr) throw systemsErr;

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-gray-600">Capture Info</div>
          <h1 className="text-xl font-semibold">{job.title}</h1>
          <div className="text-sm text-gray-600">{job.city ?? "—"}</div>
        </div>

        <Link href={`/jobs/${job.id}`} className="px-3 py-2 rounded border text-sm">
          ← Back to Job
        </Link>
      </div>

      {/* Hub */}
      {!focused ? (
  <div className="rounded-lg border bg-white p-4 space-y-3">
    <div className="text-sm font-semibold">Info Hub</div>

    <div className="grid gap-2">
      <Link
        href={`/jobs/${job.id}/info?f=equipment`}
        className="w-full px-4 py-3 rounded bg-blue-600 text-white text-center"
      >
        Equipment
      </Link>
    </div>
  </div>
) : null}


addJobEquipmentFromForm

      {/* Focused content */}
      {focused === "equipment" ? (
        <div className="rounded-lg border bg-white p-4 space-y-4">
          <div className="text-base font-semibold text-gray-900 border-b pb-2">
  Equipment
</div>

{/* Existing Equipment */}
<div>

  <div className="text-base font-semibold text-gray-900 mb-2">
    Existing Equipment ({job.job_equipment?.length ?? 0})
  </div>

  {job.job_equipment && job.job_equipment.length > 0 ? (
    <div className="space-y-2">
      {job.job_equipment.map((eq: any) => (
        <div key={eq.id} className="rounded-md border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="font-medium text-gray-900">
                {(eq.equipment_role ?? "equipment").replaceAll("_", " ")}
              </div>
<label className="text-sm font-medium" htmlFor="system_location">
  System Location (optional)
</label>
<input
  id="system_location"
  name="system_location"
  className="w-full rounded-md border px-3 py-2"
  defaultValue={eq?.system_location ?? ""}
/>

{eq.system_location ? (
  <div className="text-sm text-muted-foreground">
    Location: {eq.system_location ?? "—"}
  </div>
) : null}


              <div className="text-sm text-gray-700">
                {[eq.manufacturer, eq.model].filter(Boolean).join(" ") || "—"}
              </div>

              <div className="text-xs text-gray-600">
                {eq.serial ? `S/N: ${eq.serial}` : null}
                {eq.serial && (eq.tonnage || eq.refrigerant_type) ? " • " : null}
                {eq.tonnage ? `${eq.tonnage} ton` : null}
                {eq.tonnage && eq.refrigerant_type ? " • " : null}
                {eq.refrigerant_type ? eq.refrigerant_type : null}
              </div>

              {eq.notes ? (
                <div className="text-xs text-gray-600">Notes: {eq.notes}</div>
              ) : null}
            </div>

            <form action={deleteJobEquipmentFromForm}>
              <input type="hidden" name="job_id" value={job.id} />
              <input type="hidden" name="equipment_id" value={eq.id} />
              <button
                type="submit"
                className="px-3 py-2 rounded border text-sm hover:bg-gray-50"
              >
                Delete
              </button>
            </form>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div className="text-sm text-gray-600">No equipment added yet.</div>
  )}
</div>
          
{/* Add Equipment */}
  <form action={addJobEquipmentFromForm} className="mt-4 grid gap-3">
    <input type="hidden" name="job_id" value={job.id} />
    <div className="grid gap-1">
       <label className="text-sm font-medium text-gray-900" htmlFor="equipment_role">
        Equipment Role
      </label>
      <select
        id="equipment_role"
        name="equipment_role"
        className="w-full rounded-md border px-3 py-2 text-gray-900"
        defaultValue="outdoor_unit"
        required
      >
        <option value="outdoor_unit">Outdoor Unit</option>
        <option value="indoor_unit">Coil</option>
        <option value="air_handler">Air Handler</option>
        <option value="furnace">Furnace</option>
        <option value="heat_pump">Heat Pump</option>
        <option value="other">Pack Unit</option>
        <option value="other">Other</option>
      </select>
    </div>
     
     <SystemLocationPicker systems={systems ?? []} />


 
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="grid gap-1">
         <label className="text-sm font-medium text-gray-900" htmlFor="manufacturer">
          Manufacturer (optional)
        </label>
        <input
          id="manufacturer"
          name="manufacturer"
          className="w-full rounded-md border px-3 py-2 text-gray-900"
          placeholder="York"
        />
      </div>

      <div className="grid gap-1">
        <label className="text-sm font-medium text-gray-900" htmlFor="model">
          Model (optional)
        </label>
        <input
          id="model"
          name="model"
          className="w-full rounded-md border px-3 py-2 text-gray-900"
          placeholder="Model #"
        />
      </div>

      <div className="grid gap-1">
        <label className="text-sm font-medium text-gray-900" htmlFor="serial">
          Serial (optional)
        </label>
        <input
          id="serial"
          name="serial"
          className="w-full rounded-md border px-3 py-2 text-gray-900"
          placeholder="Serial #"
        />
      </div>

      <div className="grid gap-1">
        <label className="text-sm font-medium text-gray-900" htmlFor="tonnage">
          Tonnage (optional)
        </label>
        <input
          id="tonnage"
          name="tonnage"
          type="number"
          step="0.5"
          min="0"
          className="w-full rounded-md border px-3 py-2 text-gray-900"
          placeholder="5"
        />
      </div>

<div className="grid gap-1">
  <label className="text-sm font-medium text-gray-900" htmlFor="refrigerant_type">
    Refrigerant Type (optional)
  </label>
  <select
    id="refrigerant_type"
    name="refrigerant_type"
    className="w-full rounded-md border px-3 py-2 text-gray-900"
    defaultValue=""
  >
    <option value="">Select refrigerant</option>
    <option value="R-410A">R-410A</option>
    <option value="R-32">R-32</option>
    <option value="R-454B">R-454B</option>
    <option value="R-22">R-22</option>
    <option value="Other">Other</option>
  </select>
</div>


      <div className="grid gap-1 sm:col-span-2">
        <label className="text-sm font-medium text-gray-900" htmlFor="notes">
          Notes (optional)
        </label>
        <input
          id="notes"
          name="notes"
          className="w-full rounded-md border px-3 py-2 text-gray-900"
          placeholder="Any extra details..."
        />
      </div>
    </div>

    <button type="submit" className="w-fit rounded-md bg-black px-4 py-2 text-white">
      Add Equipment
    </button>
  </form>
        </div>
      ) : (
        <div className="text-sm text-gray-600">Choose an option above to begin.</div>
      )}




    </div>
  );
}
