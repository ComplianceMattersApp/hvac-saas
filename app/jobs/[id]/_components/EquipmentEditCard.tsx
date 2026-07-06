"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { updateJobEquipmentFromForm, deleteJobEquipmentFromForm } from "@/lib/actions/job-actions";
import SubmitButton from "@/components/SubmitButton";
import EquipmentLabelPhotoEvidencePanel from "@/components/jobs/EquipmentLabelPhotoEvidencePanel";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import { Disclosure } from "@/components/ui/Disclosure";
import {
  equipmentRoleOptionsForValue,
  equipmentRoleLabel,
  equipmentUsesRefrigerant,
  isHeatingOnlyEquipment,
} from "@/lib/utils/equipment-display";

function DeleteEquipmentSpinner() {
  return (
    <svg className="mr-1.5 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

function DeleteEquipmentButton({ className }: { className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? <DeleteEquipmentSpinner /> : null}
      Delete
    </button>
  );
}

type SystemRow = { id: string; name: string | null };

type EquipmentRow = {
  id: string;
  system_id?: string | null;
  equipment_role: string | null;
  component_type?: string | null;
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

type EvidenceAttachment = {
  id: string;
  fileName: string;
  uploadedAt: string;
  caption: string | null;
  signedUrl: string | null;
};

export default function EquipmentEditCard({
  eq,
  systems,
  jobId,
  labelPhotoAttachments = [],
}: {
  eq: EquipmentRow;
  systems: SystemRow[];
  jobId: string;
  labelPhotoAttachments?: EvidenceAttachment[];
}) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(eq.equipment_role ?? "outdoor_unit");
  const normalizedEquipmentRole = String(eq.equipment_role ?? eq.component_type ?? "").trim().toLowerCase();
  const isLegacyFilterEquipment = ["filter", "air_filter", "return_filter", "media_filter"].includes(normalizedEquipmentRole);

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
  const equipmentRoleOptions = equipmentRoleOptionsForValue(eq.equipment_role ?? eq.component_type);

  if (!editing) {
    return (
      <div className="px-5 py-4 sm:px-6 transition-colors hover:bg-slate-50/50">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <div className="text-sm font-semibold text-navy">{equipmentRoleLabel(eq.equipment_role)}</div>
              {isLegacyFilterEquipment ? (
                <div className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                  Legacy filter equipment record. Add new filters from Add Equipment or Filter.
                </div>
              ) : null}
            </div>

            {[eq.manufacturer, eq.model].filter(Boolean).length > 0 ? (
              <div className="text-sm font-medium text-slate-700">
                {[eq.manufacturer, eq.model].filter(Boolean).join(" ")}
              </div>
            ) : null}

            {eq.serial ||
            eq.tonnage ||
            eq.heating_capacity_kbtu ||
            eq.heating_output_btu ||
            (showRefrigerant && eq.refrigerant_type) ||
            eq.heating_efficiency_percent ? (
              <div className="space-y-1 text-xs text-slate-600">
                {eq.serial ? <div>Serial: {eq.serial}</div> : null}
                {showHeatingCapacity && eq.heating_output_btu ? (
                  <div>Heating: {Number(eq.heating_output_btu).toLocaleString()} BTU/h</div>
                ) : showHeatingCapacity && eq.heating_capacity_kbtu ? (
                  <div>Heating Input: {eq.heating_capacity_kbtu} KBTU/h</div>
                ) : null}
                {showHeatingCapacity && eq.heating_efficiency_percent ? (
                  <div>Efficiency / AFUE: {eq.heating_efficiency_percent}%</div>
                ) : null}
                {!showHeatingCapacity && eq.tonnage ? <div>Tonnage: {eq.tonnage}</div> : null}
                {showRefrigerant && eq.refrigerant_type ? <div>Refrigerant: {eq.refrigerant_type}</div> : null}
              </div>
            ) : null}

            {eq.notes ? <div className="text-xs italic text-slate-600">"{eq.notes}"</div> : null}
            <EquipmentLabelPhotoEvidencePanel
              jobId={jobId}
              equipmentId={eq.id}
              systemId={eq.system_id}
              systemName={eq.system_location}
              equipmentLabel={equipmentRoleLabel(eq.equipment_role)}
              evidenceAttachments={labelPhotoAttachments}
            />
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center justify-center rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
            >
              Edit
            </button>
          </div>
        </div>

        <Disclosure title="Danger zone" variant="danger" className="mt-3">
          <form action={deleteJobEquipmentFromForm}>
            <input type="hidden" name="job_id" value={jobId} />
            <input type="hidden" name="equipment_id" value={eq.id} />
            <DeleteEquipmentButton className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-800 transition-colors hover:bg-rose-100" />
          </form>
        </Disclosure>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-14px_rgba(15,23,42,0.12)] sm:p-5">
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <SectionEyebrow>Equipment</SectionEyebrow>
          <div className="text-base font-semibold text-navy">Edit Equipment</div>
        </div>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          Cancel
        </button>
      </div>

      <form action={updateJobEquipmentFromForm} className="space-y-4">
        <input type="hidden" name="job_id" value={jobId} />
        <input type="hidden" name="equipment_id" value={eq.id} />

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor={`role-${eq.id}`}>
            Equipment Role
          </label>
          <select
            id={`role-${eq.id}`}
            name="equipment_role"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {equipmentRoleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor={`sysloc-${eq.id}`}>
            System
          </label>
          {existingSystemNames.length > 0 ? (
            <div className="space-y-2">
              <select
                id={`sysloc-${eq.id}`}
                name={isCustomSys ? undefined : "system_location"}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder='Type location name (e.g. "Garage")'
                  autoFocus
                />
              ) : null}
            </div>
          ) : (
            <input
              id={`sysloc-${eq.id}`}
              name="system_location"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              defaultValue={eq.system_location ?? ""}
              placeholder="Upstairs"
            />
          )}
        </div>

        <Disclosure title="Enter Details" subtitle="Manufacturer, serial, tonnage, refrigerant, and notes" defaultOpen>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor={`mfr-${eq.id}`}>
                Manufacturer
              </label>
              <input
                id={`mfr-${eq.id}`}
                name="manufacturer"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                defaultValue={eq.manufacturer ?? ""}
                placeholder="York"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor={`mdl-${eq.id}`}>
                Model
              </label>
              <input
                id={`mdl-${eq.id}`}
                name="model"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                defaultValue={eq.model ?? ""}
                placeholder="Model #"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor={`ser-${eq.id}`}>
                Serial
              </label>
              <input
                id={`ser-${eq.id}`}
                name="serial"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                defaultValue={eq.serial ?? ""}
                placeholder="Serial #"
              />
            </div>

            <div>
              <label
                className="mb-1.5 block text-xs font-medium text-slate-700"
                htmlFor={showHeatingCapacity ? `hc-${eq.id}` : `ton-${eq.id}`}
              >
                {showHeatingCapacity ? "Heating Input (KBTU/h)" : "Tonnage"}
              </label>
              {showHeatingCapacity ? (
                <>
                  <input
                    id={`hc-${eq.id}`}
                    name="heating_capacity_kbtu"
                    type="number"
                    step="1"
                    min="0"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    defaultValue={eq.heating_capacity_kbtu ?? ""}
                    placeholder="120"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Enter thousands of BTU/h, for example 66 for 66,000 BTU/h.
                  </p>
                </>
              ) : (
                <input
                  id={`ton-${eq.id}`}
                  name="tonnage"
                  type="number"
                  step="0.5"
                  min="0"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  defaultValue={eq.tonnage ?? ""}
                  placeholder="5"
                />
              )}
            </div>

            {showHeatingCapacity && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor={`out-${eq.id}`}>
                  Heating Output (BTU/h)
                </label>
                <input
                  id={`out-${eq.id}`}
                  name="heating_output_btu"
                  type="number"
                  step="1"
                  min="0"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  defaultValue={eq.heating_output_btu ?? ""}
                  placeholder="66000"
                />
              </div>
            )}

            {showHeatingCapacity && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor={`eff-${eq.id}`}>
                  Efficiency / AFUE %
                </label>
                <input
                  id={`eff-${eq.id}`}
                  name="heating_efficiency_percent"
                  type="number"
                  step="1"
                  min="1"
                  max="100"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  defaultValue={eq.heating_efficiency_percent ?? ""}
                  placeholder="80"
                />
              </div>
            )}

            {showRefrigerant && (
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor={`ref-${eq.id}`}>
                  Refrigerant Type
                </label>
                <select
                  id={`ref-${eq.id}`}
                  name="refrigerant_type"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
              <label className="mb-1.5 block text-xs font-medium text-slate-700" htmlFor={`notes-${eq.id}`}>
                Notes
              </label>
              <input
                id={`notes-${eq.id}`}
                name="notes"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                defaultValue={eq.notes ?? ""}
                placeholder="Any extra details..."
              />
            </div>
          </div>
        </Disclosure>

        <EquipmentLabelPhotoEvidencePanel
          jobId={jobId}
          equipmentId={eq.id}
          systemId={eq.system_id}
          systemName={eq.system_location}
          equipmentLabel={equipmentRoleLabel(role)}
          evidenceAttachments={labelPhotoAttachments}
        />

        <div className="pt-2">
          <SubmitButton
            loadingText="Saving..."
            className="w-fit rounded-[10px] bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Save Changes
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
