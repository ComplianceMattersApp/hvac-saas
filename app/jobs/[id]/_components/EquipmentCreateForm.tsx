"use client";

import { useState } from "react";
import SystemLocationPicker from "@/components/jobs/SystemLocationPicker";
import SubmitButton from "@/components/SubmitButton";
import { addJobEquipmentFromForm } from "@/lib/actions/job-actions";
import {
  EQUIPMENT_ROLE_OPTIONS,
  equipmentUsesRefrigerant,
  isHeatingOnlyEquipment,
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
  const showHeatingCapacity = isHeatingOnlyEquipment(role);

  return (
    <form action={addJobEquipmentFromForm} className="pt-4 border-t border-gray-200">
      <input type="hidden" name="job_id" value={jobId} />

      <div className="px-5 py-4 sm:px-6">
        <div className="mb-5">
          <h3 className="text-base font-semibold text-gray-950">Add Equipment</h3>
          <p className="mt-1 text-sm text-gray-600">Capture equipment details to build the system inventory.</p>
        </div>

        <div className="space-y-5">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600 block mb-2" htmlFor="equipment_role">
              Equipment Role
            </label>
            <select
              id="equipment_role"
              name="equipment_role"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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

          <div className="pt-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Product Details</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1.5" htmlFor="manufacturer">
                  Manufacturer (optional)
                </label>
                <input
                  id="manufacturer"
                  name="manufacturer"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="York"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1.5" htmlFor="model">
                  Model (optional)
                </label>
                <input
                  id="model"
                  name="model"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Model #"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1.5" htmlFor="serial">
                  Serial (optional)
                </label>
                <input
                  id="serial"
                  name="serial"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Serial #"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1.5" htmlFor={showHeatingCapacity ? "heating_capacity_kbtu" : "tonnage"}>
                  {showHeatingCapacity ? "Heating Capacity (KBTU/h)" : "Tonnage"} (optional)
                </label>
                <input
                  id={showHeatingCapacity ? "heating_capacity_kbtu" : "tonnage"}
                  name={showHeatingCapacity ? "heating_capacity_kbtu" : "tonnage"}
                  type="number"
                  step={showHeatingCapacity ? "1" : "0.5"}
                  min="0"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder={showHeatingCapacity ? "120" : "5"}
                />
              </div>

              {showHeatingCapacity && (
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1.5" htmlFor="heating_output_btu">
                    Heating Output (BTU/h) (optional)
                  </label>
                  <input
                    id="heating_output_btu"
                    name="heating_output_btu"
                    type="number"
                    step="1"
                    min="0"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="66000"
                  />
                </div>
              )}

              {showHeatingCapacity && (
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1.5" htmlFor="heating_efficiency_percent">
                    Efficiency % (optional)
                  </label>
                  <input
                    id="heating_efficiency_percent"
                    name="heating_efficiency_percent"
                    type="number"
                    step="1"
                    min="1"
                    max="100"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="80"
                  />
                </div>
              )}

              {showRefrigerant ? (
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700 block mb-1.5" htmlFor="refrigerant_type">
                    Refrigerant Type (optional)
                  </label>
                  <select
                    id="refrigerant_type"
                    name="refrigerant_type"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
                <label className="text-xs font-medium text-gray-700 block mb-1.5" htmlFor="notes">
                  Notes (optional)
                </label>
                <input
                  id="notes"
                  name="notes"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Any extra details..."
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200">
          <SubmitButton loadingText="Adding..." className="w-fit rounded-md bg-blue-600 px-4 py-2 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            Add Equipment
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
