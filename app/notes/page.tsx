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
  const pinnedCount = rows.filter((note) => note.is_pinned).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 text-slate-950 sm:p-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_14px_34px_-28px_rgba(15,23,42,0.28)] sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div>
            <div className="text-xs font-semibold text-slate-500">Internal scratchpad</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950 sm:text-3xl">Notes</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Keep quick reminders, call context, and loose operational follow-up in one quiet place.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-2xl font-semibold text-slate-950">{rows.length}</div>
                <div className="mt-0.5 text-xs font-semibold text-slate-500">Total notes</div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
                <div className="text-2xl font-semibold">{pinnedCount}</div>
                <div className="mt-0.5 text-xs font-semibold">Pinned</div>
              </div>
            </div>
          </div>

          <form action={createInternalNote} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label htmlFor="note-body" className="mb-2 block text-xs font-semibold text-slate-600">
              Add note
            </label>
            <textarea
              id="note-body"
              name="body"
              rows={5}
              placeholder="Write the reminder, call note, or operational follow-up..."
              required
              className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
            <div className="mt-3 flex justify-end">
              <button
                type="submit"
                className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-slate-800 active:translate-y-[0.5px]"
              >
                Save Note
              </button>
            </div>
          </form>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center">
          <div className="text-base font-semibold text-slate-800">No notes yet</div>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">
            Add a note when there is something worth keeping visible outside a job or customer record.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_14px_34px_-30px_rgba(15,23,42,0.24)]">
          <ul className="divide-y divide-slate-200">
            {rows.map((note) => (
              <li
                key={note.id}
                className={`p-4 sm:p-5 ${
                  note.is_pinned ? "bg-amber-50/75" : "bg-white"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {note.is_pinned ? (
                        <span className="inline-flex min-h-7 items-center rounded-lg border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800">
                          Pinned
                        </span>
                      ) : null}
                      <span className="text-xs font-medium text-slate-500">
                        {formatNoteDate(note.created_at)}
                      </span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
                      {note.body}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <form action={togglePinInternalNote}>
                      <input type="hidden" name="note_id" value={note.id} />
                      <input
                        type="hidden"
                        name="is_pinned"
                        value={note.is_pinned ? "1" : "0"}
                      />
                      <button
                        type="submit"
                        className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        {note.is_pinned ? "Unpin" : "Pin"}
                      </button>
                    </form>
                    <form action={deleteInternalNote}>
                      <input type="hidden" name="note_id" value={note.id} />
                      <button
                        type="submit"
                        className="inline-flex min-h-9 items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
