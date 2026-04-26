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
  heating_output_btu: string | null;
  heating_efficiency_percent: string | null;
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
    .filter((v, i, a) => a.indexOf(v) === i);

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

  if (!editing) {
    return (
      <div className="px-5 py-4 sm:px-6 transition-colors hover:bg-gray-50/50">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <div className="text-sm font-semibold text-gray-950">{equipmentRoleLabel(eq.equipment_role)}</div>
              {eq.system_location ? (
                <div className="mt-0.5 text-xs text-gray-500">System: {eq.system_location}</div>
              ) : null}
            </div>

            <div>
              <div className="text-sm font-medium text-gray-700">
                {[eq.manufacturer, eq.model].filter(Boolean).join(" ") || "-"}
              </div>
            </div>

            {eq.serial ||
            eq.tonnage ||
            eq.heating_capacity_kbtu ||
            eq.heating_output_btu ||
            (showRefrigerant && eq.refrigerant_type) ||
            eq.heating_efficiency_percent ? (
              <div className="space-y-1 text-xs text-gray-600">
                {eq.serial ? <div>Serial: {eq.serial}</div> : null}
                {showHeatingCapacity && eq.heating_output_btu ? (
                  <div>Heating: {Number(eq.heating_output_btu).toLocaleString()} BTU/h</div>
                ) : showHeatingCapacity && eq.heating_capacity_kbtu ? (
                  <div>Capacity: {eq.heating_capacity_kbtu} KBTU/h</div>
                ) : null}
                {showHeatingCapacity && eq.heating_efficiency_percent ? (
                  <div>Efficiency: {eq.heating_efficiency_percent}%</div>
                ) : null}
                {!showHeatingCapacity && eq.tonnage ? <div>Tonnage: {eq.tonnage}</div> : null}
                {showRefrigerant && eq.refrigerant_type ? <div>Refrigerant: {eq.refrigerant_type}</div> : null}
              </div>
            ) : null}

            {eq.notes ? <div className="text-xs italic text-gray-600">"{eq.notes}"</div> : null}
          </div>

          <div className="shrink-0 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center justify-center rounded bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
            >
              Edit
            </button>
            <form action={deleteJobEquipmentFromForm}>
              <input type="hidden" name="job_id" value={jobId} />
              <input type="hidden" name="equipment_id" value={eq.id} />
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
              >
                Delete
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 bg-blue-50/50 px-5 py-4 sm:px-6">
      <div className="flex items-center justify-between gap-2 border-b border-blue-200 pb-3">
        <div className="text-sm font-semibold text-gray-950">Edit Equipment</div>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-white/50 hover:text-gray-900"
        >
          Cancel
        </button>
      </div>

      <form action={updateJobEquipmentFromForm} className="space-y-4">
        <input type="hidden" name="job_id" value={jobId} />
        <input type="hidden" name="equipment_id" value={eq.id} />

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-600" htmlFor={`role-${eq.id}`}>
            Equipment Role
          </label>
          <select
            id={`role-${eq.id}`}
            name="equipment_role"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-600" htmlFor={`sysloc-${eq.id}`}>
            System
          </label>
          {existingSystemNames.length > 0 ? (
            <div className="space-y-2">
              <select
                id={`sysloc-${eq.id}`}
                name={isCustomSys ? undefined : "system_location"}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                value={sysChoice}
                onChange={(e) => setSysChoice(e.target.value)}
              >
                {existingSystemNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                <option value="__custom__">+ Other...</option>
              </select>
              {isCustomSys ? (
                <input
                  name="system_location"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder='Type location name (e.g. "Garage")'
                  autoFocus
                />
              ) : null}
            </div>
          ) : (
            <input
              id={`sysloc-${eq.id}`}
              name="system_location"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              defaultValue={eq.system_location ?? ""}
              placeholder="Upstairs"
            />
          )}
        </div>

        <div className="pt-2">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Product Details</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700" htmlFor={`mfr-${eq.id}`}>
                Manufacturer
              </label>
              <input
                id={`mfr-${eq.id}`}
                name="manufacturer"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                defaultValue={eq.manufacturer ?? ""}
                placeholder="York"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700" htmlFor={`mdl-${eq.id}`}>
                Model
              </label>
              <input
                id={`mdl-${eq.id}`}
                name="model"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                defaultValue={eq.model ?? ""}
                placeholder="Model #"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700" htmlFor={`ser-${eq.id}`}>
                Serial
              </label>
              <input
                id={`ser-${eq.id}`}
                name="serial"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                defaultValue={eq.serial ?? ""}
                placeholder="Serial #"
              />
            </div>

            <div>
              <label
                className="mb-1.5 block text-xs font-medium text-gray-700"
                htmlFor={showHeatingCapacity ? `hc-${eq.id}` : `ton-${eq.id}`}
              >
                {showHeatingCapacity ? "Heating Capacity (KBTU/h)" : "Tonnage"}
              </label>
              {showHeatingCapacity ? (
                <input
                  id={`hc-${eq.id}`}
                  name="heating_capacity_kbtu"
                  type="number"
                  step="1"
                  min="0"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  defaultValue={eq.tonnage ?? ""}
                  placeholder="5"
                />
              )}
            </div>

            {showHeatingCapacity && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700" htmlFor={`out-${eq.id}`}>
                  Heating Output (BTU/h)
                </label>
                <input
                  id={`out-${eq.id}`}
                  name="heating_output_btu"
                  type="number"
                  step="1"
                  min="0"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  defaultValue={eq.heating_output_btu ?? ""}
                  placeholder="66000"
                />
              </div>
            )}

            {showHeatingCapacity && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700" htmlFor={`eff-${eq.id}`}>
                  Efficiency %
                </label>
                <input
                  id={`eff-${eq.id}`}
                  name="heating_efficiency_percent"
                  type="number"
                  step="1"
                  min="1"
                  max="100"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  defaultValue={eq.heating_efficiency_percent ?? ""}
                  placeholder="80"
                />
              </div>
            )}

            {showRefrigerant && (
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-gray-700" htmlFor={`ref-${eq.id}`}>
                  Refrigerant Type
                </label>
                <select
                  id={`ref-${eq.id}`}
                  name="refrigerant_type"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
            )}

            {!showRefrigerant && <input type="hidden" name="refrigerant_type" value="" />}
            {!showHeatingCapacity && (
              <>
                <input type="hidden" name="heating_output_btu" value="" />
                <input type="hidden" name="heating_efficiency_percent" value="" />
              </>
            )}

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-gray-700" htmlFor={`notes-${eq.id}`}>
                Notes
              </label>
              <input
                id={`notes-${eq.id}`}
                name="notes"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                defaultValue={eq.notes ?? ""}
                placeholder="Any extra details..."
              />
            </div>
          </div>
        </div>

        <div className="pt-2">
          <SubmitButton
            loadingText="Saving..."
            className="w-fit rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Save Changes
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
