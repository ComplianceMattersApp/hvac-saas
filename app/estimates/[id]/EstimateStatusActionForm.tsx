"use client";

type EstimateStatusActionFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  estimateId: string;
  nextStatus: "sent" | "approved" | "declined" | "expired" | "cancelled";
  label: string;
  className: string;
  confirmMessage: string;
  helperText?: string;
};

export default function EstimateStatusActionForm({
  action,
  estimateId,
  nextStatus,
  label,
  className,
  confirmMessage,
  helperText,
}: EstimateStatusActionFormProps) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (typeof window !== "undefined" && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
      className="space-y-1"
    >
      <input type="hidden" name="estimate_id" value={estimateId} />
      <input type="hidden" name="next_status" value={nextStatus} />
      <button type="submit" className={className}>
        {label}
      </button>
      {helperText ? <p className="max-w-48 text-[11px] leading-4 text-slate-500">{helperText}</p> : null}
    </form>
  );
}