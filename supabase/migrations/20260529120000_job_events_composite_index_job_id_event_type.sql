-- P4B performance: composite index on job_events(job_id, event_type, created_at)
--
-- Problem: customerAttemptSummary (and other event-type-filtered reads on /jobs/[id])
-- query job_events with a (job_id + event_type) predicate. The existing job_events_job_id_idx
-- covers the job_id equality but leaves event_type filtering as a heap-scan post-filter over
-- all events for that job. On high-event-count jobs this produces measurable latency.
--
-- This index allows the planner to seek directly to (job_id, event_type) pairs, making
-- COUNT + ORDER BY created_at DESC LIMIT 1 reads essentially free.
--
-- Affected call sites:
--   - customerAttemptSummary    (.eq("event_type", "customer_attempt"))
--   - noteCountSummary          (.in("event_type", [...]))
--   - DeferredInternalNotesBody (.eq("event_type", "internal_note"))
--   - ops/page secondarySignals (.in("event_type", [...]) over multi-job fan-out)
--   - notification-actions      (.eq("event_type", "..."))
--
-- CONCURRENTLY note:
--   This migration uses plain CREATE INDEX (not CONCURRENTLY) because the Supabase
--   migration runner wraps statements in an implicit transaction and PostgreSQL does not
--   allow CREATE INDEX CONCURRENTLY inside a transaction block.
--
--   For production, apply via the Supabase SQL editor (outside a transaction):
--
--     CREATE INDEX CONCURRENTLY IF NOT EXISTS job_events_job_id_event_type_created_at_idx
--       ON public.job_events
--       USING btree (job_id, event_type, created_at DESC);
--
--   The migration here uses the non-concurrent form for sandbox/local proof only.
--   A separate production runbook step is required before this migration is promoted.
--   Once the concurrent production index already exists, this migration becomes a
--   safe IF NOT EXISTS no-op when eventually applied.
--
-- Does NOT drop existing indexes: job_events_job_id_idx, job_events_job_id_created_at_idx.
-- Those remain useful for timeline reads that do not filter by event_type.

CREATE INDEX IF NOT EXISTS job_events_job_id_event_type_created_at_idx
  ON public.job_events
  USING btree (job_id, event_type, created_at DESC);
