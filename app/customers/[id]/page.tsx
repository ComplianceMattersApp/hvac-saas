import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
              <Link
                key={l.location_id}
                href={`/locations/${l.location_id}`}
                className="block rounded-lg border p-4 hover:bg-muted/50"
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
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
