"use client";

import { useMemo, useState } from "react";

type SystemRow = { id: string; name: string | null };

export default function SystemLocationPicker({ systems }: { systems: SystemRow[] }) {
  const first = useMemo(() => systems?.[0]?.name ?? "", [systems]);
  const [choice, setChoice] = useState(first);
  const isNew = choice === "__new__";

  return (
    <div className="grid gap-1">
      <label className="text-sm font-medium text-gray-900" htmlFor="system_location">
        System Location (required)
      </label>

      {systems && systems.length > 0 ? (
        <>
          <select
            id="system_location"
            name="system_location"
            className="w-full rounded-md border px-3 py-2 text-gray-900"
            required
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
          >
            {systems.map((s) => (
              <option key={s.id} value={s.name ?? ""}>
                {s.name}
              </option>
            ))}
            <option value="__new__">+ New…</option>
          </select>

          {isNew && (
            <input
              name="system_location_custom"
              className="w-full rounded-md border px-3 py-2 text-gray-900 mt-2"
              placeholder='Type new location (e.g. "Garage")'
              required
              autoFocus
            />
          )}

          {/* always include the field so FormData.get(...) exists */}
          {!isNew && <input type="hidden" name="system_location_custom" value="" />}
        </>
      ) : (
        <>
          <input
            id="system_location"
            name="system_location"
            className="w-full rounded-md border px-3 py-2 text-gray-900"
            placeholder="Upstairs"
            required
          />
          <input type="hidden" name="system_location_custom" value="" />
        </>
      )}
    </div>
  );
}