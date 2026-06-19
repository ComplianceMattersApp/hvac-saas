"use client";

import { useFormStatus } from "react-dom";

function MilestoneStatusSpinner() {
  return (
    <svg className="mr-1.5 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

export default function MilestoneStatusSaveButton({ className }: { className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? <MilestoneStatusSpinner /> : null}
      Save
    </button>
  );
}
