import { createClient } from "@/lib/supabase/server";
import { getAssignableInternalUsers } from "@/lib/staffing/human-layer";
import { assignJobAssigneeFromForm } from "@/lib/actions/job-actions";
import SubmitButton from "@/components/SubmitButton";

type DeferredAddAssigneeFormProps = {
  jobId: string;
  tab: string;
  assignedUserIds: string[];
};

const selectClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,box-shadow,background-color] focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 [color-scheme:light]";

export default async function DeferredAddAssigneeForm({
  jobId,
  tab,
  assignedUserIds,
}: DeferredAddAssigneeFormProps) {
  const supabase = await createClient();

  const assignableInternalUsers = await getAssignableInternalUsers({ supabase });

  const assignedSet = new Set(assignedUserIds);
  const assignmentCandidates = assignableInternalUsers.filter(
    (row) => !assignedSet.has(String(row.user_id ?? "").trim()),
  );

  return (
    <form
      action={assignJobAssigneeFromForm}
      className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
    >
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="tab" value={tab} />
      <select
        name="user_id"
        className={`${selectClass} w-full min-w-0 sm:w-auto sm:min-w-[14rem]`}
        required
        defaultValue=""
        disabled={assignmentCandidates.length === 0}
      >
        <option value="" disabled>
          {assignmentCandidates.length === 0 ? "No available assignees" : "Select assignee"}
        </option>
        {assignmentCandidates.map((candidate) => (
          <option key={candidate.user_id} value={candidate.user_id}>
            {candidate.display_name}
          </option>
        ))}
      </select>

      <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
        <input type="checkbox" name="make_primary" value="1" className="h-3.5 w-3.5" />
        Set as primary
      </label>

      <SubmitButton
        loadingText="Assigning..."
        disabled={assignmentCandidates.length === 0}
        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        Assign
      </SubmitButton>
    </form>
  );
}
