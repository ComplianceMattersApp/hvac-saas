import { redirect } from "next/navigation";
import { landingPathForDualContextAccess } from "@/lib/auth/dual-context-access";
import { getRequestDualContextAccess } from "@/lib/auth/request-identity";

export default async function HomePage() {
  // Shared, request-scoped resolution — a cache hit against the identity chain
  // the root layout already resolved for this request (dedupes getUser + the
  // full dual-context chain). Prior code passed getPortalAdmin: createAdminClient,
  // which getRequestDualContextAccess also does, so the outcome is identical.
  const access = await getRequestDualContextAccess();
  if (!access.user) redirect("/login");

  redirect(landingPathForDualContextAccess(access));
}
