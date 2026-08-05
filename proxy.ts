// proxy.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function classifyProxyRoute(pathname: string): "public_asset" | "webhook" | "cron" | "auth_route" | "protected_route" {
  if (isPublicAssetPath(pathname)) return "public_asset";
  if (isProviderWebhookRoute(pathname)) return "webhook";
  if (isCronRoute(pathname)) return "cron";
  if (isUnauthedPublicRoute(pathname)) return "auth_route";
  return "protected_route";
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const timingEnabled = process.env.PROXY_TIMING_DEBUG === "true";
  const requestStartMs = timingEnabled ? Date.now() : 0;
  const phaseDurationsMs: Record<string, number> = {};
  const routeClass = classifyProxyRoute(pathname);

  const setPhaseValue = (phaseName: string, durationMs: number) => {
    if (!timingEnabled) return;
    phaseDurationsMs[phaseName] = durationMs;
  };

  const emitTimingLog = (decision: "public_bypass" | "webhook_bypass" | "auth_route_bypass" | "pass_through" | "redirect_login") => {
    if (!timingEnabled) return;
    console.info(
      "[proxy-timing]",
      JSON.stringify({
        routeLabels: {
          pathname,
          routeClass,
          decision,
        },
        phasesMs: {
          publicBypassCheck: phaseDurationsMs.publicBypassCheck ?? 0,
          authLookup: phaseDurationsMs.authLookup ?? 0,
          redirectDecision: phaseDurationsMs.redirectDecision ?? 0,
          totalProxyTime: Date.now() - requestStartMs,
        },
      }),
    );
  };

  const publicBypassStartMs = timingEnabled ? Date.now() : 0;

  // Bypass auth for static assets so they never redirect through the auth gate.
  if (isPublicAssetPath(pathname)) {
    setPhaseValue("publicBypassCheck", Date.now() - publicBypassStartMs);
    emitTimingLog("public_bypass");
    return NextResponse.next();
  }
  setPhaseValue("publicBypassCheck", Date.now() - publicBypassStartMs);

  // Allow provider webhooks (Stripe, Twilio) to bypass auth — request signature
  // verification happens inside each route.
  if (isProviderWebhookRoute(pathname)) {
    emitTimingLog("webhook_bypass");
    return NextResponse.next();
  }

  // Vercel cron requests do not carry a Supabase browser session. Each cron
  // handler authenticates the machine request with CRON_SECRET instead.
  if (isCronRoute(pathname)) {
    emitTimingLog("public_bypass");
    return NextResponse.next();
  }

  // Allow login, signup, and auth routes without a session. These routes never
  // gate on auth, so skip the Supabase round-trip entirely instead of paying it
  // and ignoring the result.
  if (isUnauthedPublicRoute(pathname)) {
    emitTimingLog("auth_route_bypass");
    return NextResponse.next();
  }

  let res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const authLookupStartMs = timingEnabled ? Date.now() : 0;
  // getClaims() verifies the session JWT locally against the project's cached
  // JWKS instead of round-tripping to the Supabase Auth server on every
  // navigation the way getUser() does. It still refreshes an expired session
  // through the cookie adapter above, and each page/API handler re-verifies
  // identity server-side — this gate only decides the login redirect.
  const { data: claimsData } = await supabase.auth.getClaims();
  const hasSession = Boolean(claimsData?.claims?.sub);
  setPhaseValue("authLookup", Date.now() - authLookupStartMs);

  const redirectDecisionStartMs = timingEnabled ? Date.now() : 0;
  if (!hasSession) {
    setPhaseValue("redirectDecision", Date.now() - redirectDecisionStartMs);
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    emitTimingLog("redirect_login");
    return NextResponse.redirect(url);
  }
  setPhaseValue("redirectDecision", Date.now() - redirectDecisionStartMs);

  emitTimingLog("pass_through");

  return res;
}

export function isUnauthedPublicRoute(pathname: string) {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/set-password") ||
    pathname.startsWith("/proposals") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/payments/invoice/") ||
    pathname.startsWith("/payments/checkout-complete") ||
    // QBO OAuth callback verifies its own state/CSRF via the signed state cookie
    // and writes with the admin client — no user session gate needed.
    pathname === "/api/qbo/callback"
  );
}

export function isCronRoute(pathname: string) {
  return pathname.startsWith("/api/cron/");
}

export function isProviderWebhookRoute(pathname: string) {
  return (
    pathname === "/api/stripe/webhook" ||
    pathname === "/api/sms/twilio/status-callback" ||
    pathname === "/api/sms/twilio/inbound"
  );
}

export function isPublicAssetPath(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname === "/icon.png" ||
    pathname === "/icon-192.png" ||
    pathname === "/apple-icon.png" ||
    /\.(png|jpg|jpeg|gif|webp|svg|ico|js|woff|woff2|ttf|otf)$/i.test(pathname)
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|sw.js|icon.png|icon-192.png|apple-icon.png).*)",
  ],
};
