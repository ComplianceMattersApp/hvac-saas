export const INTERNAL_ESTIMATE_PROPOSAL_APPROVED_NOTIFICATION_TYPE =
  "internal_estimate_proposal_approved";

type InsertInternalProposalApprovedNotificationInput = {
  supabase: any;
  accountOwnerUserId: string;
  estimateId: string;
  estimateNumber: string;
  proposalLinkId: string;
  approverName: string;
  selectedOptionId?: string | null;
  selectedOptionLabelSnapshot?: string | null;
};

type InsertInternalProposalApprovedNotificationResult = {
  id: string;
  inserted: boolean;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function buildProposalApprovedBody(input: {
  approverName: string;
  estimateNumber: string;
  selectedOptionLabelSnapshot: string | null;
}) {
  if (input.selectedOptionLabelSnapshot) {
    return `${input.approverName} approved ${input.selectedOptionLabelSnapshot} for estimate ${input.estimateNumber}.`;
  }

  return `${input.approverName} approved estimate ${input.estimateNumber}.`;
}

export async function insertInternalProposalApprovedNotification(
  input: InsertInternalProposalApprovedNotificationInput
): Promise<InsertInternalProposalApprovedNotificationResult> {
  const accountOwnerUserId = normalizeText(input.accountOwnerUserId);
  const estimateId = normalizeText(input.estimateId);
  const estimateNumber = normalizeText(input.estimateNumber);
  const proposalLinkId = normalizeText(input.proposalLinkId);
  const approverName = normalizeText(input.approverName);
  const selectedOptionId = normalizeText(input.selectedOptionId);
  const selectedOptionLabelSnapshot = normalizeText(input.selectedOptionLabelSnapshot) || null;

  if (!accountOwnerUserId) throw new Error("Missing accountOwnerUserId for proposal approval notification");
  if (!estimateId) throw new Error("Missing estimateId for proposal approval notification");
  if (!estimateNumber) throw new Error("Missing estimateNumber for proposal approval notification");
  if (!proposalLinkId) throw new Error("Missing proposalLinkId for proposal approval notification");
  if (!approverName) throw new Error("Missing approverName for proposal approval notification");

  const dedupeKey = `proposal_approved:${proposalLinkId}`;

  const { data: existingNotification, error: existingNotificationError } = await input.supabase
    .from("notifications")
    .select("id")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("recipient_type", "internal")
    .eq("channel", "in_app")
    .eq("notification_type", INTERNAL_ESTIMATE_PROPOSAL_APPROVED_NOTIFICATION_TYPE)
    .contains("payload", { dedupe_key: dedupeKey })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingNotificationError) {
    throw existingNotificationError;
  }

  const existingId = normalizeText(existingNotification?.id);
  if (existingId) {
    return { id: existingId, inserted: false };
  }

  const payload: Record<string, unknown> = {
    source: "customer_proposal_link",
    dedupe_key: dedupeKey,
    estimate_id: estimateId,
    estimate_number: estimateNumber,
    proposal_link_id: proposalLinkId,
    approver_name: approverName,
    selected_option_id: selectedOptionId || null,
    selected_option_label_snapshot: selectedOptionLabelSnapshot,
  };

  const { data, error } = await input.supabase
    .from("notifications")
    .insert({
      job_id: null,
      account_owner_user_id: accountOwnerUserId,
      recipient_type: "internal",
      recipient_ref: null,
      channel: "in_app",
      notification_type: INTERNAL_ESTIMATE_PROPOSAL_APPROVED_NOTIFICATION_TYPE,
      subject: "Proposal Approved",
      body: buildProposalApprovedBody({
        approverName,
        estimateNumber,
        selectedOptionLabelSnapshot,
      }),
      payload,
      status: "queued",
    })
    .select("id")
    .single();

  if (error) throw error;

  const notificationId = normalizeText(data?.id);
  if (!notificationId) {
    throw new Error("Failed to create proposal approval notification row");
  }

  return { id: notificationId, inserted: true };
}