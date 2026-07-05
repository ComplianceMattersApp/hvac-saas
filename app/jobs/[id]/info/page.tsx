import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import { formatEccOpsStatusLabel, isEccJobType } from "@/lib/ecc/ecc-workflow-display";
import {
  listSystemFiltersBySystemIds,
  type JobSystemFilterRow,
} from "@/lib/customers/system-filters-read-model";

import EquipmentEditCard from "../_components/EquipmentEditCard";
import EquipmentCreateForm from "../_components/EquipmentCreateForm";
import SystemFilterInventoryCard from "../_components/SystemFilterInventoryCard";
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
  const timingEnabled = process.env.JOB_DETAIL_TIMING_DEBUG === "true";
  const timingStartMs = Date.now();
  const phaseDurationsMs: Record<string, number> = {};
  const recordPhase = (phase: string, durationMs: number) => {
    if (!timingEnabled) return;
    phaseDurationsMs[phase] = durationMs;
  };
  const timedPhase = async <T,>(phase: string, work: () => T | PromiseLike<T>): Promise<T> => {
    if (!timingEnabled) return work();
    const startedAt = Date.now();
    try {
      return await work();
    } finally {
      recordPhase(phase, Date.now() - startedAt);
    }
  };
  const emitTimingLog = () => {
    if (!timingEnabled) return;
    console.info(
      "[job-equipment-route-timing]",
      JSON.stringify({
        jobId: id,
        route: "/jobs/[id]/info",
        focused: focused || "hub",
        totalMs: Date.now() - timingStartMs,
        phasesMs: {
          createClient: phaseDurationsMs.createClient ?? 0,
          authInternalAccess: phaseDurationsMs.authInternalAccess ?? 0,
          jobEquipmentRead: phaseDurationsMs.jobEquipmentRead ?? 0,
          jobSystemsRead: phaseDurationsMs.jobSystemsRead ?? 0,
          systemFiltersRead: phaseDurationsMs.systemFiltersRead ?? 0,
          renderPrep: phaseDurationsMs.renderPrep ?? 0,
          totalServerRenderBeforeResponse: Date.now() - timingStartMs,
        },
      }),
    );
  };

  const supabase = await timedPhase("createClient", () => createClient());

  const { internalAccess } = await timedPhase("authInternalAccess", async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user ?? null;

    if (!user) redirect("/login");

    let internalAccess: Awaited<ReturnType<typeof requireInternalUser>>;

    try {
      internalAccess = await requireInternalUser({ supabase, userId: user.id });
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

    return { user, internalAccess };
  });

const { data: job, error } = await timedPhase("jobEquipmentRead", () => supabase
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
      system_id,
      equipment_role,
      component_type,
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
  .single());

if (error) throw error;
if (!job) return notFound();


  const { data: systems, error: systemsErr } = await timedPhase("jobSystemsRead", () => supabase
    .from("job_systems")
    .select("id, name")
    .eq("job_id", id)
    .order("name", { ascending: true }));

  if (systemsErr) throw systemsErr;

  const systemIds = ((systems ?? []) as Array<{ id?: string | null }>)
    .map((system) => String(system.id ?? "").trim())
    .filter(Boolean);

  const systemFilters = await timedPhase("systemFiltersRead", () =>
    systemIds.length
      ? listSystemFiltersBySystemIds({
        supabase,
        accountOwnerUserId: internalAccess.internalUser.account_owner_user_id,
        systemIds,
      })
      : Promise.resolve([]),
  );

  const renderPrepStartedAt = timingEnabled ? Date.now() : 0;
  const filtersBySystemId = systemFilters.reduce<Record<string, JobSystemFilterRow[]>>((acc, filter) => {
    if (!acc[filter.system_id]) acc[filter.system_id] = [];
    acc[filter.system_id].push(filter);
    return acc;
  }, {});
  const activeFilterCount = systemFilters.filter((filter) => !filter.archived_at).length;

  const equipmentRows = ((job.job_equipment ?? []) as Array<any>).filter((equipment) =>
    String(equipment?.id ?? "").trim(),
  );
  const equipmentIdsAssignedToSystemCards = new Set<string>();
  const equipmentBySystemId = ((systems ?? []) as Array<{ id: string; name: string | null }>).reduce<
    Record<string, Array<any>>
  >((acc, system) => {
    const systemId = String(system.id ?? "").trim();
    const systemName = String(system.name ?? "").trim();
    acc[systemId] = equipmentRows.filter((equipment) => {
      const equipmentSystemId = String(equipment?.system_id ?? "").trim();
      const equipmentSystemLocation = String(equipment?.system_location ?? "").trim();
      const belongsToSystem =
        (systemId && equipmentSystemId === systemId) ||
        (!equipmentSystemId && systemName && equipmentSystemLocation === systemName);
      if (belongsToSystem) equipmentIdsAssignedToSystemCards.add(String(equipment.id));
      return belongsToSystem;
    });
    return acc;
  }, {});
  const unassignedEquipmentRows = equipmentRows.filter(
    (equipment) => !equipmentIdsAssignedToSystemCards.has(String(equipment.id)),
  );

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
    recordPhase("renderPrep", timingEnabled ? Date.now() - renderPrepStartedAt : 0);
    emitTimingLog();

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 sm:p-6">
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
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-14px_rgba(15,23,42,0.12)] space-y-4">
            <div className="text-sm font-semibold text-navy">Info Hub</div>
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
                  className="w-full inline-flex min-h-11 items-center justify-center px-4 py-3 rounded-md border border-slate-200 bg-white text-blue-700 font-medium hover:bg-blue-50 transition-colors"
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

            {/* System inventory */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-14px_rgba(15,23,42,0.12)] overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-navy">System Inventory</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Equipment and filters are organized under each system.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="inline-flex items-center justify-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                      {(systems ?? []).length} system{(systems ?? []).length === 1 ? "" : "s"}
                    </div>
                    {equipmentRows.length + activeFilterCount > 0 ? (
                      <div className="inline-flex items-center justify-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                        {equipmentRows.length + activeFilterCount} inventory item{equipmentRows.length + activeFilterCount === 1 ? "" : "s"}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {(systems && systems.length > 0) || unassignedEquipmentRows.length > 0 ? (
                <div className="space-y-4 p-4 sm:p-5">
                  {(systems ?? []).map((system) => {
                    const systemEquipment = equipmentBySystemId[system.id] ?? [];
                    const systemFiltersForInventory = (filtersBySystemId[system.id] ?? []).filter((filter) => !filter.archived_at);
                    const systemInventoryCount = systemEquipment.length + systemFiltersForInventory.length;
                    return (
                      <div key={system.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-14px_rgba(15,23,42,0.12)]">
                        <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <h3 className="text-sm font-semibold text-navy">{system.name || "System"}</h3>
                              <p className="mt-0.5 text-xs text-slate-500">System details, equipment, and filters.</p>
                            </div>
                            <span className="inline-flex w-fit rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                              {systemInventoryCount} inventory item{systemInventoryCount === 1 ? "" : "s"}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-4 p-4">
                          <div>
                            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Inventory
                            </div>
                            {systemInventoryCount > 0 ? (
                              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                                <div className="divide-y divide-slate-200">
                                  {systemEquipment.map((eq) => (
                                    <EquipmentEditCard
                                      key={eq.id}
                                      eq={eq}
                                      systems={systems ?? []}
                                      jobId={job.id}
                                    />
                                  ))}
                                  {systemFiltersForInventory.map((filter) => (
                                    <SystemFilterInventoryCard
                                      key={filter.id}
                                      filter={filter}
                                      jobId={job.id}
                                    />
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                No equipment or filter records under this system yet.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {unassignedEquipmentRows.length > 0 ? (
                    <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50/60">
                      <div className="border-b border-amber-200 px-4 py-3">
                        <h3 className="text-sm font-semibold text-amber-950">Legacy / Unassigned Equipment</h3>
                        <p className="mt-0.5 text-xs text-amber-800">
                          These records do not have a matching system link. They are preserved as equipment records.
                        </p>
                      </div>
                      <div className="divide-y divide-amber-200 bg-white">
                        {unassignedEquipmentRows.map((eq) => (
                          <EquipmentEditCard
                            key={eq.id}
                            eq={eq}
                            systems={systems ?? []}
                            jobId={job.id}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="px-5 py-8 sm:px-6 text-center">
                  <div className="text-sm text-slate-600">No systems captured yet</div>
                  <p className="mt-1 text-xs text-slate-500">Add equipment below to create a system inventory.</p>
                </div>
              )}
            </div>

            {/* Add Equipment Form */}
            <EquipmentCreateForm jobId={job.id} systems={systems ?? []} />
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
            <p className="text-sm text-slate-600">Choose an option above to begin.</p>
          </div>
        )}
      </div>
    </div>
  );
}
