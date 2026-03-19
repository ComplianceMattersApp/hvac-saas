"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Processing authentication...");

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const supabase = createClient();

        // Parse hash fragment for tokens from Supabase redirect (invite flows)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const hashAccessToken = hashParams.get("access_token");
        const hashRefreshToken = hashParams.get("refresh_token");
        const hashType = hashParams.get("type");

        // Parse query params for code/token_hash flows (PKCE or OTP)
        const queryParams = new URLSearchParams(window.location.search);
        const code = queryParams.get("code");
        const tokenHash = queryParams.get("token_hash");
        const queryType = queryParams.get("type");

        // Determine flow type
        const hasHashTokens = !!(hashAccessToken && hashRefreshToken);
        const hasCodeFlow = !!code;
        const hasOtpFlow = !!(tokenHash && queryType);

        setStatus(
          hasHashTokens
            ? `Hash flow: type=${hashType}`
            : hasCodeFlow
              ? "Code exchange flow..."
              : hasOtpFlow
                ? `OTP verification: type=${queryType}`
                : "No auth params found"
        );

        // Handler 1: Hash-token flow (invite/recovery from Supabase verify redirect)
        if (hasHashTokens) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: hashAccessToken,
            refresh_token: hashRefreshToken,
          });

          if (sessionError) {
            setStatus(`Session error: ${sessionError.message}`);
            setTimeout(() => router.push("/login"), 1500);
            return;
          }

          // Invite or recovery: send to password setup
          if (hashType === "invite" || hashType === "recovery") {
            setStatus("Session established, routing to set-password...");
            router.push("/set-password?mode=invite");
            return;
          }

          // Other hash flows: route by role
          await routeByRole(supabase, router, setStatus);
          return;
        }

        // Handler 2: Code exchange flow (PKCE)
        if (hasCodeFlow) {
          const { error: codeError } = await supabase.auth.exchangeCodeForSession(code);

          if (codeError) {
            setStatus(`Code exchange error: ${codeError.message}`);
            setTimeout(() => router.push("/login"), 1500);
            return;
          }

          setStatus("Code exchanged, routing by role...");
          await routeByRole(supabase, router, setStatus);
          return;
        }

        // Handler 3: OTP verification flow (token_hash + type)
        if (hasOtpFlow) {
          const { error: otpError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: queryType as any,
          });

          if (otpError) {
            setStatus(`OTP error: ${otpError.message}`);
            setTimeout(() => router.push("/login"), 1500);
            return;
          }

          // OTP flows: if invite or recovery, to password setup
          if (queryType === "invite" || queryType === "recovery") {
            setStatus("OTP verified, routing to set-password...");
            router.push("/set-password?mode=invite");
            return;
          }

          setStatus("OTP verified, routing by role...");
          await routeByRole(supabase, router, setStatus);
          return;
        }

        // No recognized auth params
        setStatus("No authentication parameters found");
        setTimeout(() => router.push("/login"), 1500);
      } catch (error) {
        setStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
        setTimeout(() => router.push("/login"), 2000);
      }
    };

    handleCallback();
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="rounded-lg bg-white p-8 shadow-lg">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent mx-auto"></div>
          <p className="text-sm text-gray-600">{status}</p>
        </div>
      </div>
    </div>
  );
}

// Helper: route user to /ops or /portal based on role
async function routeByRole(
  supabase: any,
  router: any,
  setStatus: (s: string) => void
) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    setStatus("No user found after auth");
    setTimeout(() => router.push("/login"), 1500);
    return;
  }

  const { data: contractorData } = await supabase
    .from("contractor_users")
    .select("contractor_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (contractorData?.contractor_id) {
    setStatus("Routing to portal...");
    router.push("/portal");
  } else {
    setStatus("Routing to ops...");
    router.push("/ops");
  }
}
