import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default function NewContractorPage() {
  async function createContractor(formData: FormData) {
    "use server";

    const name = String(formData.get("name") ?? "").trim();

    if (!name) {
      // Minimal validation
      throw new Error("Contractor name is required.");
    }

    const supabase = await createClient();

    const { error } = await supabase.from("contractors").insert({ name });

    if (error) {
      throw new Error(error.message);
    }

    redirect("/contractors");
  }

  return (
    <div className="p-6 max-w-lg space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">New Contractor</h1>
        <p className="text-sm text-gray-600">Phase 1: contractor name only (email/phone later).</p>
      </div>

      <form action={createContractor} className="rounded-lg border bg-white p-4 space-y-3">
        <div className="space-y-1">
          <label className="text-sm">Contractor Name *</label>
          <input
            name="name"
            className="w-full rounded-md border px-3 py-2"
            placeholder="Coaches HVAC"
            required
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-900"
          >
            Create Contractor
          </button>

          <Link
            href="/contractors"
            className="rounded-md border bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>

      <Link href="/ops" className="text-sm underline">
        ← Back to Ops
      </Link>
    </div>
  );
}
