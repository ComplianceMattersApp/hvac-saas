import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function JobsPage() {
  const supabase = await createClient();

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("id, title, city, status, scheduled_date, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Jobs</h1>
        <div className="flex gap-2">
          <Link
            href="/jobs/new"
            className="px-3 py-2 rounded bg-blue-600 text-white text-sm"
          >
            New Job
          </Link>
          <Link
            href="/calendar"
            className="px-3 py-2 rounded border text-sm"
          >
            Calendar
          </Link>
        </div>
      </div>

      {(!jobs || jobs.length === 0) ? (
        <div className="rounded border p-4 text-sm text-gray-600">
          No jobs yet. Click <b>New Job</b> to create your first one.
        </div>
      ) : (
        <div className="rounded border divide-y">
          {jobs.map((job) => (
            <Link
              key={job.id}
              href={`/jobs/${job.id}`}
              className="block p-4 hover:bg-gray-50"
            >
              <div className="font-medium">{job.title}</div>
              <div className="text-sm text-gray-600">
                {job.city ?? "—"} • {job.status ?? "—"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}