export function resolveInviteRedirectTo(): string {
  const candidates = [
    String(process.env.APP_URL ?? "").trim(),
    String(process.env.NEXT_PUBLIC_APP_URL ?? "").trim(),
    String(process.env.SITE_URL ?? "").trim(),
    // VERCEL_URL is auto-set by Vercel to the deployment hostname (no protocol prefix).
    // This ensures invite redirect links are correct on Vercel deployments even when
    // APP_URL / NEXT_PUBLIC_APP_URL / SITE_URL are not explicitly configured.
    process.env.VERCEL_URL ? `https://${String(process.env.VERCEL_URL).trim()}` : "",
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

  // Development: safe to use localhost for testing
  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000/auth/callback";
  }

  // Production: use hardcoded known URL if env vars not set.
  // If you're in production and need a different URL, set NEXT_PUBLIC_APP_URL in environment.
  const productionFallback = "https://hvac-saas-xi.vercel.app";
  return `${productionFallback}/auth/callback`;
}
