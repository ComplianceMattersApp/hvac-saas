// app/jobs/new/page.tsx

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NewJobForm from "./NewJobForm";

type ExistingCustomerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
};

type CustomerLookupRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
};

type LocationRow = {
  id: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  nickname: string | null;
};

type LocationLookupRow = {
  id: string;
  customer_id: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  postal_code: string | null;
  nickname: string | null;
};

type ContractorMembershipRow = {
  contractor_id: string | null;
  contractors:
    | {
        name: string | null;
      }
    | Array<{
        name: string | null;
      }>
    | null;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export default async function NewJobPage(props: {
  searchParams?: Promise<{ customer_id?: string; source?: string; err?: string }>;
}) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");
  
  const user = userData.user;

  // Identify contractor user (multi-user per contractor)
  let myContractor: { id: string; name: string } | null = null;

  const { data: cu, error: cuErr } = await supabase
    .from("contractor_users")
    .select("contractor_id, contractors ( name )")
    .eq("user_id", user.id)
    .maybeSingle();

  if (cuErr) throw new Error(cuErr.message);

  if (cu?.contractor_id) {
    const contractorMembership = cu as ContractorMembershipRow;
    const contractorRelation = contractorMembership.contractors;
    const contractorNameSource = Array.isArray(contractorRelation)
      ? contractorRelation[0]?.name
      : contractorRelation?.name;
    const contractorName = String(contractorNameSource ?? "").trim() || "Contractor";
    myContractor = { id: cu.contractor_id, name: contractorName };
  }

  let contractors: Array<{ id: string; name: string }> = [];
  if (!myContractor?.id) {
    const { data: contractorRows, error } = await supabase
      .from("contractors")
      .select("id, name")
      .eq("lifecycle_state", "active")
      .order("name", { ascending: true });

    if (error) throw new Error(error.message);
    contractors = contractorRows ?? [];
  }

  const sp = props.searchParams ? await props.searchParams : undefined;
  const customerId = String(sp?.customer_id ?? "").trim();
  const source = String(sp?.source ?? "").trim().toLowerCase();
  const errorCode = String(sp?.err ?? "").trim() || null;
  const requestedCustomerContext = source === "customer";

  // Optional: existing customer mode
  let existingCustomer: ExistingCustomerRow | null = null;
  let customerLocations: LocationRow[] = [];
  let customerContextMode = false;

  // Internal guided mode lookup data
  let customerLookupRows: CustomerLookupRow[] = [];
  let locationLookupRows: LocationLookupRow[] = [];

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

  customerContextMode =
    !myContractor?.id &&
    requestedCustomerContext &&
    Boolean(existingCustomer?.id);

  if (!myContractor?.id && !customerContextMode) {
    const { data: lookupCustomers, error: lookupCustomerErr } = await supabase
      .from("customers")
      .select("id, full_name, first_name, last_name, phone, email")
      .order("full_name", { ascending: true })
      .limit(500);

    if (lookupCustomerErr) throw lookupCustomerErr;
    customerLookupRows = (lookupCustomers ?? []) as CustomerLookupRow[];

    const customerIds = customerLookupRows.map((c) => c.id).filter(Boolean);

    if (customerIds.length > 0) {
      const { data: lookupLocations, error: lookupLocationErr } = await supabase
        .from("locations")
        .select("id, customer_id, address_line1, city, state, zip, postal_code, nickname")
        .in("customer_id", customerIds)
        .order("created_at", { ascending: false })
        .limit(1200);

      if (lookupLocationErr) throw lookupLocationErr;
      locationLookupRows = (lookupLocations ?? []) as LocationLookupRow[];
    }
  }

  return (
    <NewJobForm
      contractors={contractors}
      existingCustomer={existingCustomer}
      locations={customerLocations}
      customerLookupRows={customerLookupRows}
      locationLookupRows={locationLookupRows}
      myContractor={myContractor}
      errorCode={errorCode}
      customerContextMode={customerContextMode}
      customerContextSource={customerContextMode ? "customer" : null}
    />
  );
}