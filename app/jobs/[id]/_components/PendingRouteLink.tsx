"use client";

import Link from "next/link";
import { type ComponentProps, type MouseEvent, type ReactNode, useState } from "react";

type PendingRouteLinkProps = ComponentProps<typeof Link> & {
  loadingLabel?: ReactNode;
};

function shouldShowPending(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    event.currentTarget.target !== "_blank" &&
    !event.currentTarget.hasAttribute("download")
  );
}

export default function PendingRouteLink({
  children,
  className,
  loadingLabel = "Opening...",
  onClick,
  ...props
}: PendingRouteLinkProps) {
  const [isPending, setIsPending] = useState(false);

  return (
    <Link
      {...props}
      aria-busy={isPending}
      aria-disabled={isPending || undefined}
      aria-live="polite"
      className={`${className ?? ""} ${isPending ? "cursor-wait opacity-80" : ""}`.trim()}
      onClick={(event) => {
        onClick?.(event);
        if (!shouldShowPending(event)) return;
        if (isPending) {
          event.preventDefault();
          return;
        }

        setIsPending(true);
      }}
    >
      {isPending ? (
        <span className="inline-flex items-center justify-center gap-2">
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
          <span>{loadingLabel}</span>
        </span>
      ) : (
        children
      )}
    </Link>
  );
}
