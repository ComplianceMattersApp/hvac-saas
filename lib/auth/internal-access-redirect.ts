import {
  landingPathForDualContextAccess,
  resolveDualContextAccess,
} from "@/lib/auth/dual-context-access";

export async function resolveInternalAccessErrorRedirectPath(input: {
  supabase: any;
  user: any;
  fallbackPath: string;
}) {
  const access = await resolveDualContextAccess({
    supabase: input.supabase,
    user: input.user,
  });

  if (!access.hasActiveAppAccess) {
    return landingPathForDualContextAccess(access);
  }

  return input.fallbackPath;
}
