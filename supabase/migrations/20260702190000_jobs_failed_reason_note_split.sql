alter table public.jobs
  add column if not exists ops_board_failure_note text;

comment on column public.jobs.ops_board_failure_note is
  'Internal failed/correction queue banner note. Follow-up reminders remain in next_action_note/follow_up_date/action_required_by.';

update public.jobs
set ops_board_failure_note = nullif(btrim(next_action_note), '')
where ops_board_failure_note is null
  and lower(coalesce(job_type, '')) = 'ecc'
  and lower(coalesce(ops_status, '')) in ('failed', 'retest_needed', 'pending_office_review')
  and nullif(btrim(next_action_note), '') is not null;

update public.jobs
set
  next_action_note = null,
  action_required_by = null,
  follow_up_date = null
where lower(coalesce(job_type, '')) = 'ecc'
  and lower(coalesce(ops_status, '')) in ('failed', 'retest_needed', 'pending_office_review')
  and nullif(btrim(ops_board_failure_note), '') is not null
  and nullif(btrim(next_action_note), '') = nullif(btrim(ops_board_failure_note), '');
