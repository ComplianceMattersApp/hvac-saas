import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContractorForm } from "@/app/contractors/_components/ContractorForm";
import { updateContractorFromForm } from "@/lib/actions/contractor-actions";

export default async function EditContractorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const supabase = await createClient();   // ✅ must come before using supabase

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (!user || userErr) redirect("/login");

  const { data: contractor, error } = await supabase
  .from("contractors")
  .select(
    "id, name, phone, email, notes, billing_name, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip"
  )
  .eq("id", id)
  .maybeSingle();

  if (error || !contractor) redirect("/contractors");

  return (
    <div className="space-y-4">
      {sp?.saved === "1" && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-900 shadow">
          Saved ✅
        </div>
      )}

      <ContractorForm
        mode="edit"
        contractor={contractor}
        action={updateContractorFromForm}
      />
    </div>
  );
}