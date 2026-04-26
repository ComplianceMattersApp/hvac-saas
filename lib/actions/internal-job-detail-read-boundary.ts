import { createAdminClient } from "@/lib/supabase/server";
import {
  isInternalAccessError,
  requireInternalUser,
} from "@/lib/auth/internal-user";
import { loadScopedInternalJobForMutation } from "@/lib/auth/internal-job-scope";

type JobDetailActorResolution =
  | { kind: "internal"; internalUser: { account_owner_user_id: string; role: string } }
  | { kind: "contractor" }
  | { kind: "unauthorized" };

export async function resolveJobDetailActor(params: {
  supabase: any;
  userId: string;
}): Promise<JobDetailActorResolution> {
  try {
    const { internalUser } = await requireInternalUser({
      supabase: params.supabase,
      userId: params.userId,
    });
    return {
      kind: "internal",
      internalUser,
    };
  } catch (error) {
    if (!isInternalAccessError(error)) {
      throw error;
    }

    const { data: contractorUser, error: contractorError } = await params.supabase
      .from("contractor_users")
      .select("contractor_id")
      .eq("user_id", params.userId)
      .maybeSingle();

    if (contractorError) throw contractorError;
    if (contractorUser?.contractor_id) return { kind: "contractor" };
    return { kind: "unauthorized" };
  }
}

export async function loadScopedInternalJobDetailReadBoundary(params: {
  accountOwnerUserId: string;
  jobId: string;
  admin?: any;
}) {
  return loadScopedInternalJobForMutation({
    accountOwnerUserId: params.accountOwnerUserId,
    jobId: params.jobId,
    select: "id",
    admin: params.admin,
  });
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