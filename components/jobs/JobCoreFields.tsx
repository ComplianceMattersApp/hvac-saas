// components/jobs/JobCoreFields
"use client";

type Props = {
  mode: "internal" | "external";
  titleRequired?: boolean;
  showJobTitle?: boolean;
  hideCustomer?: boolean;
  hideServiceLocation?: boolean;
  jobType?: "ecc" | "service";
  showJobDetails?: boolean;
  showCustomerSection?: boolean;
  showServiceLocationSection?: boolean;
  showNotesSection?: boolean;
};

export default function JobCoreFields({
  mode,
  titleRequired,
  showJobTitle,
  hideCustomer,
  hideServiceLocation,
  jobType = "ecc",
  showJobDetails = true,
  showCustomerSection = true,
  showServiceLocationSection = true,
  showNotesSection = true,
}: Props) {
  const titleIsRequired = Boolean(titleRequired);
  const showEccPermitFields = jobType !== "service";
  const shouldShowJobTitle = showJobTitle ?? jobType === "service";

  return (
    <div className="space-y-4">
      {/* Job Details */}
      {showJobDetails && (
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="text-sm font-semibold text-slate-900">Job Details</div>

        {shouldShowJobTitle && (
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-900">Job Title</label>
            <input
              type="text"
              name="title"
              required={titleIsRequired}
              placeholder={titleIsRequired ? "" : "Optional"}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
            />
          </div>
        )}

        {showEccPermitFields && (
          <>
            <div className="space-y-1">
              <label className="block text-sm font-medium">
                Permit Number (optional)
              </label>
              <input
                type="text"
                name="permit_number"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-sm font-medium">
                  Jurisdiction (optional)
                </label>
                <input
                  type="text"
                  name="jurisdiction"
                  placeholder="City or county permit office"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium">
                  Permit Date (optional)
                </label>
                <input
                  type="date"
                  name="permit_date"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                />
              </div>
            </div>
          </>
        )}
      </div>
      )}

      {/* Customer */}
      {showCustomerSection && !hideCustomer && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-900">Customer</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-900">First Name</label>
              <input
                type="text"
                name="customer_first_name"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-900">Last Name</label>
              <input
                type="text"
                name="customer_last_name"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-900">Phone</label>
              <input
                type="tel"
                name="customer_phone"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-900">Email (optional)</label>
              <input
                type="email"
                name="customer_email"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
              />
            </div>
          </div>
        </div>
      )}

      {/* Service Location */}
      {showServiceLocationSection && !hideServiceLocation && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-900">Service Location</div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-900">Address</label>
            <input
              type="text"
              name="address_line1"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-900">City</label>
            <input
              type="text"
              name="city"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-900">ZIP Code</label>
            <input
              type="text"
              name="zip"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
              required
            />
          </div>

          <input type="hidden" name="state" value="CA" />
        </div>
      )}

      {/* Notes */}
      {showNotesSection && (
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
        <div className="text-sm font-semibold text-slate-900">Additional Comments/Notes</div>
        {mode === "external" && (
          <p className="text-xs text-slate-600">
            Need to share timing, availability, or scheduling details? Add them in the notes section and our team will review.
          </p>
        )}
        <textarea
          name="job_notes"
          rows={4}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
        />
      </div>
      )}

      {mode === "external" ? null : null}
    </div>
  );
}