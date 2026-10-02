import { NextRequest, NextResponse } from "next/server";
import { ACADEMY_ENABLED } from "@/lib/academy/availability";

/**
 * Block disabled Academy requests before Next can stream the route loading UI.
 * The page/API guards remain in place as defense in depth.
 */
export function proxy(request: NextRequest) {
  if (ACADEMY_ENABLED) return NextResponse.next();

  const pathname = request.nextUrl.pathname;
  const isAcademyRequest =
    pathname === "/academy" ||
    pathname.startsWith("/academy/") ||
    pathname === "/api/academy" ||
    pathname.startsWith("/api/academy/") ||
    pathname === "/docs/guides/academy" ||
    pathname.startsWith("/docs/guides/academy/") ||
    pathname === "/docs/academy" ||
    pathname.startsWith("/docs/academy/");

  if (!isAcademyRequest) return NextResponse.next();

  return new NextResponse(null, {
    status: 404,
    headers: {
      "cache-control": "no-store",
    },
  });
}

export const config = {
  matcher: ["/academy/:path*", "/api/academy/:path*", "/docs/guides/academy/:path*", "/docs/academy/:path*"],
};
