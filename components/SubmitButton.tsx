"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

export default function SubmitButton({
  children,
  className,
  loadingText,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loadingText?: string;
}) {
  const { pending } = useFormStatus();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [attachmentUploadPending, setAttachmentUploadPending] = useState(false);
  const isDisabled = pending || attachmentUploadPending || !!disabled;

  useEffect(() => {
    const form = buttonRef.current?.closest("form");
    if (!form) return;
    const handleUploadState = (event: Event) => {
      setAttachmentUploadPending(Boolean((event as CustomEvent<{ pending?: boolean }>).detail?.pending));
    };
    form.addEventListener("attachment-upload-state", handleUploadState);
    return () => form.removeEventListener("attachment-upload-state", handleUploadState);
  }, []);

  return (
    <button
      type="submit"
      ref={buttonRef}
      disabled={isDisabled}
      className={`inline-flex min-h-11 items-center justify-center transition-colors ${className ?? ""} ${
        isDisabled ? "opacity-60 cursor-not-allowed" : "hover:brightness-95"
      }`}
      {...props}
    >
      {pending || attachmentUploadPending ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
          {attachmentUploadPending ? "Uploading attachments..." : loadingText ?? "Saving..."}
        </span>
      ) : children}
    </button>
  );
}
