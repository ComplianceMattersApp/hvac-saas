export type JobStatus =
  | "open"
  | "on_the_way"
  | "in_process"
  | "completed"
  | "failed"
  | "cancelled";

export type JobRow = {
  id: string;
  title: string;
  city: string;
  status: JobStatus;

  scheduled_date: string | null;
  created_at: string | null;

  permit_number: string | null;
  window_start: string | null;
  window_end: string | null;

  customer_phone: string | null;
  on_the_way_at: string | null;

  // ✅ NEW (Thread 6)
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  job_notes: string | null;
};