import { scheduleVisit } from "./schedule-actions";
import { closeVisit } from "./close-visit-actions";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createNextVisit } from "./visit-actions";
import { scheduleRetest } from "./retest-actions";


function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

export default async function LocationDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  const { id } = await props.params;
  if (!id || !isUuid(id)) redirect("/customers");

  const locationId = id;

  const { data: location, error: locationErr } = await supabase
    .from("location_summary")
    .select("*")
    .eq("location_id", locationId)
    .maybeSingle();

  if (locationErr) throw locationErr;

  if (!location) {
    return (
      <div className="p-6 space-y-2">
        <h1 className="text-xl font-semibold">Location not found</h1>
        <Link href="/customers" className="underline text-sm">
          Back to Customers
        </Link>
      </div>
    );
  }

  const { data: equipment, error: equipmentErr } = await supabase
    .from("equipment")
    .select("*")
    .eq("location_id", locationId)
    .order("created_at", { ascending: false });

  if (equipmentErr) throw equipmentErr;

  const { data: jobs, error: jobsErr } = await supabase
    .from("location_jobs")
    .select("*")
    .eq("location_id", locationId)
    .order("scheduled_date", { ascending: false });

  if (jobsErr) throw jobsErr;

  const jobIds = (jobs ?? []).map((j: any) => j.job_id).filter(Boolean);

  const { data: visitSummaries, error: visitErr } = jobIds.length
    ? await supabase
        .from("job_visit_test_summary")
        .select("*")
        .in("job_id", jobIds)
    : { data: [], error: null };

  if (visitErr) throw visitErr;

  const visitsByJob = new Map<string, any[]>();
  for (const row of visitSummaries ?? []) {
    const arr = visitsByJob.get(row.job_id) ?? [];
    arr.push(row);
    visitsByJob.set(row.job_id, arr);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <Link
          href={`/customers/${location.customer_id}`}
          className="text-sm underline"
        >
          ← Back to Customer
        </Link>

        <h1 className="text-2xl font-semibold mt-2">
          {location.address_line1 ?? "Location"}
        </h1>

        <div className="text-sm text-muted-foreground">
          {location.city}, {location.state} {location.zip}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">Equipment</h2>

        {equipment?.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No equipment recorded.
          </div>
        ) : (
          <div className="grid gap-2">
            {equipment?.map((e: any) => (
              <div key={e.id} className="border rounded p-3 text-sm">
                <div className="font-medium">{e.nickname ?? "System"}</div>
                <div className="text-muted-foreground">
                  {e.manufacturer ?? ""} {e.model ?? ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">Jobs</h2>

        {jobs?.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No jobs for this location.
          </div>
        ) : (
          <div className="grid gap-2">
            {jobs?.map((j: any) => {
              const visits = visitsByJob.get(j.job_id) ?? [];
              visits.sort((a, b) => (a.visit_number ?? 0) - (b.visit_number ?? 0));

              return (
                <div key={j.job_id} className="border rounded p-3 text-sm">
                  <div className="font-medium">{j.title}</div>

                  <div className="text-muted-foreground">
                    {j.status} •{" "}
                    {j.scheduled_date
                      ? new Date(j.scheduled_date).toLocaleString()
                      : "Not scheduled"}
                  </div>

                  {/* Visits */}
                  {visits.length === 0 ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      No visits recorded yet.
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <div className="text-xs font-medium">Visits</div>

                      <div className="grid gap-2">
                        {visits.map((v: any) => (
                          <div key={v.visit_id} className="rounded border p-2 text-xs">
                            <div className="font-medium">
                              Visit #{v.visit_number}
                            </div>

                            <div className="text-muted-foreground">
                              Tests: {v.test_runs_count} • Pass: {v.pass_count} • Fail:{" "}
                              {v.fail_count}
                              {v.last_test_run_at
                                ? ` • Last test: ${new Date(
                                    v.last_test_run_at
                                  ).toLocaleString()}`
                                : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
