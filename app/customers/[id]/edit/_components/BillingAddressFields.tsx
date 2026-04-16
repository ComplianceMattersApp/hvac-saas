'use client';

import { useState } from 'react';

type BillingAddressFieldsProps = {
  initialBillingAddressLine1: string;
  initialBillingAddressLine2: string;
  initialBillingCity: string;
  initialBillingState: string;
  initialBillingZip: string;
  serviceAddressSourceLabel: string | null;
  serviceAddressLine1: string;
  serviceAddressLine2: string;
  serviceCity: string;
  serviceState: string;
  serviceZip: string;
};

export default function BillingAddressFields({
  initialBillingAddressLine1,
  initialBillingAddressLine2,
  initialBillingCity,
  initialBillingState,
  initialBillingZip,
  serviceAddressSourceLabel,
  serviceAddressLine1,
  serviceAddressLine2,
  serviceCity,
  serviceState,
  serviceZip,
}: BillingAddressFieldsProps) {
  const [billingAddressLine1, setBillingAddressLine1] = useState(initialBillingAddressLine1);
  const [billingAddressLine2, setBillingAddressLine2] = useState(initialBillingAddressLine2);
  const [billingCity, setBillingCity] = useState(initialBillingCity);
  const [billingState, setBillingState] = useState(initialBillingState);
  const [billingZip, setBillingZip] = useState(initialBillingZip);

  const hasServiceAddress = [serviceAddressLine1, serviceAddressLine2, serviceCity, serviceState, serviceZip]
    .some((value) => String(value ?? '').trim().length > 0);

  const handleUseServiceAddress = () => {
    setBillingAddressLine1(serviceAddressLine1);
    setBillingAddressLine2(serviceAddressLine2);
    setBillingCity(serviceCity);
    setBillingState(serviceState);
    setBillingZip(serviceZip);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Billing Address Helper</div>
          <div className="mt-1 text-sm text-slate-600">
            {hasServiceAddress
              ? `Use the ${serviceAddressSourceLabel ?? 'service address'} as a starting point, then save the customer record to make it canonical billing data.`
              : 'No service address is available to copy yet.'}
          </div>
        </div>

        <button
          type="button"
          onClick={handleUseServiceAddress}
          disabled={!hasServiceAddress}
          className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 transition-[background-color,border-color,transform] hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]"
        >
          Use Service Address as Billing Address
        </button>
      </div>

      <div className="space-y-3">
        <input
          name="billing_address_line1"
          placeholder="Address line 1"
          value={billingAddressLine1}
          onChange={(event) => setBillingAddressLine1(event.target.value)}
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
        />
        <input
          name="billing_address_line2"
          placeholder="Address line 2"
          value={billingAddressLine2}
          onChange={(event) => setBillingAddressLine2(event.target.value)}
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            name="billing_city"
            placeholder="City"
            value={billingCity}
            onChange={(event) => setBillingCity(event.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
          />
          <input
            name="billing_state"
            placeholder="State"
            value={billingState}
            onChange={(event) => setBillingState(event.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
          />
          <input
            name="billing_zip"
            placeholder="ZIP"
            value={billingZip}
            onChange={(event) => setBillingZip(event.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
          />
        </div>
      </div>
    </div>
  );
}