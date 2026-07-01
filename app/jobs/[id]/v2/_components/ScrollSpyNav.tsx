"use client";

import { useEffect, useRef, useState } from "react";

const ACCENT = "oklch(0.55 0.17 255)";
const NAV_MUTED = "oklch(0.5 0.02 262)";
const NAV_ACTIVE = "oklch(0.4 0.13 255)";

export type NavItem = {
  id: string;
  label: string;
};

export default function ScrollSpyNav({ items }: { items: NavItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const ioRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    ioRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const id = (e.target as HTMLElement).dataset.jobsection;
            if (id) setActive(id);
          }
        });
      },
      { rootMargin: "-12% 0px -78% 0px", threshold: 0 },
    );

    const io = ioRef.current;
    requestAnimationFrame(() => {
      document.querySelectorAll("[data-jobsection]").forEach((el) => io.observe(el));
    });

    return () => io.disconnect();
  }, []);

  return (
    <nav style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "1px" }}>
      {items.map((n) => {
        const isActive = active === n.id;
        return (
          <a
            key={n.id}
            href={`#${n.id}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "11px",
              padding: "8px 10px",
              borderRadius: "8px",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: 600,
              color: isActive ? NAV_ACTIVE : NAV_MUTED,
              transition: "color .12s",
            }}
          >
            <span
              style={{
                width: "3px",
                height: "14px",
                borderRadius: "3px",
                flexShrink: 0,
                background: isActive ? ACCENT : "oklch(0.9 0.006 250)",
                transition: "background .12s",
              }}
            />
            {n.label}
          </a>
        );
      })}
    </nav>
  );
}
