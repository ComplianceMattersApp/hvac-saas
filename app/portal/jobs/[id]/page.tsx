// app/portal/jobs/[id]/page.tsx
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import JobAttachments from "@/components/portal/JobAttachments";

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
      "id, title, status, ops_status, city, job_address, created_at, follow_up_date"
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

  return (
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
            <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              {(job.job_address ?? "—") as string}
              {job.city ? ` • ${job.city}` : ""}
            </div>
          </div>

          <Link
            href="/portal"
            className="px-3 py-2 rounded-lg border bg-white dark:bg-gray-900 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            Back
          </Link>
        </div>

        <div className="flex flex-wrap gap-2 pt-3 text-xs">
          <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800">
            Status: {(job.status ?? "—") as string}
          </span>
          <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800">
            Ops: {(job.ops_status ?? "—") as string}
          </span>
          {job.follow_up_date ? (
            <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800">
              Follow-up: {job.follow_up_date}
            </span>
          ) : null}
          {job.created_at ? (
            <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800">
              Created: {formatDateLA(String(job.created_at))}
            </span>
          ) : null}
        </div>
      </div>

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