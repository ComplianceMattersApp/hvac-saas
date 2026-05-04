"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";

type ContactLoggingQuickActionsProps = {
  jobId: string;
  attemptCount: number;
  lastAttemptLabel: string;
  action: (formData: FormData) => void | Promise<void>;
  buttonClassName: string;
};

const CONTACT_LOGGING_RESTORE_KEY_PREFIX = "job-detail-contact-logging-restore:";

function ContactLoggingSubmitButton(props: {
  label: string;
  buttonClassName: string;
  onPressed: () => void;
}) {
  const { label, buttonClassName, onPressed } = props;
  const { pending } = useFormStatus();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeToken = useMemo(
    () => `${pathname}?${searchParams.toString()}`,
    [pathname, searchParams],
  );
  const [wasPressed, setWasPressed] = useState(false);

  useEffect(() => {
    setWasPressed(false);
  }, [routeToken]);

  const isActive = pending && wasPressed;

  return (
    <button
      type="submit"
      disabled={isActive}
      onClick={() => {
        setWasPressed(true);
        onPressed();
      }}
      className={`${buttonClassName} ${isActive ? "cursor-not-allowed opacity-60" : ""}`.trim()}
    >
      {isActive ? "Recording..." : label}
    </button>
  );
}

export default function ContactLoggingQuickActions(props: ContactLoggingQuickActionsProps) {
  const { jobId, attemptCount, lastAttemptLabel, action, buttonClassName } = props;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnTo = useMemo(() => {
    const search = searchParams.toString();
    return search ? `${pathname}?${search}` : pathname;
  }, [pathname, searchParams]);
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const restoreKey = `${CONTACT_LOGGING_RESTORE_KEY_PREFIX}${jobId}`;
  const banner = searchParams.get("banner");

  const markForRestore = () => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(restoreKey, "1");
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (banner !== "contact_attempt_logged") return;
    if (window.sessionStorage.getItem(restoreKey) !== "1") return;

    const node = sectionRef.current;
    if (!node) return;

    window.sessionStorage.removeItem(restoreKey);
    window.requestAnimationFrame(() => {
      node.scrollIntoView({ block: "nearest" });
    });
  }, [banner, pathname, restoreKey, searchParams]);

  return (
    <div ref={sectionRef} id="contact-logging" className="mt-4 border-t border-slate-200/80 pt-4 scroll-mt-24">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Contact Logging</div>
      <div className="flex flex-wrap gap-2">
        <form action={action}>
          <input type="hidden" name="job_id" value={jobId} />
          <input type="hidden" name="method" value="call" />
          <input type="hidden" name="result" value="no_answer" />
          <input type="hidden" name="return_to" value={returnTo} />
          <input type="hidden" name="success_banner" value="contact_attempt_logged" />
          <ContactLoggingSubmitButton
            label="No Answer"
            buttonClassName={buttonClassName}
            onPressed={markForRestore}
          />
        </form>

        <form action={action}>
          <input type="hidden" name="job_id" value={jobId} />
          <input type="hidden" name="method" value="text" />
          <input type="hidden" name="result" value="sent" />
          <input type="hidden" name="return_to" value={returnTo} />
          <input type="hidden" name="success_banner" value="contact_attempt_logged" />
          <ContactLoggingSubmitButton
            label="Sent Text"
            buttonClassName={buttonClassName}
            onPressed={markForRestore}
          />
        </form>
      </div>
      <div className="mt-2 text-[11px] text-slate-500">
        {attemptCount} attempt{attemptCount === 1 ? "" : "s"} • last: {lastAttemptLabel}
      </div>
    </div>
  );
}