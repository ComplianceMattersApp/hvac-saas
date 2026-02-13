import { createClient } from "@/lib/supabase/server";
import NewJobForm from "./NewJobForm";

export default async function NewJobPage() {
  const supabase = await createClient();

  const { data: contractors, error } = await supabase
    .from("contractors")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return <NewJobForm contractors={contractors ?? []} />;
}
