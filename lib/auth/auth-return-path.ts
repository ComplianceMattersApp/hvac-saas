export type AuthReturnActorKind = "contractor" | "internal";

function isPortalPath(pathname: string) {
  return pathname === "/portal" || pathname.startsWith("/portal/") || pathname.startsWith("/portal?");
}

function isAuthRoutePath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login?") ||
    pathname === "/signup" ||
    pathname.startsWith("/signup?") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/set-password")
  );
}

export function normalizeAuthReturnPath(candidateNext: string | null | undefined): string | null {
  const raw = String(candidateNext ?? "").trim();
  if (!raw) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }

  // Local absolute paths only.
  if (!decoded.startsWith("/")) return null;
  if (decoded.startsWith("//")) return null;

  // Reject ambiguous or potentially unsafe values.
  if (decoded.includes("\\")) return null;
  if (/[\u0000-\u001F\u007F-\u009F]/.test(decoded)) return null;

  if (isAuthRoutePath(decoded)) return null;

  return decoded;
}

export function resolveSafeAuthReturnPath(params: {
  actorKind: AuthReturnActorKind;
  candidateNext: string | null | undefined;
  fallbackPath: "/portal" | "/ops";
}): string {
  const normalized = normalizeAuthReturnPath(params.candidateNext);
  if (!normalized) return params.fallbackPath;

  if (params.actorKind === "contractor") {
    return isPortalPath(normalized) ? normalized : params.fallbackPath;
  }

  // Internal users should not be routed into contractor portal paths.
  return isPortalPath(normalized) ? params.fallbackPath : normalized;
}
