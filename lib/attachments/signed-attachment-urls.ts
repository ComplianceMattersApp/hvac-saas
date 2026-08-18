/**
 * Batched signed-URL generation for attachment rows.
 *
 * Every attachment surface used to sign one row at a time, so rendering a job
 * with 200 photos meant 200 separate Storage round-trips per request. Supabase
 * exposes a bulk `createSignedUrls(paths, expiresIn)` endpoint; this module is
 * the shared wrapper around it so the read paths converge on one implementation
 * (and one TTL) instead of each re-deriving the same loop.
 */

/** Long enough to cover a page view plus in-page navigation, short enough that a leaked URL ages out. */
export const ATTACHMENT_SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Portal-facing surfaces sign for a shorter window; contractors see a narrower slice of the data. */
export const PORTAL_ATTACHMENT_SIGNED_URL_TTL_SECONDS = 60 * 10;

export type SignableAttachmentRow = {
  id?: unknown;
  bucket?: unknown;
  storage_path?: unknown;
  content_type?: unknown;
};

export type SignedAttachmentRow<TRow> = TRow & {
  bucket: string;
  storage_path: string;
  content_type: string | null;
  signedUrl: string | null;
};

function normalizeStoragePath(value: unknown) {
  return String(value ?? "").trim().replace(/^\/+/, "");
}

function normalizeContentType(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

type SignedUrlResult = { path?: string | null; signedUrl?: string | null; error?: unknown };

/**
 * Structural shape of whatever Supabase client is doing the signing. Both the
 * RLS-scoped SSR client and the service-role admin client satisfy it, which is
 * deliberate: portal surfaces sign with the caller's own client so storage RLS
 * still applies.
 */
export type AttachmentSigningClient = {
  storage: {
    from(bucket: string): {
      createSignedUrls(
        paths: string[],
        expiresIn: number,
      ): Promise<{ data: SignedUrlResult[] | null; error: unknown }>;
    };
  };
};

/**
 * Resolve signed URLs for `paths` within a single bucket using one bulk call.
 * Returns a path -> signed URL map; paths that could not be signed are absent.
 */
async function signBucketPaths(params: {
  client: AttachmentSigningClient;
  bucket: string;
  paths: string[];
  expiresInSeconds: number;
  onFailure?: (input: { bucket: string; storagePath: string; error: string }) => void;
}) {
  const signedUrlByPath = new Map<string, string>();
  if (!params.paths.length) return signedUrlByPath;

  const { data, error } = await params.client.storage
    .from(params.bucket)
    .createSignedUrls(params.paths, params.expiresInSeconds);

  if (error || !Array.isArray(data)) {
    const message =
      error instanceof Error
        ? error.message
        : String((error as { message?: unknown } | null)?.message ?? "bulk_sign_failed");
    for (const storagePath of params.paths) {
      params.onFailure?.({ bucket: params.bucket, storagePath, error: message });
    }
    return signedUrlByPath;
  }

  // Supabase returns one entry per requested path, in request order. Prefer the
  // echoed path when present so we stay correct if that ever stops holding.
  data.forEach((entry: SignedUrlResult, index: number) => {
    const storagePath = normalizeStoragePath(entry?.path) || params.paths[index];
    const signedUrl = String(entry?.signedUrl ?? "").trim();

    if (!storagePath) return;

    if (entry?.error || !signedUrl) {
      params.onFailure?.({
        bucket: params.bucket,
        storagePath,
        error: String(entry?.error ?? "missing_signed_url"),
      });
      return;
    }

    signedUrlByPath.set(storagePath, signedUrl);
  });

  return signedUrlByPath;
}

/**
 * Attach a `signedUrl` to each row, preserving input order and every other
 * field. Rows missing a bucket or storage path keep a `null` signed URL rather
 * than failing the whole page — a broken row should not blank the library.
 */
export async function signAttachmentRows<TRow extends SignableAttachmentRow>(params: {
  client: AttachmentSigningClient;
  rows: TRow[] | null | undefined;
  expiresInSeconds?: number;
  onFailure?: (input: {
    attachmentId: string | null;
    bucket: string | null;
    storagePath: string | null;
    error: string;
  }) => void;
}): Promise<SignedAttachmentRow<TRow>[]> {
  const rows = Array.isArray(params.rows) ? params.rows : [];
  if (!rows.length) return [];

  const expiresInSeconds = params.expiresInSeconds ?? ATTACHMENT_SIGNED_URL_TTL_SECONDS;

  const normalized = rows.map((row) => ({
    row,
    bucket: String(row?.bucket ?? "").trim(),
    storagePath: normalizeStoragePath(row?.storage_path),
    contentType: normalizeContentType(row?.content_type),
    attachmentId: String(row?.id ?? "").trim() || null,
  }));

  const pathsByBucket = new Map<string, Set<string>>();

  for (const entry of normalized) {
    if (!entry.bucket || !entry.storagePath) {
      params.onFailure?.({
        attachmentId: entry.attachmentId,
        bucket: entry.bucket || null,
        storagePath: entry.storagePath || null,
        error: "missing_bucket_or_storage_path",
      });
      continue;
    }

    if (!pathsByBucket.has(entry.bucket)) pathsByBucket.set(entry.bucket, new Set());
    pathsByBucket.get(entry.bucket)?.add(entry.storagePath);
  }

  const signedByBucket = new Map<string, Map<string, string>>();

  // One bulk request per bucket; buckets run concurrently.
  await Promise.all(
    Array.from(pathsByBucket.entries()).map(async ([bucket, paths]) => {
      const signedUrlByPath = await signBucketPaths({
        client: params.client,
        bucket,
        paths: Array.from(paths),
        expiresInSeconds,
        onFailure: (failure) => {
          params.onFailure?.({
            attachmentId: null,
            bucket: failure.bucket,
            storagePath: failure.storagePath,
            error: failure.error,
          });
        },
      });

      signedByBucket.set(bucket, signedUrlByPath);
    }),
  );

  return normalized.map(({ row, bucket, storagePath, contentType }) => ({
    ...row,
    bucket,
    storage_path: storagePath,
    content_type: contentType,
    signedUrl: signedByBucket.get(bucket)?.get(storagePath) ?? null,
  })) as SignedAttachmentRow<TRow>[];
}
