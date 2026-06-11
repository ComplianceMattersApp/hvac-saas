import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import { formatEccOpsStatusLabel, isEccJobType } from "@/lib/ecc/ecc-workflow-display";

import EquipmentEditCard from "../_components/EquipmentEditCard";
import EquipmentCreateForm from "../_components/EquipmentCreateForm";
import JobSubpageContextHeader from "../_components/JobSubpageContextHeader";

function formatTimeDisplay(time?: string | null) {
  if (!time) return "";
  return String(time).slice(0, 5);
}

function formatAppointmentDate(value?: string | null) {
  if (!value) return "No appointment scheduled";
  const parsed = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function formatAppointmentTime(start?: string | null, end?: string | null, hasDate?: boolean) {
  if (start && end) return `${formatTimeDisplay(start)}-${formatTimeDisplay(end)}`;
  if (start) return `Starts ${formatTimeDisplay(start)}`;
  if (end) return `Ends ${formatTimeDisplay(end)}`;
  return hasDate ? "Time window TBD" : "No time window set";
}

function formatStatusLabel(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "Unknown";

  const mapped: Record<string, string> = {
    open: "Open",
    on_the_way: "On The Way",
    in_process: "In Process",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
  };

  return mapped[normalized] ?? normalized.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatOpsStatusLabel(value?: string | null, jobType?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "No ops status";

  const eccLabel = isEccJobType(jobType) ? formatEccOpsStatusLabel(normalized, "internal") : null;
  if (eccLabel) return eccLabel;

  const mapped: Record<string, string> = {
    need_to_schedule: "Need to Schedule",
    scheduled: "Scheduled",
    on_the_way: "On The Way",
    in_process: "In Progress",
    pending_info: "Pending Info",
    pending_office_review: "Office Review Needed",
    on_hold: "On Hold",
    failed: "Failed",
    retest_needed: "Retest Needed",
    paperwork_required: "Paperwork Required",
    invoice_required: "Invoice Required",
    closed: "Closed",
  };

  return mapped[normalized] ?? normalized.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatJobTypeLabel(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "Service";
  if (normalized === "ecc") return "ECC";
  return normalized.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

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

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user ?? null;

  if (!user) redirect("/login");

  try {
    await requireInternalUser({ supabase, userId: user.id });
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
    status,
    ops_status,
    city,
    job_address,
    job_type,
    customer_first_name,
    customer_last_name,
    scheduled_date,
    window_start,
    window_end,
    job_equipment (
      id,
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
    )
  `
  )
  .eq("id", id)
  .single();

if (error) throw error;
if (!job) return notFound();


  const { data: systems, error: systemsErr } = await supabase
    .from("job_systems")
    .select("id, name")
    .eq("job_id", id)
    .order("name", { ascending: true });

  if (systemsErr) throw systemsErr;

    const customerName =
      [job.customer_first_name, job.customer_last_name]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .join(" ") || "Customer not set";

    const addressLabel =
      [job.job_address, job.city]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .join(", ") || "No service address set";

    const appointmentLabel = `${formatAppointmentDate(job.scheduled_date)} • ${formatAppointmentTime(
      job.window_start,
      job.window_end,
      !!job.scheduled_date,
    )}`;

    const normalizedStatus = String(job.status ?? "").trim().toLowerCase();
    const normalizedOpsStatus = String(job.ops_status ?? "").trim().toLowerCase();

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-6">
          <JobSubpageContextHeader
            workspaceLabel="Job Subpage"
            workspaceTitle="Equipment Capture"
            customerName={customerName}
            jobTitle={normalizeRetestLinkedJobTitle(job.title) || "Job"}
            addressLabel={addressLabel}
            appointmentLabel={appointmentLabel}
            jobTypeLabel={formatJobTypeLabel(job.job_type)}
            fieldStatusLabel={formatStatusLabel(job.status)}
            opsStatusLabel={formatOpsStatusLabel(job.ops_status, job.job_type)}
            fieldStatusKey={normalizedStatus}
            opsStatusKey={normalizedOpsStatus}
            backHref={`/jobs/${job.id}`}
          />

        {/* Hub */}
        {!focused ? (
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm space-y-4">
            <div className="text-sm font-semibold text-gray-900">Info Hub</div>
            <div className="grid gap-3">
              <Link
                href={`/jobs/${job.id}/info?f=equipment`}
                className="w-full inline-flex min-h-11 items-center justify-center px-4 py-3 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
              >
                Equipment
              </Link>
              {String(job.job_type ?? "").trim().toLowerCase() === "ecc" ? (
                <Link
                  href={`/jobs/${job.id}/tests`}
                  className="w-full inline-flex min-h-11 items-center justify-center px-4 py-3 rounded-md border border-gray-300 bg-white text-gray-900 font-medium hover:bg-gray-50 transition-colors"
                >
                  Go to Tests
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Focused content */}
        {focused === "equipment" ? (
          <div className="space-y-6">
            {/* Next-step guidance (if ECC) */}
            {String(job.job_type ?? "").trim().toLowerCase() === "ecc" ? (
              <div className="rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-50/50 p-4 space-y-3">
                <div className="flex gap-3">
                  <div className="shrink-0 text-blue-600 mt-0.5">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zm-7 4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 100-2 1 1 0 000 2zm5 0a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-blue-900">Next step</p>
                    <p className="mt-1 text-sm text-blue-800">Equipment captured? Continue to ECC tests.</p>
                  </div>
                  <Link
                    href={`/jobs/${job.id}/tests`}
                    className="shrink-0 inline-flex items-center justify-center min-h-9 px-3 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    Go to Tests
                  </Link>
                </div>
              </div>
            ) : null}

            {/* Existing Equipment */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <div className="border-b border-gray-200 px-5 py-4 sm:px-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-gray-950">Current Equipment</h2>
                  {job.job_equipment && job.job_equipment.length > 0 ? (
                    <div className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-gray-100 text-xs font-medium text-gray-700">
                      {job.job_equipment.length}
                    </div>
                  ) : null}
                </div>
              </div>

              {job.job_equipment && job.job_equipment.length > 0 ? (
                <div className="divide-y divide-gray-200">
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
                <div className="px-5 py-8 sm:px-6 text-center">
                  <div className="text-sm text-gray-600">No equipment captured yet</div>
                  <p className="mt-1 text-xs text-gray-500">Add equipment below to begin</p>
                </div>
              )}
            </div>

            {/* Add Equipment Form */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <EquipmentCreateForm jobId={job.id} systems={systems ?? []} />
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
            <p className="text-sm text-gray-600">Choose an option above to begin.</p>
          </div>
        )}
      </div>
    </div>
  );
}
