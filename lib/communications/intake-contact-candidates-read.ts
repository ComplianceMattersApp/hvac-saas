const INTAKE_CONTACT_CANDIDATE_SELECT = [
  "id",
  "account_owner_user_id",
  "contractor_intake_submission_id",
  "proposed_role",
  "display_name",
  "phone",
  "email",
  "preferred_contact_method",
  "proposed_link_target",
  "source_role",
  "source_type",
  "status",
  "notes",
  "created_by_user_id",
  "created_at",
  "updated_at",
].join(", ");

type SupabaseLike = {
  from(table: string): any;
};

export type IntakeContactCandidateRow = {
  id: string;
  account_owner_user_id: string;
  contractor_intake_submission_id: string;
  proposed_role: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  preferred_contact_method: "sms" | "phone" | "email" | "none" | string;
  proposed_link_target: "customer" | "job" | "undecided" | string;
  source_role: "contractor" | "internal" | string;
  source_type: "intake_submission" | "internal_review" | string;
  status: "proposed" | "approved_for_promotion" | "skipped" | string;
  notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

function asTrimmed(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

function asOptionalTrimmed(value: unknown) {
  const text = asTrimmed(value);
  return text || null;
}

function isMissingIntakeContactCandidatesReadError(error: any) {
  const code = asTrimmed(error?.code).toUpperCase();
  const message = [error?.message, error?.details, error?.hint]
    .map((value) => asTrimmed(value).toLowerCase())
    .filter(Boolean)
    .join(" ");

  if (!message.includes("contractor_intake_contact_candidates")) {
    return false;
  }

  if (code === "42P01" || code === "PGRST205") {
    return true;
  }

  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    message.includes("not found in the schema cache")
  );
}

export function normalizeIntakeContactCandidateRow(row: any): IntakeContactCandidateRow | null {
  const id = asTrimmed(row?.id);
  const accountOwnerUserId = asTrimmed(row?.account_owner_user_id);
  const submissionId = asTrimmed(row?.contractor_intake_submission_id);
  const proposedRole = asTrimmed(row?.proposed_role);
  const displayName = asTrimmed(row?.display_name);
  const preferredContactMethod = asTrimmed(row?.preferred_contact_method);
  const proposedLinkTarget = asTrimmed(row?.proposed_link_target);
  const sourceRole = asTrimmed(row?.source_role);
  const sourceType = asTrimmed(row?.source_type);
  const status = asTrimmed(row?.status);
  const createdAt = asTrimmed(row?.created_at);
  const updatedAt = asTrimmed(row?.updated_at);

  if (
    !id ||
    !accountOwnerUserId ||
    !submissionId ||
    !proposedRole ||
    !displayName ||
    !preferredContactMethod ||
    !proposedLinkTarget ||
    !sourceRole ||
    !sourceType ||
    !status ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  return {
    id,
    account_owner_user_id: accountOwnerUserId,
    contractor_intake_submission_id: submissionId,
    proposed_role: proposedRole,
    display_name: displayName,
    phone: asOptionalTrimmed(row?.phone),
    email: asOptionalTrimmed(row?.email),
    preferred_contact_method: preferredContactMethod,
    proposed_link_target: proposedLinkTarget,
    source_role: sourceRole,
    source_type: sourceType,
    status,
    notes: asOptionalTrimmed(row?.notes),
    created_by_user_id: asOptionalTrimmed(row?.created_by_user_id),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export async function listIntakeContactCandidatesForSubmission(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string | null | undefined;
  contractorIntakeSubmissionId: string | null | undefined;
  limit?: number | null;
}): Promise<IntakeContactCandidateRow[]> {
  const accountOwnerUserId = asTrimmed(params.accountOwnerUserId);
  const submissionId = asTrimmed(params.contractorIntakeSubmissionId);
  if (!accountOwnerUserId || !submissionId) {
    return [];
  }

  let query = params.supabase
    .from("contractor_intake_contact_candidates")
    .select(INTAKE_CONTACT_CANDIDATE_SELECT)
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("contractor_intake_submission_id", submissionId)
    .order("created_at", { ascending: true });

  const limit = Number(params.limit ?? 200);
  if (Number.isFinite(limit) && limit > 0) {
    query = query.limit(Math.min(Math.floor(limit), 500));
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingIntakeContactCandidatesReadError(error)) {
      return [];
    }
    throw error;
  }

  return (data ?? [])
    .map((row: any) => normalizeIntakeContactCandidateRow(row))
    .filter((row: IntakeContactCandidateRow | null): row is IntakeContactCandidateRow => row !== null);
}
