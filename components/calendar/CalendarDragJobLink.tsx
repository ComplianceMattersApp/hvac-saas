"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { buildDragPayload, serializeDragPayload } from "./calendar-dnd";

type Props = {
  href: string;
  title?: string;
  className: string;
  jobId: string;
  windowStart?: string | null;
  windowEnd?: string | null;
  jobTitle?: string | null;
  jobCity?: string | null;
  assigneeSummary?: string | null;
  hasNoTechAssigned?: boolean;
  draggable?: boolean;
  scroll?: boolean;
  children: ReactNode;
};

export default function CalendarDragJobLink(props: Props) {
  const {
    href,
    title,
    className,
    jobId,
    windowStart,
    windowEnd,
    jobTitle,
    jobCity,
    assigneeSummary,
    hasNoTechAssigned,
    draggable = true,
    scroll = false,
    children,
  } = props;

  return (
    <Link
      href={href}
      title={title}
      draggable={draggable}
      scroll={scroll}
      className={className}
      onDragStart={(event) => {
        if (!draggable) {
          event.preventDefault();
          return;
        }

        const payload = buildDragPayload({
          jobId,
          windowStart,
          windowEnd,
          title: jobTitle,
          city: jobCity,
          assigneeSummary,
          hasNoTechAssigned,
        });

        event.dataTransfer.setData("application/x-cm-job", serializeDragPayload(payload));
        event.dataTransfer.setData("application/x-cm-job-id", payload.jobId);
        event.dataTransfer.setData("text/uri-list", href);
        event.dataTransfer.setData("text/plain", href);
        event.dataTransfer.effectAllowed = "move";
      }}
    >
      {children}
    </Link>
  );
}
