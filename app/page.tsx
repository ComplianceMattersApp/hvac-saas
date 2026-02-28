import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  const { data: cu } = await supabase
    .from("contractor_users")
    .select("contractor_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (cu?.contractor_id) redirect("/portal");

  redirect("/ops");
}