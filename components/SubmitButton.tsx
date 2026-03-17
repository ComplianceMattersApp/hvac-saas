"use client";

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
  const isDisabled = pending || !!disabled;

  return (
    <button
      type="submit"
      disabled={isDisabled}
      className={`inline-flex min-h-11 items-center justify-center transition-colors ${className ?? ""} ${
        isDisabled ? "opacity-60 cursor-not-allowed" : "hover:brightness-95"
      }`}
      {...props}
    >
      {pending ? loadingText ?? "Saving..." : children}
    </button>
  );
}