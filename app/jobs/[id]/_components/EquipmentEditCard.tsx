"use client";

import { useState } from "react";
import { updateJobEquipmentFromForm, deleteJobEquipmentFromForm } from "@/lib/actions/job-actions";
import SubmitButton from "@/components/SubmitButton";
import {
  EQUIPMENT_ROLE_OPTIONS,
  equipmentRoleLabel,
  equipmentUsesRefrigerant,
  isHeatingOnlyEquipment,
} from "@/lib/utils/equipment-display";

type SystemRow = { id: string; name: string | null };

type EquipmentRow = {
  id: string;
  equipment_role: string | null;
  system_location: string | null;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  tonnage: string | null;
  heating_capacity_kbtu: string | null;
  refrigerant_type: string | null;
  notes: string | null;
};

export default function EquipmentEditCard({
  eq,
  systems,
  jobId,
}: {
  eq: EquipmentRow;
  systems: SystemRow[];
  jobId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(eq.equipment_role ?? "outdoor_unit");

  const existingSystemNames = systems
    .map((s) => s.name ?? "")
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i); // deduplicate

  const [sysChoice, setSysChoice] = useState<string>(
    eq.system_location && existingSystemNames.includes(eq.system_location)
      ? eq.system_location
      : existingSystemNames.length > 0
      ? existingSystemNames[0]
      : ""
  );
  const isCustomSys = sysChoice === "__custom__";

  const showRefrigerant = equipmentUsesRefrigerant(role);
  const showHeatingCapacity = isHeatingOnlyEquipment(role);

  // ── VIEW MODE ──────────────────────────────────────────────────────────────
  if (!editing) {
    return (
      <div className="rounded-md border bg-white p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="font-medium text-gray-900">{equipmentRoleLabel(eq.equipment_role)}</div>
            {eq.system_location ? (
              <div className="text-sm text-gray-600">System: {eq.system_location}</div>
            ) : null}
            <div className="text-sm text-gray-700">
              {[eq.manufacturer, eq.model].filter(Boolean).join(" ") || "—"}
            </div>
            <div className="text-xs text-gray-500">
              {eq.serial ? `S/N: ${eq.serial}` : null}
              {eq.serial && (eq.tonnage || eq.heating_capacity_kbtu || (showRefrigerant && eq.refrigerant_type)) ? " • " : null}
              {showHeatingCapacity && eq.heating_capacity_kbtu ? `${eq.heating_capacity_kbtu} KBTU/h` : null}
              {!showHeatingCapacity && eq.tonnage ? `${eq.tonnage} ton` : null}
              {(eq.tonnage || eq.heating_capacity_kbtu) && showRefrigerant && eq.refrigerant_type ? " • " : null}
              {showRefrigerant ? eq.refrigerant_type ?? null : null}
            </div>
            {eq.notes ? (
              <div className="text-xs text-gray-500">Notes: {eq.notes}</div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex min-h-11 items-center justify-center px-3 py-2 rounded border text-sm hover:bg-gray-50 transition-colors"
            >
              Edit
            </button>
            <form action={deleteJobEquipmentFromForm}>
              <input type="hidden" name="job_id" value={jobId} />
              <input type="hidden" name="equipment_id" value={eq.id} />
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center w-full px-3 py-2 rounded border text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                Delete
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── EDIT MODE ──────────────────────────────────────────────────────────────
  return (
    <div className="rounded-md border border-blue-300 bg-blue-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-gray-900">Edit Equipment</div>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded border transition-colors"
        >
          Cancel
        </button>
      </div>

      <form action={updateJobEquipmentFromForm} className="grid gap-3">
        <input type="hidden" name="job_id" value={jobId} />
        <input type="hidden" name="equipment_id" value={eq.id} />

        {/* Equipment Role */}
        <div className="grid gap-1">
          <label className="text-sm font-medium text-gray-900" htmlFor={`role-${eq.id}`}>
            Equipment Role
          </label>
          <select
            id={`role-${eq.id}`}
            name="equipment_role"
            className="w-full rounded-md border px-3 py-2 text-gray-900 bg-white"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {EQUIPMENT_ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* System Location */}
        <div className="grid gap-1">
          <label className="text-sm font-medium text-gray-900" htmlFor={`sysloc-${eq.id}`}>
            System
          </label>
          {existingSystemNames.length > 0 ? (
            <>
              <select
                id={`sysloc-${eq.id}`}
                name={isCustomSys ? undefined : "system_location"}
                className="w-full rounded-md border px-3 py-2 text-gray-900 bg-white"
                value={sysChoice}
                onChange={(e) => setSysChoice(e.target.value)}
              >
                {existingSystemNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                <option value="__custom__">+ Other…</option>
              </select>
              {isCustomSys ? (
                <input
                  name="system_location"
                  className="w-full rounded-md border px-3 py-2 text-gray-900 bg-white mt-1"
                  placeholder='Type location name (e.g. "Garage")'
                  autoFocus
                />
              ) : null}
            </>
          ) : (
            <input
              id={`sysloc-${eq.id}`}
              name="system_location"
              className="w-full rounded-md border px-3 py-2 text-gray-900 bg-white"
              defaultValue={eq.system_location ?? ""}
              placeholder="Upstairs"
            />
          )}
        </div>

        {/* Manufacturer + Model + Serial + Tonnage */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <label className="text-sm font-medium text-gray-900" htmlFor={`mfr-${eq.id}`}>
              Manufacturer
            </label>
            <input
              id={`mfr-${eq.id}`}
              name="manufacturer"
              className="w-full rounded-md border px-3 py-2 text-gray-900 bg-white"
              defaultValue={eq.manufacturer ?? ""}
              placeholder="York"
            />
          </div>

          <div className="grid gap-1">
            <label className="text-sm font-medium text-gray-900" htmlFor={`mdl-${eq.id}`}>
              Model
            </label>
            <input
              id={`mdl-${eq.id}`}
              name="model"
              className="w-full rounded-md border px-3 py-2 text-gray-900 bg-white"
              defaultValue={eq.model ?? ""}
              placeholder="Model #"
            />
          </div>

          <div className="grid gap-1">
            <label className="text-sm font-medium text-gray-900" htmlFor={`ser-${eq.id}`}>
              Serial
            </label>
            <input
              id={`ser-${eq.id}`}
              name="serial"
              className="w-full rounded-md border px-3 py-2 text-gray-900 bg-white"
              defaultValue={eq.serial ?? ""}
              placeholder="Serial #"
            />
          </div>

          <div className="grid gap-1">
            <label className="text-sm font-medium text-gray-900" htmlFor={showHeatingCapacity ? `hc-${eq.id}` : `ton-${eq.id}`}>
              {showHeatingCapacity ? "Heating Capacity (KBTU/h)" : "Tonnage"}
            </label>
            {showHeatingCapacity ? (
              <input
                id={`hc-${eq.id}`}
                name="heating_capacity_kbtu"
                type="number"
                step="1"
                min="0"
                className="w-full rounded-md border px-3 py-2 text-gray-900 bg-white"
                defaultValue={eq.heating_capacity_kbtu ?? ""}
                placeholder="120"
              />
            ) : (
              <input
                id={`ton-${eq.id}`}
                name="tonnage"
                type="number"
                step="0.5"
                min="0"
                className="w-full rounded-md border px-3 py-2 text-gray-900 bg-white"
                defaultValue={eq.tonnage ?? ""}
                placeholder="5"
              />
            )}
          </div>

          {/* Refrigerant — hidden for furnace / air_handler */}
          {showRefrigerant ? (
            <div className="grid gap-1 sm:col-span-2">
              <label className="text-sm font-medium text-gray-900" htmlFor={`ref-${eq.id}`}>
                Refrigerant Type
              </label>
              <select
                id={`ref-${eq.id}`}
                name="refrigerant_type"
                className="w-full rounded-md border px-3 py-2 text-gray-900 bg-white"
                defaultValue={eq.refrigerant_type ?? ""}
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
            /* Clear refrigerant_type when switching to a non-refrigerant role */
            <input type="hidden" name="refrigerant_type" value="" />
          )}

          <div className="grid gap-1 sm:col-span-2">
            <label className="text-sm font-medium text-gray-900" htmlFor={`notes-${eq.id}`}>
              Notes
            </label>
            <input
              id={`notes-${eq.id}`}
              name="notes"
              className="w-full rounded-md border px-3 py-2 text-gray-900 bg-white"
              defaultValue={eq.notes ?? ""}
              placeholder="Any extra details..."
            />
          </div>
        </div>

        <SubmitButton
          loadingText="Saving..."
          className="w-fit rounded-md bg-black px-4 py-2 text-white text-sm"
        >
          Save Changes
        </SubmitButton>
      </form>
    </div>
  );
}
