"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Accepts jobs, schedule action, and refresh callback
  const [openJobId, setOpenJobId] = useState(null);
  const [feedback, setFeedback] = useState({ state: '', jobId: '' });
  const [pending, setPending] = useState(false);
  const [localJobs, setLocalJobs] = useState(jobs);
  const router = useRouter();

  async function handleSchedule(e, jobId) {
    e.preventDefault();
    setPending(true);
    setFeedback({ state: 'pending', jobId });
    const formData = new FormData(e.target);
    try {
      const result = await onSchedule(formData);
      if (result?.success) {
        setFeedback({ state: 'success', jobId });
        setLocalJobs(localJobs.filter(j => j.id !== jobId));
        setOpenJobId(null);
        router.refresh();
      } else if (result?.already) {
        setFeedback({ state: 'already', jobId });
      } else {
        setFeedback({ state: 'error', jobId });
      }
    } catch {
      setFeedback({ state: 'error', jobId });
    }
    setPending(false);
  }

  return (
    <div className="w-full max-w-md bg-white rounded shadow p-4 ml-6">
      <h2 className="text-lg font-semibold mb-3">Unscheduled</h2>
      <div className="flex flex-col gap-3">
        {localJobs.map((job) => (
          <div key={job.id} className="flex items-center justify-between border rounded px-3 py-2 bg-slate-50">
            <div className="flex flex-col min-w-0">
              <span className="font-medium text-slate-900 truncate">{`${job.customer_first_name ?? ''} ${job.customer_last_name ?? ''}`.trim() || 'Customer'}</span>
              <span className="text-xs text-slate-600 truncate">{job.job_address ?? job.city ?? 'Location'}</span>
              <span className="text-xs text-slate-500 truncate">{job.title ?? job.job_type ?? `Job ${job.id.slice(0, 8)}`}</span>
            </div>
            <div className="flex items-center gap-2">
              {job.phone_number && (
                <a href={`tel:${job.phone_number}`} className="p-1 rounded hover:bg-blue-100" title="Call">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 16.92V21a2 2 0 0 1-2.18 2A19.88 19.88 0 0 1 3 5.18 2 2 0 0 1 5 3h4.09a2 2 0 0 1 2 1.72c.13 1.23.37 2.42.72 3.57a2 2 0 0 1-.45 2.11l-2.2 2.2a16.06 16.06 0 0 0 6.29 6.29l2.2-2.2a2 2 0 0 1 2.11-.45c1.15.35 2.34.59 3.57.72A2 2 0 0 1 21 19.09V21z"></path></svg>
                </a>
              )}
              <button className="p-1 rounded hover:bg-green-100" title="Schedule" onClick={() => setOpenJobId(job.id)}>
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M8 17l4-4 4 4M3 6h18" /></svg>
              </button>
            </div>
            {feedback.jobId === job.id && feedback.state && (
              <span className="ml-2 text-xs font-semibold text-blue-700">{
                feedback.state === 'pending' ? 'Scheduling...' :
                feedback.state === 'success' ? 'Schedule updated.' :
                feedback.state === 'error' ? 'Could not save changes.' :
                feedback.state === 'already' ? 'Schedule was already up to date.' : ''
              }</span>
            )}
            {openJobId === job.id && (
              <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
                <div className="bg-white rounded shadow p-6 w-full max-w-md">
                  <h3 className="text-lg font-semibold mb-4">Schedule Job</h3>
                  <form onSubmit={e => handleSchedule(e, job.id)}>
                    <label className="block mb-2 text-sm">Date
                      <input name="scheduled_date" type="date" defaultValue="" className="border rounded px-2 py-1 w-full" required />
                    </label>
                    <label className="block mb-2 text-sm">Window Start
                      <input name="window_start" type="time" defaultValue="" className="border rounded px-2 py-1 w-full" required />
                    </label>
                    <label className="block mb-4 text-sm">Window End
                      <input name="window_end" type="time" defaultValue="" className="border rounded px-2 py-1 w-full" required />
                    </label>
                    <input type="hidden" name="job_id" value={job.id} />
                    <div className="flex gap-2">
                      <button type="submit" className="px-3 py-1 rounded bg-green-600 text-white" disabled={pending}>Save</button>
                      <button type="button" className="px-3 py-1 rounded bg-slate-200" onClick={() => setOpenJobId(null)}>Cancel</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
