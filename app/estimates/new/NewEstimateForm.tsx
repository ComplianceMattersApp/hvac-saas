"use client";

// app/estimates/new/NewEstimateForm.tsx
// Compliance Matters: Internal-only new estimate form.
// Calls createEstimateDraft server action. Redirects to detail on success.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createEstimateDraft,
  resolveEstimateCustomerLocationAssist,
} from "@/lib/estimates/estimate-actions";
import { buildEstimateDraftCreatePayload } from "@/lib/estimates/estimate-new-entry";

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
  address_line2?: string | null;
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

function normalize(v: string | null | undefined) {
  return String(v ?? "").trim().toLowerCase();
}

function phoneDigits(v: string | null | undefined) {
  return String(v ?? "").replace(/\D/g, "");
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
  initialCustomerId = "",
  initialLocationId = "",
  initialOriginJobId = "",
  initialServiceCaseId = "",
}: {
  customers: CustomerRow[];
  locations: LocationRow[];
  initialCustomerId?: string;
  initialLocationId?: string;
  initialOriginJobId?: string;
  initialServiceCaseId?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [allCustomers, setAllCustomers] = useState<CustomerRow[]>(customers);
  const [allLocations, setAllLocations] = useState<LocationRow[]>(locations);
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomerId);
  const [selectedLocationId, setSelectedLocationId] = useState(initialLocationId);
  const [customerQuery, setCustomerQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [assistMessage, setAssistMessage] = useState<string | null>(null);
  const [showAddCustomerPanel, setShowAddCustomerPanel] = useState(false);
  const [isSavingCustomer, startSavingCustomerTransition] = useTransition();
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newAddressLine1, setNewAddressLine1] = useState("");
  const [newAddressLine2, setNewAddressLine2] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("CA");
  const [newZip, setNewZip] = useState("");
  const [assistError, setAssistError] = useState<string | null>(null);

  const customerById = new Map(allCustomers.map((c) => [c.id, c] as const));
  const selectedCustomer = selectedCustomerId ? customerById.get(selectedCustomerId) ?? null : null;

  const customerLocations = new Map<string, LocationRow[]>();
  for (const loc of allLocations) {
    const list = customerLocations.get(loc.customer_id) ?? [];
    list.push(loc);
    customerLocations.set(loc.customer_id, list);
  }

  const customerSearchQuery = normalize(customerQuery);
  const customerDigitsQuery = customerSearchQuery.replace(/\D/g, "");

  const customerMatches = allCustomers
    .map((customer) => {
      const displayName = customerDisplayName(customer);
      const nameText = normalize(displayName);
      const phoneText = normalize(customer.phone);
      const emailText = normalize(customer.email);
      const phoneSearch = phoneDigits(customer.phone);
      const linkedLocations = customerLocations.get(customer.id) ?? [];
      const addressText = linkedLocations
        .map((loc) => normalize(loc.address_line1))
        .filter(Boolean)
        .join(" ");
      const cityText = linkedLocations
        .map((loc) => normalize(loc.city))
        .filter(Boolean)
        .join(" ");
      const searchBlob = [nameText, phoneText, emailText, addressText, cityText].filter(Boolean).join(" ");

      let score = 0;
      if (!customerSearchQuery) {
        score = 1;
      } else if (nameText.startsWith(customerSearchQuery)) {
        score = 500;
      } else if (nameText.includes(customerSearchQuery)) {
        score = 350;
      } else if (phoneSearch && customerDigitsQuery.length >= 2 && phoneSearch.includes(customerDigitsQuery)) {
        score = 225;
      } else if (phoneText.includes(customerSearchQuery) || emailText.includes(customerSearchQuery)) {
        score = 200;
      } else if (addressText.includes(customerSearchQuery) || cityText.includes(customerSearchQuery)) {
        score = 175;
      } else if (searchBlob.includes(customerSearchQuery)) {
        score = 100;
      }

      return {
        customer,
        displayName,
        score,
        previewLocation: linkedLocations[0] ?? null,
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
    })
    .slice(0, customerSearchQuery ? 40 : 60);

  const showPickerResults = pickerOpen && !selectedCustomer;

  const filteredLocations = allLocations.filter(
    (l) => !selectedCustomerId || l.customer_id === selectedCustomerId
  );

  function resetAddCustomerPanel() {
    setShowAddCustomerPanel(false);
    setAssistError(null);
    setNewCustomerName("");
    setNewCustomerPhone("");
    setNewCustomerEmail("");
    setNewAddressLine1("");
    setNewAddressLine2("");
    setNewCity("");
    setNewState("CA");
    setNewZip("");
  }

  function upsertCustomer(customer: CustomerRow) {
    setAllCustomers((prev) => {
      const index = prev.findIndex((row) => row.id === customer.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = customer;
        return next;
      }
      return [...prev, customer].sort((a, b) =>
        customerDisplayName(a).localeCompare(customerDisplayName(b), undefined, {
          sensitivity: "base",
        })
      );
    });
  }

  function upsertLocation(location: LocationRow) {
    setAllLocations((prev) => {
      const index = prev.findIndex((row) => row.id === location.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = location;
        return next;
      }
      return [location, ...prev];
    });
  }

  function handleSaveCustomer() {
    setAssistError(null);
    setAssistMessage(null);

    if (!newCustomerName.trim()) {
      setAssistError("Customer name is required.");
      return;
    }
    if (!newCustomerPhone.trim()) {
      setAssistError("Customer phone is required.");
      return;
    }
    if (!newAddressLine1.trim() || !newCity.trim() || !newState.trim() || !newZip.trim()) {
      setAssistError("Address, city, state, and ZIP are required.");
      return;
    }

    startSavingCustomerTransition(async () => {
      const result = await resolveEstimateCustomerLocationAssist({
        customerName: newCustomerName,
        customerPhone: newCustomerPhone,
        customerEmail: newCustomerEmail || null,
        addressLine1: newAddressLine1,
        addressLine2: newAddressLine2 || null,
        city: newCity,
        state: newState,
        zip: newZip,
      });

      if (!result.success) {
        setAssistError(result.error);
        return;
      }

      upsertCustomer(result.customer);
      upsertLocation(result.location);

      setSelectedCustomerId(result.customerId);
      setSelectedLocationId(result.locationId);
      setCustomerQuery(customerDisplayName(result.customer));
      setPickerOpen(false);
      setAssistError(null);
      setAssistMessage("Customer added and selected.");
      resetAddCustomerPanel();
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const customerId = String(fd.get("customer_id") ?? "").trim();
    const locationId = String(fd.get("location_id") ?? "").trim();
    const title = String(fd.get("title") ?? "").trim();
    const notes = String(fd.get("notes") ?? "").trim() || null;

    setErrorMessage(null);
    if (!customerId) {
      setErrorMessage("Please select a customer before creating the estimate.");
      return;
    }

    startTransition(async () => {
      const result = await createEstimateDraft(
        buildEstimateDraftCreatePayload({
          customerId,
          locationId,
          title,
          notes,
          originJobId: initialOriginJobId,
          serviceCaseId: initialServiceCaseId,
        })
      );
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
        <label htmlFor="customer_search" className={labelClass}>
          Customer <span className="text-red-500">*</span>
        </label>
        <input type="hidden" name="customer_id" value={selectedCustomerId} />

        {selectedCustomer ? (
          <div className="space-y-2">
            <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              <span className="font-medium">Selected: {customerDisplayName(selectedCustomer)}</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedCustomerId("");
                  setSelectedLocationId("");
                  setCustomerQuery("");
                  setPickerOpen(true);
                }}
                className="inline-flex min-h-9 items-center justify-center rounded-md border border-blue-200 bg-white px-3 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
              >
                Change
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowAddCustomerPanel(true);
                setAssistError(null);
                setAssistMessage(null);
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
            >
              + Add Customer
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              id="customer_search"
              type="text"
              value={customerQuery}
              onChange={(e) => {
                setCustomerQuery(e.target.value);
                setPickerOpen(true);
              }}
              onFocus={() => setPickerOpen(true)}
              onBlur={() => {
                window.setTimeout(() => setPickerOpen(false), 120);
              }}
              placeholder="Search by customer name, phone, email, address, or city"
              autoComplete="off"
              className={inputClass}
            />

            {showPickerResults && (
              <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-[0_14px_30px_-24px_rgba(15,23,42,0.35)]">
                {customerMatches.length > 0 ? (
                  <ul className="divide-y divide-slate-100">
                    {customerMatches.map(({ customer, displayName, previewLocation }) => (
                      <li key={customer.id}>
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setSelectedCustomerId(customer.id);
                            setSelectedLocationId("");
                            setCustomerQuery(displayName);
                            setPickerOpen(false);
                          }}
                          className="flex min-h-12 w-full flex-col items-start gap-0.5 px-3 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
                        >
                          <span className="text-sm font-semibold text-slate-900">{displayName}</span>
                          <span className="text-xs text-slate-500">
                            {[customer.phone, customer.email].filter(Boolean).join(" • ") || "No phone/email on file"}
                          </span>
                          {previewLocation && (
                            <span className="text-xs text-slate-500">
                              {[previewLocation.address_line1, previewLocation.city].filter(Boolean).join(", ")}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-3 py-4 text-sm text-slate-600">No matching customers found.</p>
                )}
              </div>
            )}

            <p className="text-xs text-slate-500">
              Create the customer first if they are not listed.
            </p>
            <button
              type="button"
              onClick={() => {
                setShowAddCustomerPanel(true);
                setAssistError(null);
                setAssistMessage(null);
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
            >
              + Add Customer
            </button>
          </div>
        )}

        {assistMessage ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {assistMessage}
          </div>
        ) : null}

        {showAddCustomerPanel ? (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Add Customer</p>
              <p className="mt-1 text-xs text-slate-600">Save a customer and service location without leaving this form.</p>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Customer details</p>
              <input
                type="text"
                value={newCustomerName}
                onChange={(event) => setNewCustomerName(event.target.value)}
                placeholder="Name"
                className={inputClass}
              />
              <input
                type="tel"
                value={newCustomerPhone}
                onChange={(event) => setNewCustomerPhone(event.target.value)}
                placeholder="Phone"
                className={inputClass}
              />
              <input
                type="email"
                value={newCustomerEmail}
                onChange={(event) => setNewCustomerEmail(event.target.value)}
                placeholder="Email (optional)"
                className={inputClass}
              />
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Service location</p>
              <input
                type="text"
                value={newAddressLine1}
                onChange={(event) => setNewAddressLine1(event.target.value)}
                placeholder="Address"
                className={inputClass}
              />
              <input
                type="text"
                value={newAddressLine2}
                onChange={(event) => setNewAddressLine2(event.target.value)}
                placeholder="Address line 2 (optional)"
                className={inputClass}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  value={newCity}
                  onChange={(event) => setNewCity(event.target.value)}
                  placeholder="City"
                  className={inputClass}
                />
                <input
                  type="text"
                  value={newState}
                  onChange={(event) => setNewState(event.target.value.toUpperCase())}
                  placeholder="State"
                  className={inputClass}
                />
              </div>
              <input
                type="text"
                value={newZip}
                onChange={(event) => setNewZip(event.target.value)}
                placeholder="ZIP"
                className={inputClass}
              />
            </div>

            {assistError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {assistError}
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={resetAddCustomerPanel}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCustomer}
                disabled={isSavingCustomer}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-[0_14px_22px_-18px_rgba(37,99,235,0.55)] transition-all hover:-translate-y-px hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSavingCustomer ? "Saving…" : "Save Customer"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Location */}
      <div>
        <label htmlFor="location_id" className={labelClass}>
          Location <span className="text-red-500">*</span>
        </label>
        <select
          id="location_id"
          name="location_id"
          value={selectedLocationId}
          onChange={(event) => setSelectedLocationId(event.target.value)}
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
