"use client";

type PrintButtonProps = {
  className?: string;
  label?: string;
};

export default function PrintButton({ className = "", label = "Print CHEERS" }: PrintButtonProps) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={className}
    >
      {label}
    </button>
  );
}
