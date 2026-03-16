"use client";

type UnscheduleButtonProps = {
  className?: string;
};

export default function UnscheduleButton({ className }: UnscheduleButtonProps) {
  return (
    <button
      className={
        className ??
        "inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100"
      }
      type="submit"
      name="unschedule"
      value="1"
      onClick={(e) => {
        const ok = window.confirm("Remove this job from the schedule?");
        if (!ok) e.preventDefault();
      }}
    >
      Unschedule
    </button>
  );
}
