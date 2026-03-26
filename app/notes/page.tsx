// app/notes/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  requireInternalUser,
  isInternalAccessError,
} from "@/lib/auth/internal-user";
import {
  createInternalNote,
  togglePinInternalNote,
  deleteInternalNote,
} from "@/lib/actions/notes-actions";

export const metadata = { title: "Notes" };

type NoteRow = {
  id: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
};

function formatNoteDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default async function NotesPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;

  if (!user) redirect("/login");

  try {
    await requireInternalUser({ supabase, userId: user.id });
  } catch (error) {
    if (isInternalAccessError(error)) redirect("/login");
    throw error;
  }

  const { data: notes, error: notesErr } = await supabase
    .from("internal_notes")
    .select("id, body, is_pinned, created_at")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (notesErr) throw new Error(notesErr.message);

  const rows = (notes ?? []) as NoteRow[];

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Notes</h1>
        <p className="text-sm text-gray-500 mt-1">
          Internal scratchpad — call notes, reminders, loose operational items.
        </p>
      </div>

      {/* Create form */}
      <form action={createInternalNote} className="space-y-2">
        <textarea
          name="body"
          rows={3}
          placeholder="Add a note…"
          required
          className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
        />
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Save Note
        </button>
      </form>

      {/* Notes list */}
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((note) => (
            <li
              key={note.id}
              className={`rounded-lg border p-4 space-y-2 ${
                note.is_pinned ? "border-amber-300 bg-amber-50" : "bg-white"
              }`}
            >
              <p className="text-sm whitespace-pre-wrap break-words">{note.body}</p>
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-xs text-gray-400">
                  {formatNoteDate(note.created_at)}
                  {note.is_pinned && (
                    <span className="ml-2 font-medium text-amber-600">Pinned</span>
                  )}
                </span>
                <div className="flex gap-2">
                  {/* Pin / unpin */}
                  <form action={togglePinInternalNote}>
                    <input type="hidden" name="note_id" value={note.id} />
                    <input
                      type="hidden"
                      name="is_pinned"
                      value={note.is_pinned ? "1" : "0"}
                    />
                    <button
                      type="submit"
                      className="text-xs text-gray-500 hover:text-amber-600 underline"
                    >
                      {note.is_pinned ? "Unpin" : "Pin"}
                    </button>
                  </form>
                  {/* Delete */}
                  <form action={deleteInternalNote}>
                    <input type="hidden" name="note_id" value={note.id} />
                    <button
                      type="submit"
                      className="text-xs text-red-500 hover:text-red-700 underline"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
