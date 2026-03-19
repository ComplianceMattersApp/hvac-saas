import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function redirectUrl(requestUrl: string, path: string, query?: Record<string, string>) {
  const url = new URL(requestUrl);
  url.pathname = path;
  url.search = "";
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function shouldRequirePasswordSetup(params: {
  type: string | null;
  code: string | null;
  tokenHash: string | null;
}): boolean {
  const { type, code, tokenHash } = params;
  const normalized = String(type ?? "").trim().toLowerCase();

  if (normalized === "invite" || normalized === "recovery") return true;

  // Some invite links arrive as PKCE code callbacks without type.
  // In this app, /auth/callback is dedicated to email invite/recovery completion.
  if (code) return true;

  // Token-hash callbacks without a recognized type should still continue
  // through password setup after successful verification.
  if (tokenHash) return true;

  return false;
}

function resolveInviteDebugMethod(params: {
  code: string | null;
  tokenHash: string | null;
}): string {
  if (params.code) return "code";
  if (params.tokenHash) return "token_hash";
  return "unknown";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const requiresPasswordSetup = shouldRequirePasswordSetup({ type, code, tokenHash });

  const supabase = await createClient();

  // PKCE flow: exchange code for a session.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(redirectUrl(request.url, "/login"));
    }
  } else if (tokenHash && type) {
    // OTP/hash flow (including invite links that provide token_hash + type).
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });

    if (error) {
      return NextResponse.redirect(redirectUrl(request.url, "/login"));
    }
  }

  if (requiresPasswordSetup) {
    return NextResponse.redirect(
      redirectUrl(request.url, "/auth/invite-debug", {
        callback: "1",
        method: resolveInviteDebugMethod({ code, tokenHash }),
        next: "/set-password?mode=invite",
      }),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(redirectUrl(request.url, "/login"));
  }

  const { data: cu, error: cuErr } = await supabase
    .from("contractor_users")
    .select("contractor_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (cuErr) {
    return NextResponse.redirect(redirectUrl(request.url, "/login"));
  }

  if (cu?.contractor_id) {
    return NextResponse.redirect(redirectUrl(request.url, "/portal"));
  }

  return NextResponse.redirect(redirectUrl(request.url, "/ops"));
}
