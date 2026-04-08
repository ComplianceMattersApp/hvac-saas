"use client";

import { deleteInternalUserFromForm } from "@/lib/actions/internal-user-actions";

type DeleteInternalUserButtonProps = {
  userId: string;
  displayName: string;
};

export default function DeleteInternalUserButton({
  userId,
  displayName,
}: DeleteInternalUserButtonProps) {
  return (
    <form
      action={deleteInternalUserFromForm}
      onSubmit={(event) => {
        if (!window.confirm(`Are you sure you want to permanently delete ${displayName}? This cannot be undone.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="user_id" value={userId} />
      <button
        type="submit"
        className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
      >
        Delete
      </button>
    </form>
  );
}