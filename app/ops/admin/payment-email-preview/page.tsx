import { redirect } from "next/navigation";
import { requireInternalRole } from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";
import { buildPaymentReceivedEmail } from "@/lib/payments/payment-received-email";

export const metadata = { title: "Payment Email Preview | EveryStep FieldWorks" };

export default async function PaymentEmailPreviewPage() {
  const supabase = await createClient();
  try {
    await requireInternalRole("admin", { supabase });
  } catch {
    redirect("/ops");
  }

  const message = buildPaymentReceivedEmail({
    businessName: "EveryStep FieldWorks",
    amountCents: 72000,
    balanceDueCents: 0,
    invoiceNumber: "2104",
    billingName: "Sample Customer",
    paymentMethod: "check",
    reference: "1042",
    paidAt: new Date().toISOString(),
    invoiceHref: "/jobs/sample/invoice",
  });

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">Internal preview</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Payment received email</h1>
        <p className="mt-2 text-sm text-slate-600">No email is sent from this page. Subject: {message.subject}</p>
      </header>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" dangerouslySetInnerHTML={{ __html: message.html }} />
    </main>
  );
}
