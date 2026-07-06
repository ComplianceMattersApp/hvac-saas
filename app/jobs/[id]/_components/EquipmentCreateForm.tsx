"use client";

import { useState, type FormEvent } from "react";
import EquipmentCreateFormFields, { FILTER_ROLE_VALUE } from "@/components/jobs/EquipmentCreateFormFields";
import EquipmentLabelPhotoEvidencePanel from "@/components/jobs/EquipmentLabelPhotoEvidencePanel";
import { addJobEquipmentFromForm, addSystemFilterFromForm } from "@/lib/actions/job-actions";
import { equipmentRoleLabel } from "@/lib/utils/equipment-display";

type SystemRow = { id: string; name: string | null };

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
}: {
  jobId: string;
  systems: SystemRow[];
}) {
  const [role, setRole] = useState("outdoor_unit");
  const [equipmentId] = useState(createPendingEquipmentId);
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
        showSubmitButton={canSubmitEquipment}
        actionAccessory={
          role !== FILTER_ROLE_VALUE ? (
            <EquipmentLabelPhotoEvidencePanel
              jobId={jobId}
              equipmentId={equipmentId}
              equipmentLabel={equipmentRoleLabel(role)}
              variant="action"
              onSavedChange={setHasLabelPhotoEvidence}
            />
          ) : null
        }
      />
    </form>
  );
}
