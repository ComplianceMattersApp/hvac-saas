// lib/db/jobs.ts
export function jobsActive(supabase: any) {
  return supabase.from("jobs").is("deleted_at", null);
}