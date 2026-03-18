export function resolveInviteRedirectTo(): string {
  const candidates = [
    String(process.env.APP_URL ?? "").trim(),
    String(process.env.NEXT_PUBLIC_APP_URL ?? "").trim(),
    String(process.env.SITE_URL ?? "").trim(),
  ].filter(Boolean);

  for (const raw of candidates) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        continue;
      }
      return `${raw.replace(/\/$/, "")}/auth/callback`;
    } catch {
      // Ignore invalid URL values and continue scanning candidates.
    }
  }

  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000/auth/callback";
  }

  throw new Error("MISSING_INVITE_REDIRECT_URL");
}
