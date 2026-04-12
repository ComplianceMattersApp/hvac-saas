"use client";

import { useMemo, useState } from "react";

type CustomerOption = {
  id: string;
  displayName: string;
  phone: string | null;
  email: string | null;
};

type LocationOption = {
  id: string;
  customerId: string;
  displayName: string;
  city: string | null;
  zip: string | null;
};

type Props = {
  mode: "existing_existing" | "existing_new";
  customers: CustomerOption[];
  locations: LocationOption[];
  disabled: boolean;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function customerSearchText(customer: CustomerOption) {
  return [customer.displayName, customer.phone, customer.email]
    .map((v) => normalizeText(v).toLowerCase())
    .filter(Boolean)
    .join(" ");
}

export default function CustomerLocationFinalizationFields(props: Props) {
  const { mode, customers, locations, disabled } = props;
  const [query, setQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");

  const filteredCustomers = useMemo(() => {
    const q = normalizeText(query).toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => customerSearchText(c).includes(q));
  }, [customers, query]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  const locationOptions = useMemo(() => {
    if (!selectedCustomerId) return [];
    return locations.filter((l) => l.customerId === selectedCustomerId);
  }, [locations, selectedCustomerId]);

  const selectedLocation = useMemo(
    () => locationOptions.find((l) => l.id === selectedLocationId) ?? null,
    [locationOptions, selectedLocationId],
  );

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor={`${mode}_customer_query`}>
          Search customer
        </label>
        <input
          id={`${mode}_customer_query`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled}
          placeholder="Search by name, phone, or email"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor={`${mode}_customer_select`}>
          Select customer
        </label>
        <select
          id={`${mode}_customer_select`}
          name="existing_customer_id"
          value={selectedCustomerId}
          onChange={(e) => {
            const nextCustomerId = e.target.value;
            setSelectedCustomerId(nextCustomerId);
            setSelectedLocationId("");
          }}
          required
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Choose customer...</option>
          {filteredCustomers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
              {c.phone ? ` · ${c.phone}` : ""}
              {c.email ? ` · ${c.email}` : ""}
            </option>
          ))}
        </select>
      </div>

      {selectedCustomer ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <div className="font-medium text-slate-900">{selectedCustomer.displayName}</div>
          <div>
            {selectedCustomer.phone || "No phone"}
            {selectedCustomer.phone && selectedCustomer.email ? " · " : ""}
            {selectedCustomer.email || "No email"}
          </div>
        </div>
      ) : null}

      {mode === "existing_existing" ? (
        <>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor={`${mode}_location_select`}>
              Select location
            </label>
            <select
              id={`${mode}_location_select`}
              name="existing_location_id"
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              required
              disabled={disabled || !selectedCustomerId}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Choose location...</option>
              {locationOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.displayName}
                </option>
              ))}
            </select>
          </div>

          {selectedCustomerId && locationOptions.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              This customer has no existing locations in scope.
            </div>
          ) : null}

          {selectedLocation ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <div className="font-medium text-slate-900">{selectedLocation.displayName}</div>
              <div>
                {selectedLocation.city || "City not set"}
                {selectedLocation.zip ? ` · ${selectedLocation.zip}` : ""}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
