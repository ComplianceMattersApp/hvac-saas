import { redirect } from "next/navigation";
import {
  landingPathForDualContextAccess,
  resolveDualContextAccess,
} from "@/lib/auth/dual-context-access";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  const access = await resolveDualContextAccess({
    supabase,
    user: userData.user,
    getPortalAdmin: createAdminClient,
  });

  redirect(landingPathForDualContextAccess(access));
}
