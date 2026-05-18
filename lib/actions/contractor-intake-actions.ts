"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  isInternalAccessError,
  requireInternalRole,
} from "@/lib/auth/internal-user";
import { createJob, ensureActiveAssignmentAndNotify } from "@/lib/actions/job-actions";
import { markInternalNewWorkNotificationsResolved } from "@/lib/actions/notification-actions";
import {
  normalizeContractorIntakeProjectType,
  resolveFinalizedContractorIntakeTitle,
} from "@/lib/utils/contractor-intake-title";
import { resolveOperationalMutationEntitlementAccess } from "@/lib/business/platform-entitlement";

type FinalizationMode = "existing_existing" | "existing_new" | "new_new";

type IntakeSubmissionRow = {
  id: string;
  account_owner_user_id: string;
  submitted_by_user_id: string;
  contractor_id: string;
  proposed_customer_first_name: string | null;
  proposed_customer_last_name: string | null;
  proposed_customer_phone: string | null;
  proposed_customer_email: string | null;
  proposed_address_line1: string | null;
  proposed_city: string | null;
  proposed_state: string | null;
  proposed_zip: string | null;
  proposed_location_nickname: string | null;
  proposed_job_type: string | null;
  proposed_project_type: string | null;
  proposed_title: string | null;
  proposed_job_notes: string | null;
  proposed_permit_number: string | null;
  proposed_jurisdiction: string | null;
  proposed_permit_date: string | null;
  review_status: string;
};

type IntakeSubmissionCommentRow = {
  id: string;
  submission_id: string;
  author_user_id: string | null;
  author_role: string | null;
  comment_text: string | null;
  created_at: string | null;
};

type IntakeContactCandidateRow = {
  id: string;
  account_owner_user_id: string;
  contractor_intake_submission_id: string;
  proposed_role: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  preferred_contact_method: string | null;
  proposed_link_target: string;
  source_type: string | null;
  status: string;
};

const INTAKE_CANDIDATE_ALLOWED_ROLES = new Set([
  "homeowner",
  "tenant_or_occupant",
  "responsible_party",
  "billing_contact",
  "third_party_oversight",
  "site_access_contact",
]);

const INTAKE_CANDIDATE_ALLOWED_METHODS = new Set(["sms", "phone", "email", "none"]);
const INTAKE_CANDIDATE_ALLOWED_TARGETS = new Set(["customer", "job", "undecided"]);

function defaultIntakeCandidateTargetForRole(role: string) {
  return role === "site_access_contact" ? "job" : "customer";
}

function isValidIntakeCandidateRoleTargetPair(role: string, target: string) {
  if (role === "site_access_contact") {
    return target === "job" || target === "undecided";
  }

  return target === "customer" || target === "undecided";
}

function normalizeEmailForContactRecipient(value: string | null | undefined) {
  const email = normalizeText(value).toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function normalizePhoneE164ForContactRecipient(value: string | null | undefined) {
  const raw = normalizeText(value);
  if (!raw) return null;

  const compact = raw.replace(/[\s().-]/g, "");
  const digits = compact.replace(/\D/g, "");

  if (compact.startsWith("+")) {
    if (digits.length >= 8 && digits.length <= 15) {
      return `+${digits}`;
    }
    return null;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

function phoneLast10FromE164(phoneE164: string | null) {
  if (!phoneE164) return null;
  const digits = phoneE164.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

function normalizePreferredMethodForContactRecipient(
  value: string | null | undefined,
  params: { hasPhone: boolean; hasEmail: boolean },
) {
  const method = normalizeText(value).toLowerCase();
  const allowed = new Set(["sms", "phone", "email", "none"]);
  const normalized = allowed.has(method) ? method : "none";

  if ((normalized === "sms" || normalized === "phone") && !params.hasPhone) {
    return params.hasEmail ? "email" : "none";
  }

  if (normalized === "email" && !params.hasEmail) {
    return params.hasPhone ? "phone" : "none";
  }

  if (normalized === "none") {
    if (params.hasPhone) return "phone";
    if (params.hasEmail) return "email";
  }

  return normalized;
}

function candidateSourceTypeForContactRecipient(value: string | null | undefined) {
  const source = normalizeText(value).toLowerCase();
  if (source === "intake_submission") return "intake_submission";
  return "internal_review";
}

function isDuplicateActiveContact(params: {
  existingRows: Array<{ phone_e164?: string | null; email?: string | null; display_name?: string | null }>;
  phoneE164: string | null;
  email: string | null;
  displayName: string;
}) {
  const phone = normalizeText(params.phoneE164);
  const mail = normalizeText(params.email).toLowerCase();
  const name = normalizeText(params.displayName).toLowerCase();

  return params.existingRows.some((row) => {
    const existingPhone = normalizeText(row.phone_e164);
    const existingEmail = normalizeText(row.email).toLowerCase();
    const existingName = normalizeText(row.display_name).toLowerCase();

    if (phone && existingPhone && phone === existingPhone) return true;
    if (mail && existingEmail && mail === existingEmail) return true;
    if (!phone && !mail && name && existingName && name === existingName) return true;
    return false;
  });
}

async function promoteApprovedIntakeContactCandidates(params: {
  admin: ReturnType<typeof createAdminClient>;
  accountOwnerUserId: string;
  submissionId: string;
  finalizedCustomerId: string;
  finalizedJobId: string;
  reviewerUserId: string;
}) {
  const { admin, accountOwnerUserId, submissionId, finalizedCustomerId, finalizedJobId, reviewerUserId } = params;

  let candidateRows: IntakeContactCandidateRow[] = [];
  try {
    const { data, error } = await admin
      .from("contractor_intake_contact_candidates")
      .select(
        "id, account_owner_user_id, contractor_intake_submission_id, proposed_role, display_name, phone, email, preferred_contact_method, proposed_link_target, source_type, status",
      )
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("contractor_intake_submission_id", submissionId)
      .eq("status", "approved_for_promotion")
      .order("created_at", { ascending: true })
      .limit(500);

    if (error) throw error;
    candidateRows = (data ?? []) as IntakeContactCandidateRow[];
  } catch (error) {
    if (isMissingIntakeContactCandidatesWriteError(error)) {
      console.warn("[contractor-intake] candidate promotion skipped (table unavailable)", {
        submissionId,
        accountOwnerUserId,
      });
      return;
    }
    throw error;
  }

  for (const candidate of candidateRows) {
    try {
      const role = normalizeText(candidate.proposed_role).toLowerCase();
      const displayName = normalizeText(candidate.display_name);
      const target = normalizeText(candidate.proposed_link_target).toLowerCase();

      if (!INTAKE_CANDIDATE_ALLOWED_ROLES.has(role)) {
        console.warn("[contractor-intake] candidate promotion skipped (invalid role)", {
          submissionId,
          candidateId: candidate.id,
          role,
        });
        continue;
      }

      if (!displayName) {
        console.warn("[contractor-intake] candidate promotion skipped (missing display name)", {
          submissionId,
          candidateId: candidate.id,
        });
        continue;
      }

      if (target === "undecided") {
        console.warn("[contractor-intake] candidate promotion skipped (undecided target)", {
          submissionId,
          candidateId: candidate.id,
        });
        continue;
      }

      if (!isValidIntakeCandidateRoleTargetPair(role, target)) {
        console.warn("[contractor-intake] candidate promotion skipped (invalid role-target pairing)", {
          submissionId,
          candidateId: candidate.id,
          role,
          target,
        });
        continue;
      }

      const linkedEntityType = target === "job" ? "job" : "customer";
      const linkedEntityId = target === "job" ? finalizedJobId : finalizedCustomerId;

      const phoneE164 = normalizePhoneE164ForContactRecipient(candidate.phone);
      const phoneLast10 = phoneLast10FromE164(phoneE164);
      const email = normalizeEmailForContactRecipient(candidate.email);

      if (!phoneE164 && !email) {
        console.warn("[contractor-intake] candidate promotion skipped (no usable phone/email)", {
          submissionId,
          candidateId: candidate.id,
        });
        continue;
      }

      const preferredContactMethod = normalizePreferredMethodForContactRecipient(
        candidate.preferred_contact_method,
        { hasPhone: Boolean(phoneE164), hasEmail: Boolean(email) },
      );

      const { data: existingRows, error: existingErr } = await admin
        .from("contact_recipients")
        .select("id, phone_e164, email, display_name")
        .eq("account_owner_user_id", accountOwnerUserId)
        .eq("linked_entity_type", linkedEntityType)
        .eq("linked_entity_id", linkedEntityId)
        .eq("recipient_role", role)
        .eq("status", "active")
        .limit(200);

      if (existingErr) throw existingErr;

      if (
        isDuplicateActiveContact({
          existingRows: (existingRows ?? []) as Array<{
            phone_e164?: string | null;
            email?: string | null;
            display_name?: string | null;
          }>,
          phoneE164,
          email,
          displayName,
        })
      ) {
        continue;
      }

      const { error: insertErr } = await admin
        .from("contact_recipients")
        .insert({
          account_owner_user_id: accountOwnerUserId,
          linked_entity_type: linkedEntityType,
          linked_entity_id: linkedEntityId,
          recipient_role: role,
          display_name: displayName,
          phone_e164: phoneE164,
          phone_last10: phoneLast10,
          email,
          preferred_contact_method: preferredContactMethod,
          source_type: candidateSourceTypeForContactRecipient(candidate.source_type),
          source_ref: `contractor_intake_candidate:${candidate.id}`,
          status: "active",
          created_by_user_id: reviewerUserId,
          updated_by_user_id: reviewerUserId,
        });

      if (insertErr) throw insertErr;
    } catch (candidateError) {
      console.error("[contractor-intake] candidate promotion failed for candidate", {
        submissionId,
        candidateId: candidate.id,
        accountOwnerUserId,
        error: getSafeErrorDetails(candidateError),
      });
      // V1: best-effort candidate promotion should not block finalization.
      continue;
    }
  }
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isMissingIntakeContactCandidatesWriteError(error: any) {
  const code = normalizeText(error?.code).toUpperCase();
  const message = [error?.message, error?.details, error?.hint]
    .map((value) => normalizeText(value).toLowerCase())
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

function getSafeErrorDetails(error: unknown): { error_code: string | null; error_message: string | null } {
  if (!error) {
    return { error_code: null, error_message: null };
  }

  const maybeRecord = error as Record<string, unknown>;
  const errorCode =
    typeof maybeRecord.code === "string"
      ? maybeRecord.code
      : typeof maybeRecord.error_code === "string"
        ? maybeRecord.error_code
        : null;
  const errorMessage =
    typeof maybeRecord.message === "string"
      ? maybeRecord.message
      : error instanceof Error
        ? error.message
        : String(error);

  return {
    error_code: errorCode,
    error_message: errorMessage,
  };
}

function resolveJobType(raw: unknown): "ecc" | "service" {
  const value = normalizeText(raw).toLowerCase();
  return value === "service" ? "service" : "ecc";
}

function resolveProjectType(raw: unknown) {
  return normalizeContractorIntakeProjectType(raw);
}

async function requireInternalReviewer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  try {
    const authz = await requireInternalRole(["admin", "office"], {
      supabase,
      userId: user.id,
    });

    return {
      supabase,
      admin: createAdminClient(),
      userId: user.id,
      accountOwnerUserId: String(authz.internalUser.account_owner_user_id ?? "").trim(),
    };
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect("/ops");
    }

    throw error;
  }
}

async function loadScopedPendingSubmission(params: {
  admin: ReturnType<typeof createAdminClient>;
  submissionId: string;
  accountOwnerUserId: string;
}) {
  const { admin, submissionId, accountOwnerUserId } = params;

  const { data, error } = await admin
    .from("contractor_intake_submissions")
    .select("*")
    .eq("id", submissionId)
    .eq("account_owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error("Intake submission not found");

  const submission = data as IntakeSubmissionRow;
  if (normalizeText(submission.review_status).toLowerCase() !== "pending") {
    throw new Error("Intake submission is no longer pending");
  }

  return submission;
}

async function requireOperationalContractorIntakeAdjudicationAccessOrRedirect(params: {
  supabase: any;
  accountOwnerUserId: string | null | undefined;
}) {
  const access = await resolveOperationalMutationEntitlementAccess({
    accountOwnerUserId: String(params.accountOwnerUserId ?? "").trim(),
    supabase: params.supabase,
  });

  if (access.authorized) {
    return;
  }

  const search = new URLSearchParams({
    err: "entitlement_blocked",
    reason: access.reason,
  });
  redirect(`/ops/admin/company-profile?${search.toString()}`);
}

async function requireScopedPendingAdjudication(formData: FormData) {
  const { userId, admin, supabase, accountOwnerUserId } = await requireInternalReviewer();
  const submissionId = normalizeText(formData.get("submission_id"));

  if (!isUuid(submissionId)) throw new Error("Invalid submission_id");

  const submission = await loadScopedPendingSubmission({
    admin,
    submissionId,
    accountOwnerUserId,
  });

  await requireOperationalContractorIntakeAdjudicationAccessOrRedirect({
    supabase,
    accountOwnerUserId,
  });

  return {
    userId,
    admin,
    accountOwnerUserId,
    submissionId,
    submission,
  };
}

async function updateContractorIntakeContactCandidateStatusFromForm(params: {
  formData: FormData;
  nextStatus: "approved_for_promotion" | "skipped";
  successNotice: "candidate_approved" | "candidate_skipped";
}) {
  const { admin, accountOwnerUserId, submissionId } = await requireScopedPendingAdjudication(params.formData);
  const candidateId = normalizeText(params.formData.get("candidate_id"));

  if (!isUuid(candidateId)) {
    throw new Error("Invalid candidate_id");
  }

  let candidate: { id: string; status: string } | null = null;
  try {
    const { data, error } = await admin
      .from("contractor_intake_contact_candidates")
      .select("id, status")
      .eq("id", candidateId)
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("contractor_intake_submission_id", submissionId)
      .maybeSingle();

    if (error) throw error;
    candidate = data && data.id ? { id: String((data as any).id), status: normalizeText((data as any).status).toLowerCase() } : null;
  } catch (error) {
    if (isMissingIntakeContactCandidatesWriteError(error)) {
      redirect(`/ops/admin/contractor-intake-submissions/${submissionId}?notice=candidate_table_unavailable`);
    }
    throw error;
  }

  if (!candidate?.id) {
    throw new Error("Candidate not found in account scope");
  }

  if (candidate.status !== "proposed") {
    redirect(`/ops/admin/contractor-intake-submissions/${submissionId}?notice=candidate_already_reviewed`);
  }

  const reviewedAtIso = new Date().toISOString();

  try {
    const { error: updateErr } = await admin
      .from("contractor_intake_contact_candidates")
      .update({
        status: params.nextStatus,
        updated_at: reviewedAtIso,
      })
      .eq("id", candidateId)
      .eq("account_owner_user_id", accountOwnerUserId)
      .eq("contractor_intake_submission_id", submissionId)
      .eq("status", "proposed");

    if (updateErr) throw updateErr;
  } catch (error) {
    if (isMissingIntakeContactCandidatesWriteError(error)) {
      redirect(`/ops/admin/contractor-intake-submissions/${submissionId}?notice=candidate_table_unavailable`);
    }
    throw error;
  }

  revalidatePath("/ops/admin/contractor-intake-submissions");
  revalidatePath(`/ops/admin/contractor-intake-submissions/${submissionId}`);

  redirect(`/ops/admin/contractor-intake-submissions/${submissionId}?notice=${params.successNotice}`);
}

export async function approveContractorIntakeContactCandidateFromForm(formData: FormData) {
  await updateContractorIntakeContactCandidateStatusFromForm({
    formData,
    nextStatus: "approved_for_promotion",
    successNotice: "candidate_approved",
  });
}

export async function skipContractorIntakeContactCandidateFromForm(formData: FormData) {
  await updateContractorIntakeContactCandidateStatusFromForm({
    formData,
    nextStatus: "skipped",
    successNotice: "candidate_skipped",
  });
}

export async function addContractorIntakeContactCandidateFromForm(formData: FormData) {
  let scoped:
    | {
        userId: string;
        admin: ReturnType<typeof createAdminClient>;
        accountOwnerUserId: string;
        submissionId: string;
        submission: IntakeSubmissionRow;
      }
    | null = null;

  try {
    scoped = await requireScopedPendingAdjudication(formData);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("REDIRECT:")) {
      throw error;
    }

    const submissionId = normalizeText(formData.get("submission_id"));
    if (isUuid(submissionId)) {
      redirect(`/ops/admin/contractor-intake-submissions/${submissionId}?notice=candidate_add_failed`);
    }
    throw error;
  }

  const { admin, userId, accountOwnerUserId, submissionId } = scoped;

  try {
    const role = normalizeText(formData.get("proposed_role")).toLowerCase();
    const displayName = normalizeText(formData.get("display_name"));
    const phone = normalizeText(formData.get("phone")) || null;
    const email = normalizeText(formData.get("email")) || null;
    const preferredContactMethod = normalizeText(formData.get("preferred_contact_method")).toLowerCase() || "none";
    const proposedTargetInput = normalizeText(formData.get("proposed_link_target")).toLowerCase();
    const notes = normalizeText(formData.get("notes")) || null;

    if (!INTAKE_CANDIDATE_ALLOWED_ROLES.has(role)) {
      throw new Error("Invalid role");
    }

    if (!displayName) {
      throw new Error("Display name is required");
    }

    if (!INTAKE_CANDIDATE_ALLOWED_METHODS.has(preferredContactMethod)) {
      throw new Error("Invalid preferred contact method");
    }

    const proposedLinkTarget =
      proposedTargetInput && proposedTargetInput !== "default_from_role"
        ? proposedTargetInput
        : defaultIntakeCandidateTargetForRole(role);

    if (!INTAKE_CANDIDATE_ALLOWED_TARGETS.has(proposedLinkTarget)) {
      throw new Error("Invalid proposed link target");
    }

    if (!isValidIntakeCandidateRoleTargetPair(role, proposedLinkTarget)) {
      throw new Error("Invalid role and target pairing");
    }

    if ((preferredContactMethod === "sms" || preferredContactMethod === "phone") && !phone) {
      throw new Error("Phone required for preferred contact method");
    }

    if (preferredContactMethod === "email" && !email) {
      throw new Error("Email required for preferred contact method");
    }

    const { error: insertErr } = await admin
      .from("contractor_intake_contact_candidates")
      .insert({
        account_owner_user_id: accountOwnerUserId,
        contractor_intake_submission_id: submissionId,
        proposed_role: role,
        display_name: displayName,
        phone,
        email,
        preferred_contact_method: preferredContactMethod,
        proposed_link_target: proposedLinkTarget,
        source_role: "internal",
        source_type: "internal_review",
        status: "proposed",
        notes,
        created_by_user_id: userId,
      });

    if (insertErr) throw insertErr;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("REDIRECT:")) {
      throw error;
    }

    if (isMissingIntakeContactCandidatesWriteError(error)) {
      redirect(`/ops/admin/contractor-intake-submissions/${submissionId}?notice=candidate_table_unavailable`);
    }

    redirect(`/ops/admin/contractor-intake-submissions/${submissionId}?notice=candidate_add_failed`);
  }

  revalidatePath("/ops/admin/contractor-intake-submissions");
  revalidatePath(`/ops/admin/contractor-intake-submissions/${submissionId}`);
  redirect(`/ops/admin/contractor-intake-submissions/${submissionId}?notice=candidate_added`);
}

async function listSubmissionComments(params: {
  admin: ReturnType<typeof createAdminClient>;
  submissionId: string;
}) {
  const { admin, submissionId } = params;

  const { data, error } = await admin
    .from("contractor_intake_submission_comments")
    .select("id, submission_id, author_user_id, author_role, comment_text, created_at")
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) throw error;
  return (data ?? []) as IntakeSubmissionCommentRow[];
}

async function appendFinalizationNarrativeEvents(params: {
  admin: ReturnType<typeof createAdminClient>;
  jobId: string;
  submission: IntakeSubmissionRow;
  reviewNote: string | null;
  reviewerUserId: string;
}) {
  const { admin, jobId, submission, reviewNote, reviewerUserId } = params;
  const submissionId = submission.id;

  const submissionComments = await listSubmissionComments({
    admin,
    submissionId,
  });

  const contractorComments = submissionComments.filter((row) => {
    const role = normalizeText(row.author_role).toLowerCase();
    return role === "contractor" && Boolean(normalizeText(row.comment_text));
  });

  const { data: existingRows, error: existingErr } = await admin
    .from("job_events")
    .select("event_type, meta")
    .eq("job_id", jobId)
    .contains("meta", { contractor_intake_submission_id: submissionId })
    .limit(500);

  if (existingErr) throw existingErr;

  const existingCommentIds = new Set<string>();
  let hasSubmissionNoteEvent = false;
  let hasReviewNoteEvent = false;

  for (const row of existingRows ?? []) {
    const type = normalizeText((row as any)?.event_type).toLowerCase();
    const meta = (row as any)?.meta;
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) continue;

    const source = normalizeText((meta as any).source).toLowerCase();
    const commentId = normalizeText((meta as any).contractor_intake_comment_id);
    if (commentId) existingCommentIds.add(commentId);
    if (type === "contractor_note" && source === "contractor_intake_submission_note") {
      hasSubmissionNoteEvent = true;
    }
    if (type === "internal_note" && source === "contractor_intake_review_note") {
      hasReviewNoteEvent = true;
    }
  }

  const submissionNote = normalizeText(submission.proposed_job_notes);
  const normalizedContractorCommentNotes = new Set(
    contractorComments.map((row) => normalizeText(row.comment_text)).filter(Boolean),
  );
  const shouldAddSubmissionNoteEvent =
    Boolean(submissionNote) &&
    !hasSubmissionNoteEvent &&
    !normalizedContractorCommentNotes.has(submissionNote);

  const eventsToInsert: Array<{
    job_id: string;
    event_type: string;
    user_id: string | null;
    meta: Record<string, unknown>;
  }> = contractorComments
    .filter((row) => !existingCommentIds.has(normalizeText(row.id)))
    .map((row) => ({
      job_id: jobId,
      event_type: "contractor_note",
      user_id: normalizeText(row.author_user_id) || null,
      meta: {
        note: normalizeText(row.comment_text),
        source: "contractor_intake_submission_comment",
        contractor_intake_submission_id: submissionId,
        contractor_intake_comment_id: normalizeText(row.id),
        contractor_intake_comment_created_at: normalizeText(row.created_at) || null,
        contractor_intake_comment_author_role: normalizeText(row.author_role) || "contractor",
      },
    }));

  if (shouldAddSubmissionNoteEvent) {
    eventsToInsert.push({
      job_id: jobId,
      event_type: "contractor_note",
      user_id: normalizeText(submission.submitted_by_user_id) || null,
      meta: {
        note: submissionNote,
        source: "contractor_intake_submission_note",
        contractor_intake_submission_id: submissionId,
      },
    });
  }

  const trimmedReviewNote = normalizeText(reviewNote);
  if (trimmedReviewNote && !hasReviewNoteEvent) {
    eventsToInsert.push({
      job_id: jobId,
      event_type: "internal_note",
      user_id: reviewerUserId,
      meta: {
        note: trimmedReviewNote,
        source: "contractor_intake_review_note",
        contractor_intake_submission_id: submissionId,
      },
    });
  }

  if (eventsToInsert.length === 0) return;

  const { error: insertErr } = await admin.from("job_events").insert(eventsToInsert);
  if (insertErr) throw insertErr;
}

async function assertExistingCustomerOwned(params: {
  admin: ReturnType<typeof createAdminClient>;
  customerId: string;
  accountOwnerUserId: string;
}) {
  const { admin, customerId, accountOwnerUserId } = params;

  const { data, error } = await admin
    .from("customers")
    .select("id, owner_user_id, first_name, last_name, email, phone")
    .eq("id", customerId)
    .maybeSingle();

  if (error) throw error;

  const owner = normalizeText((data as any)?.owner_user_id);
  if (!data?.id || owner !== accountOwnerUserId) {
    throw new Error("Customer not in account scope");
  }

  return {
    id: String((data as any).id),
    first_name: (data as any).first_name ?? null,
    last_name: (data as any).last_name ?? null,
    email: (data as any).email ?? null,
    phone: (data as any).phone ?? null,
  };
}

async function assertExistingLocationOwned(params: {
  admin: ReturnType<typeof createAdminClient>;
  locationId: string;
  customerId: string;
  accountOwnerUserId: string;
}) {
  const { admin, locationId, customerId, accountOwnerUserId } = params;

  const { data, error } = await admin
    .from("locations")
    .select("id, owner_user_id, customer_id, address_line1, city, state")
    .eq("id", locationId)
    .maybeSingle();

  if (error) throw error;

  const owner = normalizeText((data as any)?.owner_user_id);
  const locCustomerId = normalizeText((data as any)?.customer_id);
  if (!data?.id || owner !== accountOwnerUserId || locCustomerId !== customerId) {
    throw new Error("Location not in account scope or does not match customer");
  }

  return {
    id: String((data as any).id),
    address_line1: (data as any).address_line1 ?? null,
    city: (data as any).city ?? null,
    state: (data as any).state ?? null,
  };
}

async function createLocationForCustomer(params: {
  admin: ReturnType<typeof createAdminClient>;
  customerId: string;
  accountOwnerUserId: string;
  nickname: string | null;
  address_line1: string;
  city: string;
  state: string | null;
  zip: string;
}) {
  const { admin, customerId, accountOwnerUserId, nickname, address_line1, city, state, zip } = params;

  const { data, error } = await admin
    .from("locations")
    .insert({
      customer_id: customerId,
      owner_user_id: accountOwnerUserId,
      nickname: nickname || null,
      address_line1,
      city,
      state,
      zip,
      postal_code: zip,
    })
    .select("id, address_line1, city, state")
    .single();

  if (error) throw error;

  return {
    id: String((data as any).id),
    address_line1: (data as any).address_line1 ?? null,
    city: (data as any).city ?? null,
    state: (data as any).state ?? null,
  };
}

async function createCustomerInScope(params: {
  admin: ReturnType<typeof createAdminClient>;
  accountOwnerUserId: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}) {
  const { admin, accountOwnerUserId, first_name, last_name, email, phone } = params;

  const full_name = [normalizeText(first_name), normalizeText(last_name)].filter(Boolean).join(" ") || null;

  const { data, error } = await admin
    .from("customers")
    .insert({
      owner_user_id: accountOwnerUserId,
      first_name,
      last_name,
      full_name,
      email,
      phone,
    })
    .select("id, first_name, last_name, email, phone")
    .single();

  if (error) throw error;

  return {
    id: String((data as any).id),
    first_name: (data as any).first_name ?? null,
    last_name: (data as any).last_name ?? null,
    email: (data as any).email ?? null,
    phone: (data as any).phone ?? null,
  };
}

export async function finalizeContractorIntakeSubmissionFromForm(formData: FormData) {
  const { admin, userId, accountOwnerUserId, submission } = await requireScopedPendingAdjudication(formData);
  const modeRaw = normalizeText(formData.get("finalization_mode")).toLowerCase();
  const reviewNote = normalizeText(formData.get("review_note")) || null;
  const selectedAssignedInternalUserId =
    normalizeText(formData.get("assigned_internal_user_id")) ||
    normalizeText(formData.get("assignee_user_id")) ||
    null;

  if (!["existing_existing", "existing_new", "new_new"].includes(modeRaw)) {
    throw new Error("Invalid finalization mode");
  }

  const mode = modeRaw as FinalizationMode;

  let customer:
    | { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null }
    | null = null;
  let location:
    | { id: string; address_line1: string | null; city: string | null; state: string | null }
    | null = null;

  if (mode === "existing_existing") {
    const existingCustomerId = normalizeText(formData.get("existing_customer_id"));
    const existingLocationId = normalizeText(formData.get("existing_location_id"));

    if (!isUuid(existingCustomerId) || !isUuid(existingLocationId)) {
      throw new Error("Existing customer and location are required");
    }

    customer = await assertExistingCustomerOwned({
      admin,
      customerId: existingCustomerId,
      accountOwnerUserId,
    });

    location = await assertExistingLocationOwned({
      admin,
      locationId: existingLocationId,
      customerId: customer.id,
      accountOwnerUserId,
    });
  }

  if (mode === "existing_new") {
    const existingCustomerId = normalizeText(formData.get("existing_customer_id"));
    const newAddressLine1 = normalizeText(formData.get("new_address_line1"));
    const newCity = normalizeText(formData.get("new_city"));
    const newState = normalizeText(formData.get("new_state")) || "CA";
    const newZip = normalizeText(formData.get("new_zip"));
    const newNickname = normalizeText(formData.get("new_location_nickname")) || null;

    if (!isUuid(existingCustomerId)) {
      throw new Error("Existing customer is required");
    }

    if (!newAddressLine1 || !newCity || !newZip) {
      throw new Error("New location address, city, and zip are required");
    }

    customer = await assertExistingCustomerOwned({
      admin,
      customerId: existingCustomerId,
      accountOwnerUserId,
    });

    location = await createLocationForCustomer({
      admin,
      customerId: customer.id,
      accountOwnerUserId,
      nickname: newNickname,
      address_line1: newAddressLine1,
      city: newCity,
      state: newState,
      zip: newZip,
    });
  }

  if (mode === "new_new") {
    const firstName = normalizeText(formData.get("new_customer_first_name")) || normalizeText(submission.proposed_customer_first_name);
    const lastName = normalizeText(formData.get("new_customer_last_name")) || normalizeText(submission.proposed_customer_last_name);
    const email = normalizeText(formData.get("new_customer_email")) || normalizeText(submission.proposed_customer_email);
    const phone = normalizeText(formData.get("new_customer_phone")) || normalizeText(submission.proposed_customer_phone);

    const addressLine1 = normalizeText(formData.get("new_address_line1")) || normalizeText(submission.proposed_address_line1);
    const city = normalizeText(formData.get("new_city")) || normalizeText(submission.proposed_city);
    const state =
      normalizeText(formData.get("new_state")) ||
      normalizeText(submission.proposed_state) ||
      "CA";
    const zip = normalizeText(formData.get("new_zip")) || normalizeText(submission.proposed_zip);
    const nickname = normalizeText(formData.get("new_location_nickname")) || normalizeText(submission.proposed_location_nickname) || null;

    if (!addressLine1 || !city || !zip) {
      throw new Error("New location address, city, and zip are required");
    }

    customer = await createCustomerInScope({
      admin,
      accountOwnerUserId,
      first_name: firstName || null,
      last_name: lastName || null,
      email: email || null,
      phone: phone || null,
    });

    location = await createLocationForCustomer({
      admin,
      customerId: customer.id,
      accountOwnerUserId,
      nickname,
      address_line1: addressLine1,
      city,
      state,
      zip,
    });
  }

  if (!customer?.id || !location?.id) {
    throw new Error("Could not resolve final customer/location");
  }

  const jobType = resolveJobType(submission.proposed_job_type);
  const jobCity = normalizeText(location.city) || normalizeText(submission.proposed_city);

  if (!jobCity) {
    throw new Error("Resolved location city is required for job creation");
  }

  const created = await createJob(
    {
      job_type: jobType,
      project_type: resolveProjectType(submission.proposed_project_type),
      title: resolveFinalizedContractorIntakeTitle({
        proposedProjectType: submission.proposed_project_type,
        proposedTitle: submission.proposed_title,
        jobType,
      }),
      city: jobCity,
      job_address: normalizeText(location.address_line1) || normalizeText(submission.proposed_address_line1) || null,
      scheduled_date: null,
      status: "open",
      contractor_id: submission.contractor_id,
      customer_id: customer.id,
      location_id: location.id,
      customer_first_name: customer.first_name,
      customer_last_name: customer.last_name,
      customer_email: customer.email,
      customer_phone: customer.phone,
      job_notes: submission.proposed_job_notes,
      permit_number: normalizeText(submission.proposed_permit_number) || null,
      jurisdiction: normalizeText(submission.proposed_jurisdiction) || null,
      permit_date: normalizeText(submission.proposed_permit_date) || null,
      ops_status: "need_to_schedule",
      billing_recipient: "contractor",
    },
    {
      serviceCaseWriteClient: admin,
    },
  );

  const hasValidSelectedAssignee =
    !!selectedAssignedInternalUserId && isUuid(selectedAssignedInternalUserId);

  if (hasValidSelectedAssignee) {
    try {
      const assignmentResult = await ensureActiveAssignmentAndNotify({
        supabase: admin,
        jobId: created.id,
        userId: selectedAssignedInternalUserId,
        actorUserId: userId,
        accountOwnerUserId,
      });

      console.info("[contractor-intake] finalization assignment diagnostics", {
        marker: "proposal_finalization_assignment_path",
        submission_id: submission.id,
        job_id: created.id,
        account_owner_user_id: accountOwnerUserId,
        actor_user_id: userId,
        selected_assigned_user_id: selectedAssignedInternalUserId,
        selected_assigned_user_id_present: true,
        selected_assigned_user_id_valid: true,
        assignment_notification_hook_bypassed: false,
        assignment_created: assignmentResult.assignmentCreated,
        notification_created: assignmentResult.notificationCreated,
      });
    } catch (assignmentPathError) {
      const safeError = getSafeErrorDetails(assignmentPathError);
      console.error("[contractor-intake] finalization assignment diagnostics failed", {
        marker: "proposal_finalization_assignment_path",
        submission_id: submission.id,
        job_id: created.id,
        account_owner_user_id: accountOwnerUserId,
        actor_user_id: userId,
        selected_assigned_user_id: selectedAssignedInternalUserId,
        selected_assigned_user_id_present: true,
        selected_assigned_user_id_valid: true,
        assignment_notification_hook_bypassed: false,
        error_code: safeError.error_code,
        error_message: safeError.error_message,
      });
    }
  } else {
    console.info("[contractor-intake] finalization assignment diagnostics", {
      marker: "proposal_finalization_assignment_path",
      submission_id: submission.id,
      job_id: created.id,
      account_owner_user_id: accountOwnerUserId,
      actor_user_id: userId,
      selected_assigned_user_id: selectedAssignedInternalUserId,
      selected_assigned_user_id_present: !!selectedAssignedInternalUserId,
      selected_assigned_user_id_valid: false,
      assignment_notification_hook_bypassed: true,
    });
  }

  const reviewedAtIso = new Date().toISOString();

  const { error: proposalUpdateErr } = await admin
    .from("contractor_intake_submissions")
    .update({
      review_status: "finalized",
      review_note: reviewNote,
      reviewed_by_user_id: userId,
      reviewed_at: reviewedAtIso,
      finalized_job_id: created.id,
      finalized_customer_id: customer.id,
      finalized_location_id: location.id,
      updated_at: reviewedAtIso,
    })
    .eq("id", submission.id)
    .eq("review_status", "pending");

  if (proposalUpdateErr) throw proposalUpdateErr;

  try {
    await promoteApprovedIntakeContactCandidates({
      admin,
      accountOwnerUserId,
      submissionId: submission.id,
      finalizedCustomerId: customer.id,
      finalizedJobId: created.id,
      reviewerUserId: userId,
    });
  } catch (promotionError) {
    console.error("[contractor-intake] approved candidate promotion failed", {
      submissionId: submission.id,
      jobId: created.id,
      accountOwnerUserId,
      error: getSafeErrorDetails(promotionError),
    });
    // V1: preserve successful finalization even if promotion encounters errors.
  }

  try {
    await markInternalNewWorkNotificationsResolved({
      supabase: admin,
      accountOwnerUserId,
      contractorIntakeSubmissionId: submission.id,
      jobId: created.id,
      readAtIso: reviewedAtIso,
    });
  } catch (notificationResolutionError) {
    console.error("[contractor-intake] Failed to resolve finalized new-work notifications", {
      submissionId: submission.id,
      jobId: created.id,
      accountOwnerUserId,
      error: notificationResolutionError,
    });
  }

  await admin.from("job_events").insert({
    job_id: created.id,
    event_type: "contractor_intake_finalized",
    user_id: userId,
    meta: {
      contractor_intake_submission_id: submission.id,
      finalization_mode: mode,
    },
  });

  await appendFinalizationNarrativeEvents({
    admin,
    jobId: created.id,
    submission,
    reviewNote,
    reviewerUserId: userId,
  });

  revalidatePath("/ops");
  revalidatePath("/ops/admin/contractor-intake-submissions");
  revalidatePath(`/ops/admin/contractor-intake-submissions/${submission.id}`);
  revalidatePath(`/jobs/${created.id}`);
  revalidatePath("/portal");
  revalidatePath("/portal/jobs");
  revalidatePath(`/portal/intake-submissions/${submission.id}`);

  redirect(`/jobs/${created.id}?banner=contractor_intake_finalized`);
}

export async function rejectContractorIntakeSubmissionFromForm(formData: FormData) {
  const submissionId = normalizeText(formData.get("submission_id"));
  if (!isUuid(submissionId)) throw new Error("Invalid submission_id");

  let scoped:
    | {
        userId: string;
        admin: ReturnType<typeof createAdminClient>;
        accountOwnerUserId: string;
        submissionId: string;
        submission: IntakeSubmissionRow;
      }
    | null = null;

  try {
    scoped = await requireScopedPendingAdjudication(formData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // Reject should be idempotent from the detail page and never hard-crash
    // when a pending proposal has already been adjudicated.
    if (message === "Intake submission is no longer pending") {
      redirect(`/ops/admin/contractor-intake-submissions/${submissionId}?notice=already_reviewed`);
    }

    throw error;
  }

  const { userId, admin, accountOwnerUserId, submission } = scoped;
  const reviewNote = normalizeText(formData.get("review_note")) || null;

  const reviewedAtIso = new Date().toISOString();
  const { error } = await admin
    .from("contractor_intake_submissions")
    .update({
      review_status: "rejected",
      review_note: reviewNote,
      reviewed_by_user_id: userId,
      reviewed_at: reviewedAtIso,
      updated_at: reviewedAtIso,
    })
    .eq("id", submission.id)
    .eq("review_status", "pending");

  if (error) throw error;

  try {
    await markInternalNewWorkNotificationsResolved({
      supabase: admin,
      accountOwnerUserId,
      contractorIntakeSubmissionId: submission.id,
      readAtIso: reviewedAtIso,
    });
  } catch (notificationResolutionError) {
    console.error("[contractor-intake] Failed to resolve rejected proposal notifications", {
      submissionId: submission.id,
      accountOwnerUserId,
      error: notificationResolutionError,
    });
  }

  revalidatePath("/ops");
  revalidatePath("/ops/admin/contractor-intake-submissions");
  revalidatePath(`/ops/admin/contractor-intake-submissions/${submission.id}`);
  revalidatePath("/portal");
  revalidatePath("/portal/jobs");
  revalidatePath(`/portal/intake-submissions/${submission.id}`);

  redirect(`/ops/admin/contractor-intake-submissions/${submission.id}?notice=rejected`);
}

export async function markContractorIntakeSubmissionAsDuplicateFromForm(formData: FormData) {
  const { userId, admin, accountOwnerUserId, submissionId } = await requireScopedPendingAdjudication(formData);
  const duplicateJobId = normalizeText(formData.get("duplicate_job_id"));
  const reviewNote = normalizeText(formData.get("review_note")) || null;

  if (!isUuid(duplicateJobId)) throw new Error("Invalid duplicate_job_id");

  // Verify the referenced job is in this account's scope
  const { data: jobRow, error: jobErr } = await admin
    .from("jobs")
    .select("id, customer_id")
    .eq("id", duplicateJobId)
    .maybeSingle();

  if (jobErr) throw jobErr;
  if (!jobRow?.id) throw new Error("Referenced job not found");

  const { data: custRow } = await admin
    .from("customers")
    .select("id")
    .eq("id", normalizeText(jobRow.customer_id))
    .eq("owner_user_id", accountOwnerUserId)
    .maybeSingle();

  if (!custRow?.id) throw new Error("Referenced job is not in account scope");

  const reviewedAtIso = new Date().toISOString();
  const { error } = await admin
    .from("contractor_intake_submissions")
    .update({
      review_status: "rejected",
      review_note: reviewNote || `duplicate_of_job:${duplicateJobId}`,
      reviewed_by_user_id: userId,
      reviewed_at: reviewedAtIso,
      duplicate_of_job_id: duplicateJobId,
      updated_at: reviewedAtIso,
    })
    .eq("id", submissionId)
    .eq("review_status", "pending");

  if (error) throw error;

  try {
    await markInternalNewWorkNotificationsResolved({
      supabase: admin,
      accountOwnerUserId,
      contractorIntakeSubmissionId: submissionId,
      readAtIso: reviewedAtIso,
    });
  } catch (notificationResolutionError) {
    console.error("[contractor-intake] Failed to resolve duplicate proposal notifications", {
      submissionId,
      duplicateJobId,
      accountOwnerUserId,
      error: notificationResolutionError,
    });
  }

  revalidatePath("/ops");
  revalidatePath("/ops/admin/contractor-intake-submissions");
  revalidatePath(`/ops/admin/contractor-intake-submissions/${submissionId}`);
  revalidatePath("/portal");
  revalidatePath("/portal/jobs");
  revalidatePath(`/portal/intake-submissions/${submissionId}`);

  redirect(`/ops/admin/contractor-intake-submissions/${submissionId}?notice=duplicate`);
}
