"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import ActionFeedback from "@/components/ui/ActionFeedback";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  CONTRACTOR_PERMIT_REQUEST_ATTACHMENT_MAX_COUNT,
  CONTRACTOR_PERMIT_REQUEST_ATTACHMENT_MAX_FILE_SIZE_BYTES,
} from "@/lib/permits/contractor-permit-request-upload-limits";
import {
  createContractorPermitRequestUploadToken,
  finalizeContractorPermitRequest,
  type ContractorPermitRequestUploadDraft,
} from "@/lib/actions/permit-request-actions";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const allowedExtensions = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);

function fileExtension(fileName: string) {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? String(parts.at(-1) ?? "") : "";
}

function validateFile(file: File) {
  if (file.size <= 0) return "File is empty or invalid.";
  if (file.size > CONTRACTOR_PERMIT_REQUEST_ATTACHMENT_MAX_FILE_SIZE_BYTES) {
    return `File exceeds the ${Math.floor(CONTRACTOR_PERMIT_REQUEST_ATTACHMENT_MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB size limit.`;
  }
  if (!allowedMimeTypes.has(file.type) || !allowedExtensions.has(fileExtension(file.name))) {
    return "Only JPG, PNG, WEBP, and PDF files are allowed.";
  }
  return null;
}

export default function ContractorPermitRequestUploadForm() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onPickFiles(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setSuccess(null);
    setFiles(Array.from(event.target.files ?? []));
  }

  function submitPermitRequest() {
    setError(null);
    setSuccess(null);

    if (files.length === 0) {
      setError("Select at least one file to upload.");
      return;
    }

    if (files.length > CONTRACTOR_PERMIT_REQUEST_ATTACHMENT_MAX_COUNT) {
      setError(`You can upload up to ${CONTRACTOR_PERMIT_REQUEST_ATTACHMENT_MAX_COUNT} files per permit request.`);
      return;
    }

    for (const file of files) {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    startTransition(() => {
      void (async () => {
        try {
          const uploads: ContractorPermitRequestUploadDraft[] = [];

          for (const file of files) {
            const token = await createContractorPermitRequestUploadToken({
              fileName: file.name,
              contentType: file.type,
              fileSize: file.size,
            });

            const { error: uploadErr } = await supabase.storage
              .from(token.bucket)
              .uploadToSignedUrl(token.path, token.token, file, {
                contentType: file.type,
                upsert: false,
              });

            if (uploadErr) {
              throw new Error("File upload failed. Please try again.");
            }

            uploads.push({
              attachmentId: token.attachmentId,
              path: token.path,
              fileName: token.fileName,
              contentType: token.contentType,
              fileSize: token.fileSize,
            });
          }

          await finalizeContractorPermitRequest({
            uploads,
            note,
          });

          setFiles([]);
          setNote("");
          if (fileInputRef.current) fileInputRef.current.value = "";
          setSuccess("Permit request submitted. Compliance Matters will review it.");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not submit permit request.");
        }
      })();
    });
  }

  return (
    <div className="space-y-4">
      <ActionFeedback type="warning" message={error} />
      <ActionFeedback type="success" message={success} />

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
          Contract, photo, or PDF
        </label>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
          onChange={onPickFiles}
          disabled={isPending}
          className="w-full rounded-xl border border-slate-300 bg-white p-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
        <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
          Max {CONTRACTOR_PERMIT_REQUEST_ATTACHMENT_MAX_COUNT} files, 10MB each. JPG, PNG, WEBP, or PDF.
        </p>
        {files.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            Selected: {files.map((file) => file.name).join(", ")}
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
          Note
        </label>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={4000}
          rows={4}
          placeholder="Optional note for Compliance Matters"
          disabled={isPending}
          className="w-full rounded-xl border border-slate-300/80 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>

      <button
        type="button"
        onClick={submitPermitRequest}
        disabled={isPending}
        className="inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_-18px_rgba(37,99,235,0.48)] transition-[background-color,box-shadow,transform] hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isPending ? "Submitting..." : "Submit Permit Request"}
      </button>
    </div>
  );
}
