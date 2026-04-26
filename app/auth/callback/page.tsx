"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

async function waitForSessionCommit(supabase: ReturnType<typeof createClient>) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return false;
}

async function waitForRecoverySignal(getHandledRecovery: () => boolean) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (getHandledRecovery()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return false;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Signing you in...");

  useEffect(() => {
    const supabase = createClient();
    let handledRecovery = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        handledRecovery = true;
      }
    });

    const handleCallback = async () => {
      try {
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

        setStatus("Signing you in...");

        // Handler 1: Hash-token flow (invite/recovery from Supabase verify redirect)
        if (hasHashTokens) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: hashAccessToken,
            refresh_token: hashRefreshToken,
          });

          if (sessionError) {
            setStatus("We could not complete sign-in. Redirecting to login...");
            setTimeout(() => router.push("/login"), 1500);
            return;
          }

          // Invite or recovery: send to password setup
          if (hashType === "invite" || hashType === "recovery") {
            setStatus("Redirecting to set password...");
            await waitForSessionCommit(supabase);
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
            setStatus("We could not complete sign-in. Redirecting to login...");
            setTimeout(() => router.push("/login"), 1500);
            return;
          }

          // Persisted browser session + PASSWORD_RECOVERY event can lag code exchange by a moment.
          // Wait briefly before deciding between recovery handoff and normal sign-in routing.
          await waitForSessionCommit(supabase);
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const {
            data: { user },
          } = await supabase.auth.getUser();
          // Treat both "recovery" and "invite" queryType as set-password handoff signals.
          // PKCE invite flows from Supabase include type=invite in the callback URL;
          // without this guard the contractor bypasses /set-password and hits routeByRole
          // before contractor_users membership exists, landing erroneously at /ops.
          const sawRecoverySignal =
            queryType === "recovery" || queryType === "invite" || handledRecovery || (await waitForRecoverySignal(() => handledRecovery));

          if (sawRecoverySignal) {
            setStatus("Redirecting to set password...");
            router.push("/set-password?mode=invite");
            return;
          }
          setStatus("Finishing sign-in...");
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
            setStatus("We could not complete sign-in. Redirecting to login...");
            setTimeout(() => router.push("/login"), 1500);
            return;
          }

          // OTP flows: if invite or recovery, to password setup
          if (queryType === "invite" || queryType === "recovery") {
            setStatus("Redirecting to set password...");
            await waitForSessionCommit(supabase);
            router.push("/set-password?mode=invite");
            return;
          }

          setStatus("Finishing sign-in...");
          await routeByRole(supabase, router, setStatus);
          return;
        }

        // No recognized auth params
        setStatus("Invalid or expired sign-in link. Redirecting to login...");
        setTimeout(() => router.push("/login"), 1500);
      } catch (error) {
        setStatus("We could not complete sign-in. Redirecting to login...");
        setTimeout(() => router.push("/login"), 2000);
      }
    };

    handleCallback();

    return () => {
      subscription.unsubscribe();
    };
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
    setStatus("Session could not be confirmed. Redirecting to login...");
    setTimeout(() => router.push("/login"), 1500);
    return;
  }

  const { data: contractorData } = await supabase
    .from("contractor_users")
    .select("contractor_id, contractors ( lifecycle_state )")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  const contractorLifecycleState = String((contractorData as any)?.contractors?.lifecycle_state ?? "active")
    .trim()
    .toLowerCase();

  if (contractorData?.contractor_id && contractorLifecycleState === "active") {
    setStatus("Redirecting...");
    router.push("/portal");
  } else {
    setStatus("Redirecting...");
    router.push("/ops");
  }
}
