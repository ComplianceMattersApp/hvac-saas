"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function FlashBanner({
  type,
  message,
}: {
  type: "success" | "warning";
  message: string;
}) {
  const router = useRouter();

useEffect(() => {
  const t = setTimeout(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("banner");
    router.replace(url.pathname + url.search, { scroll: false });
  }, 4000); // show for 4 seconds

  return () => clearTimeout(t);
}, [router]);

  const base =
    "rounded-md px-3 py-2 text-sm mb-4 border";

  const style =
    type === "success"
      ? "border-green-200 bg-green-50 text-green-900"
      : "border-amber-200 bg-amber-50 text-amber-900";

  return <div className={`${base} ${style}`}>{message}</div>;
}