"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  isInternalAccessError,
  requireInternalRole,
} from "@/lib/auth/internal-user";
import { createJob } from "@/lib/actions/job-actions";
import {
  normalizeContractorIntakeProjectType,
  resolveFinalizedContractorIntakeTitle,
} from "@/lib/utils/contractor-intake-title";

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

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

async function requireScopedPendingAdjudication(formData: FormData) {
  const { userId, admin, accountOwnerUserId } = await requireInternalReviewer();
  const submissionId = normalizeText(formData.get("submission_id"));

  if (!isUuid(submissionId)) throw new Error("Invalid submission_id");

  const submission = await loadScopedPendingSubmission({
    admin,
    submissionId,
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

  await admin.from("job_events").insert({
    job_id: created.id,
    event_type: "contractor_intake_finalized",
    user_id: userId,
    meta: {
      contractor_intake_submission_id: submission.id,
      finalization_mode: mode,
    },
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
  const { userId, admin, submission } = await requireScopedPendingAdjudication(formData);
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

  revalidatePath("/ops");
  revalidatePath("/ops/admin/contractor-intake-submissions");
  revalidatePath(`/ops/admin/contractor-intake-submissions/${submissionId}`);
  revalidatePath("/portal");
  revalidatePath("/portal/jobs");
  revalidatePath(`/portal/intake-submissions/${submissionId}`);

  redirect(`/ops/admin/contractor-intake-submissions/${submissionId}?notice=duplicate`);
}
