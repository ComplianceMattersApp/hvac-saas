"use client";

type Props = {
  mode: "internal" | "external";
  titleRequired?: boolean;
};

export default function JobCoreFields({ mode, titleRequired }: Props) {
  const titleIsRequired = Boolean(titleRequired);

  return (
    <div className="space-y-4">
      {/* Job Details */}
      <div className="rounded-lg border p-3 space-y-3">
        <div className="text-sm font-semibold">Job Details</div>

        <div className="space-y-1">
          <label className="block text-sm font-medium">Job Title</label>
          <input
            type="text"
            name="title"
            required={titleIsRequired}
            placeholder={titleIsRequired ? "" : "Optional"}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium">Permit Number (optional)</label>
          <input
            type="text"
            name="permit_number"
            className="w-full border rounded px-3 py-2"
          />
        </div>
      </div>

      {/* Customer */}
      <div className="rounded-lg border p-3 space-y-3">
        <div className="text-sm font-semibold">Customer</div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-sm font-medium">First Name</label>
            <input
              type="text"
              name="customer_first_name"
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium">Last Name</label>
            <input
              type="text"
              name="customer_last_name"
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium">Phone</label>
            <input
              type="tel"
              name="customer_phone"
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium">Email (optional)</label>
            <input
              type="email"
              name="customer_email"
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>
      </div>

      {/* Service Location */}
      <div className="rounded-lg border p-3 space-y-3">
        <div className="text-sm font-semibold">Service Location</div>

        <div className="space-y-1">
          <label className="block text-sm font-medium">Address</label>
          <input
            type="text"
            name="address_line1"
            required
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium">City</label>
          <input
            type="text"
            name="city"
            className="w-full border rounded px-3 py-2"
            required
          />
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-lg border p-3 space-y-2">
        <div className="text-sm font-semibold">Additional Comments/Notes</div>
        <textarea
          name="job_notes"
          rows={4}
          className="w-full border rounded px-3 py-2"
        />
      </div>

      {/* Mode hint (optional, harmless) */}
      {mode === "external" ? null : null}
    </div>
  );
}