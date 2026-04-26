import { createAdminClient, createClient } from "@/lib/supabase/server";

export type CurrentContractorPortalContext = {
  contractorId: string;
  contractorName: string | null;
  userId: string;
};

export type PendingContractorIntakeProposal = {
  id: string;
  created_at: string;
  proposed_customer_first_name: string | null;
  proposed_customer_last_name: string | null;
  proposed_title: string | null;
  proposed_job_type: string | null;
  proposed_address_line1: string | null;
  proposed_city: string | null;
  proposed_zip: string | null;
};

export type ContractorPortalIntakeProposalDetail = {
  submission: Record<string, unknown>;
  proposalAttachmentCount: number;
  addendumRows: Array<Record<string, unknown>>;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function resolvePortalAccessError(code: string) {
  return new Error(code);
}

function resolveProposalReadAdmin(inputAdmin?: any) {
  return inputAdmin ?? createAdminClient();
}

export async function requireCurrentContractorPortalContext(input?: {
  supabase?: any;
}): Promise<CurrentContractorPortalContext> {
  const supabase = input?.supabase ?? (await createClient());
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const userId = normalizeText(userData?.user?.id);

  if (userErr) throw userErr;
  if (!userId) throw resolvePortalAccessError("NOT_AUTHENTICATED");

  const { data: contractorUser, error: contractorErr } = await supabase
    .from("contractor_users")
    .select("contractor_id, contractors ( id, name, lifecycle_state )")
    .eq("user_id", userId)
    .maybeSingle();

  if (contractorErr) throw contractorErr;

  const contractorId = normalizeText(contractorUser?.contractor_id);
  if (!contractorId) throw resolvePortalAccessError("NOT_CONTRACTOR");

  const lifecycleState = normalizeText((contractorUser as any)?.contractors?.lifecycle_state).toLowerCase();
  if (lifecycleState && lifecycleState !== "active") {
    throw resolvePortalAccessError("CONTRACTOR_ARCHIVED");
  }

  return {
    contractorId,
    contractorName: normalizeText((contractorUser as any)?.contractors?.name) || null,
    userId,
  };
}

function assertSameContractorPortalScope(params: {
  currentContractorId: string;
  contractorId?: string | null;
}) {
  const requestedContractorId = normalizeText(params.contractorId);
  if (requestedContractorId && requestedContractorId !== params.currentContractorId) {
    throw resolvePortalAccessError("NOT_AUTHORIZED");
  }
}

async function loadScopedProposalRow(params: {
  admin?: any;
  contractorId: string;
  submissionId: string;
  select: string;
  pendingOnly?: boolean;
}) {
  const admin = resolveProposalReadAdmin(params.admin);

  let query = admin
    .from("contractor_intake_submissions")
    .select(params.select)
    .eq("id", params.submissionId)
    .eq("contractor_id", params.contractorId);

  if (params.pendingOnly) {
    query = query.eq("review_status", "pending");
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function listPendingContractorIntakeProposalsForContractor(input: {
  contractorId?: string;
  context?: CurrentContractorPortalContext;
  supabase?: any;
  admin?: any;
}): Promise<PendingContractorIntakeProposal[]> {
  const context =
    input.context ?? (await requireCurrentContractorPortalContext({ supabase: input.supabase }));
  assertSameContractorPortalScope({
    currentContractorId: context.contractorId,
    contractorId: input.contractorId,
  });

  const contractorId = context.contractorId;
  if (!contractorId) return [];

  const admin = resolveProposalReadAdmin(input.admin);
  const { data, error } = await admin
    .from("contractor_intake_submissions")
    .select(
      "id, created_at, proposed_customer_first_name, proposed_customer_last_name, proposed_title, proposed_job_type, proposed_address_line1, proposed_city, proposed_zip"
    )
    .eq("contractor_id", contractorId)
    .eq("review_status", "pending")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    created_at: String(row.created_at ?? ""),
    proposed_customer_first_name: row.proposed_customer_first_name ?? null,
    proposed_customer_last_name: row.proposed_customer_last_name ?? null,
    proposed_title: row.proposed_title ?? null,
    proposed_job_type: row.proposed_job_type ?? null,
    proposed_address_line1: row.proposed_address_line1 ?? null,
    proposed_city: row.proposed_city ?? null,
    proposed_zip: row.proposed_zip ?? null,
  }));
}

export async function getContractorIntakeProposalPortalDetail(input: {
  submissionId: string;
  contractorId?: string;
  context?: CurrentContractorPortalContext;
  supabase?: any;
  admin?: any;
}): Promise<ContractorPortalIntakeProposalDetail | null> {
  const context =
    input.context ?? (await requireCurrentContractorPortalContext({ supabase: input.supabase }));
  assertSameContractorPortalScope({
    currentContractorId: context.contractorId,
    contractorId: input.contractorId,
  });

  const submissionId = normalizeText(input.submissionId);
  if (!submissionId) return null;

  const admin = resolveProposalReadAdmin(input.admin);
  const submission = await loadScopedProposalRow({
    admin,
    contractorId: context.contractorId,
    submissionId,
    select:
      "id, created_at, review_status, proposed_customer_first_name, proposed_customer_last_name, proposed_customer_phone, proposed_customer_email, proposed_address_line1, proposed_city, proposed_zip, proposed_job_type, proposed_project_type, proposed_title, proposed_job_notes, proposed_permit_number, proposed_jurisdiction, proposed_permit_date",
  });

  if (!submission) return null;

  const reviewStatus = normalizeText((submission as any)?.review_status).toLowerCase();
  if (reviewStatus !== "pending") {
    return {
      submission: submission as Record<string, unknown>,
      proposalAttachmentCount: 0,
      addendumRows: [],
    };
  }

  const { count: proposalAttachmentCount, error: attachmentCountErr } = await admin
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", "contractor_intake_submission")
    .eq("entity_id", submissionId);

  if (attachmentCountErr) throw attachmentCountErr;

  const { data: addendumRows, error: addendumErr } = await admin
    .from("contractor_intake_submission_comments")
    .select("id, comment_text, created_at")
    .eq("submission_id", submissionId)
    .eq("author_role", "contractor")
    .order("created_at", { ascending: false })
    .limit(200);

  if (addendumErr) throw addendumErr;

  return {
    submission: submission as Record<string, unknown>,
    proposalAttachmentCount: proposalAttachmentCount ?? 0,
    addendumRows: (addendumRows ?? []) as Array<Record<string, unknown>>,
  };
}

export async function appendContractorIntakeProposalPortalComment(input: {
  submissionId: string;
  commentText: string;
  contractorId?: string;
  context?: CurrentContractorPortalContext;
  supabase?: any;
  admin?: any;
}) {
  const context =
    input.context ?? (await requireCurrentContractorPortalContext({ supabase: input.supabase }));
  assertSameContractorPortalScope({
    currentContractorId: context.contractorId,
    contractorId: input.contractorId,
  });

  const submissionId = normalizeText(input.submissionId);
  const trimmedComment = normalizeText(input.commentText).slice(0, 4000).trim();

  if (!submissionId) throw resolvePortalAccessError("INVALID_SUBMISSION");
  if (!trimmedComment) throw resolvePortalAccessError("EMPTY_COMMENT");

  const admin = resolveProposalReadAdmin(input.admin);
  const scopedSubmission = await loadScopedProposalRow({
    admin,
    contractorId: context.contractorId,
    submissionId,
    pendingOnly: true,
    select: "id, review_status",
  });

  if (!scopedSubmission) {
    throw resolvePortalAccessError("NOT_FOUND");
  }

  const { error: insertErr } = await admin
    .from("contractor_intake_submission_comments")
    .insert({
      submission_id: submissionId,
      author_user_id: context.userId,
      author_role: "contractor",
      comment_text: trimmedComment,
    });

  if (insertErr) throw insertErr;
}