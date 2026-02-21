import Link from "next/link";

type ContractorRow = {
  id?: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  billing_name?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
};

export function ContractorForm({
  mode,
  contractor,
  action,
}: {
  mode: "create" | "edit";
  contractor?: ContractorRow | null;
  action: (formData: FormData) => Promise<void>;
}) {
  const isEdit = mode === "edit";

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">
            {isEdit ? "Edit Contractor" : "New Contractor"}
          </h1>
          <div className="text-sm text-zinc-400">
            {isEdit
              ? "Update company contact + billing profile."
              : "Create contractor with full company + billing profile."}
          </div>
        </div>

        <div className="flex gap-2">
          <Link
            href="/contractors"
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            ← Back
          </Link>
        </div>
      </div>

      <form action={action} className="space-y-6">
        {isEdit && (
          <input type="hidden" name="contractor_id" value={contractor?.id ?? ""} />
        )}

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-sm space-y-4">
          <div className="text-base font-semibold text-white">Company</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-200">Name *</label>
              <input
                name="name"
                defaultValue={contractor?.name ?? ""}
                className="w-full rounded-md border px-3 py-2 text-sm"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-200">Phone</label>
              <input
                name="phone"
                defaultValue={contractor?.phone ?? ""}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-200">Email</label>
              <input
                name="email"
                defaultValue={contractor?.email ?? ""}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="block text-xs font-medium text-gray-200">Notes</label>
              <textarea
                name="notes"
                defaultValue={contractor?.notes ?? ""}
                className="w-full rounded-md border px-3 py-2 text-sm"
                rows={3}
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-sm space-y-4">
          <div className="text-base font-semibold text-white">Billing Profile</div>

          <div className="space-y-3">
            <input
              name="billing_name"
              placeholder="Billing Name"
              defaultValue={contractor?.billing_name ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                name="billing_email"
                placeholder="Billing Email"
                defaultValue={contractor?.billing_email ?? ""}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
              <input
                name="billing_phone"
                placeholder="Billing Phone"
                defaultValue={contractor?.billing_phone ?? ""}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <input
              name="billing_address_line1"
              placeholder="Billing Address line 1"
              defaultValue={contractor?.billing_address_line1 ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            <input
              name="billing_address_line2"
              placeholder="Billing Address line 2"
              defaultValue={contractor?.billing_address_line2 ?? ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                name="billing_city"
                placeholder="City"
                defaultValue={contractor?.billing_city ?? ""}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
              <input
                name="billing_state"
                placeholder="State"
                defaultValue={contractor?.billing_state ?? ""}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
              <input
                name="billing_zip"
                placeholder="ZIP"
                defaultValue={contractor?.billing_zip ?? ""}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="rounded-md bg-white text-black px-4 py-2 text-sm font-medium hover:bg-zinc-200"
        >
          {isEdit ? "Save Contractor" : "Create Contractor"}
        </button>

        <Link href="/ops" className="text-sm underline">
          ← Back to Ops
        </Link>
      </form>
    </div>
  );
}