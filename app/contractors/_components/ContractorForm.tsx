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
  embedded = false,
}: {
  mode: "create" | "edit";
  contractor?: ContractorRow | null;
  action: (formData: FormData) => Promise<void>;
  embedded?: boolean;
}) {
  const isEdit = mode === "edit";

  return (
    <div className={embedded ? "space-y-6" : "mx-auto max-w-4xl space-y-6 p-4 sm:p-6"}>
      {!embedded ? (
        <div className="rounded-2xl border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98)_58%,rgba(224,242,254,0.68))] p-5 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.34)] sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-[1.8rem] font-semibold tracking-[-0.02em] text-slate-950">
                {isEdit ? "Edit Contractor" : "New Contractor"}
              </h1>
              <p className="text-sm leading-6 text-slate-600">
                {isEdit
                  ? "Update core company profile and billing contact details."
                  : "Create a contractor company record. If an email is provided, submitting may also send an invite email."}
              </p>
            </div>

            <div className="flex gap-2">
              <Link
                href="/ops/admin/contractors"
                className="inline-flex items-center rounded-lg border border-slate-300/90 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_8px_20px_-16px_rgba(15,23,42,0.35)] active:translate-y-[0.5px]"
              >
                Back to contractors
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      <form action={action} className="space-y-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] sm:p-6">
        {isEdit && (
          <input type="hidden" name="contractor_id" value={contractor?.id ?? ""} />
        )}

        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-[-0.01em] text-slate-950">Core Identity & Contact</h2>
            <p className="text-xs leading-5 text-slate-600">
              Primary contractor company information used across assignment and admin workflows.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Name *</label>
              <input
                name="name"
                defaultValue={contractor?.name ?? ""}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)] focus:outline-none focus:ring-2 focus:ring-slate-200"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Phone</label>
              <input
                name="phone"
                defaultValue={contractor?.phone ?? ""}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)] focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Email</label>
              <input
                name="email"
                defaultValue={contractor?.email ?? ""}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)] focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700">Notes</label>
              <textarea
                name="notes"
                defaultValue={contractor?.notes ?? ""}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)] focus:outline-none focus:ring-2 focus:ring-slate-200"
                rows={3}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-[-0.01em] text-slate-950">Billing Profile</h2>
            <p className="text-xs leading-5 text-slate-600">
              Billing contact and remittance information for contractor-facing documents.
            </p>
          </div>

          <div className="space-y-3">
            <input
              name="billing_name"
              placeholder="Billing Name"
              defaultValue={contractor?.billing_name ?? ""}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)] focus:outline-none focus:ring-2 focus:ring-slate-200"
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                name="billing_email"
                placeholder="Billing Email"
                defaultValue={contractor?.billing_email ?? ""}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)] focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              <input
                name="billing_phone"
                placeholder="Billing Phone"
                defaultValue={contractor?.billing_phone ?? ""}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)] focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <input
              name="billing_address_line1"
              placeholder="Billing Address line 1"
              defaultValue={contractor?.billing_address_line1 ?? ""}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)] focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
            <input
              name="billing_address_line2"
              placeholder="Billing Address line 2"
              defaultValue={contractor?.billing_address_line2 ?? ""}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)] focus:outline-none focus:ring-2 focus:ring-slate-200"
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                name="billing_city"
                placeholder="City"
                defaultValue={contractor?.billing_city ?? ""}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)] focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              <input
                name="billing_state"
                placeholder="State"
                defaultValue={contractor?.billing_state ?? ""}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)] focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              <input
                name="billing_zip"
                placeholder="ZIP"
                defaultValue={contractor?.billing_zip ?? ""}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)] focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs leading-5 text-slate-500">
            Changes update the contractor record without altering lifecycle history.
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_26px_-20px_rgba(15,23,42,0.52)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_20px_30px_-22px_rgba(15,23,42,0.6)] active:translate-y-[0.5px]"
            >
              {isEdit ? "Save Contractor" : "Create Contractor"}
            </button>
            {!embedded ? (
              <Link
                href="/ops"
                className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_10px_20px_-16px_rgba(15,23,42,0.35)] active:translate-y-[0.5px]"
              >
                Back to Ops
              </Link>
            ) : null}
          </div>
        </div>
      </form>
    </div>
  );
}