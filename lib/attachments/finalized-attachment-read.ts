type AttachmentReadResult = {
  error?: unknown;
  status?: number;
};

function errorText(error: unknown) {
  if (!error || typeof error !== "object") return String(error ?? "");

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };

  return [candidate.code, candidate.message, candidate.details, candidate.hint]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function shouldRetryFinalizedAttachmentRead(result: AttachmentReadResult) {
  if (!result.error) return false;

  const description = errorText(result.error);
  if (description.includes("finalized_at")) return true;
  if (description.includes("42703")) return true;

  // PostgREST currently returns this exact shape when production code reaches
  // a database that has not received the finalized_at migration yet.
  return result.status === 400 && description === "";
}

/**
 * Reads only finalized rows on the current schema, but remains compatible with
 * the pre-staging attachment schema while an additive migration rolls out.
 */
export async function readFinalizedAttachmentsWithLegacyFallback<
  TResult extends AttachmentReadResult,
>(read: (requireFinalized: boolean) => PromiseLike<TResult>): Promise<TResult> {
  const finalizedResult = await read(true);
  if (!shouldRetryFinalizedAttachmentRead(finalizedResult)) return finalizedResult;

  return read(false);
}
