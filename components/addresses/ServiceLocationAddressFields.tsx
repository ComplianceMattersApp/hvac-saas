"use client";

import { useId, useState } from "react";
import GoogleAddressAutocomplete from "@/components/addresses/GoogleAddressAutocomplete";
import {
  mergeSelectedServiceAddressFields,
  type SelectedServiceAddress,
  type ServiceAddressFieldValues,
} from "@/lib/addresses/google-place-address";

export type ServiceLocationAddressFieldsProps = {
  initialValues?: Partial<ServiceAddressFieldValues>;
  required?: boolean;
  showAddressLine2?: boolean;
  tone?: "white" | "muted";
  compact?: boolean;
  className?: string;
};

const assistantLabel = "Start typing an address to fill the fields below, or enter it manually.";

export default function ServiceLocationAddressFields({
  initialValues,
  required = true,
  showAddressLine2 = true,
  tone = "white",
  compact = false,
  className = "",
}: ServiceLocationAddressFieldsProps) {
  const id = useId();
  const [values, setValues] = useState<ServiceAddressFieldValues>({
    addressLine1: initialValues?.addressLine1 ?? "",
    addressLine2: initialValues?.addressLine2 ?? "",
    city: initialValues?.city ?? "",
    state: initialValues?.state ?? "",
    zip: initialValues?.zip ?? "",
  });

  const inputClassName = [
    "w-full rounded-lg border px-3 py-2 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60",
    tone === "muted"
      ? "border-gray-200 bg-gray-50 text-gray-900"
      : "border-slate-300 bg-white text-slate-900",
  ].join(" ");
  const labelClassName = `grid gap-1 ${compact ? "text-xs text-slate-600" : "text-sm text-gray-700"} font-medium`;

  function applySelection(selected: SelectedServiceAddress) {
    setValues((current) => mergeSelectedServiceAddressFields(current, selected));
  }

  function update(field: keyof ServiceAddressFieldValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className={`space-y-3 ${className}`} data-service-location-address-fields="true">
      <GoogleAddressAutocomplete label={assistantLabel} onAddressSelected={applySelection} />

      <label className={labelClassName} htmlFor={`${id}-address-line-1`}>
        Address Line 1
        <input
          id={`${id}-address-line-1`}
          name="address_line1"
          required={required}
          autoComplete="address-line1"
          value={values.addressLine1}
          onChange={(event) => update("addressLine1", event.target.value)}
          className={inputClassName}
        />
      </label>

      {showAddressLine2 ? (
        <label className={labelClassName} htmlFor={`${id}-address-line-2`}>
          Address Line 2
          <input
            id={`${id}-address-line-2`}
            name="address_line2"
            autoComplete="address-line2"
            value={values.addressLine2}
            onChange={(event) => update("addressLine2", event.target.value)}
            className={inputClassName}
          />
        </label>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3">
        <label className={labelClassName} htmlFor={`${id}-city`}>
          City
          <input
            id={`${id}-city`}
            name="city"
            required={required}
            autoComplete="address-level2"
            value={values.city}
            onChange={(event) => update("city", event.target.value)}
            className={inputClassName}
          />
        </label>
        <label className={labelClassName} htmlFor={`${id}-state`}>
          State
          <input
            id={`${id}-state`}
            name="state"
            required={required}
            autoComplete="address-level1"
            value={values.state}
            onChange={(event) => update("state", event.target.value)}
            className={inputClassName}
          />
        </label>
        <label className={labelClassName} htmlFor={`${id}-zip`}>
          ZIP
          <input
            id={`${id}-zip`}
            name="zip"
            required={required}
            autoComplete="postal-code"
            value={values.zip}
            onChange={(event) => update("zip", event.target.value)}
            className={inputClassName}
          />
        </label>
      </div>
    </div>
  );
}
