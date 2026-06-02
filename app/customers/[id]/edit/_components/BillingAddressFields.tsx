'use client';

import { useState } from 'react';

type BillingAddressMode = 'same_as_service' | 'different';

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
  const normalizeAddressValue = (value: string) => String(value ?? '').trim();

  const hasExplicitBillingAddress = [
    initialBillingAddressLine1,
    initialBillingAddressLine2,
    initialBillingCity,
    initialBillingState,
    initialBillingZip,
  ].some((value) => normalizeAddressValue(value).length > 0);

  const [billingAddressLine1, setBillingAddressLine1] = useState(initialBillingAddressLine1);
  const [billingAddressLine2, setBillingAddressLine2] = useState(initialBillingAddressLine2);
  const [billingCity, setBillingCity] = useState(initialBillingCity);
  const [billingState, setBillingState] = useState(initialBillingState);
  const [billingZip, setBillingZip] = useState(initialBillingZip);

  const hasServiceAddress = [serviceAddressLine1, serviceAddressLine2, serviceCity, serviceState, serviceZip]
    .some((value) => normalizeAddressValue(value).length > 0);

  const explicitBillingMatchesService =
    normalizeAddressValue(initialBillingAddressLine1) === normalizeAddressValue(serviceAddressLine1)
    && normalizeAddressValue(initialBillingAddressLine2) === normalizeAddressValue(serviceAddressLine2)
    && normalizeAddressValue(initialBillingCity) === normalizeAddressValue(serviceCity)
    && normalizeAddressValue(initialBillingState) === normalizeAddressValue(serviceState)
    && normalizeAddressValue(initialBillingZip) === normalizeAddressValue(serviceZip);

  const serviceAddressDisplay = [
    serviceAddressLine1,
    serviceAddressLine2,
    [serviceCity, serviceState, serviceZip].filter(Boolean).join(' '),
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(', ');

  const [billingAddressMode, setBillingAddressMode] = useState<BillingAddressMode>(() => {
    if (hasServiceAddress && explicitBillingMatchesService) return 'same_as_service';
    if (hasExplicitBillingAddress) return 'different';
    if (hasServiceAddress) return 'same_as_service';
    return 'different';
  });

  const useServiceAddressMode = billingAddressMode === 'same_as_service' && hasServiceAddress;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Billing Address</div>
          <div className="mt-1 text-sm text-slate-600">
            {hasServiceAddress
              ? 'Billing address defaults to the service address unless you enter a different billing address.'
              : 'No service address is available yet. Add a billing address below.'}
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 text-sm text-slate-700">
          {hasServiceAddress ? (
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="billing_address_mode"
                value="same_as_service"
                checked={billingAddressMode === 'same_as_service'}
                onChange={() => setBillingAddressMode('same_as_service')}
              />
              <span>Same as {serviceAddressSourceLabel ?? 'service address'}</span>
            </label>
          ) : null}

          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="billing_address_mode"
              value="different"
              checked={billingAddressMode === 'different' || !hasServiceAddress}
              onChange={() => setBillingAddressMode('different')}
            />
            <span>Different billing address</span>
          </label>
        </div>
      </div>

      {useServiceAddressMode ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Same as service address</div>
          <div className="mt-1 text-sm text-slate-900">{serviceAddressDisplay || 'Service address not available.'}</div>

          <input type="hidden" name="billing_address_line1" value={serviceAddressLine1} />
          <input type="hidden" name="billing_address_line2" value={serviceAddressLine2} />
          <input type="hidden" name="billing_city" value={serviceCity} />
          <input type="hidden" name="billing_state" value={serviceState} />
          <input type="hidden" name="billing_zip" value={serviceZip} />
        </div>
      ) : (
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
      )}
    </div>
  );
}