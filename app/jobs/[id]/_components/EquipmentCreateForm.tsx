"use client";

import { useState } from "react";
import SystemLocationPicker from "@/components/jobs/SystemLocationPicker";
import SubmitButton from "@/components/SubmitButton";
import { addJobEquipmentFromForm } from "@/lib/actions/job-actions";
import {
  EQUIPMENT_ROLE_OPTIONS,
  equipmentUsesRefrigerant,
} from "@/lib/utils/equipment-display";

type SystemRow = { id: string; name: string | null };

export default function EquipmentCreateForm({
  jobId,
  systems,
}: {
  jobId: string;
  systems: SystemRow[];
}) {
  const [role, setRole] = useState("outdoor_unit");
  const showRefrigerant = equipmentUsesRefrigerant(role);

  return (
    <form action={addJobEquipmentFromForm} className="mt-4 grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <input type="hidden" name="job_id" value={jobId} />

      <div className="text-sm font-semibold text-gray-900">Add Equipment</div>

      <div className="grid gap-1">
        <label className="text-sm font-medium text-gray-900" htmlFor="equipment_role">
          Equipment Role
        </label>
        <select
          id="equipment_role"
          name="equipment_role"
          className="w-full rounded-md border px-3 py-2 text-gray-900"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          required
        >
          {EQUIPMENT_ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <SystemLocationPicker systems={systems} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <label className="text-sm font-medium text-gray-900" htmlFor="manufacturer">
            Manufacturer (optional)
          </label>
          <input
            id="manufacturer"
            name="manufacturer"
            className="w-full rounded-md border px-3 py-2 text-gray-900"
            placeholder="York"
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium text-gray-900" htmlFor="model">
            Model (optional)
          </label>
          <input
            id="model"
            name="model"
            className="w-full rounded-md border px-3 py-2 text-gray-900"
            placeholder="Model #"
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium text-gray-900" htmlFor="serial">
            Serial (optional)
          </label>
          <input
            id="serial"
            name="serial"
            className="w-full rounded-md border px-3 py-2 text-gray-900"
            placeholder="Serial #"
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium text-gray-900" htmlFor="tonnage">
            Tonnage (optional)
          </label>
          <input
            id="tonnage"
            name="tonnage"
            type="number"
            step="0.5"
            min="0"
            className="w-full rounded-md border px-3 py-2 text-gray-900"
            placeholder="5"
          />
        </div>

        {showRefrigerant ? (
          <div className="grid gap-1 sm:col-span-2">
            <label className="text-sm font-medium text-gray-900" htmlFor="refrigerant_type">
              Refrigerant Type (optional)
            </label>
            <select
              id="refrigerant_type"
              name="refrigerant_type"
              className="w-full rounded-md border px-3 py-2 text-gray-900"
              defaultValue=""
            >
              <option value="">Select refrigerant</option>
              <option value="R-410A">R-410A</option>
              <option value="R-32">R-32</option>
              <option value="R-454B">R-454B</option>
              <option value="R-22">R-22</option>
              <option value="Other">Other</option>
            </select>
          </div>
        ) : (
          <input type="hidden" name="refrigerant_type" value="" />
        )}

        <div className="grid gap-1 sm:col-span-2">
          <label className="text-sm font-medium text-gray-900" htmlFor="notes">
            Notes (optional)
          </label>
          <input
            id="notes"
            name="notes"
            className="w-full rounded-md border px-3 py-2 text-gray-900"
            placeholder="Any extra details..."
          />
        </div>
      </div>

      <SubmitButton loadingText="Adding..." className="w-fit rounded-md bg-black px-4 py-2 text-white">
        Add Equipment
      </SubmitButton>
    </form>
  );
}
