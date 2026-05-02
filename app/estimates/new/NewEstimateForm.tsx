"use client";

// app/estimates/new/NewEstimateForm.tsx
// Compliance Matters: Internal-only new estimate form.
// Calls createEstimateDraft server action. Redirects to detail on success.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEstimateDraft } from "@/lib/estimates/estimate-actions";

type CustomerRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
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

function customerDisplayName(c: CustomerRow) {
  return (
    String(c.full_name ?? "").trim() ||
    [c.first_name, c.last_name].filter(Boolean).join(" ") ||
    "Unnamed Customer"
  );
}

function locationDisplayName(l: LocationRow) {
  if (l.nickname) return l.nickname;
  const parts = [l.address_line1, l.city, l.state].filter(Boolean);
  return parts.join(", ") || "Unnamed Location";
}

const labelClass =
  "mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500";
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200";

export default function NewEstimateForm({
  customers,
  locations,
}: {
  customers: CustomerRow[];
  locations: LocationRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filteredLocations = locations.filter(
    (l) => !selectedCustomerId || l.customer_id === selectedCustomerId
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const customerId = String(fd.get("customer_id") ?? "").trim();
    const locationId = String(fd.get("location_id") ?? "").trim();
    const title = String(fd.get("title") ?? "").trim();
    const notes = String(fd.get("notes") ?? "").trim() || null;

    setErrorMessage(null);
    startTransition(async () => {
      const result = await createEstimateDraft({ customerId, locationId, title, notes });
      if (result.success) {
        router.push(`/estimates/${result.estimateId}`);
      } else {
        setErrorMessage(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Customer */}
      <div>
        <label htmlFor="customer_id" className={labelClass}>
          Customer <span className="text-red-500">*</span>
        </label>
        <select
          id="customer_id"
          name="customer_id"
          required
          value={selectedCustomerId}
          onChange={(e) => setSelectedCustomerId(e.target.value)}
          className={inputClass}
        >
          <option value="">Select a customer…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {customerDisplayName(c)}
            </option>
          ))}
        </select>
      </div>

      {/* Location */}
      <div>
        <label htmlFor="location_id" className={labelClass}>
          Location <span className="text-red-500">*</span>
        </label>
        <select
          id="location_id"
          name="location_id"
          required
          disabled={!selectedCustomerId}
          className={inputClass}
        >
          <option value="">
            {selectedCustomerId ? "Select a location…" : "Select a customer first"}
          </option>
          {filteredLocations.map((l) => (
            <option key={l.id} value={l.id}>
              {locationDisplayName(l)}
            </option>
          ))}
        </select>
        {selectedCustomerId && filteredLocations.length === 0 && (
          <p className="mt-1 text-xs text-amber-600">
            No locations found for this customer.
          </p>
        )}
      </div>

      {/* Title */}
      <div>
        <label htmlFor="title" className={labelClass}>
          Estimate Title <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          placeholder="e.g. HVAC System Replacement Quote"
          className={inputClass}
        />
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="notes" className={labelClass}>
          Notes / Summary
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Optional summary or context for this estimate…"
          className={inputClass}
        />
      </div>

      {/* Error */}
      {errorMessage && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {errorMessage}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <a
          href="/estimates"
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,transform] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-[0_14px_22px_-18px_rgba(37,99,235,0.55)] transition-all hover:-translate-y-px hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Creating…" : "Create Draft Estimate"}
        </button>
      </div>
    </form>
  );
}
