"use client";

import { type ButtonHTMLAttributes, type ReactNode } from "react";
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
  const isPending = pending;
  const isDisabled = isPending || Boolean(disabled);

  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-busy={isPending}
      aria-live="polite"
      className={`${className ?? ""} ${isDisabled ? "cursor-not-allowed opacity-60" : ""}`.trim()}
      onClick={(event) => {
        onClick?.(event);
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
