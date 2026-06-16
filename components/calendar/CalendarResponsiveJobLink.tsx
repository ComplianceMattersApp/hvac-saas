import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  mobileHref: string;
  desktopHref: string;
  title?: string;
  className: string;
  desktopClassName?: string;
  mobileClassName?: string;
  scroll?: boolean;
  children: ReactNode;
};

export default function CalendarResponsiveJobLink(props: Props) {
  const {
    mobileHref,
    desktopHref,
    title,
    className,
    desktopClassName = "",
    mobileClassName = "",
    scroll = false,
    children,
  } = props;

  return (
    <>
      <Link
        href={mobileHref}
        title={title}
        className={`${className} ${mobileClassName} xl:hidden`}
      >
        {children}
      </Link>
      <Link
        href={desktopHref}
        title={title}
        scroll={scroll}
        className={`${className} ${desktopClassName} hidden xl:block`}
      >
        {children}
      </Link>
    </>
  );
}
