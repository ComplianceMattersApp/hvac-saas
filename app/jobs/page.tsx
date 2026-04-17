import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import { buildPromotedCompanionReadModel, buildVisitScopeReadModel } from "@/lib/jobs/visit-scope";


const QUEUES = [
  "attention_today",
  "all",
  "need_to_schedule",
  "pending_info",
  "on_hold",
  "retest_needed",
] as const;



type Queue = (typeof QUEUES)[number];

function formatDateLA(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function safeQueue(value: string | undefined): Queue {
  if (!value) return "all";
  return (QUEUES as readonly string[]).includes(value) ? (value as Queue) : "all";
}

function queueLabel(q: Queue) {
  const map: Record<Queue, string> = {
    attention_today: "🔴 Attention Today",
    all: "All",
    need_to_schedule: "Need to Schedule",
    pending_info: "Pending Info",
    on_hold: "On Hold",
    retest_needed: "Retest Needed",
  };
  return map[q];
}

function formatOpsStatusLabel(value?: string | null) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return "—";

  const labelMap: Record<string, string> = {
    need_to_schedule: "Need to Schedule",
    scheduled: "Scheduled",
    pending_info: "Pending Info",
    on_hold: "On Hold",
    retest_needed: "Retest Needed",
    failed: "Failed",
    paperwork_required: "Paperwork Required",
    invoice_required: "Invoice Required",
    closed: "Closed",
  };

  return labelMap[v] ?? "In Progress";
}



export default async function JobsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

  const sp = (await searchParams) ?? {};
  const queueRaw = Array.isArray(sp.queue) ? sp.queue[0] : sp.queue;
  const queue = safeQueue(queueRaw);

  const supabase = await createClient();


// Smart count: Attention Today
const { count: attentionTodayCount } = await supabase
  .from("jobs")
  .select("id", { count: "exact", head: true })
  .is("deleted_at", null)
  .neq("status", "cancelled")
  .not("follow_up_date", "is", null)
  .lte("follow_up_date", today)
  .in("ops_status", ["need_to_schedule", "pending_info", "retest_needed"]);

const { count: allCount } = await supabase
  .from("jobs")
  .select("id", { count: "exact", head: true })
  .is("deleted_at", null);

  const { data: countsData } = await supabase
  .from("jobs")
  .select("ops_status", { count: "exact" })
  .is("deleted_at", null)
  .neq("status", "cancelled");

const counts: Record<string, number> = {};

if (countsData) {
  for (const row of countsData) {
    const key = row.ops_status ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
}


  let query = supabase
    .from("jobs")
    .select(
      "id, title, job_type, status, scheduled_date, created_at, ops_status, follow_up_date, next_action_note, pending_info_reason, on_hold_reason, job_notes, customer_id, location_id, customer_first_name, customer_last_name, customer_phone, job_address, city, visit_scope_summary, visit_scope_items"
    )
    .is("deleted_at", null);

  if (queue === "attention_today") {
  query = query
      .neq("status", "cancelled")
    .not("follow_up_date", "is", null)
    .lte("follow_up_date", today)
    .in("ops_status", ["need_to_schedule", "pending_info", "retest_needed"]);
} else if (queue !== "all") {
    query = query
      .neq("status", "cancelled")
      .eq("ops_status", queue);
}


  const { data: jobs, error } = await query
    .order("follow_up_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {

    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Jobs</h1>
        <p className="mt-4 text-sm text-red-600">
          Failed to load jobs: {error.message}
        </p>
      </div>
    );
  }

          const customerIds = Array.from(
      new Set((jobs ?? []).map((j: any) => j.customer_id).filter(Boolean))
    ) as string[];

    const locationIds = Array.from(
      new Set((jobs ?? []).map((j: any) => j.location_id).filter(Boolean))
    ) as string[];

    const [custRes, locRes] = await Promise.all([
      customerIds.length
        ? supabase
            .from("customers")
            .select("id, full_name, first_name, last_name, phone")
            .in("id", customerIds)
        : Promise.resolve({ data: [] as any[], error: null }),

      locationIds.length
        ? supabase
            .from("locations")
            .select("id, address_line1, city, state, zip")
            .in("id", locationIds)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

    if (custRes.error) throw custRes.error;
    if (locRes.error) throw locRes.error;

    const customersById = new Map((custRes.data ?? []).map((c: any) => [c.id, c]));
    const locationsById = new Map((locRes.data ?? []).map((l: any) => [l.id, l]));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Jobs</h1>
          <div className="text-sm text-gray-600 mt-1">
            Queue: <b>{queueLabel(queue)}</b>
          </div>
        </div>

        <div className="flex gap-2">
          <Link href="/jobs/new" className="px-3 py-2 rounded bg-blue-600 text-white text-sm">
            New Job
          </Link>
          <Link href="/calendar" className="px-3 py-2 rounded border text-sm">
            Calendar
          </Link>
        </div>
      </div>



      {/* Queue buttons */}
<div className="flex flex-wrap gap-2">
  {QUEUES.map((q) => {
    const active = q === queue;
    const count =
  q === "attention_today"
    ? (attentionTodayCount ?? 0)
    : q === "all"
      ? (allCount ?? 0)
      : counts[q] ?? 0;

    return (
      <Link
        key={q}
        href={q === "all" ? "/jobs" : `/jobs?queue=${q}`}
        className={
          active
            ? "px-3 py-2 rounded bg-gray-900 text-white text-sm"
            : "px-3 py-2 rounded border text-sm hover:bg-gray-50"
        }
      >
        {queueLabel(q)} ({count})
      </Link>
    );
  })}
</div>



      {!jobs || jobs.length === 0 ? (
        <div className="rounded border p-4 text-sm text-gray-600">
          No jobs in this queue.
        </div>
      ) : (
        <div className="rounded border divide-y">
          {jobs.map((job) => {
            const c: any = job.customer_id ? customersById.get(job.customer_id) : null;
const l: any = job.location_id ? locationsById.get(job.location_id) : null;

const customerName: string | null =
  (c?.full_name ||
    `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() ||
    `${job.customer_first_name ?? ""} ${job.customer_last_name ?? ""}`.trim()) || null;

const displayCity: string = [l?.city ?? job.city ?? null, [l?.state ?? null, l?.zip ?? null].filter(Boolean).join(" ")]
  .filter(Boolean)
  .join(", ") || "—";
  const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

  const isUrgent =
    job.follow_up_date &&
    job.follow_up_date <= today &&
    ["need_to_schedule", "pending_info", "retest_needed"].includes(
      job.ops_status ?? ""
    );
  const visitScope = buildVisitScopeReadModel(job.visit_scope_summary, job.visit_scope_items, {
    leadMaxLength: 86,
    previewItemCount: 1,
    previewItemMaxLength: 34,
  });
  const promotedCompanion = buildPromotedCompanionReadModel(job.visit_scope_items);

  return (

    <Link
      key={job.id}
      href={`/jobs/${job.id}`}
      className={`block p-4 hover:bg-gray-50 ${
        isUrgent ? "border-l-4 border-red-500 bg-red-50" : ""
      }`}
    >

              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{normalizeRetestLinkedJobTitle(job.title) || "Job"}</div>

                  <div className="text-sm text-gray-600">
                    {displayCity} • {job.status ?? "—"} •{" "}
                    <span className="font-medium">{formatOpsStatusLabel(job.ops_status)}</span>
                    {job.follow_up_date ? <> • Follow-up: {job.follow_up_date}</> : null}
                  </div>

                  {visitScope.hasContent ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
                      <span className="font-semibold uppercase tracking-wide text-gray-500">Visit</span>
                      <span className="font-medium text-gray-700">{visitScope.lead}</span>
                      {visitScope.itemCount > 0 ? (
                        <span className="rounded-full border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                          {visitScope.itemCount} item{visitScope.itemCount === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {String(job.job_type ?? "").toLowerCase() === "ecc" && promotedCompanion.hasPromotedCompanion ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-emerald-700">
                      <span className="font-semibold uppercase tracking-wide text-emerald-600">Follow-up</span>
                      <span className="font-medium">{promotedCompanion.label}</span>
                    </div>
                  ) : null}

                  {job.ops_status === "pending_info" ? (
                    <div className="text-xs text-gray-500 mt-1">
                      Pending Info: {String(job.pending_info_reason ?? "").trim() || "Reason not set."}
                    </div>
                  ) : null}

                  {job.ops_status === "on_hold" ? (
                    <div className="text-xs text-gray-500 mt-1">
                      On Hold: {String((job as any).on_hold_reason ?? "").trim() || "Reason not set."}
                    </div>
                  ) : null}

                  {(job.customer_first_name || job.customer_last_name) ? (
                    <div className="text-sm text-gray-600 mt-1">
                      Customer:{" "}
                      {`${job.customer_first_name ?? ""} ${job.customer_last_name ?? ""}`.trim()}
                    </div>
                  ) : null}

                  {job.next_action_note ? (
                    <div className="text-xs text-gray-500 mt-1">
                      Next: {job.next_action_note.length > 90 ? `${job.next_action_note.slice(0, 90)}…` : job.next_action_note}
                    </div>
                  ) : null}

                  {job.job_notes ? (
                    <div className="text-xs text-gray-500 mt-1">
                      Notes: {job.job_notes.length > 80 ? `${job.job_notes.slice(0, 80)}…` : job.job_notes}
                    </div>
                  ) : null}
                </div>

                <div className="text-xs text-gray-500 whitespace-nowrap">
                  Created: {job.created_at ? formatDateLA(String(job.created_at)) : "—"}
                </div>
              </div>
                      </Link>
        );
      })}
        </div>
      )}
    </div>
  );
}

