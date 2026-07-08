import { createAdminClient } from "@/lib/supabase/server";
import { resolveDualContextAccess } from "@/lib/auth/dual-context-access";
import type { InternalUserRow } from "@/lib/auth/internal-user";
import { loadScopedInternalJobForMutation } from "@/lib/auth/internal-job-scope";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type NormalizedQueryError = {
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
};

export type ScopedInternalJobDetailReadBoundaryOutcome =
  | { status: "ok"; job: { id?: string | null } }
  | { status: "invalid_job_id" }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "query_error"; error: NormalizedQueryError };

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function normalizeQueryError(error: unknown): NormalizedQueryError {
  if (error instanceof Error) {
    return {
      message: error.message || "Scoped job boundary query failed.",
      code: null,
      details: null,
      hint: null,
    };
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message =
      typeof record.message === "string" && record.message.trim().length > 0
        ? record.message.trim()
        : "Scoped job boundary query failed.";
    const code = typeof record.code === "string" ? record.code : null;
    const details = typeof record.details === "string" ? record.details : null;
    const hint = typeof record.hint === "string" ? record.hint : null;

    return { message, code, details, hint };
  }

  return {
    message: String(error ?? "Scoped job boundary query failed."),
    code: null,
    details: null,
    hint: null,
  };
}

type JobDetailActorResolution =
  | { kind: "internal"; internalUser: InternalUserRow }
  | { kind: "contractor" }
  | { kind: "unauthorized" };

export async function resolveJobDetailActor(params: {
  supabase: any;
  userId: string;
}): Promise<JobDetailActorResolution> {
  const access = await resolveDualContextAccess({
    supabase: params.supabase,
    user: { id: params.userId },
  });

  if (access.hasActiveAppAccess && access.internalUser) {
    return {
      kind: "internal",
      internalUser: {
        user_id: access.internalUser.userId,
        role: access.internalUser.role,
        is_active: access.internalUser.isActive,
        account_owner_user_id: access.internalUser.accountOwnerUserId,
        created_by: access.internalUser.createdBy,
      },
    };
  }

  if (access.hasPortalAccess) return { kind: "contractor" };
  return { kind: "unauthorized" };
}

export async function loadScopedInternalJobDetailReadBoundary(params: {
  accountOwnerUserId: string;
  jobId: string;
  admin?: any;
}) {
  const outcome = await loadScopedInternalJobDetailReadBoundaryOutcome(params);

  if (outcome.status === "ok") {
    return outcome.job;
  }

  if (outcome.status === "query_error") {
    const normalized = outcome.error;
    const scopedError = new Error(normalized.message);
    (scopedError as any).code = normalized.code;
    (scopedError as any).details = normalized.details;
    (scopedError as any).hint = normalized.hint;
    throw scopedError;
  }

  return null;
}

export async function loadScopedInternalJobDetailReadBoundaryOutcome(params: {
  accountOwnerUserId: string;
  jobId: string;
  admin?: any;
}): Promise<ScopedInternalJobDetailReadBoundaryOutcome> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  const jobId = String(params.jobId ?? "").trim();
  const admin = params.admin ?? createAdminClient();

  if (!accountOwnerUserId) {
    return { status: "forbidden" };
  }

  if (!jobId || !isUuid(jobId)) {
    return { status: "invalid_job_id" };
  }

  try {
    const scopedJob = await loadScopedInternalJobForMutation({
      accountOwnerUserId,
      jobId,
      select: "id",
      admin,
    });

    if (scopedJob?.id) {
      return { status: "ok", job: scopedJob };
    }

    const { data: jobRow, error: jobRowError } = await admin
      .from("jobs")
      .select("id, customer_id")
      .eq("id", jobId)
      .is("deleted_at", null)
      .maybeSingle();

    if (jobRowError) {
      return {
        status: "query_error",
        error: normalizeQueryError(jobRowError),
      };
    }

    if (!jobRow?.id) {
      return { status: "not_found" };
    }

    const customerId = String((jobRow as any)?.customer_id ?? "").trim();
    if (!customerId) {
      return {
        status: "query_error",
        error: {
          message: "Scoped job is missing customer_id.",
          code: "SCOPED_JOB_MISSING_CUSTOMER_ID",
          details: `job_id=${jobId}`,
          hint: "Backfill jobs.customer_id for internal same-account scoping.",
        },
      };
    }

    const { data: customerRow, error: customerRowError } = await admin
      .from("customers")
      .select("id, owner_user_id")
      .eq("id", customerId)
      .maybeSingle();

    if (customerRowError) {
      return {
        status: "query_error",
        error: normalizeQueryError(customerRowError),
      };
    }

    if (!customerRow?.id) {
      return {
        status: "query_error",
        error: {
          message: "Scoped job references a missing customer row.",
          code: "SCOPED_JOB_MISSING_CUSTOMER_ROW",
          details: `job_id=${jobId} customer_id=${customerId}`,
          hint: "Repair customer linkage for the scoped job.",
        },
      };
    }

    const ownerUserId = String((customerRow as any)?.owner_user_id ?? "").trim();
    if (!ownerUserId || ownerUserId !== accountOwnerUserId) {
      return { status: "forbidden" };
    }

    return { status: "ok", job: { id: String(jobRow.id) } };
  } catch (error) {
    return {
      status: "query_error",
      error: normalizeQueryError(error),
    };
  }
}

export async function signScopedInternalJobDetailAttachments(params: {
  accountOwnerUserId: string;
  jobId: string;
  attachmentRows: any[];
  admin?: any;
}) {
  const scopedJob = await loadScopedInternalJobForMutation({
    accountOwnerUserId: params.accountOwnerUserId,
    jobId: params.jobId,
    select: "id",
    admin: params.admin,
  });

  if (!scopedJob?.id) {
    return { authorized: false as const, items: [] as any[] };
  }

  const attachmentAdmin = params.admin ?? createAdminClient();

  const items = await Promise.all(
    (params.attachmentRows ?? []).map(async (attachment: any) => {
      const bucket = String(attachment?.bucket ?? "").trim();
      const storagePath = String(attachment?.storage_path ?? "")
        .trim()
        .replace(/^\/+/, "");
      const contentType =
        typeof attachment?.content_type === "string" &&
        attachment.content_type.trim().length > 0
          ? attachment.content_type.trim()
          : null;

      let signedUrl: string | null = null;

      if (!bucket || !storagePath) {
        console.warn("Job attachment row missing bucket/storage_path", {
          jobId: params.jobId,
          attachmentId: String(attachment?.id ?? "").trim() || null,
          bucket: bucket || null,
          storagePath: storagePath || null,
          contentType,
        });
      } else {
        const { data, error: signErr } = await attachmentAdmin.storage
          .from(bucket)
          .createSignedUrl(storagePath, 60 * 60);

        if (signErr || !data?.signedUrl) {
          console.warn("Job attachment signing failed", {
            jobId: params.jobId,
            attachmentId: String(attachment?.id ?? "").trim() || null,
            bucket,
            storagePath,
            contentType,
            error: signErr?.message ?? "missing_signed_url",
          });
        } else {
          signedUrl = data.signedUrl;
        }
      }

      return {
        ...attachment,
        bucket,
        storage_path: storagePath,
        content_type: contentType,
        signedUrl,
      };
    }),
  );

  return {
    authorized: true as const,
    items,
  };
}

export async function listScopedContractorsForJobDetail(params: {
  supabase: any;
  accountOwnerUserId?: string | null;
  includeArchived?: boolean;
}) {
  const scopedOwnerUserId = String(params.accountOwnerUserId ?? "").trim();

  let query = params.supabase
    .from("contractors")
    .select("id, name, phone, email");

  if (scopedOwnerUserId) {
    query = query.eq("owner_user_id", scopedOwnerUserId);
  }

  if (!params.includeArchived) {
    query = query.eq("lifecycle_state", "active");
  }

  const { data, error } = await query.order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
