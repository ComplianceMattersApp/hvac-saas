"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

export default function SubmitButton({
  children,
  className,
  loadingText,
  disabled,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loadingText?: string;
}) {
  const { pending } = useFormStatus();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [attachmentUploadPending, setAttachmentUploadPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const isPending = pending || attachmentUploadPending || submitted;
  const isDisabled = isPending || !!disabled;

  useEffect(() => {
    const form = buttonRef.current?.closest("form");
    if (!form) return;
    const handleUploadState = (event: Event) => {
      setAttachmentUploadPending(Boolean((event as CustomEvent<{ pending?: boolean }>).detail?.pending));
    };
    form.addEventListener("attachment-upload-state", handleUploadState);
    return () => form.removeEventListener("attachment-upload-state", handleUploadState);
  }, []);

  useEffect(() => {
    if (!submitted) return;
    const timeout = window.setTimeout(() => setSubmitted(false), 30_000);
    return () => window.clearTimeout(timeout);
  }, [submitted]);

  return (
    <button
      type="submit"
      ref={buttonRef}
      disabled={isDisabled}
      aria-busy={isPending}
      aria-live="polite"
      className={`inline-flex min-h-11 items-center justify-center transition-colors ${className ?? ""} ${
        isDisabled ? "opacity-60 cursor-not-allowed" : "hover:brightness-95"
      }`}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || disabled || submitted) return;

        const button = event.currentTarget;
        const form = button.form;
        if (form && !button.formNoValidate && !form.checkValidity()) return;

        window.setTimeout(() => setSubmitted(true), 0);
      }}
      {...props}
    >
      {isPending ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
          {attachmentUploadPending ? "Uploading attachments..." : loadingText ?? "Saving..."}
        </span>
      ) : children}
    </button>
  );
}
