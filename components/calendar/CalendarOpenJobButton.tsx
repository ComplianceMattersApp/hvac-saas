"use client";

import { useEffect, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type CalendarOpenJobButtonProps = {
  href: string;
  className: string;
  children?: ReactNode;
  loadingLabel?: string;
};

export default function CalendarOpenJobButton({
  href,
  className,
  children,
  loadingLabel = "Opening...",
}: CalendarOpenJobButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    router.prefetch(href);
  }, [href, router]);

  return (
    <button
      type="button"
      onClick={() => {
        startTransition(() => {
          router.push(href);
        });
      }}
      disabled={isPending}
      aria-busy={isPending}
      className={`${className} ${isPending ? "cursor-wait opacity-80" : ""}`.trim()}
    >
      {isPending ? loadingLabel : children}
    </button>
  );
}
