import {
  normalizeAuthReturnPath,
  resolveSafeAuthReturnPath,
} from "@/lib/auth/auth-return-path";
import {
  landingPathForDualContextAccess,
  type DualContextAccess,
} from "@/lib/auth/dual-context-access";

export type PostLoginDestination =
  | { kind: "redirect"; path: string }
  | { kind: "no_access"; message: string };

export function resolvePostLoginDestination(params: {
  access: DualContextAccess;
  nextPath?: string | null;
}): PostLoginDestination {
  const { access, nextPath } = params;
  const destination = landingPathForDualContextAccess(access);

  if (destination === "/login") {
    return {
      kind: "no_access",
      message: "This account is not configured for portal or internal access.",
    };
  }

  const normalizedNext = normalizeAuthReturnPath(nextPath);

  if (access.hasActiveAppAccess) {
    if (access.hasPortalAccess && normalizedNext?.startsWith("/portal")) {
      return { kind: "redirect", path: normalizedNext };
    }

    return {
      kind: "redirect",
      path: resolveSafeAuthReturnPath({
        actorKind: "internal",
        candidateNext: nextPath,
        fallbackPath: "/today",
      }),
    };
  }

  if (access.hasPortalAccess) {
    return {
      kind: "redirect",
      path: resolveSafeAuthReturnPath({
        actorKind: "contractor",
        candidateNext: nextPath,
        fallbackPath: "/portal",
      }),
    };
  }

  return { kind: "redirect", path: destination };
}
