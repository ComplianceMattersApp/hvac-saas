"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { isPlatformOwnerActor } from "@/lib/business/platform-owner-access";
import {
  addSupportCaseNoteRecord,
  createSupportCaseRecord,
  loadSupportCaseById,
  parseSupportCaseNoteType,
  parseSupportCasePriority,
  parseSupportCaseSource,
  parseSupportCaseStatus,
  updateSupportCaseStateRecord,
} from "@/lib/business/support-cases";
import { createAdminClient, createClient } from "@/lib/supabase/server";

function cleanFormText(value: FormDataEntryValue | null, maxLength = 4000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function cleanOptionalUuid(value: FormDataEntryValue | null) {
  const cleaned = cleanFormText(value, 80);
  return cleaned || null;
}

async function requirePlatformOwnerActorOrFailClosed() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) redirect("/login");

  const allowed = isPlatformOwnerActor({
    userId: user.id,
    email: user.email,
    env: process.env,
  });

  if (!allowed) notFound();
  return user;
}

function revalidateSupportCaseViews(accountOwnerUserId: string, supportCaseId?: string | null) {
  revalidatePath("/ops/owner-console");
  revalidatePath(`/ops/owner-console/${encodeURIComponent(accountOwnerUserId)}`);
  revalidatePath(`/ops/owner-console/${encodeURIComponent(accountOwnerUserId)}/support-cases`);
  revalidatePath("/ops/owner-console/support-cases");
  if (supportCaseId) {
    revalidatePath(`/ops/owner-console/support-cases/${encodeURIComponent(supportCaseId)}`);
  }
}

export async function createSupportCaseFromAccountSnapshot(formData: FormData) {
  const user = await requirePlatformOwnerActorOrFailClosed();
  const accountOwnerUserId = cleanFormText(formData.get("account_owner_user_id"), 80);
  const title = cleanFormText(formData.get("title"), 200);
  const issueSummary = cleanFormText(formData.get("issue_summary"), 4000);
  const priority = parseSupportCasePriority(formData.get("priority"));
  const source = parseSupportCaseSource(formData.get("source"));
  const relatedCustomerId = cleanOptionalUuid(formData.get("related_customer_id"));

  if (!accountOwnerUserId) throw new Error("SUPPORT_CASE_ACCOUNT_REQUIRED");

  const admin = createAdminClient();
  const supportCase = await createSupportCaseRecord({
    supabase: admin,
    accountOwnerUserId,
    actorUserId: user.id,
    title,
    issueSummary,
    priority,
    source,
    relatedCustomerId,
  });

  revalidateSupportCaseViews(accountOwnerUserId, supportCase.id);
  redirect(`/ops/owner-console/support-cases/${encodeURIComponent(supportCase.id)}`);
}

export async function addSupportCaseNoteFromDetail(formData: FormData) {
  const user = await requirePlatformOwnerActorOrFailClosed();
  const supportCaseId = cleanFormText(formData.get("support_case_id"), 80);
  const body = cleanFormText(formData.get("body"), 4000);
  const noteType = parseSupportCaseNoteType(formData.get("note_type"));

  if (!supportCaseId) throw new Error("SUPPORT_CASE_ID_REQUIRED");

  const admin = createAdminClient();
  const supportCase = await loadSupportCaseById({ supabase: admin, supportCaseId });
  if (!supportCase) notFound();

  await addSupportCaseNoteRecord({
    supabase: admin,
    supportCaseId,
    actorUserId: user.id,
    body,
    noteType,
  });

  revalidateSupportCaseViews(supportCase.accountOwnerUserId, supportCase.id);
  redirect(`/ops/owner-console/support-cases/${encodeURIComponent(supportCase.id)}`);
}

export async function updateSupportCaseStateFromDetail(formData: FormData) {
  await requirePlatformOwnerActorOrFailClosed();
  const supportCaseId = cleanFormText(formData.get("support_case_id"), 80);
  const status = parseSupportCaseStatus(formData.get("status"));
  const priority = parseSupportCasePriority(formData.get("priority"));
  const resolutionSummary = cleanFormText(formData.get("resolution_summary"), 4000) || null;

  if (!supportCaseId) throw new Error("SUPPORT_CASE_ID_REQUIRED");

  const admin = createAdminClient();
  const existing = await loadSupportCaseById({ supabase: admin, supportCaseId });
  if (!existing) notFound();

  const supportCase = await updateSupportCaseStateRecord({
    supabase: admin,
    supportCaseId,
    status,
    priority,
    resolutionSummary,
  });

  revalidateSupportCaseViews(supportCase.accountOwnerUserId, supportCase.id);
  redirect(`/ops/owner-console/support-cases/${encodeURIComponent(supportCase.id)}`);
}
