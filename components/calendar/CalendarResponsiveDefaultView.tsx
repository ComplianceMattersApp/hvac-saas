"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { resolveCalendarDefaultViewHref } from '@/lib/utils/calendar-view-default';

type Props = {
  hadExplicitViewParam: boolean;
  disableAutoReplace?: boolean;
};

export default function CalendarResponsiveDefaultView(props: Props) {
  const { hadExplicitViewParam, disableAutoReplace = false } = props;
  const router = useRouter();

  useEffect(() => {
    if (disableAutoReplace) return;
    if (hadExplicitViewParam) return;

    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    const nextHref = resolveCalendarDefaultViewHref({
      href: window.location.href,
      isMobile,
    });

    if (!nextHref) return;
    router.replace(nextHref, { scroll: false });
  }, [disableAutoReplace, hadExplicitViewParam, router]);

  return null;
}
