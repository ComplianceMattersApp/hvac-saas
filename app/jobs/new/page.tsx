// app/jobs/new/page.tsx

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NewJobForm from "./NewJobForm";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export default async function NewJobPage(props: {
  searchParams?: Promise<{ customer_id?: string }>;
}) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");
  
  const user = userData.user;

  

  // Identify contractor user (multi-user per contractor)
  let myContractor: { id: string; name: string } | null = null;

  const { data: cu, error: cuErr } = await supabase
    .from("contractor_users")
    .select("contractor_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (cuErr) throw new Error(cuErr.message);

  if (cu?.contractor_id) {
    const { data: cRow, error: cErr } = await supabase
      .from("contractors")
      .select("id, name")
      .eq("id", cu.contractor_id)
      .maybeSingle();

    if (cErr) throw new Error(cErr.message);
    if (cRow?.id) myContractor = { id: cRow.id, name: cRow.name };
  }

  // Still fetch contractors list for internal/admin use
  const { data: contractors, error } = await supabase
    .from("contractors")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  const sp = props.searchParams ? await props.searchParams : undefined;
  const customerId = String(sp?.customer_id ?? "").trim();

  // Optional: existing customer mode
  let existingCustomer: any = null;
  let customerLocations: any[] = [];

  if (customerId && isUuid(customerId)) {
    const { data: cRow, error: cErr } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone, email")
      .eq("id", customerId)
      .maybeSingle();

    if (cErr) throw cErr;
    existingCustomer = cRow;

    const { data: locs, error: locErr } = await supabase
      .from("locations")
      .select("id, address_line1, city, state, zip, nickname")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (locErr) throw locErr;
    customerLocations = locs ?? [];
  }

  return (
    <NewJobForm
      contractors={contractors ?? []}
      existingCustomer={existingCustomer}
      locations={customerLocations}
      myContractor={myContractor}
    />
  );
}