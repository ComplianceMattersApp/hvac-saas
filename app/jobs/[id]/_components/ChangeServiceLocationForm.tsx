"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type SavedServiceLocation = {
  id: string;
  label: string;
};

function UpdateLocationButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={pending}
      className={`inline-flex rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 ${
        isDisabled ? "cursor-not-allowed opacity-60" : ""
      }`}
    >
      {pending ? "Updating..." : "Update location"}
    </button>
  );
}

export default function ChangeServiceLocationForm({
  action,
  currentLocationId,
  jobId,
  locations,
  returnTo,
}: {
  action: (formData: FormData) => void | Promise<void>;
  currentLocationId: string;
  jobId: string;
  locations: SavedServiceLocation[];
  returnTo?: string;
}) {
  const [selectedLocationId, setSelectedLocationId] = useState(currentLocationId);
  const hasDifferentSelection = Boolean(
    selectedLocationId && selectedLocationId !== currentLocationId,
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="job_id" value={jobId} />
      {returnTo && <input type="hidden" name="return_to" value={returnTo} />}
      <label className="grid gap-1 text-xs font-medium text-slate-700">
        Saved service location
        <select
          name="location_id"
          value={selectedLocationId}
          onChange={(event) => setSelectedLocationId(event.currentTarget.value)}
          required
          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-normal text-slate-900"
        >
          <option value="">Select a saved location</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs leading-5 text-slate-600">
        Move this job to a different saved service location?
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <UpdateLocationButton disabled={!hasDifferentSelection} />
      </div>
    </form>
  );
}
