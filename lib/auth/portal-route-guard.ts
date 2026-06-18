import {
  landingPathForDualContextAccess,
  type DualContextAccess,
} from "@/lib/auth/dual-context-access";

export type PortalAccessFallbackPath = "/portal" | "/today" | "/access-inactive" | "/login";

export function portalAccessFallbackPathForAccess(access: DualContextAccess): PortalAccessFallbackPath {
  if (access.hasPortalAccess) return "/portal";
  if (access.hasActiveAppAccess) return "/today";
  return landingPathForDualContextAccess(access) as PortalAccessFallbackPath;
}
