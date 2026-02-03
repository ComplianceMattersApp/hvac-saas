'use server';

import { createClient } from '@/lib/supabase/server';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';

export type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  job_id: string | null;
  service_id: string | null;
  status: string | null;
  contractor_name?: string | null;
  permit_number?: string | null;
  window_start?: string | null;
  window_end?: string | null;
};

export async function getCalendarEvents(month: Date) {
  const supabase = await createClient();

  const monthStart = startOfWeek(startOfMonth(month));
  const monthEnd = endOfWeek(endOfMonth(month));

  // Jobs (join contractors)
  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select(`
id,
title,
city,
status,
scheduled_date,
permit_number,
window_start,
window_end,
contractors ( name )
`)
    .gte('scheduled_date', monthStart.toISOString())
    .lte('scheduled_date', monthEnd.toISOString())
    .order('scheduled_date', { ascending: true });

  if (jobsError) throw jobsError;

  // Services (no join yet — your DB has no FK services -> jobs)
  const { data: services, error: servicesError } = await supabase
    .from('services')
    .select(`
  id,
  scheduled_date,
  title,
  city,
  status,
  job_id,
  jobs (
    contractors ( name ),
    permit_number,
    window_start,
    window_end
  )
`)
    .gte('scheduled_date', monthStart.toISOString())
    .lte('scheduled_date', monthEnd.toISOString());

  if (servicesError) throw servicesError;

  const jobsWithContractor = (jobs ?? []).map((j: any) => ({
    ...j,
    contractor_name: j.contractors?.name ?? null,
  }));

  const events: CalendarEvent[] = [
    ...jobsWithContractor.map((j: any) => ({
      id: j.id,
      title: `${j.title}${j.city ? ` – ${j.city}` : ''}`,
      description: null,
      start_at: j.scheduled_date,
      end_at: null,
      job_id: j.id,
      service_id: null,
      status: j.status ?? null,
      contractor_name: j.contractors?.name ?? 'Compliance Matters',
      permit_number: j.permit_number ?? null,
      window_start: j.window_start ?? null,
      window_end: j.window_end ?? null,
    })),
    ...(services ?? []).map((s: any) => ({
      id: s.id,
      title: `${s.title}${s.city ? ` – ${s.city}` : ''} (${s.jobs?.contractors?.name ?? 'Compliance Matters'})`,
      description: null,
      start_at: s.scheduled_date,
      end_at: null,
      job_id: null,
      service_id: s.id,
      status: s.status ?? null,
      contractor_name: null,
      permit_number: s.jobs?.permit_number ?? null,
      window_start: s.jobs?.window_start ?? null,
      window_end: s.jobs?.window_end ?? null,
    })),
  ].filter((e) => !!e.start_at);

  function formatWindow(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const s = new Date(start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const e = new Date(end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${s} – ${e}`;
}
  return {
    jobs: jobsWithContractor,
    services: services ?? [],
    events,
  };
}

export async function updateJobSchedule(jobId: string, scheduledDate: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('jobs')
    .update({ scheduled_date: scheduledDate })
    .eq('id', jobId);

  if (error) {
    console.error('SUPABASE updateJobSchedule ERROR:', error);
    throw error;
  }

  return { success: true };
}

export async function updateServiceSchedule(serviceId: string, scheduledDate: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('services')
    .update({ scheduled_date: scheduledDate })
    .eq('id', serviceId);

  if (error) {
    console.error('SUPABASE updateServiceSchedule ERROR:', error);
    throw error;
  }

  return { success: true };
}