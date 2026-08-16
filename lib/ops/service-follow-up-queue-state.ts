import type { FocusedQueueJob } from "@/lib/ops/focused-queues";
import {
  buildServiceFollowUpProgressState,
  type ServiceFollowUpProgressEvent,
  type ServiceFollowUpProgressState,
} from "@/lib/jobs/service-follow-up-progress";

export type ServiceFollowUpQueueEvent = ServiceFollowUpProgressEvent & {
  job_id?: string | null;
};

export type ServiceFollowUpQueueStateByJob = ReadonlyMap<
  string,
  ServiceFollowUpProgressState
>;

export function buildServiceFollowUpQueueStateByJob(
  jobs: FocusedQueueJob[],
  events: ServiceFollowUpQueueEvent[],
): ServiceFollowUpQueueStateByJob {
  const eventsByJob = new Map<string, ServiceFollowUpProgressEvent[]>();
  for (const event of events) {
    const jobId = String(event?.job_id ?? "").trim();
    if (!jobId) continue;
    const jobEvents = eventsByJob.get(jobId) ?? [];
    jobEvents.push(event);
    eventsByJob.set(jobId, jobEvents);
  }

  const stateByJob = new Map<string, ServiceFollowUpProgressState>();
  for (const job of jobs) {
    const jobId = String(job?.id ?? "").trim();
    if (!jobId) continue;
    stateByJob.set(jobId, buildServiceFollowUpProgressState({
      pendingInfoReason: job.pending_info_reason ?? null,
      events: eventsByJob.get(jobId) ?? [],
    }));
  }

  return stateByJob;
}

export function resolveServiceFollowUpQueueState(
  job: FocusedQueueJob,
  stateByJob: ServiceFollowUpQueueStateByJob,
): ServiceFollowUpProgressState {
  const jobId = String(job?.id ?? "").trim();
  return stateByJob.get(jobId) ?? buildServiceFollowUpProgressState({
    pendingInfoReason: job.pending_info_reason ?? null,
    events: [],
  });
}

export function enrichServiceFollowUpQueueRows<T extends FocusedQueueJob>(
  jobs: T[],
  stateByJob: ServiceFollowUpQueueStateByJob,
): T[] {
  return jobs.map((job) => {
    const state = resolveServiceFollowUpQueueState(job, stateByJob);
    if (!state.progressLabel && !state.continuedThroughChildJobId) return job;
    return {
      ...job,
      service_follow_up_progress_label:
        state.progressLabel ?? job.service_follow_up_progress_label ?? null,
      service_follow_up_continued:
        Boolean(state.continuedThroughChildJobId) ||
        Boolean(job.service_follow_up_continued),
    };
  });
}
