import { createAdminClient } from "@/lib/supabase/server";
import { loadScopedInternalJobForMutation } from "@/lib/auth/internal-job-scope";

type ScopedInternalAttachmentJobParams = {
  accountOwnerUserId: string;
  jobId: string;
  select?: string;
  admin?: any;
};

type ScopedInternalJobAttachmentParams = {
  accountOwnerUserId: string;
  jobId: string;
  attachmentId: string;
  jobSelect?: string;
  attachmentSelect?: string;
  admin?: any;
};

type ScopedInternalJobAttachmentsParams = {
  accountOwnerUserId: string;
  jobId: string;
  attachmentIds: string[];
  jobSelect?: string;
  attachmentSelect?: string;
  admin?: any;
};

function buildSelectClause(baseFields: string[], extraFields?: string) {
  const extra = String(extraFields ?? "").trim();
  return extra ? `${baseFields.join(", ")}, ${extra}` : baseFields.join(", ");
}

export async function loadScopedInternalAttachmentJobForMutation(
  params: ScopedInternalAttachmentJobParams,
) {
  return loadScopedInternalJobForMutation({
    accountOwnerUserId: params.accountOwnerUserId,
    jobId: params.jobId,
    select: params.select,
    admin: params.admin,
  });
}

export async function loadScopedInternalJobAttachmentForMutation(
  params: ScopedInternalJobAttachmentParams,
) {
  const context = await loadScopedInternalJobAttachmentsForMutation({
    accountOwnerUserId: params.accountOwnerUserId,
    jobId: params.jobId,
    attachmentIds: [params.attachmentId],
    jobSelect: params.jobSelect,
    attachmentSelect: params.attachmentSelect,
    admin: params.admin,
  });

  if (!context) return null;

  return {
    job: context.job,
    attachment: context.attachments[0] ?? null,
  };
}

export async function loadScopedInternalJobAttachmentsForMutation(
  params: ScopedInternalJobAttachmentsParams,
) {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  const jobId = String(params.jobId ?? "").trim();

  if (!accountOwnerUserId || !jobId) return null;

  const admin = params.admin ?? createAdminClient();
  const job = await loadScopedInternalAttachmentJobForMutation({
    accountOwnerUserId,
    jobId,
    select: params.jobSelect,
    admin,
  });

  if (!job) return null;

  const attachmentIds = Array.from(
    new Set(params.attachmentIds.map((value) => String(value ?? "").trim()).filter(Boolean)),
  );

  if (!attachmentIds.length) {
    return {
      job,
      attachments: [] as any[],
    };
  }

  const { data: attachments, error: attachmentsErr } = await admin
    .from("attachments")
    .select(
      buildSelectClause(
        ["id", "entity_type", "entity_id", "bucket", "storage_path", "file_name"],
        params.attachmentSelect,
      ),
    )
    .eq("entity_type", "job")
    .eq("entity_id", jobId)
    .in("id", attachmentIds);

  if (attachmentsErr) throw attachmentsErr;

  const rows = Array.isArray(attachments) ? attachments : [];
  if (rows.length !== attachmentIds.length) return null;

  const rowsById = new Map(
    rows.map((attachment) => [String((attachment as any)?.id ?? "").trim(), attachment]),
  );

  const orderedRows = attachmentIds.map((attachmentId) => rowsById.get(attachmentId)).filter(Boolean);
  if (orderedRows.length !== attachmentIds.length) return null;

  return {
    job,
    attachments: orderedRows,
  };
}