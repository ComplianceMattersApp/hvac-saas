

  import { createClient } from "@/lib/supabase/server";
  import { notFound } from "next/navigation";
  import {
    addJobEquipmentFromForm,
    deleteJobEquipmentFromForm,
    updateJobScheduleFromForm,
    advanceJobStatusFromForm,
    markJobFailedFromForm,
    updateJobCustomerFromForm,
    updateJobProfileFromForm,
    updateJobEquipmentFromForm,
    type JobStatus,
  } from "@/lib/actions/job-actions";

  function isoToDateInput(iso?: string | null) {
    if (!iso) return "";
    const d = new Date(iso);
    // scheduled_date is stored as noon Z, so this should be stable
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  }

  function isoToTimeInput(iso?: string | null) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toISOString().slice(11, 16); // HH:MM (UTC-based)
  }

  function formatStatus(status?: string | null) {
    const s = (status ?? "").toString();
    const map: Record<JobStatus, string> = {
      open: "Open",
      on_the_way: "On The Way",
      in_process: "In Process",
      completed: "Completed",
      failed: "Failed",
      cancelled: "Cancelled",
    };

    // If for any reason the DB has an unexpected string, show it as-is
    return (map as any)[s] ?? (s ? s : "—");
  }

  function nextStatusLabel(status?: string | null) {
    const s = (status ?? "open") as JobStatus;
    const nextMap: Record<JobStatus, string> = {
      open: "On The Way",
      on_the_way: "In Process",
      in_process: "Completed",
      completed: "Completed",
      failed: "Failed",
      cancelled: "Cancelled",
    };
    return nextMap[s] ?? "Next";
  }

  export default async function JobDetailPage({
    params,
  }: {
    params: Promise<{ id: string }>;
  }) {
    const { id } = await params;

    const supabase = await createClient();

const { data: job, error: jobError } = await supabase
  .from("jobs")
  .select(`
    job_type,
    project_type,
    id,
    title,
    city,
    status,
    scheduled_date,
    created_at,
    contractor_id,
    permit_number,
    window_start,
    window_end,
    customer_phone,
    on_the_way_at,
    customer_first_name,
    customer_last_name,
    customer_email,
    job_notes,
    job_equipment (
      id,
      equipment_role,
      manufacturer,
      model,
      serial,
      tonnage,
      refrigerant_type,
      notes,
      created_at,
      updated_at
    )
  `)
  .eq("id", id)
  .single();

      

    if (jobError || !job) return notFound();


    let contractorName: string | null = null;

    if (job.contractor_id) {
      const { data: contractor } = await supabase
        .from("contractors")
        .select("name")
        .eq("id", job.contractor_id)
        .single();

      contractorName = contractor?.name ?? null;
    }

    const scheduledDateValue = isoToDateInput(job.scheduled_date);
    const windowStartValue = isoToTimeInput(job.window_start);
    const windowEndValue = isoToTimeInput(job.window_end);

    const isTerminal =
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "cancelled";

    return (
      <div className="p-6 max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">{job.title}</h1>
          <p className="text-sm text-gray-600">{job.city ?? "No city set"}</p>
        </div>

        {/* Summary */}
        <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
          <div className="grid gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Status</span>
              <span className="font-medium">{formatStatus(job.status)}</span>
              {job.job_notes ? (
  <div className="mt-4 border-t pt-4">
    <div className="text-xs text-gray-600 mb-1">Job Notes</div>
    <div className="text-sm whitespace-pre-wrap">{job.job_notes}</div>
  </div>
) : null}

            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Arrival Window</span>
              <span className="font-medium">
                {job.window_start && job.window_end
                  ? `${new Date(job.window_start).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })} – ${new Date(job.window_end).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}`
                  : "—"}
              </span>
            </div>
          <div className="flex justify-between">
    <span className="text-gray-600">Customer Phone</span>
    <span className="font-medium">{job.customer_phone ?? "—"}</span>
  </div>

<div className="flex justify-between">
  <span className="text-gray-600">Customer Name</span>
  <span className="font-medium">
    {job.customer_first_name || job.customer_last_name
      ? `${job.customer_first_name ?? ""} ${job.customer_last_name ?? ""}`.trim()
      : "—"}
  </span>
</div>

<div className="flex justify-between">
  <span className="text-gray-600">Customer Email</span>
  <span className="font-medium">{job.customer_email ?? "—"}</span>
</div>

  <div className="flex justify-between">
    <span className="text-gray-600">On The Way At</span>
    <span className="font-medium">
      {job.on_the_way_at ? new Date(job.on_the_way_at).toLocaleString() : "—"}
    </span>
  </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Permit Number</span>
              <span className="font-medium">{job.permit_number ?? "—"}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Scheduled Date</span>
              <span className="font-medium">
                {job.scheduled_date
                  ? new Date(job.scheduled_date).toLocaleDateString()
                  : "—"}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Created</span>
              <span className="font-medium">
                {job.created_at ? new Date(job.created_at).toLocaleString() : "—"}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Contractor</span>
              <span className="font-medium">{contractorName ?? "—"}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Job ID</span>
              <span className="font-mono text-xs text-gray-700 break-all">
                {job.id}
              </span>
            </div>
          </div>
        </div>

      {/* Edit Customer + Notes */}
      <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
        <h2 className="text-sm font-semibold mb-3">Edit Customer + Notes</h2>

        <form action={updateJobCustomerFromForm} className="grid gap-4">
          <input type="hidden" name="id" value={job.id} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                First Name
              </label>
              <input
                type="text"
                name="customer_first_name"
                defaultValue={job.customer_first_name ?? ""}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Last Name
              </label>
              <input
                type="text"
                name="customer_last_name"
                defaultValue={job.customer_last_name ?? ""}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Email</label>
              <input
                type="email"
                name="customer_email"
                defaultValue={job.customer_email ?? ""}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">Phone</label>
              <input
                type="tel"
                name="customer_phone"
                defaultValue={job.customer_phone ?? ""}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Notes</label>
            <textarea
              name="job_notes"
              defaultValue={job.job_notes ?? ""}
              rows={4}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end">
            <button className="border rounded px-3 py-2 text-sm">
              Save Customer Info
            </button>
          </div>
        </form>
      </div>

      <section className="rounded-lg border p-4">
  <h2 className="text-lg font-semibold">Equipment</h2>
  <p className="text-sm text-muted-foreground">
    Add the equipment tied to this job. You can add multiple systems if needed.
  </p>

  {/* Add Equipment */}
  <form action={addJobEquipmentFromForm} className="mt-4 grid gap-3">
    <input type="hidden" name="job_id" value={job.id} />

    <div className="grid gap-1">
      <label className="text-sm font-medium" htmlFor="equipment_role">
        Equipment Role
      </label>
      <select
        id="equipment_role"
        name="equipment_role"
        className="w-full rounded-md border px-3 py-2"
        defaultValue="outdoor_unit"
        required
      >
        <option value="outdoor_unit">Outdoor Unit</option>
        <option value="indoor_unit">Indoor Unit / Coil</option>
        <option value="air_handler">Air Handler</option>
        <option value="furnace">Furnace</option>
        <option value="heat_pump">Heat Pump</option>
        <option value="other">Other</option>
      </select>
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor="manufacturer">
          Manufacturer (optional)
        </label>
        <input
          id="manufacturer"
          name="manufacturer"
          className="w-full rounded-md border px-3 py-2"
          placeholder="York"
        />
      </div>

      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor="model">
          Model (optional)
        </label>
        <input
          id="model"
          name="model"
          className="w-full rounded-md border px-3 py-2"
          placeholder="Model #"
        />
      </div>

      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor="serial">
          Serial (optional)
        </label>
        <input
          id="serial"
          name="serial"
          className="w-full rounded-md border px-3 py-2"
          placeholder="Serial #"
        />
      </div>

      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor="tonnage">
          Tonnage (optional)
        </label>
        <input
          id="tonnage"
          name="tonnage"
          type="number"
          step="0.5"
          min="0"
          className="w-full rounded-md border px-3 py-2"
          placeholder="5"
        />
      </div>

<div className="grid gap-1">
  <label className="text-sm font-medium" htmlFor="refrigerant_type">
    Refrigerant (optional)
  </label>
  <select
    id="refrigerant_type"
    name="refrigerant_type"
    className="w-full rounded-md border px-3 py-2"
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
        <label className="text-sm font-medium" htmlFor="notes">
          Notes (optional)
        </label>
        <input
          id="notes"
          name="notes"
          className="w-full rounded-md border px-3 py-2"
          placeholder="Any extra details..."
        />
      </div>
    </div>

    <button type="submit" className="w-fit rounded-md bg-black px-4 py-2 text-white">
      Add Equipment
    </button>
  </form>

  {/* Existing Equipment List */}
  <div className="mt-6 space-y-3">
    {job.job_equipment && job.job_equipment.length > 0 ? (
      job.job_equipment.map((eq: any) => (
        <div key={eq.id} className="rounded-md border p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium">
                {eq.equipment_role?.replaceAll("_", " ") || "equipment"}
              </div>
              <div className="text-sm text-muted-foreground">
                {[eq.manufacturer, eq.model].filter(Boolean).join(" ") || "No make/model yet"}
              </div>
              <div className="text-sm text-muted-foreground">
                {eq.tonnage ? `${eq.tonnage} ton` : null}
                {eq.tonnage && eq.refrigerant_type ? " • " : null}
                {eq.refrigerant_type || null}
              </div>
              {eq.serial ? (
                <div className="text-sm text-muted-foreground">Serial: {eq.serial}</div>
              ) : null}
              {eq.notes ? (
                <div className="mt-2 text-sm">{eq.notes}</div>
              ) : null}
            </div>
<form action={updateJobEquipmentFromForm} className="mt-3 grid gap-3 border-t pt-3">
  <input type="hidden" name="job_id" value={job.id} />
  <input type="hidden" name="equipment_id" value={eq.id} />

  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <div className="grid gap-1">
      <label className="text-sm font-medium" htmlFor={`role-${eq.id}`}>
        Equipment Role
      </label>
      <select
        id={`role-${eq.id}`}
        name="equipment_role"
        defaultValue={eq.equipment_role ?? "outdoor_unit"}
        className="w-full rounded-md border px-3 py-2"
        required
      >
        <option value="outdoor_unit">Outdoor Unit</option>
        <option value="indoor_unit">Indoor Unit / Coil</option>
        <option value="air_handler">Air Handler</option>
        <option value="furnace">Furnace</option>
        <option value="heat_pump">Heat Pump</option>
        <option value="other">Other</option>
      </select>
    </div>

    <div className="grid gap-1">
      <label className="text-sm font-medium" htmlFor={`mfr-${eq.id}`}>
        Manufacturer
      </label>
      <input
        id={`mfr-${eq.id}`}
        name="manufacturer"
        defaultValue={eq.manufacturer ?? ""}
        className="w-full rounded-md border px-3 py-2"
      />
    </div>

    <div className="grid gap-1">
      <label className="text-sm font-medium" htmlFor={`model-${eq.id}`}>
        Model
      </label>
      <input
        id={`model-${eq.id}`}
        name="model"
        defaultValue={eq.model ?? ""}
        className="w-full rounded-md border px-3 py-2"
      />
    </div>

    <div className="grid gap-1">
      <label className="text-sm font-medium" htmlFor={`serial-${eq.id}`}>
        Serial
      </label>
      <input
        id={`serial-${eq.id}`}
        name="serial"
        defaultValue={eq.serial ?? ""}
        className="w-full rounded-md border px-3 py-2"
      />
    </div>

    <div className="grid gap-1">
      <label className="text-sm font-medium" htmlFor={`ton-${eq.id}`}>
        Tonnage
      </label>
      <input
        id={`ton-${eq.id}`}
        name="tonnage"
        type="number"
        step="0.5"
        min="0"
        defaultValue={eq.tonnage ?? ""}
        className="w-full rounded-md border px-3 py-2"
      />
    </div>

    <div className="grid gap-1">
      <label className="text-sm font-medium" htmlFor={`ref-${eq.id}`}>
        Refrigerant
      </label>
      <select
        id={`ref-${eq.id}`}
        name="refrigerant_type"
        defaultValue={eq.refrigerant_type ?? ""}
        className="w-full rounded-md border px-3 py-2"
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
      <label className="text-sm font-medium" htmlFor={`notes-${eq.id}`}>
        Notes
      </label>
      <input
        id={`notes-${eq.id}`}
        name="notes"
        defaultValue={eq.notes ?? ""}
        className="w-full rounded-md border px-3 py-2"
      />
    </div>
  </div>

  <button type="submit" className="w-fit rounded-md bg-black px-4 py-2 text-white">
    Save Changes
  </button>
</form>

            <form action={deleteJobEquipmentFromForm}>
              <input type="hidden" name="job_id" value={job.id} />
              <input type="hidden" name="equipment_id" value={eq.id} />
              <button
                type="submit"
                className="rounded-md border px-3 py-1 text-sm"
              >
                Delete
              </button>
            </form>
          </div>
        </div>
      ))
    ) : (
      <div className="rounded-md border p-3 text-sm text-muted-foreground">
        No equipment added yet.
      </div>
    )}
  </div>
</section>


      <section className="rounded-lg border p-4">
  <h2 className="text-lg font-semibold">ECC Profile</h2>
  <p className="text-sm text-muted-foreground">
    Controls which ECC tests and equipment requirements apply to this job.
  </p>

  <form action={updateJobProfileFromForm} className="mt-3 space-y-3">
    <input type="hidden" name="job_id" value={job.id} />
    <input type="hidden" name="job_type" value={job.job_type ?? "ecc"} />

    <div className="space-y-1">
      <label className="text-sm font-medium" htmlFor="project_type">
        Project Type
      </label>
      <select
        id="project_type"
        name="project_type"
        defaultValue={job.project_type ?? "alteration"}
        className="w-full rounded-md border px-3 py-2"
      >
        <option value="alteration">Alteration</option>
        <option value="all_new">All New</option>
      </select>
    </div>

    <button type="submit" className="rounded-md bg-black px-4 py-2 text-white">
      Save ECC Profile
    </button>
  </form>
</section>


        {/* Workflow */}
        <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
          <h2 className="text-sm font-semibold mb-3">Workflow</h2>

          <div className="flex gap-3 flex-wrap items-center">
            <form action={advanceJobStatusFromForm}>
              <input type="hidden" name="id" value={job.id} />
              <input
                type="hidden"
                name="current_status"
                value={(job.status ?? "open") as JobStatus}
              />
              <button
                className="border rounded px-3 py-2 text-sm"
                disabled={isTerminal}
                title={
                  isTerminal
                    ? "Job is in a final status"
                    : `Advance to ${nextStatusLabel(job.status)}`
                }
              >
                {isTerminal ? "Status Final" : `Advance → ${nextStatusLabel(job.status)}`}
              </button>
            </form>

            <form action={markJobFailedFromForm}>
              <input type="hidden" name="id" value={job.id} />
              <button
                className="border rounded px-3 py-2 text-sm"
                disabled={job.status === "failed"}
                title="Mark ECC failure for this job"
              >
                Mark Failed (ECC)
              </button>
            </form>
          </div>

          <p className="text-xs text-gray-600 mt-2">
            Flow: Open → On The Way → In Process → Completed (or Failed).
          </p>
        </div>

        {/* Inline Edit Scheduling */}
        <div className="rounded-lg border bg-white p-4 text-gray-900">
          <h2 className="text-sm font-semibold mb-3 scroll-mt-24" id="schedule">
            Edit Scheduling
          </h2>

          <form action={updateJobScheduleFromForm} className="grid gap-4">
            <input type="hidden" name="id" value={job.id} />

            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Scheduled Date
              </label>
              <input
                type="date"
                name="scheduled_date"
                defaultValue={scheduledDateValue}
                className="w-full border rounded px-3 py-2 text-sm"
                required
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Window Start (optional)
                </label>
                <input
                  type="time"
                  name="window_start"
                  defaultValue={windowStartValue}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Window End (optional)
                </label>
                <input
                  type="time"
                  name="window_end"
                  defaultValue={windowEndValue}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Permit Number (optional)
              </label>
              <input
                type="text"
                name="permit_number"
                defaultValue={job.permit_number ?? ""}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="e.g. 2026-12345"
              />
            </div>

            <div className="flex justify-end">
              <button className="border rounded px-3 py-2 text-sm">
                Save Scheduling
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }