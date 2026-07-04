"use client";

import { useState } from "react";
import SystemLocationPicker from "@/components/jobs/SystemLocationPicker";
import SubmitButton from "@/components/SubmitButton";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { Disclosure } from "@/components/ui/Disclosure";
import {
  EQUIPMENT_ROLE_OPTIONS,
  equipmentUsesRefrigerant,
  isHeatingOnlyEquipment,
} from "@/lib/utils/equipment-display";

type SystemRow = { id: string; name: string | null };

export const FILTER_ROLE_VALUE = "__system_filter__";

export default function EquipmentCreateFormFields({
  systems,
  includeSystemPicker,
  includeFilterOption,
  title = "Add Equipment or Filter",
  description = "Add an equipment record or a system-level filter to the selected system.",
  role: controlledRole,
  onRoleChange,
}: {
  systems: SystemRow[];
  includeSystemPicker: boolean;
  includeFilterOption: boolean;
  title?: string;
  description?: string;
  role?: string;
  onRoleChange?: (role: string) => void;
}) {
  const [uncontrolledRole, setUncontrolledRole] = useState("outdoor_unit");
  const [filterDateDefault] = useState(() => new Date().toISOString().slice(0, 10));
  const role = controlledRole ?? uncontrolledRole;
  const setRole = onRoleChange ?? setUncontrolledRole;
  const addingFilter = includeFilterOption && role === FILTER_ROLE_VALUE;
  const showRefrigerant = equipmentUsesRefrigerant(role);
  const showHeatingCapacity = isHeatingOnlyEquipment(role);

  return (
    <div className="px-5 py-4 sm:px-6">
      <div className="mb-5">
        <SectionEyebrow>Equipment</SectionEyebrow>
        <h3 className="text-base font-semibold text-navy">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>

      <div className="space-y-5">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 block mb-2" htmlFor="equipment_role">
            System Item Type
          </label>
          <select
            id="equipment_role"
            name="equipment_role"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
          >
            {EQUIPMENT_ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            {includeFilterOption ? <option value={FILTER_ROLE_VALUE}>Filter</option> : null}
          </select>
        </div>

        {includeSystemPicker ? <SystemLocationPicker systems={systems} /> : null}

        {addingFilter ? (
          <div className="pt-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Filter Details</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <label className="text-xs font-medium text-slate-700 block mb-1.5" htmlFor="filter-label">
                  Filter location
                </label>
                <input
                  id="filter-label"
                  name="label"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Hall return"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1.5" htmlFor="filter-length">
                  Length
                </label>
                <input
                  id="filter-length"
                  name="length"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="20"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1.5" htmlFor="filter-width">
                  Width
                </label>
                <input
                  id="filter-width"
                  name="width"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="25"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1.5" htmlFor="filter-height">
                  Depth
                </label>
                <input
                  id="filter-height"
                  name="height"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="1"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="text-xs font-medium text-slate-700 block mb-1.5" htmlFor="filter-date-changed">
                  Date changed
                </label>
                <input
                  id="filter-date-changed"
                  name="date_changed"
                  type="date"
                  required
                  defaultValue={filterDateDefault}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="text-xs font-medium text-slate-700 block mb-1.5" htmlFor="filter-notes">
                  Notes (optional)
                </label>
                <textarea
                  id="filter-notes"
                  name="notes"
                  rows={2}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Optional notes"
                />
              </div>
            </div>
          </div>
        ) : (
        <Disclosure
          title="Advanced Details"
          subtitle="Manufacturer, serial, tonnage, refrigerant, and notes (all optional)"
          className="mt-2"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1.5" htmlFor="manufacturer">
                Manufacturer (optional)
              </label>
              <input
                id="manufacturer"
                name="manufacturer"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="York"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1.5" htmlFor="model">
                Model (optional)
              </label>
              <input
                id="model"
                name="model"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Model #"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1.5" htmlFor="serial">
                Serial (optional)
              </label>
              <input
                id="serial"
                name="serial"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Serial #"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1.5" htmlFor={showHeatingCapacity ? "heating_capacity_kbtu" : "tonnage"}>
                {showHeatingCapacity ? "Heating Input (KBTU/h)" : "Tonnage"} (optional)
              </label>
              <input
                id={showHeatingCapacity ? "heating_capacity_kbtu" : "tonnage"}
                name={showHeatingCapacity ? "heating_capacity_kbtu" : "tonnage"}
                type="number"
                step={showHeatingCapacity ? "1" : "0.5"}
                min="0"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder={showHeatingCapacity ? "120" : "5"}
              />
              {showHeatingCapacity ? (
                <p className="mt-1 text-xs text-slate-500">
                  Enter thousands of BTU/h, for example 66 for 66,000 BTU/h.
                </p>
              ) : null}
            </div>

            {showHeatingCapacity && (
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1.5" htmlFor="heating_output_btu">
                  Heating Output (BTU/h) (optional)
                </label>
                <input
                  id="heating_output_btu"
                  name="heating_output_btu"
                  type="number"
                  step="1"
                  min="0"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="66000"
                />
              </div>
            )}

            {showHeatingCapacity && (
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1.5" htmlFor="heating_efficiency_percent">
                  Efficiency / AFUE % (optional)
                </label>
                <input
                  id="heating_efficiency_percent"
                  name="heating_efficiency_percent"
                  type="number"
                  step="1"
                  min="1"
                  max="100"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="80"
                />
              </div>
            )}

            {showRefrigerant ? (
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-slate-700 block mb-1.5" htmlFor="refrigerant_type">
                  Refrigerant Type (optional)
                </label>
                <select
                  id="refrigerant_type"
                  name="refrigerant_type"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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

            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-slate-700 block mb-1.5" htmlFor="notes">
                Notes (optional)
              </label>
              <input
                id="notes"
                name="notes"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Any extra details..."
              />
            </div>
          </div>
        </Disclosure>
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-slate-200">
        <SubmitButton loadingText="Adding..." className="w-fit rounded-[10px] bg-blue-600 px-4 py-2 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
          {addingFilter ? "Add Filter" : "Add Equipment"}
        </SubmitButton>
      </div>
    </div>
  );
}
