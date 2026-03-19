"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function SetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function ensureSession() {
      // Invite session hand-off can arrive slightly after initial hydration.
      // Retry getUser briefly before deciding session is missing.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!isMounted) return;

        if (user) {
          setCheckingSession(false);
          return;
        }

        await sleep(250);
      }

      if (!isMounted) return;
      router.replace("/login");
    }

    void ensureSession();

    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!password || !confirmPassword) {
      setErrorMsg("Please enter and confirm your new password.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setLoading(false);
      setErrorMsg(updateError.message || "Failed to update password.");
      return;
    }

    setSuccessMsg("Password updated. Redirecting...");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      router.replace("/login");
      return;
    }

    const { data: cu, error: cuErr } = await supabase
      .from("contractor_users")
      .select("contractor_id")
      .eq("user_id", user.id)
      .maybeSingle();

    setLoading(false);

    if (cuErr) {
      router.replace("/login");
      return;
    }

    if (cu?.contractor_id) {
      router.replace("/portal");
      router.refresh();
      return;
    }

    router.replace("/ops");
    router.refresh();
  }

  if (checkingSession) {
    return (
      <div className="mx-auto max-w-md p-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
          <div>Validating invite session...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Set Your Password</h1>
      <p className="text-sm text-gray-600">
        Create a password to finish setting up your Compliance Matters account.
      </p>

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1">
          <label className="text-sm">New Password</label>
          <input
            className="w-full rounded-md border px-3 py-2"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm">Confirm New Password</label>
          <input
            className="w-full rounded-md border px-3 py-2"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        {errorMsg ? <div className="text-sm text-red-600">{errorMsg}</div> : null}
        {successMsg ? <div className="text-sm text-emerald-700">{successMsg}</div> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-black px-4 py-2 text-white"
        >
          {loading ? "Saving..." : "Save Password"}
        </button>
      </form>
    </div>
  );
}
