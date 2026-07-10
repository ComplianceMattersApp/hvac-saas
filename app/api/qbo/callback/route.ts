import { NextResponse, type NextRequest } from "next/server";

import { requireInternalRole } from "@/lib/auth/internal-user";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getQboEnvironment } from "@/lib/qbo/qbo-env";
import { exchangeQboAuthCode } from "@/lib/qbo/qbo-oauth-client";
import { upsertQboConnection } from "@/lib/qbo/qbo-connection";

const STATE_COOKIE = "qbo_oauth_state";
const SUCCESS_PATH = "/ops/admin/company-profile?notice=qbo_connected#integrations";
const FAILURE_PATH = "/ops/admin/company-profile?notice=qbo_connect_failed#integrations";

function redirectClearingState(request: NextRequest, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, request.url));
  // Clear the one-time OAuth state cookie regardless of outcome.
  response.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const stateParam = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const cookieState = request.cookies.get(STATE_COOKIE)?.value;

    // CSRF: the state echoed back by Intuit must match our signed one-time cookie.
    if (!stateParam || !cookieState || stateParam !== cookieState) {
      return redirectClearingState(request, FAILURE_PATH);
    }
    if (!code) {
      return redirectClearingState(request, FAILURE_PATH);
    }

    // Exchange the authorization code for tokens (+ realmId).
    const tokens = await exchangeQboAuthCode(request.url);

    // Resolve the calling account. The Supabase session cookie rides along on
    // this top-level GET (SameSite=Lax), so we can scope the connection.
    const supabase = await createClient();
    const { internalUser } = await requireInternalRole("admin", { supabase });

    // Persist via the admin client (service role) — token writes never depend on RLS timing.
    const admin = createAdminClient();
    await upsertQboConnection({
      supabase: admin,
      accountOwnerUserId: internalUser.account_owner_user_id,
      realmId: tokens.realmId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      environment: getQboEnvironment(),
    });

    return redirectClearingState(request, SUCCESS_PATH);
  } catch {
    // Any failure degrades to the failure notice — never a 500 that leaks details.
    return redirectClearingState(request, FAILURE_PATH);
  }
}
