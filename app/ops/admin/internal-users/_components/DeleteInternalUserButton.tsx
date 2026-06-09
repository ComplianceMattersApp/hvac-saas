"use client";

import { deleteInternalUserFromForm } from "@/lib/actions/internal-user-actions";
import { useState } from "react";

type DeleteInternalUserButtonProps = {
  userId: string;
  displayName: string;
};

export default function DeleteInternalUserButton({
  userId,
  displayName,
}: DeleteInternalUserButtonProps) {
  const [submitted, setSubmitted] = useState(false);

  return (
    <form
      action={deleteInternalUserFromForm}
      onSubmit={(event) => {
        if (submitted) {
          event.preventDefault();
          return;
        }

        if (!window.confirm(`Are you sure you want to permanently delete ${displayName}? This cannot be undone.`)) {
          event.preventDefault();
          return;
        }

        setSubmitted(true);
      }}
    >
      <input type="hidden" name="user_id" value={userId} />
      <button
        type="submit"
        disabled={submitted}
        aria-busy={submitted}
        aria-live="polite"
        className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitted ? "Removing..." : "Remove Team Member"}
      </button>
    </form>
  );
}
