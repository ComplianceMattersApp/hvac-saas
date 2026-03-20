type ActionFeedbackProps = {
  type: "success" | "warning" | "error";
  message?: string | null;
  className?: string;
};

export function getActionFeedbackClasses(type: ActionFeedbackProps["type"]) {
  if (type === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }

  if (type === "error") {
    return "border-red-200 bg-red-50 text-red-900";
  }

  return "border-amber-200 bg-amber-50 text-amber-900";
}

export default function ActionFeedback({ type, message, className }: ActionFeedbackProps) {
  if (!message) return null;

  const role = type === "error" ? "alert" : "status";
  const classes = getActionFeedbackClasses(type);

  return (
    <div
      role={role}
      className={`rounded-md border px-3 py-2 text-sm ${classes}${className ? ` ${className}` : ""}`}
    >
      {message}
    </div>
  );
}