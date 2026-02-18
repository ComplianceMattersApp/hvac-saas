import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function ContractorsPage() {
  const supabase = await createClient();

  const { data: contractors, error } = await supabase
    .from("contractors")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-xl font-semibold">Contractors</h1>
        <div className="rounded-md border bg-white p-4 text-sm text-red-600">
          Failed to load contractors: {error.message}
        </div>
        <Link href="/ops" className="text-sm underline">
          Back to Ops
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Contractors</h1>
          <p className="text-sm text-gray-600">Manage contractor accounts (Phase 1: basics).</p>
        </div>

        <Link
          href="/contractors/new"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-900"
        >
          + New Contractor
        </Link>
      </div>

      <div className="rounded-lg border bg-white">
        {(!contractors || contractors.length === 0) ? (
          <div className="p-4 text-sm text-gray-600">
            No contractors yet. Create your first one.
          </div>
        ) : (
          <ul className="divide-y">
            {contractors.map((c) => (
              <li key={c.id} className="p-4 flex items-center justify-between">
                <div className="font-medium text-gray-900">{c.name}</div>
                <div className="text-xs text-gray-500">{c.id}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <Link href="/ops" className="text-sm underline">
          ← Back to Ops
        </Link>
      </div>
    </div>
  );
}
