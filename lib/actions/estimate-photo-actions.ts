"use server";

import { revalidatePath } from "next/cache";
import { requireInternalUser } from "@/lib/auth/internal-user";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  ESTIMATE_PHOTO_ALLOWED_TYPES,
  ESTIMATE_PHOTO_MAX_BYTES,
  ESTIMATE_PHOTO_MAX_COUNT,
} from "@/lib/estimates/estimate-photos";

function cleanFileName(value: string) {
  return value.replace(/[^\w.\- ()]/g, "_").slice(0, 140) || "estimate-photo.jpg";
}

function cleanCaption(value: unknown) {
  const caption = String(value ?? "").trim().replace(/\s+/g, " ");
  return caption ? caption.slice(0, 160) : null;
}

async function requireScopedEstimate(estimateId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not authenticated");
  const { internalUser } = await requireInternalUser({ supabase, userId: auth.user.id });
  const admin = createAdminClient();
  const { data: estimate, error } = await admin
    .from("estimates")
    .select("id, account_owner_user_id, status")
    .eq("id", estimateId)
    .eq("account_owner_user_id", internalUser.account_owner_user_id)
    .maybeSingle();
  if (error) throw error;
  if (!estimate?.id) throw new Error("Estimate not found");
  if (String(estimate.status ?? "").toLowerCase() !== "draft") {
    throw new Error("Photos can only be changed while the estimate is a draft.");
  }
  return { admin, userId: auth.user.id, accountOwnerUserId: internalUser.account_owner_user_id };
}

function revalidateEstimatePhotos(estimateId: string) {
  revalidatePath(`/estimates/${estimateId}`);
  revalidatePath(`/estimates/${estimateId}/print`);
  revalidatePath("/proposals/[token]", "page");
}

export async function createEstimatePhotoUploadToken(input: {
  estimateId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  caption?: string;
  customerVisible?: boolean;
}) {
  const estimateId = String(input.estimateId ?? "").trim();
  const contentType = String(input.contentType ?? "").trim().toLowerCase();
  const fileSize = Number(input.fileSize);
  if (!estimateId) throw new Error("Missing estimate");
  if (!ESTIMATE_PHOTO_ALLOWED_TYPES.has(contentType)) throw new Error("Use a JPG, PNG, WebP, HEIC, or HEIF photo.");
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > ESTIMATE_PHOTO_MAX_BYTES) throw new Error("Each photo must be 12 MB or smaller.");

  const { admin, userId, accountOwnerUserId } = await requireScopedEstimate(estimateId);
  const { count, error: countError } = await admin
    .from("estimate_photos")
    .select("id", { count: "exact", head: true })
    .eq("estimate_id", estimateId)
    .eq("account_owner_user_id", accountOwnerUserId);
  if (countError) throw countError;
  if (Number(count ?? 0) >= ESTIMATE_PHOTO_MAX_COUNT) throw new Error(`An estimate can have up to ${ESTIMATE_PHOTO_MAX_COUNT} photos.`);

  const id = crypto.randomUUID();
  const fileName = cleanFileName(input.fileName);
  const storagePath = `estimate/${accountOwnerUserId}/${estimateId}/${id}-${fileName}`;
  const { error: insertError } = await admin.from("estimate_photos").insert({
    id,
    estimate_id: estimateId,
    account_owner_user_id: accountOwnerUserId,
    bucket: "attachments",
    storage_path: storagePath,
    file_name: fileName,
    content_type: contentType,
    file_size: fileSize,
    caption: cleanCaption(input.caption),
    customer_visible: input.customerVisible !== false,
    sort_order: Number(count ?? 0) + 1,
    created_by_user_id: userId,
  });
  if (insertError) throw insertError;

  const { data, error } = await admin.storage.from("attachments").createSignedUploadUrl(storagePath);
  if (error || !data) {
    await admin.from("estimate_photos").delete().eq("id", id);
    throw error ?? new Error("Could not prepare photo upload");
  }
  return { photoId: id, bucket: "attachments", path: storagePath, token: data.token };
}

export async function discardEstimatePhotoUpload(input: { estimateId: string; photoId: string }) {
  const estimateId = String(input.estimateId ?? "").trim();
  const photoId = String(input.photoId ?? "").trim();
  const { admin, accountOwnerUserId } = await requireScopedEstimate(estimateId);
  const { data: photo } = await admin.from("estimate_photos").select("bucket, storage_path").eq("id", photoId).eq("estimate_id", estimateId).eq("account_owner_user_id", accountOwnerUserId).maybeSingle();
  if (!photo) return;
  await admin.storage.from(String(photo.bucket)).remove([String(photo.storage_path)]);
  await admin.from("estimate_photos").delete().eq("id", photoId).eq("estimate_id", estimateId);
  revalidateEstimatePhotos(estimateId);
}

export async function updateEstimatePhoto(input: { estimateId: string; photoId: string; caption?: string; customerVisible: boolean }) {
  const estimateId = String(input.estimateId ?? "").trim();
  const photoId = String(input.photoId ?? "").trim();
  const { admin, accountOwnerUserId } = await requireScopedEstimate(estimateId);
  const { error } = await admin.from("estimate_photos").update({ caption: cleanCaption(input.caption), customer_visible: Boolean(input.customerVisible) }).eq("id", photoId).eq("estimate_id", estimateId).eq("account_owner_user_id", accountOwnerUserId);
  if (error) throw error;
  revalidateEstimatePhotos(estimateId);
}

export async function finalizeEstimatePhotoUpload(input: { estimateId: string }) {
  await requireScopedEstimate(String(input.estimateId ?? "").trim());
  revalidateEstimatePhotos(String(input.estimateId ?? "").trim());
}
