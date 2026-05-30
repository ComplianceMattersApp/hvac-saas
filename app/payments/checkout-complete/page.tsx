import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type CheckoutStatus = "success" | "cancelled";

function toClean(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return String(value[0] ?? "").trim();
  }
  return String(value ?? "").trim();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeStatus(value: string): CheckoutStatus {
  return value === "cancelled" ? "cancelled" : "success";
}

async function isActiveInternalUser(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("internal_users")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data?.id);
}

export default async function CheckoutCompletePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const status = normalizeStatus(toClean(sp.status).toLowerCase());
  const jobId = toClean(sp.job_id);

  if (isUuid(jobId)) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id) {
      const internal = await isActiveInternalUser(user.id);
      if (internal) {
        const banner =
          status === "cancelled"
            ? "internal_invoice_payment_checkout_cancelled"
            : "internal_invoice_payment_checkout_success";
        redirect(`/jobs/${jobId}/invoice?banner=${banner}#invoice-workspace`);
      }
    }
  }

  const heading =
    status === "cancelled"
      ? "Payment checkout cancelled"
      : "Payment checkout complete";
  const body =
    status === "cancelled"
      ? "No payment was submitted. You can close this page or return to the invoice link when you are ready."
      : "Thank you. Your payment was submitted in Stripe Checkout. Your invoice balance will update after payment processing finishes.";

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
          Invoice payment
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{heading}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/login"
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Team sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
