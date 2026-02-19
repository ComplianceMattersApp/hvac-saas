import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { upsertCustomerProfileFromForm } from "@/lib/actions/customer-actions";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;


  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (!user || userErr) redirect("/login");

  const { data: customer, error } = await supabase
    .from("customers")
    .select(
      "id, first_name, last_name, phone, email, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip"
    )
    .eq("id", id)
    .maybeSingle();

  // ✅ DIAGNOSTIC: show real errors instead of returning 404
  if (error || !customer) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <div className="text-xl font-semibold">Edit Customer</div>

        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <div className="font-semibold mb-2">Could not load customer.</div>
          <div>
            <span className="font-medium">Customer ID:</span> {id}
          </div>
          <div className="mt-2">
            <span className="font-medium">Error:</span>{" "}
            {error ? JSON.stringify(error) : "No row returned (customer is null)"}
          </div>
        </div>

        <div className="flex gap-2">
          <Link
            href={`/customers/${id}`}
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            ← Back to Customer
          </Link>
          <Link
            href="/customers"
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Customers
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
  <h1 className="text-2xl font-semibold">Edit Customer</h1>

  <div className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-200">
    <span className="font-medium">
      {(customer.first_name ?? "").trim() || "Unknown"}
      {(customer.last_name ?? "").trim() ? ` • ${customer.last_name}` : ""}
    </span>
    {customer.phone ? (
      <span className="text-zinc-400">• {customer.phone}</span>
    ) : null}
    {customer.email ? (
      <span className="text-zinc-400">• {customer.email}</span>
    ) : null}
  </div>

  <div className="text-sm text-zinc-400">
    Update contact info and billing address.
  </div>
</div>


        <div className="flex gap-2">
          <Link
            href={`/customers/${customer.id}`}
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            ← Back
          </Link>
        </div>
      </div>

      <form action={upsertCustomerProfileFromForm} className="space-y-6">
        <input type="hidden" name="customer_id" value={customer.id} />

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-sm space-y-4">

          <div className="text-base font-semibold">Customer</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-200">First Name</label>
              <input
                name="first_name"
                defaultValue={customer.first_name ?? ""}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-200">Last Name</label>
              <input
                name="last_name"
                defaultValue={customer.last_name ?? ""}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-200">Phone</label>
              <input
                name="phone"
                defaultValue={customer.phone ?? ""}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-200">Email</label>
              <input
                name="email"
                defaultValue={customer.email ?? ""}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-sm space-y-4">

          <div className="text-base font-semibold">Billing Address</div>

          <div className="space-y-3">
            <input
              name="billing_address_line1"
              placeholder="Address line 1"
              defaultValue={customer.billing_address_line1 ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            <input
              name="billing_address_line2"
              placeholder="Address line 2"
              defaultValue={customer.billing_address_line2 ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                name="billing_city"
                placeholder="City"
                defaultValue={customer.billing_city ?? ""}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
              <input
                name="billing_state"
                placeholder="State"
                defaultValue={customer.billing_state ?? ""}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
              <input
                name="billing_zip"
                placeholder="ZIP"
                defaultValue={customer.billing_zip ?? ""}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <button
  className="rounded-md bg-white text-black px-4 py-2 text-sm font-medium hover:bg-zinc-200"
  type="submit"
>

          Save Customer
        </button>
      </form>
    </div>
  );
}
