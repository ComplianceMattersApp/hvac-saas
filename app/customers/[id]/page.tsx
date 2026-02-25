import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { archiveCustomerFromForm } from "@/lib/actions/customer-actions";


type CustomerSummaryRow = {
  customer_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  locations_count: number;
  jobs_count: number;
  last_scheduled_date: string | null;
};

type CustomerLocationRow = {
  customer_id: string;
  location_id: string;
  nickname: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  equipment_count: number;
  jobs_count: number;
  last_scheduled_date: string | null;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

export default async function CustomerDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  // ✅ Next.js: unwrap params
  const { id } = await props.params;

  // ✅ Guard against bad route params (prevents 22P02)
  if (!id || !isUuid(id)) {
    redirect("/customers");
  }

  const customerId = id;

  const { data: customerRow, error: customerErr } = await supabase
    .from("customer_summary")
    .select("*")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (customerErr) throw customerErr;

  if (!customerRow) {
    return (
      <div className="p-6 space-y-2">
        <h1 className="text-2xl font-semibold">Customer not found</h1>
        <Link href="/customers" className="text-sm underline">
          Back to Customers
        </Link>
      </div>
      
    );
  }
  const customer = customerRow as CustomerSummaryRow;
  const { data: locationsData, error: locationsErr } = await supabase
    .from("customer_locations_summary")
    .select("*")
    .eq("customer_id", customerId)
    .order("last_scheduled_date", { ascending: false, nullsFirst: false });

  if (locationsErr) throw locationsErr;

  const locations = (locationsData ?? []) as CustomerLocationRow[];

  // Fetch jobs grouped by location
const jobsByLocation = new Map<string, any[]>();

for (const loc of locations) {
  const { data: jobsData, error: jobsErr } = await supabase
    .from("jobs")
    .select("id, title, status, ops_status, scheduled_date, created_at")
    .eq("location_id", loc.location_id)
    .order("scheduled_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (jobsErr) throw jobsErr;

  jobsByLocation.set(loc.location_id, jobsData ?? []);
}

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1">
        <Link href="/customers" className="text-sm underline">
          ← Back to Customers
        </Link>

        

        <h1 className="text-2xl font-semibold">
          {customer.full_name ?? "Unnamed Customer"}
        </h1>

        <div className="text-sm text-muted-foreground">
          {customer.phone ?? "No phone"}{" "}
          {customer.email ? `• ${customer.email}` : ""}
        </div>

        <div className="text-sm text-muted-foreground">
          {customer.locations_count} location
          {customer.locations_count === 1 ? "" : "s"} • {customer.jobs_count} job
          {customer.jobs_count === 1 ? "" : "s"}
          {customer.last_scheduled_date
            ? ` • Last scheduled: ${new Date(
                customer.last_scheduled_date
              ).toLocaleString()}`
            : ""}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Locations</h2>

        {locations.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No locations found for this customer.
          </div>
        ) : (
          <div className="grid gap-3">
            {locations.map((l) => (
              <div
                key={l.location_id}
                className="rounded-lg border p-4"
>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium">
                      {l.nickname ?? "Service Location"}
                    </div>
                    <div className="text-sm">
                      {l.address_line1 ?? "No address"}
                      {l.city ? `, ${l.city}` : ""}
                      {l.state ? `, ${l.state}` : ""}
                      {l.zip ? ` ${l.zip}` : ""}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {l.equipment_count} equipment • {l.jobs_count} jobs
                      {l.last_scheduled_date
                        ? ` • Last scheduled: ${new Date(
                            l.last_scheduled_date
                          ).toLocaleString()}`
                        : ""}
                    </div>
                  </div>
                  

                  <div className="text-sm text-muted-foreground whitespace-nowrap">
                    View →
                  </div>
                </div>

                <div className="mt-3">
  <Link
    href={`/locations/${l.location_id}`}
    className="text-sm underline text-muted-foreground"
  >
    View Location →
  </Link>
</div>

                <div className="mt-3 space-y-2">
  <div className="text-sm font-medium">Jobs</div>

  {(jobsByLocation.get(l.location_id) ?? []).length === 0 ? (
    <div className="text-sm text-muted-foreground">
      No jobs for this location.
    </div>
  ) : (
    (jobsByLocation.get(l.location_id) ?? []).map((job) => (
      <Link
        key={job.id}
        href={`/jobs/${job.id}`}
        className="block rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
      >
        <div className="flex justify-between">
          <span>{job.title ?? "Untitled Job"}</span>
          <span className="text-muted-foreground">
            {job.status === "failed"
              ? "FAILED"
              : job.status === "completed"
                ? "Completed"
                : job.scheduled_date
                  ? `Scheduled ${new Date(job.scheduled_date).toLocaleDateString()}`
                  : job.ops_status ?? "Unscheduled"}
            </span>
        </div>
      </Link>
    ))
  )}
</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 🔴 Danger Zone */}
<div className="rounded-lg border border-red-200 p-4 space-y-2">
  <div className="font-semibold text-red-700">Danger zone</div>
  <div className="text-sm text-gray-600">
    Archive removes this customer from active lists. Cannot archive if customer has jobs.
  </div>

  <form action={archiveCustomerFromForm}>
    <input type="hidden" name="customer_id" value={customerId} />
    <button
      type="submit"
      className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
    >
      Archive Customer
    </button>
  </form>
</div>
    </div>
    
    
  );
  
}
