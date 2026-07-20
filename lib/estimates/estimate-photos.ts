import { createAdminClient } from "@/lib/supabase/server";

export const ESTIMATE_PHOTO_MAX_BYTES = 12 * 1024 * 1024;
export const ESTIMATE_PHOTO_MAX_COUNT = 12;
export const ESTIMATE_PHOTO_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export type EstimatePhoto = {
  id: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  caption: string | null;
  customerVisible: boolean;
  signedUrl: string;
};

export async function listEstimatePhotos(params: {
  estimateId: string;
  accountOwnerUserId: string;
  customerVisibleOnly?: boolean;
  admin?: ReturnType<typeof createAdminClient>;
}): Promise<EstimatePhoto[]> {
  const admin = params.admin ?? createAdminClient();
  let query = admin
    .from("estimate_photos")
    .select("id, bucket, storage_path, file_name, content_type, file_size, caption, customer_visible")
    .eq("estimate_id", params.estimateId)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (params.customerVisibleOnly) query = query.eq("customer_visible", true);
  const { data, error } = await query;
  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }

  const photos = await Promise.all((data ?? []).map(async (row) => {
    const bucket = String(row.bucket ?? "attachments");
    const path = String(row.storage_path ?? "");
    const { data: signed } = await admin.storage.from(bucket).createSignedUrl(path, 60 * 60);
    if (!signed?.signedUrl) return null;
    return {
      id: String(row.id),
      fileName: String(row.file_name),
      contentType: String(row.content_type),
      fileSize: Number(row.file_size),
      caption: row.caption ? String(row.caption) : null,
      customerVisible: Boolean(row.customer_visible),
      signedUrl: signed.signedUrl,
    } satisfies EstimatePhoto;
  }));

  return photos.filter((photo): photo is EstimatePhoto => photo !== null);
}
