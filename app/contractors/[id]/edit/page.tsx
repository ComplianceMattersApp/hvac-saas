import { redirect } from "next/navigation";
import {
  isInternalAccessError,
  requireInternalRole,
} from "@/lib/auth/internal-user";
import { createClient } from "@/lib/supabase/server";
import { ContractorForm } from "@/app/contractors/_components/ContractorForm";
import { updateContractorFromForm } from "@/lib/actions/contractor-actions";

const NOTICE_TEXT: Record<string, { tone: "success" | "warn" | "error"; message: string }> = {
  contractor_created_invite_sent: { tone: "success", message: "Contractor created and invite sent." },
  contractor_created_no_email: { tone: "warn", message: "Contractor created. No invite sent because no email was provided." },
  contractor_created_invite_failed: { tone: "warn", message: "Contractor created, but invite could not be sent." },
};

function noticeClass(tone: "success" | "warn" | "error") {
  if (tone === "success") return "border-green-200 bg-green-50 text-green-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
}

export default async function EditContractorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; notice?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const notice = NOTICE_TEXT[String(sp?.notice ?? "").trim().toLowerCase()];

  const supabase = await createClient();   // ✅ must come before using supabase

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (!user || userErr) redirect("/login");

  try {
    await requireInternalRole(["admin", "office"], {
      supabase,
      userId: user.id,
    });
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect("/ops");
    }

    throw error;
  }

  const { data: contractor, error } = await supabase
  .from("contractors")
  .select(
    "id, name, phone, email, notes, billing_name, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip"
  )
  .eq("id", id)
  .maybeSingle();

  if (error || !contractor) redirect("/ops/admin/contractors");

  return (
    <div className="space-y-4">
      {sp?.saved === "1" && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-900 shadow">
          Saved ✅
        </div>
      )}

      {notice ? (
        <div className={`fixed top-4 left-1/2 z-[9998] -translate-x-1/2 rounded-md border px-4 py-2 text-sm shadow ${noticeClass(notice.tone)}`}>
          {notice.message}
        </div>
      ) : null}

      <ContractorForm
        mode="edit"
        contractor={contractor}
        action={updateContractorFromForm}
      />
    </div>
  );
}