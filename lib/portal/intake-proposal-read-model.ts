import { createAdminClient } from "@/lib/supabase/server";

export type PendingContractorIntakeProposal = {
  id: string;
  created_at: string;
  proposed_customer_first_name: string | null;
  proposed_customer_last_name: string | null;
  proposed_title: string | null;
  proposed_job_type: string | null;
  proposed_address_line1: string | null;
  proposed_city: string | null;
  proposed_zip: string | null;
};

export async function listPendingContractorIntakeProposalsForContractor(input: {
  contractorId: string;
}): Promise<PendingContractorIntakeProposal[]> {
  const contractorId = String(input.contractorId ?? "").trim();
  if (!contractorId) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("contractor_intake_submissions")
    .select(
      "id, created_at, proposed_customer_first_name, proposed_customer_last_name, proposed_title, proposed_job_type, proposed_address_line1, proposed_city, proposed_zip"
    )
    .eq("contractor_id", contractorId)
    .eq("review_status", "pending")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    created_at: String(row.created_at ?? ""),
    proposed_customer_first_name: row.proposed_customer_first_name ?? null,
    proposed_customer_last_name: row.proposed_customer_last_name ?? null,
    proposed_title: row.proposed_title ?? null,
    proposed_job_type: row.proposed_job_type ?? null,
    proposed_address_line1: row.proposed_address_line1 ?? null,
    proposed_city: row.proposed_city ?? null,
    proposed_zip: row.proposed_zip ?? null,
  }));
}