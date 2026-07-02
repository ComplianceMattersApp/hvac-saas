import { NextRequest, NextResponse } from "next/server";

const JOB_DETAIL_PATH_RE = /^\/jobs\/([^/]+)$/;
const JOB_DETAIL_V2_PATH_RE = /^\/jobs\/([^/]+)\/v2$/;

function isMobileRequest(request: NextRequest) {
  const clientHintMobile = String(request.headers.get("sec-ch-ua-mobile") ?? "").trim().toLowerCase();

  if (clientHintMobile === "?1") return true;
  if (clientHintMobile === "?0") return false;

  const userAgent = String(request.headers.get("user-agent") ?? "");
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(userAgent);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const jobDetailMatch = pathname.match(JOB_DETAIL_PATH_RE);
  const jobDetailV2Match = pathname.match(JOB_DETAIL_V2_PATH_RE);
  const isMobile = isMobileRequest(request);

  if (jobDetailMatch && !isMobile) {
    const url = request.nextUrl.clone();
    url.pathname = `/jobs/${jobDetailMatch[1]}/v2`;
    return NextResponse.redirect(url);
  }

  if (jobDetailV2Match && isMobile) {
    const url = request.nextUrl.clone();
    url.pathname = `/jobs/${jobDetailV2Match[1]}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/jobs/:id", "/jobs/:id/v2"],
};
