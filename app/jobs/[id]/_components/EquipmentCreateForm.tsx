"use client";

import { useState } from "react";
import EquipmentCreateFormFields, { FILTER_ROLE_VALUE } from "@/components/jobs/EquipmentCreateFormFields";
import EquipmentLabelPhotoEvidencePanel from "@/components/jobs/EquipmentLabelPhotoEvidencePanel";
import { addJobEquipmentFromForm, addSystemFilterFromForm } from "@/lib/actions/job-actions";
import { equipmentRoleLabel } from "@/lib/utils/equipment-display";

type SystemRow = { id: string; name: string | null };

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

  return (
    <form
      action={role === FILTER_ROLE_VALUE ? addSystemFilterFromForm : addJobEquipmentFromForm}
      className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-14px_rgba(15,23,42,0.12)]"
    >
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="equipment_id" value={equipmentId} />
      <EquipmentCreateFormFields
        systems={systems}
        includeSystemPicker={true}
        includeFilterOption={true}
        role={role}
        onRoleChange={setRole}
      />
      {role !== FILTER_ROLE_VALUE ? (
        <div className="border-t border-slate-200 px-5 py-4 sm:px-6">
          <EquipmentLabelPhotoEvidencePanel
            jobId={jobId}
            equipmentId={equipmentId}
            equipmentLabel={equipmentRoleLabel(role)}
          />
        </div>
      ) : null}
    </form>
  );
}
