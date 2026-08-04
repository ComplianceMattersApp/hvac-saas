import { after } from "next/server";

// Defers best-effort work until after the response has streamed (Next `after`),
// keeping it off the user-felt critical path of a Server Action. Outside a
// request scope (e.g. unit tests calling actions directly), `after` throws —
// fall back to running the task inline so call sites keep their original
// awaited semantics.
export async function runAfterResponse(task: () => Promise<void>): Promise<void> {
  try {
    after(task);
  } catch {
    await task();
  }
}
