// app/estimates/new/page.tsx
// Compliance Matters: Internal-only create estimate draft page.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  requireInternalUser,
  isInternalAccessError,
} from "@/lib/auth/internal-user";
import { isEstimatesEnabled } from "@/lib/estimates/estimate-exposure";
import NewEstimateForm from "./NewEstimateForm";

export const metadata = { title: "New Estimate" };

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

type CustomerRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
};

type LocationRow = {
  id: string;
  customer_id: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  nickname: string | null;
};

export default async function NewEstimatePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  try {
    await requireInternalUser({ supabase, userId: userData.user.id });
  } catch (error) {
    if (isInternalAccessError(error)) redirect("/login");
    throw error;
  }

  if (!isEstimatesEnabled()) {
    redirect("/ops?notice=estimates_unavailable");
  }

  // Resolve safe prefill customer_id from query params
  const sp = searchParams ? await searchParams : {};
  const rawCustomerId = typeof sp.customer_id === "string" ? sp.customer_id.trim() : "";
  const initialCustomerId = rawCustomerId && isUuid(rawCustomerId) ? rawCustomerId : "";

  // Load customers scoped to this account via RLS
  const { data: customerRows, error: custErr } = await supabase
    .from("customers")
    .select("id, full_name, first_name, last_name, phone, email")
    .order("full_name", { ascending: true })
    .limit(500);
  if (custErr) throw new Error(custErr.message);

  const customers = (customerRows ?? []) as CustomerRow[];
  const customerIds = customers.map((c) => c.id).filter(Boolean);

  // Load locations for those customers
  let locationRows: LocationRow[] = [];
  if (customerIds.length > 0) {
    const { data: locs, error: locErr } = await supabase
      .from("locations")
      .select("id, customer_id, address_line1, city, state, zip, nickname")
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false })
      .limit(1200);
    if (locErr) throw new Error(locErr.message);
    locationRows = (locs ?? []) as LocationRow[];
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div>
        <nav className="mb-3 text-sm text-slate-500">
          <a href="/estimates" className="hover:text-slate-900">
            Estimates
          </a>
          <span className="mx-1.5">›</span>
          <span className="text-slate-700">New Estimate</span>
        </nav>
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-slate-950">New Estimate</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Create a draft estimate for a customer. Add line items after creation.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.18)]">
        <NewEstimateForm customers={customers} locations={locationRows} initialCustomerId={initialCustomerId} />
      </div>
    </div>
  );
}
