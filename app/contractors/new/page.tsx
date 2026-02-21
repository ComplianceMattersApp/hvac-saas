import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContractorForm } from "@/app/contractors/_components/ContractorForm";
import { createContractorFromForm } from "@/lib/actions/contractor-actions";

export default async function NewContractorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <ContractorForm mode="create" contractor={null} action={createContractorFromForm} />;
}