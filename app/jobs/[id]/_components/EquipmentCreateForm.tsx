"use client";

import { useState, type FormEvent } from "react";
import EquipmentCreateFormFields, { FILTER_ROLE_VALUE } from "@/components/jobs/EquipmentCreateFormFields";
import EquipmentLabelPhotoEvidencePanel from "@/components/jobs/EquipmentLabelPhotoEvidencePanel";
import { addJobEquipmentFromForm, addSystemFilterFromForm } from "@/lib/actions/job-equipment-actions";
import { equipmentRoleLabel } from "@/lib/utils/equipment-display";

type SystemRow = { id: string; name: string | null };

/** Active canonical unit at the job's address, offered as a replace target. */
type UnitOnFile = { id: string; display: string };

const MANUAL_EQUIPMENT_DETAIL_FIELDS = [
  "manufacturer",
  "model",
  "serial",
  "tonnage",
  "heating_capacity_kbtu",
  "heating_output_btu",
  "heating_efficiency_percent",
  "refrigerant_type",
  "notes",
];

function createPendingEquipmentId() {
  return globalThis.crypto?.randomUUID?.() ?? "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16),
  );
}

export default function EquipmentCreateForm({
  jobId,
  systems,
  unitsOnFile = [],
}: {
  jobId: string;
  systems: SystemRow[];
  unitsOnFile?: UnitOnFile[];
}) {
  const [role, setRole] = useState("outdoor_unit");
  const [equipmentId] = useState(createPendingEquipmentId);
  const [replaceTargetId, setReplaceTargetId] = useState("");
  const [hasManualEquipmentDetails, setHasManualEquipmentDetails] = useState(false);
  const [hasLabelPhotoEvidence, setHasLabelPhotoEvidence] = useState(false);
  const canSubmitEquipment = role === FILTER_ROLE_VALUE || hasManualEquipmentDetails || hasLabelPhotoEvidence;

  function updateManualEquipmentDetails(event: FormEvent<HTMLFormElement>) {
    if (role === FILTER_ROLE_VALUE) {
      setHasManualEquipmentDetails(false);
      return;
    }
    const formData = new FormData(event.currentTarget);
    setHasManualEquipmentDetails(
      MANUAL_EQUIPMENT_DETAIL_FIELDS.some((field) => String(formData.get(field) ?? "").trim().length > 0),
    );
  }

  function updateRole(nextRole: string) {
    setRole(nextRole);
    if (nextRole === FILTER_ROLE_VALUE) {
      setHasManualEquipmentDetails(false);
    }
  }

  return (
    <form
      action={role === FILTER_ROLE_VALUE ? addSystemFilterFromForm : addJobEquipmentFromForm}
      onChange={updateManualEquipmentDetails}
      onInput={updateManualEquipmentDetails}
      className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-14px_rgba(15,23,42,0.12)]"
    >
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="equipment_id" value={equipmentId} />
      <EquipmentCreateFormFields
        systems={systems}
        includeSystemPicker={true}
        includeFilterOption={true}
        role={role}
        onRoleChange={updateRole}
        replaceSection={
          unitsOnFile.length > 0 ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <label
                className="text-xs font-semibold uppercase tracking-wide text-slate-400 block mb-2"
                htmlFor="replaces_canonical_equipment_id"
              >
                Replacing an existing unit?
              </label>
              <select
                id="replaces_canonical_equipment_id"
                name="replaces_canonical_equipment_id"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                value={replaceTargetId}
                onChange={(e) => setReplaceTargetId(e.target.value)}
              >
                <option value="">No — adding additional equipment</option>
                {unitsOnFile.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    Replaces: {unit.display}
                  </option>
                ))}
              </select>
              {replaceTargetId ? (
                <div className="mt-3">
                  <label
                    className="text-xs font-medium text-slate-700 block mb-1.5"
                    htmlFor="retire_reason"
                  >
                    Why is it being replaced?
                  </label>
                  <select
                    id="retire_reason"
                    name="retire_reason"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    defaultValue=""
                    required
                  >
                    <option value="" disabled>
                      Select retire reason
                    </option>
                    <option value="failure">Failure</option>
                    <option value="warranty">Warranty</option>
                    <option value="upgrade">Upgrade</option>
                  </select>
                  <p className="mt-1.5 text-xs text-slate-500">
                    The old unit is retired on the property record (never deleted) and this new
                    unit takes its place. Past jobs keep showing the old unit.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null
        }
        showSubmitButton={canSubmitEquipment}
        actionAccessory={
          role !== FILTER_ROLE_VALUE ? (
            <EquipmentLabelPhotoEvidencePanel
              jobId={jobId}
              equipmentId={equipmentId}
              equipmentLabel={equipmentRoleLabel(role)}
              variant="action"
              onSavedChange={setHasLabelPhotoEvidence}
              saveWithParentForm
            />
          ) : null
        }
      />
    </form>
  );
}
