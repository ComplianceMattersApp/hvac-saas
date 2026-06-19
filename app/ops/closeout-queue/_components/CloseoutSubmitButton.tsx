"use client";

import { useFormStatus } from "react-dom";

function Spinner() {
  return (
    <svg className="mr-1.5 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

export default function CloseoutSubmitButton({
  children,
  className,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  const isDisabled = pending || !!disabled;

  return (
    <button type="submit" disabled={isDisabled} className={className} {...props}>
      {pending ? <Spinner /> : null}
      {children}
    </button>
  );
}
