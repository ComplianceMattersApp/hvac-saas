"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isPlatformOwnerActor } from "@/lib/business/platform-owner-access";

export async function publishTrainerKnowledgeDraftFromForm(formData: FormData): Promise<void> {
  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!eventId) return;
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user;
  if (authError || !user || !isPlatformOwnerActor({ userId: user.id, email: user.email })) return;
  const admin = createAdminClient();
  const { data: gap, error } = await admin
    .from("assistant_help_gap_events")
    .select("id, draft_article_title, draft_article_body")
    .eq("id", eventId)
    .maybeSingle();
  if (error || !gap?.draft_article_title || !gap?.draft_article_body) return;
  const slugBase = String(gap.draft_article_title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "trainer-article";
  const now = new Date().toISOString();
  const { error: insertError } = await admin.from("assistant_knowledge_articles").insert({
    slug: `${slugBase}-${eventId.slice(0, 8)}`,
    title: String(gap.draft_article_title).slice(0, 200),
    body: String(gap.draft_article_body).slice(0, 6_000),
    source_label: "Platform Owner approved trainer knowledge",
    source_path: "/training",
    status: "published",
    approved_at: now,
    approved_by_user_id: user.id,
  });
  if (insertError) return;
  await admin.from("assistant_help_gap_events").update({
    review_status: "converted_to_help_article",
    reviewed_at: now,
    reviewed_by_user_id: user.id,
  }).eq("id", eventId);
  revalidatePath("/ops/admin/help-gaps");
}
