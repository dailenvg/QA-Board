import { NextResponse } from "next/server";
import { readBytes } from "../share/http";

/**
 * Plain HTML form posts to the auth routes. The forms carry `method="post"`
 * and an `action` so that a submit before hydration posts its fields in the
 * body, never in a URL; the routes answer those with a 303 back to a page.
 */

const FORM_TYPE = "application/x-www-form-urlencoded";
/** An email, a password or two, a token and a path fit in far less. */
const MAX_FORM_BYTES = 8 * 1024;

export function isFormPost(request: Request): boolean {
  return (request.headers.get("content-type") ?? "").toLowerCase().startsWith(FORM_TYPE);
}

/** The posted fields; empty when the body is missing or too big. */
export async function readForm(request: Request): Promise<URLSearchParams> {
  const bytes = await readBytes(request, MAX_FORM_BYTES);
  return new URLSearchParams(bytes ? new TextDecoder().decode(bytes) : "");
}

/**
 * A 303 to a path on this site: the browser follows with a GET carrying none
 * of the form. The Location is relative, so the browser stays on the host it
 * posted to (Next reports 127.0.0.1 as localhost, which would lose the cookie).
 */
export function seeOther(path: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { location: path, "cache-control": "no-store" },
  });
}
