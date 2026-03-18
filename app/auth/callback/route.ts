import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function redirectUrl(requestUrl: string, path: string) {
  const url = new URL(requestUrl);
  url.pathname = path;
  url.search = "";
  return url;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");

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
