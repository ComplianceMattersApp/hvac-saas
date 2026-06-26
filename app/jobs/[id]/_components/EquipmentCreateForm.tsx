"use client";

import { useState } from "react";
import EquipmentCreateFormFields, { FILTER_ROLE_VALUE } from "@/components/jobs/EquipmentCreateFormFields";
import { addJobEquipmentFromForm, addSystemFilterFromForm } from "@/lib/actions/job-actions";

type SystemRow = { id: string; name: string | null };

export default function EquipmentCreateForm({
  jobId,
  systems,
}: {
  jobId: string;
  systems: SystemRow[];
}) {
  const [role, setRole] = useState("outdoor_unit");

  return (
    <form
      action={role === FILTER_ROLE_VALUE ? addSystemFilterFromForm : addJobEquipmentFromForm}
      className="pt-4 border-t border-gray-200"
    >
      <input type="hidden" name="job_id" value={jobId} />
      <EquipmentCreateFormFields
        systems={systems}
        includeSystemPicker={true}
        includeFilterOption={true}
        role={role}
        onRoleChange={setRole}
      />
    </form>
  );
}
