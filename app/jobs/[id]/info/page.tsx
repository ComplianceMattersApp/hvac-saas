import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

import EquipmentEditCard from "../_components/EquipmentEditCard";
import EquipmentCreateForm from "../_components/EquipmentCreateForm";

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
        className="w-full inline-flex min-h-11 items-center justify-center px-4 py-3 rounded bg-blue-600 text-white text-center"
      >
        Equipment
      </Link>
      <Link
        href={`/jobs/${job.id}/tests`}
        className="w-full inline-flex min-h-11 items-center justify-center px-4 py-3 rounded border border-gray-300 bg-white text-gray-900 text-center hover:bg-gray-50"
      >
        Go to Tests
      </Link>
    </div>
  </div>
) : null}

      {/* Focused content */}
      {focused === "equipment" ? (
        <div className="rounded-lg border bg-white p-4 space-y-4">
          <div className="text-base font-semibold text-gray-900 border-b pb-2">
  Equipment
</div>

<div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
  <div>Next step after equipment capture: run or complete ECC tests for this job.</div>
  <Link
    href={`/jobs/${job.id}/tests`}
    className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
  >
    Go to Tests
  </Link>
</div>

{/* Existing Equipment */}
<div className="space-y-3">
  <div className="flex items-center justify-between gap-3">
    <div className="text-base font-semibold text-gray-900">
      Equipment on this job
    </div>
    {job.job_equipment && job.job_equipment.length > 0 ? (
      <div className="text-sm text-gray-500">{job.job_equipment.length} item(s)</div>
    ) : null}
  </div>

  {job.job_equipment && job.job_equipment.length > 0 ? (
    <div className="space-y-2">
      {job.job_equipment.map((eq) => (
        <EquipmentEditCard
          key={eq.id}
          eq={eq}
          systems={systems ?? []}
          jobId={job.id}
        />
      ))}
    </div>
  ) : (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600">
      No equipment has been added yet.
    </div>
  )}
</div>

<EquipmentCreateForm jobId={job.id} systems={systems ?? []} />
        </div>
      ) : (
        <div className="text-sm text-gray-600">Choose an option above to begin.</div>
      )}




    </div>
  );
}
