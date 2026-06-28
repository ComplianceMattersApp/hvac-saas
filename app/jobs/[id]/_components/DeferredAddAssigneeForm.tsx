import { createClient } from "@/lib/supabase/server";
import { updateJobTeamAssignmentsFromForm } from "@/lib/actions/job-actions";
import { getAssignableInternalUsers } from "@/lib/staffing/human-layer";
import type { ActiveJobAssignmentDisplay } from "@/lib/staffing/human-layer";
import TeamAssignmentSelector from "./TeamAssignmentSelector";

type DeferredAddAssigneeFormProps = {
  jobId: string;
  tab: string;
  assignedTeam: ActiveJobAssignmentDisplay[];
  returnAnchor?: string;
  returnTo?: string;
};

export default async function DeferredAddAssigneeForm({
  jobId,
  tab,
  assignedTeam,
  returnAnchor = "assigned-team",
  returnTo,
}: DeferredAddAssigneeFormProps) {
  const supabase = await createClient();

  const assignableInternalUsers = await getAssignableInternalUsers({ supabase });

  return (
    <TeamAssignmentSelector
      jobId={jobId}
      tab={tab}
      returnAnchor={returnAnchor}
      assignedTeam={assignedTeam}
      assignableUsers={assignableInternalUsers}
      updateTeamAction={updateJobTeamAssignmentsFromForm}
      returnTo={returnTo}
    />
  );
}
