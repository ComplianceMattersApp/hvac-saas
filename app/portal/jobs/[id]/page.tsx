// app/portal/jobs/[id]/page.tsx
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import JobAttachments from "@/components/portal/JobAttachments";
import { AccordionCards } from "@/components/AccordionCards";

function formatDateLA(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export default async function PortalJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: jobId } = await params;

  const supabase = await createClient();

  // Must be logged in
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  // Must be contractor user (internal users go to /ops)
  const { data: cu, error: cuErr } = await supabase
    .from("contractor_users")
    .select("contractor_id, contractors ( id, name )")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (cuErr) throw cuErr;
  if (!cu?.contractor_id) redirect("/ops");

  const contractorName =
    (cu as any)?.contractors?.name ?? (cu?.contractor_id ? "Contractor" : "—");

  // Read job (RLS will enforce tenant isolation)
const { data: job, error: jobErr } = await supabase
  .from("jobs")
  .select(
    `
    id, title, status, ops_status, city, job_address, location_id, created_at, follow_up_date,
    scheduled_date, window_start, window_end, permit_number, on_the_way_at,
    pending_info_reason, next_action_note, parent_job_id,
    locations:location_id ( address_line1, address_line2, city, state, zip )
    `
  )
  .eq("id", jobId)
  .maybeSingle();

  if (jobErr) throw jobErr;
  if (!job) notFound();


  // Load attachments for this job
  const { data: attachments, error: attErr } = await supabase
    .from("attachments")
    .select(
      "id, bucket, storage_path, file_name, content_type, file_size, caption, created_at"
    )
    .eq("entity_type", "job")
    .eq("entity_id", jobId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (attErr) throw attErr;

  // Create signed download URLs (private bucket)
  const items = await Promise.all(
    (attachments ?? []).map(async (a: any) => {
      const { data } = await supabase.storage
        .from(a.bucket)
        .createSignedUrl(a.storage_path, 60 * 10); // 10 minutes

      return {
        ...a,
        signedUrl: data?.signedUrl ?? null,
      };
    })
  );

  // Load equipment (systems + equipment rows)
  const { data: systems, error: sysErr } = await supabase
    .from("job_systems")
    .select("id, name, created_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (sysErr) throw sysErr;

  const { data: equipment, error: eqErr } = await supabase
    .from("job_equipment")
    .select(
      "id, system_id, system_location, equipment_role, manufacturer, model, serial, tonnage, refrigerant_type, notes, created_at"
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (eqErr) throw eqErr;

  // Group equipment by system_id (fallback to system_location if needed)
  const systemsById = new Map((systems ?? []).map((s: any) => [s.id, s]));
  const grouped = new Map<string, any[]>();

  for (const e of equipment ?? []) {
    const key =
      (e as any).system_id ??
      `loc:${String((e as any).system_location ?? "Unknown").trim() || "Unknown"}`;

    const arr = grouped.get(key) ?? [];
    arr.push(e);
    grouped.set(key, arr);
  }

    // --- Job chain (original + retests) ---
  const rootJobId = (job as any)?.parent_job_id ?? jobId;

  const { data: jobChain, error: chainErr } = await supabase
    .from("jobs")
    .select(
      "id, title, status, ops_status, created_at, scheduled_date, window_start, window_end, permit_number, parent_job_id"
    )
    .or(`id.eq.${rootJobId},parent_job_id.eq.${rootJobId}`)
    .order("created_at", { ascending: true })
    .limit(20);

  if (chainErr) throw chainErr;

  const chainJobIds = (jobChain ?? []).map((j: any) => j.id);

  // --- Timeline / Attempts (contractor-safe subset across the whole chain) ---
  const SAFE_EVENT_TYPES = [
    "customer_attempt",
    "contractor_note",
    "contractor_correction_submission",
    "attachment_added",
    // add later if/when you start logging these:
    // "scheduled",
    // "rescheduled",
    // "retest_created",
    // "job_created",
  ];

  const { data: events, error: evErr } = await supabase
    .from("job_events")
    .select("job_id, created_at, event_type, meta, user_id")
    .in("job_id", chainJobIds.length ? chainJobIds : [jobId])
    .in("event_type", SAFE_EVENT_TYPES)
    .order("created_at", { ascending: false })
    .limit(300);

  if (evErr) throw evErr;

  function shortUid(uid: string | null | undefined) {
  const s = String(uid || "").trim();
  if (!s) return "—";
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

const myUid = userData?.user?.id ?? null;

const contractorNotes = (events ?? [])
  .filter((e: any) => e?.event_type === "contractor_note")
  .map((e: any) => {
    const meta = typeof e.meta === "string" ? null : e.meta;
    const noteText = meta?.note ? String(meta.note).trim() : "";
    return {
      created_at: e.created_at,
      user_id: e.user_id ?? null,
      note: noteText,
    };
  })
  .filter((n: any) => n.note);
  

  // --- Tests (ECC runs across the whole chain) ---
  const { data: testRuns, error: trErr } = await supabase
    .from("ecc_test_runs")
    .select("id, job_id, created_at, test_type, computed_pass, override_pass, computed, is_completed")
    .in("job_id", chainJobIds.length ? chainJobIds : [jobId])
    .order("created_at", { ascending: false })
    .limit(100);

  if (trErr) throw trErr;

  function formatTimeLocal(t: string | null | undefined) {
    const s = String(t || "").slice(0, 5);
    return s || "—";
  }

  const windowLabel =
    (job as any)?.scheduled_date && (job as any)?.window_start && (job as any)?.window_end
      ? `${formatTimeLocal((job as any).window_start)}–${formatTimeLocal((job as any).window_end)}`
      : null;

      const loc = (job as any)?.locations ?? null;

const addressLine1 =
  String(loc?.address_line1 ?? "").trim() ||
  String((job as any)?.job_address ?? "").trim();

const addressCity =
  String(loc?.city ?? "").trim() || String((job as any)?.city ?? "").trim();

const addressState = String(loc?.state ?? "").trim();

  // Group events/runs by job_id for display
  const chainById = new Map((jobChain ?? []).map((j: any) => [j.id, j]));
  const eventsByJob = new Map<string, any[]>();
  for (const e of events ?? []) {
    const arr = eventsByJob.get(e.job_id) ?? [];
    arr.push(e);
    eventsByJob.set(e.job_id, arr);
  }

  const runsByJob = new Map<string, any[]>();
  for (const r of testRuns ?? []) {
    const arr = runsByJob.get(r.job_id) ?? [];
    arr.push(r);
    runsByJob.set(r.job_id, arr);
  }

    // --- Job Health / Urgency banner (based on latest completed run) ---
  const latestCompletedRun =
    (testRuns ?? []).find((r: any) => r.is_completed) ??
    null;

  const latestPass =
    latestCompletedRun
      ? (latestCompletedRun.override_pass != null
          ? !!latestCompletedRun.override_pass
          : !!latestCompletedRun.computed_pass)
      : null;

function extractTopReasons(run: any): string[] {
  const computed = run?.computed ?? null;
  if (!computed) return [];

  const failures = Array.isArray(computed.failures)
    ? computed.failures.map(String).map((s: string) => s.trim()).filter(Boolean)
    : [];

  if (failures.length) return failures.slice(0, 3);

  const warnings = Array.isArray(computed.warnings)
    ? computed.warnings.map(String).map((s: string) => s.trim()).filter(Boolean)
    : [];

  if (warnings.length) return warnings.slice(0, 3);

  // Fallback: duct leakage specific numeric summary if present
  const measured = computed.measured_duct_leakage_cfm;
  const max = computed.max_leakage_cfm;

  if (typeof measured === "number" && typeof max === "number") {
    if (measured > max) return [`Duct leakage ${measured} CFM exceeds max ${max} CFM.`];
    return [`Duct leakage ${measured} CFM (max ${max} CFM).`];
  }

  return [];
}

  const topReasons =
  latestCompletedRun ? extractTopReasons(latestCompletedRun) : [];

  async function addContractorNote(formData: FormData) {
  "use server";

  const jobId = String(formData.get("job_id") || "").trim();
  const note = String(formData.get("note") || "").trim();

  if (!jobId) throw new Error("Missing job_id");
  if (!note) throw new Error("Note is required");

  const supabase = await createClient();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  if (!userData?.user) redirect("/login");

  const { error: insErr } = await supabase.from("job_events").insert({
  job_id: jobId,
  event_type: "contractor_note",
  user_id: userData.user.id,
  meta: { note },
});

  if (insErr) throw insErr;

  revalidatePath(`/portal/jobs/${jobId}`);
  redirect(`/portal/jobs/${jobId}`);
}


  return (

    // Header
    <div className="max-w-4xl mx-auto space-y-6 text-gray-900 dark:text-gray-100">
      {/* Header */}
<div className="rounded-xl border bg-white dark:bg-gray-900 p-5 shadow-sm space-y-1">
  <div className="flex items-start justify-between gap-4">
    <div>
      <div className="text-xs text-gray-500 dark:text-gray-300">
        Contractor Portal • {contractorName}
      </div>

      <h1 className="text-2xl font-semibold tracking-tight mt-1">
        {job.title ?? "Job"}
      </h1>

      <div className="text-sm text-gray-600 dark:text-gray-300">
        {addressLine1 ? addressLine1 : "—"}
        {addressCity ? ` • ${addressCity}` : ""}
        {addressState ? `, ${addressState}` : ""}
      </div>
    </div>

    <Link
      href="/portal"
      className="px-3 py-2 rounded-lg border bg-white dark:bg-gray-900 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition"
    >
      Back
    </Link>
  </div>
</div>

{/* Job Health (Urgency Banner) */}
{latestCompletedRun ? (
  <div
    className={[
      "rounded-xl border p-5 shadow-sm space-y-2",
      (() => {
        const run = latestCompletedRun as any;
        const finalPass =
          run.override_pass != null ? !!run.override_pass : !!run.computed_pass;

        return finalPass
          ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900/40"
          : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/40";
      })(),
    ].join(" ")}
  >
    {(() => {
      const run = latestCompletedRun as any;
      const finalPass =
        run.override_pass != null ? !!run.override_pass : !!run.computed_pass;
      const wouldFail = run.computed_pass === false && run.override_pass === true;
      const reasons = extractTopReasons(run);

      if (!finalPass) {
        return (
          <>
            <div className="text-sm font-semibold">FAILED — Retest Required</div>
            <div className="text-sm text-gray-700 dark:text-gray-200">
              Latest completed test: {String(run.test_type ?? "Test")} •{" "}
              {formatDateLA(String(run.created_at))}
            </div>

            {reasons.length ? (
              <ul className="list-disc pl-5 text-sm text-gray-800 dark:text-gray-100">
                {reasons.map((r: string, i: number) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-gray-700 dark:text-gray-200">
                Next step: submit corrections and supporting photos in the portal.
              </div>
            )}
          </>
        );
      }

      return (
        <>
          <div className="text-sm font-semibold">
            {wouldFail
              ? "PASS (Override) — Review Required"
              : "PASS — Job meets requirements"}
          </div>

          <div className="text-sm text-gray-700 dark:text-gray-200">
            Latest completed test: {String(run.test_type ?? "Test")} •{" "}
            {formatDateLA(String(run.created_at))}
          </div>

          {wouldFail && reasons.length ? (
            <div className="text-sm text-gray-700 dark:text-gray-200">
              Would have failed without override:
              <ul className="list-disc pl-5 mt-1">
                {reasons.map((r: string, i: number) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      );
    })()}
  </div>
) : null}

{/* At a glance */}
<div className="rounded-xl border bg-white dark:bg-gray-900 p-5 shadow-sm space-y-3">
  <div className="text-sm font-semibold">At a glance</div>

  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
    <div className="rounded-lg border bg-gray-50 dark:bg-gray-800/40 p-3">
      <div className="text-xs text-gray-500 dark:text-gray-300">Scheduled</div>
      <div className="font-medium mt-1">
        {(job as any).scheduled_date ? String((job as any).scheduled_date) : "Not scheduled"}
        {windowLabel ? ` • ${windowLabel}` : ""}
      </div>
    </div>

    <div className="rounded-lg border bg-gray-50 dark:bg-gray-800/40 p-3">
      <div className="text-xs text-gray-500 dark:text-gray-300">Status</div>
      <div className="font-medium mt-1">
        {(job.status ?? "—") as string} • {(job.ops_status ?? "—") as string}
      </div>
    </div>

    {(job as any).permit_number ? (
      <div className="rounded-lg border bg-gray-50 dark:bg-gray-800/40 p-3">
        <div className="text-xs text-gray-500 dark:text-gray-300">Permit</div>
        <div className="font-medium mt-1">{String((job as any).permit_number)}</div>
      </div>
    ) : null}

    {(job as any).pending_info_reason || (job as any).next_action_note ? (
      <div className="rounded-lg border bg-gray-50 dark:bg-gray-800/40 p-3">
        <div className="text-xs text-gray-500 dark:text-gray-300">Next action</div>
        <div className="font-medium mt-1">
          {String((job as any).pending_info_reason || (job as any).next_action_note)}
        </div>
      </div>
    ) : null}
  </div>
</div>


     

      
      {/* Notes Section */}
      <div className="rounded-xl border bg-white dark:bg-gray-900 p-5 shadow-sm space-y-3">
  <div className="text-sm font-semibold">Add a note</div>
  <div className="text-sm text-gray-600 dark:text-gray-300">
    Use this to request an afternoon appointment, add gate codes, access notes, etc.
  </div>

  <form action={addContractorNote} className="space-y-3">
    <input type="hidden" name="job_id" value={jobId} />

    <textarea
      name="note"
      rows={3}
      placeholder="Type your note here..."
      className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-900"
    />

    <button
      type="submit"
      className="px-4 py-2 rounded-lg border bg-gray-900 text-white text-sm font-medium hover:opacity-90 transition"
    >
      Save Note
    </button>
  </form>
</div>



{/* Collapsible sections (single-open) */}
<AccordionCards
  items={[
    {
  key: "notes",
  title: (
    <div className="flex items-center justify-between w-full">
      <span>Notes</span>
      <span className="text-xs text-gray-500 dark:text-gray-300">
        {contractorNotes.length} total
      </span>
    </div>
  ),
  children: (
    <>
      {contractorNotes.length === 0 ? (
        <div className="text-sm text-gray-600 dark:text-gray-300">
          No notes yet.
        </div>
      ) : (
        <div className="space-y-2">
          {contractorNotes.map((n: any, idx: number) => {
            const who =
              n.user_id && myUid && n.user_id === myUid
                ? "You"
                : `User ${shortUid(n.user_id)}`;

            return (
              <div
                key={`${String(n.created_at)}-${idx}`}
                className="rounded-lg border bg-gray-50 dark:bg-gray-800/40 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-gray-500 dark:text-gray-300">
                    {who}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-300">
                    {n.created_at
                      ? formatDateLA(String(n.created_at))
                      : "—"}
                  </div>
                </div>

                <div className="text-sm text-gray-800 dark:text-gray-100 mt-2 whitespace-pre-wrap">
                  {n.note}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  ),
},

    {
      key: "test-results",
      title: (
        <div className="flex items-center justify-between w-full">
          <span>Test results</span>
          <span className="text-xs text-gray-500 dark:text-gray-300">
            Runs: {(testRuns?.length ?? 0) as number}
          </span>
        </div>
      ),
      defaultOpen: true,
      children: (
        <>
          {!testRuns || testRuns.length === 0 ? (
            <div className="text-sm text-gray-600 dark:text-gray-300">
              No test results yet.
            </div>
          ) : (
            <div className="space-y-2">
              {testRuns.map((r: any) => {
                const pass =
                  r.override_pass != null ? !!r.override_pass : !!r.computed_pass;
                const inst = chainById.get(r.job_id);
                const instLabel = inst?.id === rootJobId ? "Original" : "Retest";

                return (
                  <div
                    key={r.id}
                    className="rounded-lg border bg-gray-50 dark:bg-gray-800/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">
                        {String(r.test_type ?? "Test")}{" "}
                        <span className="text-xs text-gray-500 dark:text-gray-300">
                          • {instLabel}
                        </span>
                      </div>
                      <span
                        className={[
                          "text-xs px-2 py-1 rounded",
                          pass
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200"
                            : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
                        ].join(" ")}
                      >
                        {pass ? "PASS" : "FAIL"}
                      </span>
                    </div>

                    <div className="text-xs text-gray-500 dark:text-gray-300 mt-1">
                      {r.created_at ? formatDateLA(String(r.created_at)) : "—"}
                    </div>

                    {/* show top reasons when fail */}
                    {!pass ? (() => {
                      const reasons = extractTopReasons(r);
                      if (!reasons.length) return null;
                      return (
                        <ul className="list-disc pl-5 text-sm mt-2 text-gray-800 dark:text-gray-100">
                          {reasons.slice(0, 3).map((x: string, i: number) => (
                            <li key={i}>{x}</li>
                          ))}
                        </ul>
                      );
                    })() : null}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ),
    },
    {
      key: "job-history",
      title: (
        <div className="flex items-center justify-between w-full">
          <span>Job history</span>
          <span className="text-xs text-gray-500 dark:text-gray-300">
            Instances: {(jobChain?.length ?? 0) as number}
          </span>
        </div>
      ),
      children: (
        <>
          {!jobChain || jobChain.length === 0 ? (
            <div className="text-sm text-gray-600 dark:text-gray-300">—</div>
          ) : (
            <div className="space-y-2">
              {jobChain.map((j: any, idx: number) => {
                const isCurrent = j.id === jobId;
                const label = idx === 0 ? "Original" : `Retest ${idx}`;
                const win =
                  j.scheduled_date && j.window_start && j.window_end
                    ? `${formatTimeLocal(j.window_start)}–${formatTimeLocal(j.window_end)}`
                    : null;

                return (
                  <div
                    key={j.id}
                    className={[
                      "rounded-lg border p-3",
                      isCurrent
                        ? "bg-white dark:bg-gray-900"
                        : "bg-gray-50 dark:bg-gray-800/40",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">
                        {label}
                        {isCurrent ? " • (current)" : ""}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-300">
                        {j.created_at ? formatDateLA(String(j.created_at)) : "—"}
                      </div>
                    </div>

                    <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                      Status: {String(j.status ?? "—")} • Ops:{" "}
                      {String(j.ops_status ?? "—")}
                      {j.scheduled_date ? ` • Scheduled: ${String(j.scheduled_date)}` : ""}
                      {win ? ` • ${win}` : ""}
                    </div>

                    {!isCurrent ? (
                      <div className="mt-2">
                        <Link
                          href={`/portal/jobs/${j.id}`}
                          className="text-sm underline text-gray-900 dark:text-gray-100 hover:opacity-80"
                        >
                          View this instance
                        </Link>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ),
    },
    {
      key: "history",
      title: (
        <div className="flex items-center justify-between w-full">
          <span>Audit Trail</span>
          <span className="text-xs text-gray-500 dark:text-gray-300">
            Events: {(events?.length ?? 0) as number}
          </span>
        </div>
      ),
      children: (
        <>
          {!events || events.length === 0 ? (
            <div className="text-sm text-gray-600 dark:text-gray-300">
              No history yet.
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((e: any, idx: number) => {
                const meta = typeof e.meta === "string" ? null : e.meta;

                return (
                  <div
                    key={`${String(e.created_at)}-${idx}`}
                    className="rounded-lg border bg-gray-50 dark:bg-gray-800/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">
                        {e.event_type === "contractor_note" && "Note added"}
                        {e.event_type === "customer_attempt" && "Contact attempt"}
                        {e.event_type === "contractor_correction_submission" &&
                          "Corrections submitted"}
                        {e.event_type === "attachment_added" && "Attachment added"}

                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-300">
                          •{" "}
                          {e.user_id && myUid && e.user_id === myUid
                            ? "You"
                            : `User ${shortUid(e.user_id)}`}
                        </span>
                      </div>

                      <div className="text-xs text-gray-500 dark:text-gray-300">
                        {formatDateLA(String(e.created_at))}
                      </div>
                    </div>

                    {/* safe meta rendering */}
                    {meta ? (
                      <div className="text-sm text-gray-700 dark:text-gray-200 mt-2">
                        {e.event_type === "contractor_note" && meta.note ? (
                          <div className="whitespace-pre-wrap">{String(meta.note)}</div>
                        ) : e.event_type === "customer_attempt" ? (
                          <div>
                            {meta.method ? String(meta.method) : "Attempt"}
                            {meta.result ? ` — ${String(meta.result)}` : ""}
                          </div>
                        ) : e.event_type === "contractor_correction_submission" ? (
                          <div>Corrections submitted.</div>
                        ) : e.event_type === "attachment_added" ? (
                          <div>Attachment uploaded.</div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ),
    },
    {
      key: "equipment",
      title: (
        <div className="flex items-center justify-between w-full">
          <span>Equipment</span>
          <span className="text-xs text-gray-500 dark:text-gray-300">
            Systems: {(systems?.length ?? 0) as number} • Items:{" "}
            {(equipment?.length ?? 0) as number}
          </span>
        </div>
      ),
      children: (
        <>
          {(!equipment || equipment.length === 0) && (!systems || systems.length === 0) ? (
            <div className="text-sm text-gray-600 dark:text-gray-300">
              No equipment added yet.
            </div>
          ) : (
            <div className="space-y-4">
              {(systems ?? []).map((s: any) => {
                const rows = grouped.get(s.id) ?? [];
                return (
                  <div
                    key={s.id}
                    className="rounded-lg border bg-gray-50 dark:bg-gray-800/40 p-3"
                  >
                    <div className="text-sm font-semibold">{String(s.name ?? "System")}</div>

                    {rows.length === 0 ? (
                      <div className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                        No equipment items on this system yet.
                      </div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {rows.map((e: any) => {
                          const role = String(e.equipment_role ?? "—");
                          const make = e.manufacturer ? String(e.manufacturer) : "";
                          const model = e.model ? String(e.model) : "";
                          const serial = e.serial ? String(e.serial) : "";
                          const ton = e.tonnage != null ? `${e.tonnage} ton` : "";
                          const ref = e.refrigerant_type ? String(e.refrigerant_type) : "";

                          const line1 = [make, model].filter(Boolean).join(" ");
                          const line2 = [serial ? `S/N ${serial}` : "", ton, ref]
                            .filter(Boolean)
                            .join(" • ");

                          return (
                            <div
                              key={e.id}
                              className="rounded-md border bg-white dark:bg-gray-900 p-3"
                            >
                              <div className="text-sm font-medium">{role}</div>
                              {line1 ? (
                                <div className="text-sm text-gray-700 dark:text-gray-200 mt-1">
                                  {line1}
                                </div>
                              ) : null}
                              {line2 ? (
                                <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                                  {line2}
                                </div>
                              ) : null}
                              {e.notes ? (
                                <div className="text-xs text-gray-600 dark:text-gray-300 mt-2">
                                  Notes: {String(e.notes)}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Fallback group if some equipment has no system_id */}
              {Array.from(grouped.keys())
                .filter((k) => k.startsWith("loc:"))
                .map((k) => {
                  const locName = k.replace("loc:", "");
                  const rows = grouped.get(k) ?? [];
                  return (
                    <div
                      key={k}
                      className="rounded-lg border bg-gray-50 dark:bg-gray-800/40 p-3"
                    >
                      <div className="text-sm font-semibold">{locName}</div>
                      <div className="mt-2 space-y-2">
                        {rows.map((e: any) => (
                          <div
                            key={e.id}
                            className="rounded-md border bg-white dark:bg-gray-900 p-3"
                          >
                            <div className="text-sm font-medium">
                              {String(e.equipment_role ?? "—")}
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                              {[e.manufacturer, e.model].filter(Boolean).join(" ")}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </>
      ),
    },
  ]}
/>


       
           {/* Attachments (upload + list) */}
      <JobAttachments jobId={jobId} initialItems={items} />

      {/* Help */}
      <div className="rounded-xl border bg-white dark:bg-gray-900 p-4 text-sm text-gray-700 dark:text-gray-200 shadow-sm">
        If you need help, contact Compliance Matters:{" "}
        <b className="whitespace-nowrap">(209) 518-2383</b>
      </div>
    </div>
  );
}