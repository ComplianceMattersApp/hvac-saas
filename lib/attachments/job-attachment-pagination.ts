/**
 * Paging rules for the job attachment library.
 *
 * The library previously read with a bare `.limit(500)`, which is a cliff
 * rather than a limit: a job past that many attachments silently stops showing
 * the oldest ones, with nothing in the UI to say so. Paging makes the boundary
 * explicit and keeps the first paint cheap -- every row on a page costs a
 * signed URL and, for photos, a full-resolution download.
 */

/**
 * Rows per page. Housecall Pro defaults its attachment view to 25; 24 divides
 * evenly into the 1-, 2-, 3- and 4-column grids this list renders at, so a page
 * never ends in a ragged row.
 */
export const JOB_ATTACHMENT_PAGE_SIZE = 24;

/** Hard ceiling on a single request, so a crafted offset cannot ask for the table. */
export const JOB_ATTACHMENT_MAX_PAGE_SIZE = 100;

export type AttachmentPageRange = {
  offset: number;
  limit: number;
  /** Inclusive upper bound, as PostgREST's `.range()` expects. */
  to: number;
};

/**
 * Clamp a caller-supplied offset and limit into a range that is always safe to
 * hand to PostgREST. Both arrive from the client on "load more", so neither can
 * be trusted to be a sane non-negative integer.
 */
export function resolveAttachmentPageRange(input: {
  offset?: unknown;
  limit?: unknown;
}): AttachmentPageRange {
  const rawOffset = Number(input.offset);
  const offset =
    Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;

  const rawLimit = Number(input.limit);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), JOB_ATTACHMENT_MAX_PAGE_SIZE)
      : JOB_ATTACHMENT_PAGE_SIZE;

  return { offset, limit, to: offset + limit - 1 };
}
