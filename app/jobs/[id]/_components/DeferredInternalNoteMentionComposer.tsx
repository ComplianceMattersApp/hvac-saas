import { createClient } from "@/lib/supabase/server";
import { addInternalNoteFromForm } from "@/lib/actions/job-actions";
import { getAssignableInternalUsers } from "@/lib/staffing/human-layer";
import InternalNoteMentionComposer from "./InternalNoteMentionComposer";

type DeferredInternalNoteMentionComposerProps = {
  jobId: string;
  tab: string;
  accountOwnerUserId: string;
  textareaClassName: string;
  selectClassName: string;
  helperTextClassName: string;
  buttonClassName: string;
  returnAnchor?: string;
};

export default async function DeferredInternalNoteMentionComposer({
  jobId,
  tab,
  accountOwnerUserId,
  textareaClassName,
  selectClassName,
  helperTextClassName,
  buttonClassName,
  returnAnchor,
}: DeferredInternalNoteMentionComposerProps) {
  const supabase = await createClient();
  const candidates = await getAssignableInternalUsers({
    supabase,
    accountOwnerUserId,
  });

  return (
    <InternalNoteMentionComposer
      action={addInternalNoteFromForm}
      jobId={jobId}
      tab={tab}
      candidates={candidates}
      textareaClassName={textareaClassName}
      selectClassName={selectClassName}
      helperTextClassName={helperTextClassName}
      buttonClassName={buttonClassName}
      returnAnchor={returnAnchor}
    />
  );
}
