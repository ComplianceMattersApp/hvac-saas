"use server";

import { revalidatePath } from "next/cache";
import {
  updateHelpGapReviewStatus,
  type UpdateHelpGapReviewStatusResult,
} from "@/lib/help-assistant/help-gap-review-status";

export async function updateHelpGapReviewStatusFromForm(
  formData: FormData,
): Promise<void> {
  await updateHelpGapReviewStatusAction({
    eventId: formData.get("event_id"),
    reviewStatus: formData.get("review_status"),
  });
}

export async function updateHelpGapReviewStatusAction(input: {
  eventId: unknown;
  reviewStatus: unknown;
}): Promise<UpdateHelpGapReviewStatusResult> {
  const result = await updateHelpGapReviewStatus({
    eventId: input.eventId,
    reviewStatus: input.reviewStatus,
  });

  if (result.ok) {
    revalidatePath("/ops/admin/help-gaps");
  }

  return result;
}
