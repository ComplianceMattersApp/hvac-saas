"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import type { DispatchCalendarBlockEvent, DispatchJob, DispatchViewMode } from "@/lib/actions/calendar";
import { normalizeRetestLinkedJobTitle } from "@/lib/utils/job-title-display";
import { compactCalendarUserLabel } from "@/lib/calendar/calendar-user-label";
import { buildCalendarHref } from "./calendar-href";
import { formatCalendarDisplayStatus, getCalendarDisplayStatus } from "./calendar-status";
import {
  buildDragPayload,
  computeDropColumnKey,
  computeDropStartMinutes,
  computeDropWindow,
  DISPATCH_GRID_END_MINUTES,
  DISPATCH_GRID_START_MINUTES,
  extractDraggedJobPayloadFromDataTransfer,
  serializeDragPayload,
} from "./calendar-dnd";

type Props = {
  jobs: DispatchJob[];
  blockEvents: DispatchCalendarBlockEvent[];
  assignableUsers: Array<{ user_id: string; display_name: string; calendar_label?: string | null; email?: string | null }>;
  mode: DispatchViewMode;
  date: string;
  tech?: string | null;
  selectedJobId?: string;
  dropReturnTo: string;
  scheduleAction: (formData: FormData) => Promise<void> | void;
  reassignAction: (formData: FormData) => Promise<void> | void;
};

type GridColumn = {
  key: string;
  label: string;
  title: string;
};

const UNASSIGNED_COLUMN_KEY = "unassigned";

type PendingReassignDrop = {
  jobId: string;
  originColumnKey: string;
  originLabel: string;
  targetColumnKey: string;
  targetLabel: string;
  windowStart: string;
  windowEnd: string;
  start: number;
  end: number;
  title: string;
  city: string;
  assigneeSummary: string | null;
  hasNoTechAssigned: boolean;
};

type PendingUnassignDrop = {
  jobId: string;
  assigneeNames: string[];
  windowStart: string;
  windowEnd: string;
  start: number;
  end: number;
  title: string;
  city: string;
};

type GridItem = {
  id: string;
  kind: "job" | "block";
  job?: DispatchJob;
  event?: DispatchCalendarBlockEvent;
  columnKey: string;
  start: number;
  end: number;
  lane: number;
  laneCount: number;
};

type OptimisticJobDrop = {
  jobId: string;
  start: number;
  end: number;
  title: string;
  city: string;
  assigneeSummary: string | null;
  hasNoTechAssigned: boolean;
};

function parseMinutes(value?: string | null): number | null {
  const raw = String(value ?? "").trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function blockTimeLabel(startMinutes: number, endMinutes: number) {
  const toLabel = (minutes: number) => {
    const h24 = Math.floor(minutes / 60);
    const m = minutes % 60;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const suffix = h24 >= 12 ? "PM" : "AM";
    return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
  };
  return `${toLabel(startMinutes)} - ${toLabel(endMinutes)}`;
}

function listTimeWindowLabel(windowStart?: string | null, windowEnd?: string | null) {
  if (!windowStart) return "Time not set";
  return windowEnd ? `${windowStart} - ${windowEnd}` : windowStart;
}

function hmLabel(minutes: number) {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = h24 >= 12 ? "PM" : "AM";
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function shortTitle(job: DispatchJob) {
  const title = normalizeRetestLinkedJobTitle(job.title);
  if (!title) return `Job ${job.id.slice(0, 8)}`;
  return title.length > 42 ? `${title.slice(0, 39)}...` : title;
}

function colorClassForUserId(userId: string) {
  const palette = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-violet-500",
    "bg-rose-500",
    "bg-teal-500",
    "bg-cyan-500",
    "bg-lime-500",
    "bg-sky-500",
    "bg-fuchsia-500",
    "bg-slate-500",
  ];
  let hash = 0;
  const raw = String(userId ?? "");
  for (let i = 0; i < raw.length; i += 1) hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

function initialsFromName(name: string) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "T";
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  const letters = `${first}${second}`.trim();
  return (letters || first || "T").toUpperCase();
}

function currentMinutesLA(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function dispatchBlockClass(status?: string | null) {
  const value = String(status ?? "").toLowerCase();
  if (value === "failed") return "border-rose-300 bg-rose-100 text-rose-950";
  if (value === "pending_info") return "border-amber-200 bg-amber-100 text-amber-900";
  if (value === "on_hold") return "border-slate-300 bg-slate-100 text-slate-900";
  if (value === "on_my_way") return "border-blue-300 bg-blue-100 text-blue-950";
  if (value === "in_progress") return "border-indigo-300 bg-indigo-100 text-indigo-950";
  if (value === "field_complete") return "border-amber-200 bg-amber-100 text-amber-900";
  if (value === "cancelled") return "border-slate-300 border-dashed bg-slate-100 text-slate-500";
  if (value === "closed") return "border-green-200 border-dashed bg-green-50 text-green-900";
  if (value === "scheduled") return "border-cyan-300 bg-cyan-100 text-cyan-950";
  return "border-indigo-200 bg-indigo-50 text-indigo-900";
}

function todayYmdLA(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function isLikelyJobDrag(transfer: DataTransfer) {
  const types = Array.from(transfer.types ?? []);
  if (!types.length) return false;
  return (
    types.includes("application/x-cm-job") ||
    types.includes("application/x-cm-job-id") ||
    types.includes("text/uri-list") ||
    types.includes("text/plain")
  );
}

function assignLanes(rows: GridItem[]) {
  rows.sort((a, b) => a.start - b.start || a.end - b.end);

  const laneEndTimes: number[] = [];
  let groupStart = 0;
  let groupEnd = -1;

  const finalizeGroup = (startIndex: number, endIndex: number) => {
    if (endIndex < startIndex) return;
    let maxLane = 0;
    for (let i = startIndex; i <= endIndex; i += 1) {
      if (rows[i].lane > maxLane) maxLane = rows[i].lane;
    }
    const count = Math.max(maxLane + 1, 1);
    for (let i = startIndex; i <= endIndex; i += 1) {
      rows[i].laneCount = count;
    }
  };

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    let laneIndex = laneEndTimes.findIndex((end) => end <= row.start);
    if (laneIndex < 0) {
      laneIndex = laneEndTimes.length;
      laneEndTimes.push(row.end);
    } else {
      laneEndTimes[laneIndex] = row.end;
    }
    row.lane = laneIndex;

    if (i === 0) {
      groupStart = 0;
      groupEnd = row.end;
    } else if (row.start < groupEnd) {
      groupEnd = Math.max(groupEnd, row.end);
    } else {
      finalizeGroup(groupStart, i - 1);
      groupStart = i;
      groupEnd = row.end;
    }
  }

  finalizeGroup(groupStart, rows.length - 1);
}

export default function CalendarDispatchGrid(props: Props) {
  const {
    jobs,
    blockEvents,
    assignableUsers,
    mode,
    date,
    tech,
    selectedJobId,
    dropReturnTo,
    scheduleAction,
    reassignAction,
  } = props;

  const currentView = mode === "week" ? "week" : "day";

  const startHour = 6;
  const endHour = 18;
  const hourHeight = 50;
  const gridStartMinutes = startHour * 60;
  const gridEndMinutes = endHour * 60;
  const totalGridHeight = (endHour - startHour) * hourHeight;

  const [dropPreview, setDropPreview] = useState<{ start: number; end: number } | null>(null);
  const [dropHoverMinutes, setDropHoverMinutes] = useState<number | null>(null);
  const [dropZoneActive, setDropZoneActive] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [optimisticDrop, setOptimisticDrop] = useState<OptimisticJobDrop | null>(null);
  const [pendingReassignDrop, setPendingReassignDrop] = useState<PendingReassignDrop | null>(null);
  const [pendingUnassignDrop, setPendingUnassignDrop] = useState<PendingUnassignDrop | null>(null);

  const router = useRouter();
  const [isSavingDrop, startSavingDrop] = useTransition();

  const dayJobs = jobs.filter((job) => {
    if (mode === "day") return String(job.scheduled_date) === date;
    return true;
  });

  const dayBlockEvents = blockEvents.filter((event) => event.calendar_date === date);

  const columns: GridColumn[] = [
    { key: UNASSIGNED_COLUMN_KEY, label: "Unassigned", title: "Unassigned" },
    ...assignableUsers.map((user) => ({
      key: user.user_id,
      label: String(user.calendar_label ?? "").trim() || compactCalendarUserLabel({
        displayName: user.display_name,
        email: user.email,
      }),
      title: user.display_name,
    })),
  ];
  const columnIndexByKey = new Map(columns.map((column, index) => [column.key, index]));
  const activeTechKeys = new Set(assignableUsers.map((user) => user.user_id));

  function resolveJobColumnKey(job: DispatchJob): string {
    const assignments = Array.isArray(job.assignments) ? job.assignments : [];
    if (!assignments.length) return UNASSIGNED_COLUMN_KEY;
    const primary = assignments.find((assignment) => assignment.is_primary) ?? assignments[0];
    const userId = String(primary?.user_id ?? "").trim();
    return userId && activeTechKeys.has(userId) ? userId : UNASSIGNED_COLUMN_KEY;
  }

  function resolveBlockColumnKey(event: DispatchCalendarBlockEvent): string {
    const userId = String(event.internal_user_id ?? "").trim();
    return userId && activeTechKeys.has(userId) ? userId : UNASSIGNED_COLUMN_KEY;
  }

  const rows: GridItem[] = [];

  for (const job of dayJobs) {
    const start = parseMinutes(job.window_start);
    const parsedEnd = parseMinutes(job.window_end);
    if (start == null) continue;

    const clampedStart = Math.max(start, gridStartMinutes);
    const clampedEnd = Math.min(Math.max(parsedEnd ?? clampedStart + 60, clampedStart + 30), gridEndMinutes);

    rows.push({
      id: job.id,
      kind: "job",
      job,
      columnKey: resolveJobColumnKey(job),
      start: clampedStart,
      end: clampedEnd,
      lane: 0,
      laneCount: 1,
    });
  }

  for (const event of dayBlockEvents) {
    const start = parseMinutes(event.start_time);
    const parsedEnd = parseMinutes(event.end_time);
    if (start == null || parsedEnd == null) continue;

    const clampedStart = Math.max(start, gridStartMinutes);
    const clampedEnd = Math.min(Math.max(parsedEnd, clampedStart + 30), gridEndMinutes);

    rows.push({
      id: event.id,
      kind: "block",
      event,
      columnKey: resolveBlockColumnKey(event),
      start: clampedStart,
      end: clampedEnd,
      lane: 0,
      laneCount: 1,
    });
  }

  const rowsByColumn = new Map<string, GridItem[]>();
  for (const row of rows) {
    const group = rowsByColumn.get(row.columnKey);
    if (group) group.push(row);
    else rowsByColumn.set(row.columnKey, [row]);
  }
  for (const group of rowsByColumn.values()) {
    assignLanes(group);
  }

  const columnCount = columns.length;
  const columnWidthPct = 100 / Math.max(columnCount, 1);
  const minGridWidth = 84 + columnCount * 170;

  const isTodayColumn = String(date) === todayYmdLA();
  const nowMinutes = currentMinutesLA();
  const showNowLine = isTodayColumn && nowMinutes != null && nowMinutes >= gridStartMinutes && nowMinutes <= gridEndMinutes;
  const nowTop = showNowLine ? ((Number(nowMinutes) - gridStartMinutes) / 60) * hourHeight : 0;

  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  function submitDropSchedule(args: {
    jobId: string;
    windowStart: string;
    windowEnd: string;
    start: number;
    end: number;
    title?: string | null;
    city?: string | null;
    assigneeSummary?: string | null;
    hasNoTechAssigned?: boolean;
  }) {
    const payload = new FormData();
    payload.set("job_id", args.jobId);
    payload.set("scheduled_date", date);
    payload.set("window_start", args.windowStart);
    payload.set("window_end", args.windowEnd);
    payload.set("return_to", dropReturnTo);
    payload.set("no_redirect", "1");

    setOptimisticDrop({
      jobId: args.jobId,
      start: args.start,
      end: args.end,
      title: String(args.title ?? "").trim() || `Job ${args.jobId.slice(0, 8)}`,
      city: String(args.city ?? "").trim() || "",
      assigneeSummary: String(args.assigneeSummary ?? "").trim() || null,
      hasNoTechAssigned: args.hasNoTechAssigned === true,
    });

    startSavingDrop(() => {
      void Promise.resolve(scheduleAction(payload))
        .then(() => {
          router.refresh();
        })
        .catch(() => {
          setDropError("Could not save the new schedule. Please try again.");
          setOptimisticDrop(null);
        })
        .finally(() => {
          setOptimisticDrop(null);
        });
    });
  }

  // Cross-column drop confirmed via the modal below — kept entirely separate
  // from submitDropSchedule above so the same-column path is untouched.
  function submitReassignDrop(mode: "reassign" | "add") {
    if (!pendingReassignDrop) return;
    const drop = pendingReassignDrop;

    const payload = new FormData();
    payload.set("job_id", drop.jobId);
    payload.set("target_user_id", drop.targetColumnKey);
    payload.set("mode", mode);
    payload.set("scheduled_date", date);
    payload.set("window_start", drop.windowStart);
    payload.set("window_end", drop.windowEnd);
    payload.set("return_to", dropReturnTo);
    payload.set("no_redirect", "1");

    setPendingReassignDrop(null);
    setOptimisticDrop({
      jobId: drop.jobId,
      start: drop.start,
      end: drop.end,
      title: drop.title,
      city: drop.city,
      assigneeSummary: drop.assigneeSummary,
      hasNoTechAssigned: drop.hasNoTechAssigned,
    });

    startSavingDrop(() => {
      void Promise.resolve(reassignAction(payload))
        .then(() => {
          router.refresh();
        })
        .catch(() => {
          setDropError("Could not reassign the job. Please try again.");
          setOptimisticDrop(null);
        })
        .finally(() => {
          setOptimisticDrop(null);
        });
    });
  }

  // Drop onto the Unassigned column, confirmed via the modal below — same
  // shape as submitReassignDrop, kept separate so neither it nor
  // submitDropSchedule is touched by this path.
  function submitUnassignDrop() {
    if (!pendingUnassignDrop) return;
    const drop = pendingUnassignDrop;

    const payload = new FormData();
    payload.set("job_id", drop.jobId);
    payload.set("mode", "unassign");
    payload.set("scheduled_date", date);
    payload.set("window_start", drop.windowStart);
    payload.set("window_end", drop.windowEnd);
    payload.set("return_to", dropReturnTo);
    payload.set("no_redirect", "1");

    setPendingUnassignDrop(null);
    setOptimisticDrop({
      jobId: drop.jobId,
      start: drop.start,
      end: drop.end,
      title: drop.title,
      city: drop.city,
      assigneeSummary: null,
      hasNoTechAssigned: true,
    });

    startSavingDrop(() => {
      void Promise.resolve(reassignAction(payload))
        .then(() => {
          router.refresh();
        })
        .catch(() => {
          setDropError("Could not unassign the job. Please try again.");
          setOptimisticDrop(null);
        })
        .finally(() => {
          setOptimisticDrop(null);
        });
    });
  }

  return (
    <>
      {dropError ? (
        <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{dropError}</div>
      ) : null}

      {isSavingDrop ? (
        <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">Saving schedule...</div>
      ) : null}

      <div className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-950/5" style={{ minWidth: `${minGridWidth}px` }}>
        <div className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-4 py-2">
          <p className="truncate text-[11px] text-slate-500">Drag changes date and time only. Technician assignment stays attached to the job.</p>
        </div>
        <div className="grid" style={{ gridTemplateColumns: `84px repeat(${columnCount}, minmax(170px, 1fr))` }}>
          <div className="border-b border-r border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Time</div>
          {columns.map((column) => (
            <div key={`header-${column.key}`} className="min-w-0 border-b border-r border-slate-200 bg-slate-50 px-3 py-3">
              <p className="min-w-0 truncate text-sm font-semibold text-slate-900" title={column.title}>{column.label}</p>
            </div>
          ))}

          <div className="relative border-r border-slate-200 bg-white" style={{ height: `${totalGridHeight}px` }}>
            {Array.from({ length: endHour - startHour }, (_, i) => (
              <div key={`shade-${i}`} className={i % 2 === 0 ? "absolute left-0 right-0 bg-slate-50/40" : "absolute left-0 right-0 bg-white"} style={{ top: `${i * hourHeight}px`, height: `${hourHeight}px` }} />
            ))}
            {hours.map((hour) => {
              const y = (hour - startHour) * hourHeight;
              const label = hour === 12 ? "12 PM" : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
              return (
                <div key={hour} className="absolute left-0 right-0" style={{ top: `${y}px` }}>
                  <div className="-translate-y-1/2 px-3 text-[11px] font-medium text-slate-500">{label}</div>
                </div>
              );
            })}
            {showNowLine ? (
              <>
                <div className="absolute left-0 right-0 border-t border-rose-400/70" style={{ top: `${nowTop}px` }} />
                <div className="absolute left-2 -translate-y-1/2 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700" style={{ top: `${nowTop}px` }}>
                  Now
                </div>
              </>
            ) : null}
          </div>

          <div
            className={`relative border-r border-slate-200 bg-white transition ${dropZoneActive ? "bg-blue-50/25 ring-2 ring-inset ring-blue-300/70" : ""}`}
            style={{ height: `${totalGridHeight}px`, gridColumn: `span ${columnCount}` }}
            onDragEnter={(event) => {
              if (!event.dataTransfer) return;
              if (!isLikelyJobDrag(event.dataTransfer)) return;
              setDropZoneActive(true);
            }}
            onDragOver={(event) => {
              if (!event.dataTransfer) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = isLikelyJobDrag(event.dataTransfer) ? "move" : "none";

              const rect = event.currentTarget.getBoundingClientRect();
              const hoverMinutes = computeDropStartMinutes({
                clientY: event.clientY,
                top: rect.top,
                height: rect.height,
                gridStartMinutes,
                gridEndMinutes,
              });
              setDropHoverMinutes(hoverMinutes);
              setDropZoneActive(true);

              const payload = extractDraggedJobPayloadFromDataTransfer(event.dataTransfer);
              if (!payload?.jobId) {
                setDropPreview(null);
                setDropError(null);
                return;
              }

              const startMinutes = computeDropStartMinutes({
                clientY: event.clientY,
                top: rect.top,
                height: rect.height,
                gridStartMinutes,
                gridEndMinutes,
              });
              const nextWindow = computeDropWindow({ payload, startMinutes, gridEndMinutes });
              const nextStart = parseMinutes(nextWindow.windowStart) ?? DISPATCH_GRID_START_MINUTES;
              const nextEnd = parseMinutes(nextWindow.windowEnd) ?? DISPATCH_GRID_END_MINUTES;
              setDropPreview({ start: nextStart, end: nextEnd });
              setDropError(null);
            }}
            onDragLeave={() => {
              setDropPreview(null);
              setDropHoverMinutes(null);
              setDropZoneActive(false);
            }}
            onDrop={(event) => {
              if (isSavingDrop) return;
              event.preventDefault();
              setDropPreview(null);
              setDropHoverMinutes(null);
              setDropZoneActive(false);
              if (!event.dataTransfer) return;

              const payload = extractDraggedJobPayloadFromDataTransfer(event.dataTransfer);
              if (!payload?.jobId) {
                setDropError("Could not identify the dragged job.");
                return;
              }

              const rect = event.currentTarget.getBoundingClientRect();
              const startMinutes = computeDropStartMinutes({
                clientY: event.clientY,
                top: rect.top,
                height: rect.height,
                gridStartMinutes,
                gridEndMinutes,
              });
              const dropWindow = computeDropWindow({ payload, startMinutes, gridEndMinutes });
              const nextStart = parseMinutes(dropWindow.windowStart) ?? DISPATCH_GRID_START_MINUTES;
              const nextEnd = parseMinutes(dropWindow.windowEnd) ?? DISPATCH_GRID_END_MINUTES;

              const targetColumnKey = computeDropColumnKey({
                clientX: event.clientX,
                left: rect.left,
                width: rect.width,
                columns,
              });
              const originColumnKey = payload.originColumnKey ?? UNASSIGNED_COLUMN_KEY;

              if (targetColumnKey !== originColumnKey) {
                const originLabel = columns.find((column) => column.key === originColumnKey)?.label ?? "Unassigned";
                const targetLabel = columns.find((column) => column.key === targetColumnKey)?.label ?? "Unassigned";

                if (targetColumnKey === UNASSIGNED_COLUMN_KEY) {
                  const assigneeSummaryRaw = String(payload.assigneeSummary ?? "").trim();
                  const assigneeNames = assigneeSummaryRaw
                    ? assigneeSummaryRaw.split(",").map((name) => name.trim()).filter(Boolean)
                    : [];

                  setPendingUnassignDrop({
                    jobId: payload.jobId,
                    assigneeNames,
                    windowStart: dropWindow.windowStart,
                    windowEnd: dropWindow.windowEnd,
                    start: nextStart,
                    end: nextEnd,
                    title: String(payload.title ?? "").trim() || `Job ${payload.jobId.slice(0, 8)}`,
                    city: String(payload.city ?? "").trim() || "",
                  });
                  return;
                }

                setPendingReassignDrop({
                  jobId: payload.jobId,
                  originColumnKey,
                  originLabel,
                  targetColumnKey,
                  targetLabel,
                  windowStart: dropWindow.windowStart,
                  windowEnd: dropWindow.windowEnd,
                  start: nextStart,
                  end: nextEnd,
                  title: String(payload.title ?? "").trim() || `Job ${payload.jobId.slice(0, 8)}`,
                  city: String(payload.city ?? "").trim() || "",
                  assigneeSummary: String(payload.assigneeSummary ?? "").trim() || null,
                  hasNoTechAssigned: payload.hasNoTechAssigned === true,
                });
                return;
              }

              submitDropSchedule({
                jobId: payload.jobId,
                windowStart: dropWindow.windowStart,
                windowEnd: dropWindow.windowEnd,
                start: nextStart,
                end: nextEnd,
                title: payload.title,
                city: payload.city,
                assigneeSummary: payload.assigneeSummary,
                hasNoTechAssigned: payload.hasNoTechAssigned,
              });
            }}
          >
            {Array.from({ length: endHour - startHour }, (_, i) => (
              <div key={`col-shade-${i}`} className={i % 2 === 0 ? "absolute left-0 right-0 bg-slate-50/35" : "absolute left-0 right-0 bg-white"} style={{ top: `${i * hourHeight}px`, height: `${hourHeight}px` }} />
            ))}
            {hours.map((hour) => {
              const y = (hour - startHour) * hourHeight;
              return <div key={hour} className="absolute left-0 right-0 border-t border-slate-100/90" style={{ top: `${y}px` }} />;
            })}
            {showNowLine ? <div className="absolute left-0 right-0 border-t border-rose-400/70" style={{ top: `${nowTop}px` }} /> : null}
            {columns.slice(1).map((_, index) => (
              <div
                key={`col-divider-${index}`}
                className="pointer-events-none absolute top-0 bottom-0 border-l border-slate-200"
                style={{ left: `${(index + 1) * columnWidthPct}%` }}
              />
            ))}

            {dropHoverMinutes != null ? (
              <>
                <div
                  className="pointer-events-none absolute left-0 right-0 border-t-2 border-blue-500/80"
                  style={{ top: `${((dropHoverMinutes - gridStartMinutes) / 60) * hourHeight}px` }}
                />
                <div
                  className="pointer-events-none absolute right-2 -translate-y-1/2 rounded-md border border-blue-300 bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-blue-800 shadow-sm"
                  style={{ top: `${((dropHoverMinutes - gridStartMinutes) / 60) * hourHeight}px` }}
                >
                  Drop at {hmLabel(dropHoverMinutes)}
                </div>
              </>
            ) : null}

            {dropPreview ? (
              <div
                className="pointer-events-none absolute left-1 right-1 rounded-xl border-2 border-blue-500 bg-blue-100/75 px-2 py-1 text-[10px] font-semibold text-blue-900 shadow-md"
                style={{
                  top: `${((dropPreview.start - gridStartMinutes) / 60) * hourHeight}px`,
                  height: `${Math.max(((dropPreview.end - dropPreview.start) / 60) * hourHeight, 36)}px`,
                }}
              >
                Drop to schedule {listTimeWindowLabel(String(Math.floor(dropPreview.start / 60)).padStart(2, "0") + ":" + String(dropPreview.start % 60).padStart(2, "0"), String(Math.floor(dropPreview.end / 60)).padStart(2, "0") + ":" + String(dropPreview.end % 60).padStart(2, "0"))}
              </div>
            ) : null}

            {optimisticDrop ? (
              <div
                className="pointer-events-none absolute left-1 right-1 rounded-xl border-2 border-blue-500 bg-blue-100/85 py-1 pr-2 pl-5 text-blue-900 shadow-lg"
                style={{
                  top: `${((optimisticDrop.start - gridStartMinutes) / 60) * hourHeight}px`,
                  height: `${Math.max(((optimisticDrop.end - optimisticDrop.start) / 60) * hourHeight, 36)}px`,
                }}
              >
                <p className="truncate text-xs font-semibold leading-4">{optimisticDrop.title}</p>
                {optimisticDrop.hasNoTechAssigned ? <span className="ml-1 inline-block rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">No tech assigned</span> : null}
                {optimisticDrop.assigneeSummary ? <p className="truncate text-[10px] font-medium leading-4">Assigned: {optimisticDrop.assigneeSummary}</p> : null}
                {optimisticDrop.city ? <p className="truncate text-[11px] leading-4">{optimisticDrop.city}</p> : null}
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="truncate rounded-full bg-white/65 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">{blockTimeLabel(optimisticDrop.start, optimisticDrop.end)}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide">Saving...</p>
                </div>
              </div>
            ) : null}

            {rows.map((row) => {
              if (row.kind === "job" && optimisticDrop?.jobId === row.id) return null;
              const top = ((row.start - gridStartMinutes) / 60) * hourHeight;
              const height = Math.max(((row.end - row.start) / 60) * hourHeight, 36);
              const columnIndex = columnIndexByKey.get(row.columnKey) ?? 0;
              const laneWidthPct = columnWidthPct / Math.max(row.laneCount, 1);
              const laneLeftPct = columnIndex * columnWidthPct + row.lane * laneWidthPct;
              const laneGapPx = 3;

              if (row.kind === "block" && row.event) {
                const blockEvent = row.event;
                return (
                  <div
                    key={`block-${row.id}`}
                    className="absolute left-1 right-1 overflow-hidden rounded-lg border border-emerald-300 border-dashed bg-emerald-50/95 px-2.5 py-1.5 text-emerald-950 shadow-sm shadow-emerald-950/5"
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      left: `calc(${laneLeftPct}% + ${laneGapPx}px)`,
                      width: `calc(${laneWidthPct}% - ${laneGapPx * 2}px)`,
                      right: "auto",
                    }}
                  >
                    <div className="flex h-full min-w-0 items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold leading-4 text-emerald-950">{blockEvent.title}</p>
                        {blockEvent.description ? <p className="mt-0.5 truncate text-[10px] leading-4 text-emerald-900/75">{blockEvent.description}</p> : null}
                      </div>
                      <Link
                        href={buildCalendarHref(currentView, date, { block: blockEvent.id, tech })}
                        scroll={false}
                        className="inline-flex h-6 w-14 items-center justify-center rounded-lg border border-emerald-300 bg-white/95 px-1.5 py-1 text-[9px] font-semibold uppercase leading-none tracking-wide text-emerald-800 transition hover:bg-emerald-100"
                      >
                        Edit
                      </Link>
                    </div>
                  </div>
                );
              }

              const job = row.job!;
              const isSelected = selectedJobId === job.id;
              const assignees = Array.isArray(job.assignments) ? job.assignments : [];
              const colorBars = assignees.slice(0, 3);
              const overflowCount = Math.max(assignees.length - colorBars.length, 0);
              const initials = assignees.slice(0, 2).map((a) => initialsFromName(a.display_name)).join(" ");
              const assigneeSummary = assignees.map((a) => a.display_name).filter(Boolean).join(", ");
              const lifecycle = getCalendarDisplayStatus(job);
              const workContextLabel = String(job.work_context_label ?? "").trim();
              const statusBadgeLabel = lifecycle === "cancelled" || lifecycle === "on_my_way" || lifecycle === "in_progress" ? formatCalendarDisplayStatus(lifecycle) : null;
              const statusBadgeClass = lifecycle === "cancelled" ? "border-slate-300 bg-slate-200 text-slate-600" : lifecycle === "on_my_way" ? "border-blue-300 bg-blue-100 text-blue-950" : "border-indigo-300 bg-indigo-100 text-indigo-900";
              const jobCardBody = (
                <>
                  <div className="absolute inset-y-1 left-1 flex items-start gap-0.5">
                    {colorBars.map((assignment) => (
                      <span key={`${job.id}-${assignment.user_id}-bar`} className={`inline-block rounded-sm ${colorClassForUserId(assignment.user_id)} ${isSelected ? "w-1.5" : "w-1"} h-full`} title={assignment.display_name} />
                    ))}
                    {overflowCount > 0 ? <span className="inline-flex h-3 min-w-3 items-center justify-center rounded-sm bg-slate-700/75 px-0.5 text-[9px] font-semibold text-white">+{overflowCount}</span> : null}
                  </div>
                  <p className="truncate text-xs font-semibold leading-4 text-slate-950">{shortTitle(job)}</p>
                  {statusBadgeLabel ? <span className={`ml-1 inline-block rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${statusBadgeClass}`}>{statusBadgeLabel}</span> : null}
                  {job.scheduled_date && (!job.assignments || job.assignments.length === 0) ? <span className="ml-2 inline-block rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">No tech assigned</span> : null}
                  {assigneeSummary ? <p className="truncate text-[10px] font-medium leading-4 text-slate-700/85">Assigned: {assigneeSummary}</p> : null}
                  {workContextLabel ? <p className="truncate text-[10px] font-medium leading-4 text-slate-600">Work: {workContextLabel}</p> : null}
                  <p className="truncate text-[11px] leading-4 text-slate-700/90">{job.city || job.contractor_name || "No city or contractor"}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="truncate rounded-full bg-white/55 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-700/90">{blockTimeLabel(row.start, row.end)}</p>
                    {initials ? <p className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-700/70">{initials}</p> : null}
                  </div>
                </>
              );
              const jobCardClass = `absolute left-1 right-1 rounded-lg border py-1 pr-2 pl-5 shadow-sm shadow-slate-950/5 transition hover:cursor-pointer hover:-translate-y-px hover:shadow-md hover:brightness-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${dispatchBlockClass(lifecycle)} ${lifecycle === "cancelled" ? "cursor-default opacity-70" : "cursor-grab active:cursor-grabbing"} ${isSelected ? "ring-2 ring-slate-800/45 border-slate-700 shadow-md" : ""}`;
              const jobCardStyle = {
                top: `${top}px`,
                height: `${height}px`,
                left: `calc(${laneLeftPct}% + ${laneGapPx}px)`,
                width: `calc(${laneWidthPct}% - ${laneGapPx * 2}px)`,
                right: "auto",
              };

              return (
                <Fragment key={`job-${row.id}`}>
                  <Link
                    href={`/jobs/${job.id}`}
                    className={`${jobCardClass} xl:hidden`}
                    style={jobCardStyle}
                  >
                    {jobCardBody}
                  </Link>
                  <Link
                    href={buildCalendarHref(currentView, date, { job: job.id, tech })}
                    draggable={lifecycle !== "cancelled"}
                    onDragStart={(event) => {
                      if (lifecycle === "cancelled") {
                        event.preventDefault();
                        return;
                      }
                      const payload = buildDragPayload({
                        jobId: job.id,
                        windowStart: job.window_start,
                        windowEnd: job.window_end,
                        title: shortTitle(job),
                        city: job.city,
                        assigneeSummary,
                        hasNoTechAssigned: !job.assignments || job.assignments.length === 0,
                        originColumnKey: row.columnKey,
                      });
                      event.dataTransfer.setData("application/x-cm-job", serializeDragPayload(payload));
                      event.dataTransfer.setData("application/x-cm-job-id", payload.jobId);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    scroll={false}
                    className={`${jobCardClass} hidden xl:block`}
                    style={jobCardStyle}
                  >
                    {jobCardBody}
                  </Link>
                </Fragment>
              );
            })}

            {!rows.length ? (
              <div className="absolute inset-0 flex items-center justify-center px-4">
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-center text-xs text-slate-500">
                  No appointments or blocks for this {mode}. Drag a job here to schedule it.
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {pendingReassignDrop ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reassign-drop-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_44px_-28px_rgba(15,23,42,0.45)] sm:p-6"
          >
            <h2 id="reassign-drop-title" className="text-lg font-semibold tracking-tight text-slate-950">
              Reassign this job?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              This job is currently assigned to <strong>{pendingReassignDrop.originLabel}</strong>. You dropped it
              on <strong>{pendingReassignDrop.targetLabel}</strong>&apos;s column at {hmLabel(pendingReassignDrop.start)}.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                disabled={isSavingDrop}
                onClick={() => submitReassignDrop("reassign")}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Reassign to {pendingReassignDrop.targetLabel}
              </button>
              <button
                type="button"
                disabled={isSavingDrop}
                onClick={() => submitReassignDrop("add")}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Also assign {pendingReassignDrop.targetLabel}
              </button>
              <button
                type="button"
                disabled={isSavingDrop}
                onClick={() => setPendingReassignDrop(null)}
                className="inline-flex min-h-9 items-center justify-center rounded-lg px-4 text-sm font-semibold text-slate-500 transition hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingUnassignDrop ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="unassign-drop-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_44px_-28px_rgba(15,23,42,0.45)] sm:p-6"
          >
            <h2 id="unassign-drop-title" className="text-lg font-semibold tracking-tight text-slate-950">
              Unassign this job?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {pendingUnassignDrop.assigneeNames.length === 1 ? (
                <>
                  Remove <strong>{pendingUnassignDrop.assigneeNames[0]}</strong> from this job and mark it
                  unassigned?
                </>
              ) : pendingUnassignDrop.assigneeNames.length > 1 ? (
                <>
                  Remove all {pendingUnassignDrop.assigneeNames.length} technicians (
                  {pendingUnassignDrop.assigneeNames.join(", ")}) from this job?
                </>
              ) : (
                <>Mark this job unassigned?</>
              )}{" "}
              It will also move to {hmLabel(pendingUnassignDrop.start)}.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                disabled={isSavingDrop}
                onClick={() => submitUnassignDrop()}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-rose-700 bg-rose-700 px-4 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Confirm
              </button>
              <button
                type="button"
                disabled={isSavingDrop}
                onClick={() => setPendingUnassignDrop(null)}
                className="inline-flex min-h-9 items-center justify-center rounded-lg px-4 text-sm font-semibold text-slate-500 transition hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
