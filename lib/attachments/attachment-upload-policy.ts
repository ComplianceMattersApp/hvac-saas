/**
 * Single source of truth for what may be uploaded into the `attachments`
 * bucket through the job attachment surfaces (internal job workspace and the
 * contractor portal).
 *
 * The upload flow hands the browser a service-role signed upload URL, which
 * bypasses storage RLS by design. That makes this module the only server-side
 * gate on content type and size for those surfaces, so validation lives here
 * rather than in the calling action.
 */

export const JOB_ATTACHMENT_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const JOB_ATTACHMENT_MAX_PER_JOB = 200;
export const JOB_ATTACHMENT_MAX_FILE_NAME_LENGTH = 140;

/**
 * Allowed content types mapped to the extensions that may legitimately carry
 * them. Both halves are checked so a file cannot claim `image/jpeg` while
 * landing in storage as `payload.html`, and cannot claim `text/html` while
 * wearing a `.jpg` extension.
 *
 * SVG is deliberately absent: it is an active-content format, and job
 * attachments are served from signed storage URLs that render in the browser.
 */
const JOB_ATTACHMENT_ALLOWED_TYPES = new Map<string, readonly string[]>([
  // Photos — the dominant case (phone camera, equipment labels, evidence).
  ["image/jpeg", ["jpg", "jpeg"]],
  ["image/png", ["png"]],
  ["image/webp", ["webp"]],
  ["image/gif", ["gif"]],
  ["image/heic", ["heic"]],
  ["image/heif", ["heif"]],
  // Paperwork attached to jobs.
  ["application/pdf", ["pdf"]],
  ["text/plain", ["txt"]],
  ["text/csv", ["csv"]],
  ["application/msword", ["doc"]],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ["docx"],
  ],
  ["application/vnd.ms-excel", ["xls"]],
  [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ["xlsx"],
  ],
]);

export const JOB_ATTACHMENT_ACCEPT_ATTRIBUTE = Array.from(
  new Set([
    ...JOB_ATTACHMENT_ALLOWED_TYPES.keys(),
    ...Array.from(JOB_ATTACHMENT_ALLOWED_TYPES.values()).flatMap((extensions) =>
      extensions.map((extension) => `.${extension}`),
    ),
  ]),
).join(",");

export function normalizeAttachmentContentType(value: unknown) {
  // Browsers may send parameters (`image/jpeg; charset=binary`); keep the essence.
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .split(";")[0]
    .trim();
}

export function parseAttachmentFileExtension(fileName: string) {
  const normalized = String(fileName ?? "").trim().toLowerCase();
  const lastDot = normalized.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === normalized.length - 1) return "";
  return normalized.slice(lastDot + 1);
}

/**
 * Strip anything that could escape the intended key prefix or confuse storage,
 * then bound the length so the object key stays well inside S3's 1024-byte cap
 * once the `job/<jobId>/<uuid>-` prefix is prepended.
 */
export function safeAttachmentFileName(raw: string) {
  const cleaned = String(raw ?? "")
    .trim()
    .replace(/[^\w.\- ()]/g, "_")
    .replace(/^\.+/, "")
    .trim();

  if (!cleaned) return "attachment";

  if (cleaned.length <= JOB_ATTACHMENT_MAX_FILE_NAME_LENGTH) return cleaned;

  const extension = parseAttachmentFileExtension(cleaned);
  if (!extension) return cleaned.slice(0, JOB_ATTACHMENT_MAX_FILE_NAME_LENGTH);

  const suffix = `.${extension}`;
  const stem = cleaned
    .slice(0, cleaned.length - suffix.length)
    .slice(0, Math.max(1, JOB_ATTACHMENT_MAX_FILE_NAME_LENGTH - suffix.length));

  return `${stem}${suffix}`;
}

export function isAllowedJobAttachmentContentType(value: unknown) {
  return JOB_ATTACHMENT_ALLOWED_TYPES.has(normalizeAttachmentContentType(value));
}

const CONTENT_TYPE_BY_EXTENSION = new Map<string, string>(
  Array.from(JOB_ATTACHMENT_ALLOWED_TYPES.entries()).flatMap(([contentType, extensions]) =>
    extensions.map((extension) => [extension, contentType] as [string, string]),
  ),
);

/**
 * Browsers do not always know a file's type — HEIC/HEIF picked from the Files
 * app and some Android pickers report an empty string or
 * `application/octet-stream`. Fall back to the extension in those cases so a
 * legitimate photo is not rejected for a gap in the browser's MIME table.
 */
export function inferAttachmentContentType(input: {
  fileName: string;
  declaredContentType?: unknown;
}) {
  const declared = normalizeAttachmentContentType(input.declaredContentType);

  if (declared && declared !== "application/octet-stream") return declared;

  return CONTENT_TYPE_BY_EXTENSION.get(parseAttachmentFileExtension(input.fileName)) ?? declared;
}

/**
 * Split a picked file list into what may be uploaded and human-readable
 * reasons for anything that may not. Applied in the browser so the user sees
 * the problem at pick time; the server re-checks the same policy regardless.
 */
export function partitionJobAttachmentFiles(files: File[]) {
  const accepted: File[] = [];
  const rejected: string[] = [];

  for (const file of files) {
    const fileName = safeAttachmentFileName(file.name);
    const message = validateJobAttachmentMetadata({
      fileName,
      contentType: inferAttachmentContentType({
        fileName,
        declaredContentType: file.type,
      }),
      fileSize: file.size,
    });

    if (message) rejected.push(`${file.name}: ${message}`);
    else accepted.push(file);
  }

  return { accepted, rejected };
}

/**
 * Returns a user-facing message when the upload must be rejected, or `null`
 * when the metadata is acceptable.
 */
export function validateJobAttachmentMetadata(input: {
  fileName: string;
  contentType: unknown;
  fileSize: unknown;
}) {
  const fileName = String(input.fileName ?? "").trim();
  const contentType = normalizeAttachmentContentType(input.contentType);
  const fileSize = Number(input.fileSize);

  if (!fileName) return "File name is required.";

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return "File is empty or invalid.";
  }

  if (fileSize > JOB_ATTACHMENT_MAX_FILE_SIZE_BYTES) {
    return `File exceeds the ${Math.floor(
      JOB_ATTACHMENT_MAX_FILE_SIZE_BYTES / (1024 * 1024),
    )}MB size limit.`;
  }

  const allowedExtensions = JOB_ATTACHMENT_ALLOWED_TYPES.get(contentType);
  if (!allowedExtensions) {
    return "That file type is not supported. Upload a photo, PDF, or Office document.";
  }

  const extension = parseAttachmentFileExtension(fileName);
  if (!allowedExtensions.includes(extension)) {
    return "The file extension does not match the file type.";
  }

  return null;
}
