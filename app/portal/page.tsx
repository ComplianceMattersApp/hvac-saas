// /portal/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function formatDateLA(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function statusLabel(ops: string | null | undefined) {
  const v = (ops ?? "").toLowerCase();

  if (v === "failed") return "FAILED";
  if (v === "pending_info") return "PENDING INFO";
  if (v === "retest_needed") return "RETEST REQUIRED";
  if (v === "need_to_schedule") return "NEED TO SCHEDULE";

  // Your system has historically used "ready" as scheduled/ready-to-go.
  if (v === "scheduled" || v === "ready") return "SCHEDULED";

  if (v === "on_hold") return "ON HOLD";
  if (v === "field_complete") return "FIELD COMPLETE";
  if (v === "closed") return "CLOSED";

  return v ? v.toUpperCase().replaceAll("_", " ") : "UNKNOWN";
}

function statusBadgeClass(ops: string | null | undefined) {
  const v = (ops ?? "").toLowerCase();

  if (v === "failed")
    return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
  if (v === "pending_info")
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
  if (v === "retest_needed")
    return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
  if (v === "need_to_schedule")
    return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200";
  if (v === "scheduled" || v === "ready")
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
  if (v === "on_hold")
    return "bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-200";

  return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
}

function rowAccentClass(opts: { isUrgent: boolean; ops_status?: string | null }) {
  const ops = (opts.ops_status ?? "").toLowerCase();

  if (opts.isUrgent) return "border-red-500 bg-red-50 dark:bg-red-950/20";
  if (ops === "pending_info")
    return "border-amber-400 bg-amber-50 dark:bg-amber-950/20";
  if (ops === "retest_needed" || ops === "failed")
    return "border-red-400 bg-red-50 dark:bg-red-950/15";
  if (ops === "scheduled" || ops === "ready")
    return "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20";

  return "border-transparent";
}

type SP = Record<string, string | string[] | undefined>;

function sp1(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function PortalPage({
  searchParams,
}: {
  searchParams?: Promise<SP>;
}) {
  const supabase = await createClient();

  const sp: SP = (searchParams ? await searchParams : {}) ?? {};
  const queue = (sp1(sp.queue) ?? "").toString();


  // Must be logged in
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  // Must be a contractor user (otherwise send internal users to ops)
  const { data: cu, error: cuErr } = await supabase
    .from("contractor_users")
    .select("contractor_id, contractors ( id, name )")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (cuErr) throw cuErr;

  const contractorId = cu?.contractor_id ?? null;
  const contractorName =
    (cu as any)?.contractors?.name ?? (contractorId ? "Contractor" : null);

  if (!contractorId) redirect("/ops");


  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const { count: totalActiveCount, error: totalErr } = await supabase
  .from("jobs")
  .select("id", { count: "exact", head: true })
  .eq("contractor_id", contractorId)
  .is("deleted_at", null);

  if (totalErr) throw totalErr;

  // Base filter: SECURITY + ARCHIVE HIDE
  const baseJobs = () =>
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("contractor_id", contractorId)
      .is("deleted_at", null);

  // “Attention Today” count (contractor scoped + not archived)
  const { count: attentionTodayCount } = await baseJobs()
    .not("follow_up_date", "is", null)
    .lte("follow_up_date", today)
    .in("ops_status", ["need_to_schedule", "pending_info", "retest_needed", "failed"]);

  // Counts by ops_status (contractor scoped + not archived)
  const { data: countsData, error: countsErr } = await supabase
    .from("jobs")
    .select("ops_status")
    .eq("contractor_id", contractorId)
    .is("deleted_at", null);

  if (countsErr) throw countsErr;

  const counts: Record<string, number> = {};
  for (const row of countsData ?? []) {
    const key = (row as any)?.ops_status ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }

  // List query (queue-aware)
  let listQ = supabase
    .from("jobs")
    .select(
      `
      id,
      title,
      status,
      ops_status,
      pending_info_reason,
      next_action_note,
      follow_up_date,
      created_at,
      city,
      job_address,
      locations:location_id ( address_line1, city, state )
    `
    )
    .eq("contractor_id", contractorId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(25);

  if (queue === "attention_today") {
    listQ = listQ
      .not("follow_up_date", "is", null)
      .lte("follow_up_date", today)
      .in("ops_status", ["need_to_schedule", "pending_info", "retest_needed", "failed"]);
  } else if (queue === "need_to_schedule") {
    listQ = listQ.eq("ops_status", "need_to_schedule");
  } else if (queue === "pending_info") {
    listQ = listQ.eq("ops_status", "pending_info");
  } else if (queue === "retest_needed") {
    listQ = listQ.eq("ops_status", "retest_needed");
  }

  const { data: jobs, error: jobsErr } = await listQ;
  if (jobsErr) throw jobsErr;

  const openCount =
    (counts["need_to_schedule"] ?? 0) +
    (counts["pending_info"] ?? 0) +
    (counts["retest_needed"] ?? 0) +
    (counts["failed"] ?? 0) +
    (counts["on_hold"] ?? 0) +
    (counts["ready"] ?? 0) +
    (counts["scheduled"] ?? 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <div className="rounded-xl border bg-white dark:bg-gray-900 p-5 flex items-start justify-between gap-4 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contractor Portal</h1>
          <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            {contractorName}
          </div>
        </div>

        <Link
          href="/jobs/new"
          className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-white text-sm font-medium hover:bg-gray-800 transition"
        >
          + Add Job
        </Link>
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Link
          href="/portal"
          className="rounded-xl border bg-white dark:bg-gray-900 p-4 hover:shadow-sm transition"
        >
          <div className="text-sm text-gray-600 dark:text-gray-300">Recent Jobs</div>
          <div className="text-3xl font-semibold mt-1">{totalActiveCount ?? 0}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            View all current jobs
          </div>
        </Link>
        <Link
          href="/portal?queue=attention_today"
          className="rounded-xl border bg-white dark:bg-gray-900 p-4 hover:shadow-sm transition"
        >
          <div className="text-sm text-gray-600 dark:text-gray-300">Attention Today</div>
          <div className="text-3xl font-semibold mt-1">{attentionTodayCount ?? 0}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Follow-ups due today or earlier
          </div>
        </Link>

        <Link
          href="/portal?queue=need_to_schedule"
          className="rounded-xl border bg-white dark:bg-gray-900 p-4 hover:shadow-sm transition"
        >
          <div className="text-sm text-gray-600 dark:text-gray-300">Need to Schedule</div>
          <div className="text-3xl font-semibold mt-1">{counts["need_to_schedule"] ?? 0}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Jobs awaiting scheduling info
          </div>
        </Link>

        <Link
          href="/portal?queue=pending_info"
          className="rounded-xl border bg-white dark:bg-gray-900 p-4 hover:shadow-sm transition"
        >
          <div className="text-sm text-gray-600 dark:text-gray-300">Pending Info</div>
          <div className="text-3xl font-semibold mt-1">{counts["pending_info"] ?? 0}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Missing permit/info/notes
          </div>
        </Link>

        <Link
          href="/portal?queue=retest_needed"
          className="rounded-xl border bg-white dark:bg-gray-900 p-4 hover:shadow-sm transition"
        >
          <div className="text-sm text-gray-600 dark:text-gray-300">Retest Needed</div>
          <div className="text-3xl font-semibold mt-1">{counts["retest_needed"] ?? 0}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Failed or retest required
          </div>
        </Link>
      </div>

      {/* List Header */}
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">
          {queue
            ? `Queue: ${queue.replaceAll("_", " ")}`
            : "Recent Jobs"}
        </h2>
        <div className="text-sm text-gray-600 dark:text-gray-300">
          Open items: <span className="font-semibold">{openCount}</span>
        </div>
      </div>

      {/* Job List */}
      <div className="rounded-xl border bg-white dark:bg-gray-900 overflow-hidden">
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {(jobs ?? []).map((j: any) => {
            const isUrgent =
              !!j.follow_up_date && String(j.follow_up_date) <= String(today);

            return (
              <Link
                key={j.id}
                href={`/jobs/${j.id}`}
                className={[
                  "block p-4 border-l-4 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition",
                  rowAccentClass({ isUrgent, ops_status: j.ops_status }),
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold truncate">
                        {j.title ?? "Untitled Job"}
                      </div>
                      <span
                        className={[
                          "text-xs font-semibold px-2 py-1 rounded-full",
                          statusBadgeClass(j.ops_status),
                        ].join(" ")}
                      >
                        {statusLabel(j.ops_status)}
                      </span>
                    </div>

                    <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      {j.job_address ?? j.locations?.address_line1 ?? "No address"} •{" "}
                      {j.city ?? j.locations?.city ?? "—"}
                    </div>

                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 space-y-1">
                      <div>
                        <span className="font-semibold">ops_status:</span>{" "}
                        {j.ops_status ?? "—"}
                      </div>

                      {!!j.pending_info_reason && (
                        <div>
                          <span className="font-semibold">pending_info_reason:</span>{" "}
                          {j.pending_info_reason}
                        </div>
                      )}

                      {!!j.next_action_note && (
                        <div>
                          <span className="font-semibold">next_action_note:</span>{" "}
                          {j.next_action_note}
                        </div>
                      )}

                      {!!j.follow_up_date && (
                        <div>
                          <span className="font-semibold">follow_up_date:</span>{" "}
                          {j.follow_up_date}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {j.created_at ? `Added ${formatDateLA(j.created_at)}` : ""}
                  </div>
                </div>
              </Link>
            );
          })}

          {(!jobs || jobs.length === 0) && (
            <div className="p-6 text-sm text-gray-600 dark:text-gray-300">
              No jobs found for this queue.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}