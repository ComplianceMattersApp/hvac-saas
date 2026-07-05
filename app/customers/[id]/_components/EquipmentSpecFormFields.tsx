"use client";

import { useState } from "react";
import { Disclosure } from "@/components/ui/Disclosure";
import {
  equipmentRoleOptionsForValue,
  equipmentUsesRefrigerant,
  isHeatingOnlyEquipment,
} from "@/lib/utils/equipment-display";

/**
 * Shared field set for canonical (location-owned) equipment forms — Edit and
 * Replace both embed this. Mirrors the field/role-conditional pattern already
 * used by app/jobs/[id]/_components/EquipmentEditCard.tsx so the two schemas
 * (job_equipment vs. equipment) at least share the same form shape.
 */
export function EquipmentSpecFormFields({
  idPrefix,
  defaultValues,
}: {
  idPrefix: string;
  defaultValues?: {
    equipmentRole?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    serial?: string | null;
    tonnage?: string | null;
    refrigerantType?: string | null;
    heatingCapacityKbtu?: string | null;
    heatingOutputBtu?: string | null;
    heatingEfficiencyPercent?: string | null;
    notes?: string | null;
  };
}) {
  const [role, setRole] = useState(defaultValues?.equipmentRole || "outdoor_unit");
  const showRefrigerant = equipmentUsesRefrigerant(role);
  const showHeatingCapacity = isHeatingOnlyEquipment(role);
  const roleOptions = equipmentRoleOptionsForValue(defaultValues?.equipmentRole);

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-400" htmlFor={`${idPrefix}-role`}>
          Equipment Role
        </label>
        <select
          id={`${idPrefix}-role`}
          name="equipment_role"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        >
          {roleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor={`${idPrefix}-manufacturer`}>
            Manufacturer
          </label>
          <input
            id={`${idPrefix}-manufacturer`}
            name="manufacturer"
            defaultValue={defaultValues?.manufacturer ?? ""}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="York"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor={`${idPrefix}-model`}>
            Model
          </label>
          <input
            id={`${idPrefix}-model`}
            name="model"
            defaultValue={defaultValues?.model ?? ""}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Model #"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor={`${idPrefix}-serial`}>
            Serial
          </label>
          <input
            id={`${idPrefix}-serial`}
            name="serial"
            defaultValue={defaultValues?.serial ?? ""}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Serial #"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor={showHeatingCapacity ? `${idPrefix}-heating-capacity` : `${idPrefix}-tonnage`}>
            {showHeatingCapacity ? "Heating Input (KBTU/h)" : "Tonnage"}
          </label>
          {showHeatingCapacity ? (
            <input
              id={`${idPrefix}-heating-capacity`}
              name="heating_capacity_kbtu"
              type="number"
              step="1"
              min="0"
              defaultValue={defaultValues?.heatingCapacityKbtu ?? ""}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="120"
            />
          ) : (
            <input
              id={`${idPrefix}-tonnage`}
              name="tonnage"
              type="number"
              step="0.5"
              min="0"
              defaultValue={defaultValues?.tonnage ?? ""}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="5"
            />
          )}
        </div>

        {showHeatingCapacity ? (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor={`${idPrefix}-heating-output`}>
              Heating Output (BTU/h)
            </label>
            <input
              id={`${idPrefix}-heating-output`}
              name="heating_output_btu"
              type="number"
              step="1"
              min="0"
              defaultValue={defaultValues?.heatingOutputBtu ?? ""}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="66000"
            />
          </div>
        ) : null}

        {showHeatingCapacity ? (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor={`${idPrefix}-heating-efficiency`}>
              Efficiency / AFUE %
            </label>
            <input
              id={`${idPrefix}-heating-efficiency`}
              name="heating_efficiency_percent"
              type="number"
              step="1"
              min="1"
              max="100"
              defaultValue={defaultValues?.heatingEfficiencyPercent ?? ""}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="80"
            />
          </div>
        ) : null}

        {showRefrigerant ? (
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor={`${idPrefix}-refrigerant`}>
              Refrigerant Type
            </label>
            <select
              id={`${idPrefix}-refrigerant`}
              name="refrigerant_type"
              defaultValue={defaultValues?.refrigerantType ?? ""}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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

        {!showHeatingCapacity ? (
          <>
            <input type="hidden" name="heating_output_btu" value="" />
            <input type="hidden" name="heating_efficiency_percent" value="" />
          </>
        ) : null}
      </div>

      <Disclosure title="Notes" className="w-full">
        <textarea
          name="notes"
          defaultValue={defaultValues?.notes ?? ""}
          rows={3}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          placeholder="Any extra details..."
        />
      </Disclosure>
    </div>
  );
}
