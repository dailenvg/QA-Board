import { NextResponse, type NextRequest } from "next/server";
import { loginHref, PATH_HEADER } from "@/lib/auth/next-path";
import { isPublicPath, opensSignedOut } from "@/lib/auth/public-paths";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session-cookie";

/**
 * Sends browsers without a session cookie to /login (API routes get a 401),
 * except to pages that answer them themselves (a project's link).
 * Checks only that the cookie is there: the session itself is checked in
 * server code (`lib/auth/guards.ts`). Passes the asked-for path on as
 * `PATH_HEADER`, so a server-side redirect to /login can return there, and
 * re-sets the cookie so its 30 days run from the last visit.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    if (opensSignedOut(pathname)) return NextResponse.next();
    return NextResponse.redirect(new URL(loginHref(`${pathname}${search}`), request.url));
  }

  const forwarded = new Headers(request.headers);
  forwarded.set(PATH_HEADER, `${pathname}${search}`);
  const response = NextResponse.next({ request: { headers: forwarded } });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(request.nextUrl));
  return response;
}

export const config = {
  // Vercel services (vercel.json) can't deploy Edge functions, so middleware runs on Node.
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image).*)"],
};
