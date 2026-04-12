import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { upsertCustomerProfileFromForm, claimNullOwnerCustomer } from "@/lib/actions/customer-actions";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";

export default async function CustomerEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ saved?: string; claimError?: string }>;
}) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  

  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (!user || userErr) redirect("/login");

  let internalUser;
  try {
    ({ internalUser } = await requireInternalUser({ supabase, userId: user.id }));
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect("/login");
    }

    throw error;
  }

  const admin = createAdminClient();
  const accountOwnerUserId = String(internalUser.account_owner_user_id ?? "").trim();

  const { data: customer, error } = await admin
    .from("customers")
    .select(
      "id, first_name, last_name, phone, email, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip"
    )
    .eq("id", id)
    .eq("owner_user_id", accountOwnerUserId)
    .maybeSingle();

  

  if (error || !customer) {
    const claimError = sp?.claimError as string | undefined;

    let adminRow: { id: string; owner_user_id: string | null; full_name: string | null } | null = null;
    let adminUnavailable = false;
    try {
      const { data } = await admin
        .from("customers")
        .select("id, owner_user_id, full_name")
        .eq("id", id)
        .maybeSingle();
      adminRow = data;
    } catch {
      adminUnavailable = true;
    }

    const claimAction = claimNullOwnerCustomer.bind(null, id);

    const isOrphaned = !adminUnavailable && adminRow !== null && adminRow.owner_user_id === null;
    const isOwnedByOther =
      !adminUnavailable &&
      adminRow !== null &&
      adminRow.owner_user_id !== null &&
      adminRow.owner_user_id !== accountOwnerUserId;
    const rowMissing = !adminUnavailable && adminRow === null;

    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <div className="text-xl font-semibold">Edit Customer</div>

        {claimError && (
          <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
            {claimError === "already_owned"
              ? "This record is owned by another account."
              : claimError === "row_not_found"
              ? "Customer record not found."
              : claimError === "contractors_not_allowed"
              ? "Contractors cannot claim internal records."
              : "Claim failed. Please try again."}
          </div>
        )}

        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900 space-y-3">
          <div className="font-semibold">Could not load customer.</div>

          {adminUnavailable && (
            <div className="text-red-800">
              This record is not accessible with your current account.
            </div>
          )}

          {rowMissing && (
            <div className="text-red-800">
              This customer record does not exist.
            </div>
          )}

          {isOrphaned && (
            <div className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900 space-y-2">
              <div className="font-semibold">Unclaimed record</div>
              <div>
                This customer exists but has no owner assigned. You can claim it to gain access.
              </div>
              <div className="text-xs text-amber-700">
                Name: <span className="font-medium">{adminRow?.full_name ?? "(unnamed)"}</span>
              </div>
              <form action={claimAction}>
                <button
                  type="submit"
                  className="mt-1 rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800"
                >
                  Claim this record
                </button>
              </form>
            </div>
          )}

          {isOwnedByOther && (
            <div className="text-red-800">
              This record is owned by another account and cannot be accessed here.
            </div>
          )}
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
    <div className="min-h-screen bg-slate-50">
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {sp?.saved === "1" && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-900 shadow">
            Saved ✓
          </div>
        )}
        <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
  <h1 className="text-2xl font-semibold">Edit Customer</h1>

  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
    <span className="font-medium">
      {(customer.first_name ?? "").trim() || "Unknown"}
      {(customer.last_name ?? "").trim() ? ` • ${customer.last_name}` : ""}
    </span>
    {customer.phone ? (
      <span className="text-slate-500">• {customer.phone}</span>
    ) : null}
    {customer.email ? (
      <span className="text-slate-500">• {customer.email}</span>
    ) : null}
  </div>

  <div className="text-sm text-slate-500">
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

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">

          <div className="text-base font-semibold text-slate-900">Customer</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">First Name</label>
              <input
                name="first_name"
                defaultValue={customer.first_name ?? ""}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Last Name</label>
              <input
                name="last_name"
                defaultValue={customer.last_name ?? ""}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Phone</label>
              <input
                name="phone"
                defaultValue={customer.phone ?? ""}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Email</label>
              <input
                name="email"
                defaultValue={customer.email ?? ""}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">

          <div className="text-base font-semibold text-slate-900">Billing Address</div>

          <div className="space-y-3">
            <input
              name="billing_address_line1"
              placeholder="Address line 1"
              defaultValue={customer.billing_address_line1 ?? ""}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
            />
            <input
              name="billing_address_line2"
              placeholder="Address line 2"
              defaultValue={customer.billing_address_line2 ?? ""}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                name="billing_city"
                placeholder="City"
                defaultValue={customer.billing_city ?? ""}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
              />
              <input
                name="billing_state"
                placeholder="State"
                defaultValue={customer.billing_state ?? ""}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
              />
              <input
                name="billing_zip"
                placeholder="ZIP"
                defaultValue={customer.billing_zip ?? ""}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>
        </div>

        <button
          className="rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-700"
          type="submit"
        >
          Save Customer
        </button>
      </form>
      </div>
    </div>
  );
}
