"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ActionFeedback from "@/components/ui/ActionFeedback";

export default function FlashBanner({
  type,
  message,
}: {
  type: "success" | "warning" | "error";
  message: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete("banner");
      router.replace(url.pathname + url.search, { scroll: false });
    }, 4000);

    return () => clearTimeout(t);
  }, [router]);

  return <ActionFeedback type={type} message={message} className="mb-4" />;
}