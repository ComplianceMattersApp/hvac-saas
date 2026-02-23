"use client";

import { useState } from "react";
import { createJobFromForm } from "@/lib/actions";
import JobCoreFields from "@/components/jobs/JobCoreFields";

type Contractor = { id: string; name: string };

export default function NewJobForm({ contractors }: { contractors: Contractor[] }) {
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");

  const [contractorId, setContractorId] = useState<string>("");
  const [jobType, setJobType] = useState<"ecc" | "service">("ecc");

  const [billingRecipient, setBillingRecipient] = useState<
    "contractor" | "customer" | "other"
  >("customer");

  const [projectType, setProjectType] = useState<
    "alteration" | "all_new" | "new_construction"
  >("alteration");

  function onQuickWindowChange(value: string) {
    if (!value) return;
    const [start, end] = value.split("-");
    if (start) setWindowStart(start);
    if (end) setWindowEnd(end);
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-xl font-semibold mb-6">New Job</h1>

      <form action={createJobFromForm} className="space-y-4">
        {/* Job Type */}
        <div className="rounded-lg border p-3 space-y-2">
          <label className="block text-sm font-medium">Job Type</label>

          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="_jobTypeUi"
                value="ecc"
                checked={jobType === "ecc"}
                onChange={() => setJobType("ecc")}
              />
              ECC
            </label>

            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="_jobTypeUi"
                value="service"
                checked={jobType === "service"}
                onChange={() => setJobType("service")}
              />
              Service
            </label>
          </div>

          {/* Project Type (ECC only) */}
          {jobType === "ecc" ? (
            <div>
              <label className="block text-sm font-medium mb-1">Project Type</label>
              <select
                name="project_type"
                value={projectType}
                onChange={(e) => setProjectType(e.target.value as any)}
                className="w-full border rounded px-3 py-2"
              >
                <option value="alteration">Alteration</option>
                <option value="all_new">All New</option>
                <option value="new_construction">New Construction</option>
              </select>
            </div>
          ) : (
            <input type="hidden" name="project_type" value="alteration" />
          )}

          {/* Canonical field submitted */}
          <input type="hidden" name="job_type" value={jobType} />
        </div>

        {/* Shared Core Fields (title/permit/customer/address/city/notes) */}
        <JobCoreFields mode="internal" titleRequired={jobType === "service"} />

        {/* Contractor */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Contractor (optional)
          </label>
          <select
            name="contractor_id"
            value={contractorId}
            onChange={(e) => {
              const next = e.target.value;
              setContractorId(next);

              // Auto-toggle billing recipient based on contractor selection
              setBillingRecipient((prev) => {
                if (next && prev === "customer") return "contractor";
                if (!next && prev === "contractor") return "customer";
                return prev;
              });
            }}
            className="w-full border rounded px-3 py-2"
          >
            <option value="">— None —</option>
            {contractors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Billing Recipient */}
        <div className="rounded-lg border p-3 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-2">Billing Recipient</label>

            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="billing_recipient"
                  value="contractor"
                  disabled={!contractorId}
                  checked={billingRecipient === "contractor"}
                  onChange={() => setBillingRecipient("contractor")}
                />
                Contractor
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="billing_recipient"
                  value="customer"
                  checked={billingRecipient === "customer"}
                  onChange={() => setBillingRecipient("customer")}
                />
                Customer
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="billing_recipient"
                  value="other"
                  checked={billingRecipient === "other"}
                  onChange={() => setBillingRecipient("other")}
                />
                Other
              </label>
            </div>
          </div>

          {billingRecipient === "other" && (
            <div className="space-y-3 pt-2">
              <input
                type="text"
                name="billing_name"
                placeholder="Billing Name"
                required
                className="w-full border rounded px-3 py-2"
              />

              <input
                type="text"
                name="billing_address_line1"
                placeholder="Billing Address"
                required
                className="w-full border rounded px-3 py-2"
              />

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  name="billing_city"
                  placeholder="City"
                  required
                  className="border rounded px-3 py-2"
                />
                <input
                  type="text"
                  name="billing_state"
                  placeholder="State"
                  required
                  className="border rounded px-3 py-2"
                />
              </div>

              <input
                type="text"
                name="billing_zip"
                placeholder="Zip"
                required
                className="w-full border rounded px-3 py-2"
              />

              <input
                type="email"
                name="billing_email"
                placeholder="Billing Email (optional)"
                className="w-full border rounded px-3 py-2"
              />

              <input
                type="tel"
                name="billing_phone"
                placeholder="Billing Phone (optional)"
                className="w-full border rounded px-3 py-2"
              />
            </div>
          )}
        </div>

        {/* Scheduling */}
        <div className="rounded-lg border p-3 space-y-3">
          {/* Scheduled Date */}
          <div>
            <label className="block text-sm font-medium mb-1">Scheduled Date</label>
            <input
              type="date"
              name="scheduled_date"
              className="w-full border rounded px-3 py-2"
            />
          </div>

          {/* Quick Window */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Quick Window (optional)
            </label>
            <select
              name="quick_window"
              defaultValue=""
              onChange={(e) => onQuickWindowChange(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">Select a window…</option>
              <option value="08:00-10:00">8:00 AM – 10:00 AM</option>
              <option value="10:00-12:00">10:00 AM – 12:00 PM</option>
              <option value="12:00-14:00">12:00 PM – 2:00 PM</option>
              <option value="14:00-16:00">2:00 PM – 4:00 PM</option>
              <option value="16:00-18:00">4:00 PM – 6:00 PM</option>
            </select>
            <p className="text-xs text-gray-300 mt-1">
              Selecting a window auto-fills the times. You can still edit them.
            </p>
          </div>

          {/* Window Start */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Window Start (optional)
            </label>
            <input
              type="time"
              name="window_start"
              value={windowStart}
              onChange={(e) => setWindowStart(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          {/* Window End */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Window End (optional)
            </label>
            <input
              type="time"
              name="window_end"
              value={windowEnd}
              onChange={(e) => setWindowEnd(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>

        {/* Workflow-first: status is always Open at creation */}
        <input type="hidden" name="status" value="open" />

        <div className="pt-4">
          <button type="submit" className="px-4 py-2 rounded bg-blue-600 text-white">
            Create Job
          </button>
        </div>
      </form>
    </div>
  );
}