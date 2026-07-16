import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "crypto";

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

    // Intuit sends error/error_description on the callback when auth fails/denies.
    const intuitError = url.searchParams.get("error");
    const intuitErrorDescription = url.searchParams.get("error_description");
    if (intuitError || intuitErrorDescription) {
      console.error(
        "[qbo/callback] intuit returned error:",
        intuitError,
        "| description:",
        intuitErrorDescription,
      );
    }

    console.error(
      "[qbo/callback] state cookie:",
      cookieState,
      "| state param:",
      stateParam,
    );

    // CSRF: the state echoed back by Intuit must match our signed one-time cookie.
    if (!stateParam || !cookieState || stateParam !== cookieState) {
      console.error(
        "[qbo/callback] FAILURE: state mismatch (hasParam:",
        Boolean(stateParam),
        "hasCookie:",
        Boolean(cookieState),
        "equal:",
        stateParam === cookieState,
        ")",
      );
      return redirectClearingState(request, FAILURE_PATH);
    }
    if (!code) {
      console.error("[qbo/callback] FAILURE: missing ?code= param");
      return redirectClearingState(request, FAILURE_PATH);
    }

    // Resolve the calling account. The Supabase session cookie rides along on
    // this top-level GET (SameSite=Lax), so we can scope the connection.
    const supabase = await createClient();
    const { internalUser } = await requireInternalRole("admin", { supabase });

    // The cookie comparison protects against CSRF. The atomic database consume
    // also makes the state single-use across concurrent server instances, so a
    // duplicated callback cannot exchange Intuit's one-time code twice and
    // invalidate the newly issued refresh token.
    const stateHash = createHash("sha256").update(stateParam).digest("hex");
    const { data: consumed, error: consumeError } = await supabase.rpc(
      "consume_qbo_oauth_attempt",
      {
        p_account_owner_user_id: internalUser.account_owner_user_id,
        p_state_hash: stateHash,
      },
    );
    if (consumeError || !consumed) {
      console.error("[qbo/callback] FAILURE: authorization state was expired or already consumed");
      return redirectClearingState(request, FAILURE_PATH);
    }

    // Exchange only after the one-time attempt has been atomically claimed.
    const tokens = await exchangeQboAuthCode(request.url);

    // Persist via the admin client (service role) — token writes never depend on RLS timing.
    const admin = createAdminClient();
    console.log("[qbo/callback] realmId before upsert:", tokens.realmId);
    await upsertQboConnection({
      supabase: admin,
      accountOwnerUserId: internalUser.account_owner_user_id,
      realmId: tokens.realmId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      environment: getQboEnvironment(),
    });

    console.error("[qbo/callback] SUCCESS: connection stored for", internalUser.account_owner_user_id);
    return redirectClearingState(request, SUCCESS_PATH);
  } catch (error) {
    // Any failure degrades to the failure notice — never a 500 that leaks details.
    console.error(
      "[qbo/callback] FAILURE: caught error:",
      error instanceof Error ? error.message : String(error),
    );
    if (error instanceof Error && error.stack) {
      console.error("[qbo/callback] stack:", error.stack);
    }
    return redirectClearingState(request, FAILURE_PATH);
  }
}
