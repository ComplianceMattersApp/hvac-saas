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
      className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-14px_rgba(15,23,42,0.12)]"
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
