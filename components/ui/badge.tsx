import * as React from "react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

export function Badge({
  variant = "default",
  className = "",
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}) {
  const base = "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium";
  const variants: Record<BadgeVariant, string> = {
    default: "bg-gray-100 text-gray-800",
    success: "bg-green-100 text-green-800",
    warning: "bg-yellow-100 text-yellow-800",
    danger: "bg-red-100 text-red-800",
    info: "bg-blue-100 text-blue-800",
  };

  return <span className={`${base} ${variants[variant]} ${className}`}>{children}</span>;
}
