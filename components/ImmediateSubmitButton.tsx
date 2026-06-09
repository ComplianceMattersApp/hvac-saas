"use client";

import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

type ImmediateSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  pendingText?: string;
};

export default function ImmediateSubmitButton({
  children,
  className,
  pendingText = "Working...",
  disabled,
  onClick,
  ...props
}: ImmediateSubmitButtonProps) {
  const { pending } = useFormStatus();
  const [submitted, setSubmitted] = useState(false);
  const isPending = pending || submitted;
  const isDisabled = isPending || Boolean(disabled);

  useEffect(() => {
    if (!submitted || pending) return;

    const timeout = window.setTimeout(() => {
      setSubmitted(false);
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, [pending, submitted]);

  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-busy={isPending}
      aria-live="polite"
      className={`${className ?? ""} ${isDisabled ? "cursor-not-allowed opacity-60" : ""}`.trim()}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || disabled || submitted) return;

        const form = event.currentTarget.form;
        if (form && !form.checkValidity()) return;

        setSubmitted(true);
      }}
      {...props}
    >
      {isPending ? (
        <span className="inline-flex items-center justify-center gap-2">
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
          <span>{pendingText}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
