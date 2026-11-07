import { json } from "../share/http";

/**
 * Another site posting to an auth route. Browsers send `Origin` on every
 * POST, so a host that isn't ours means a cross-site form or fetch (login
 * CSRF). Requests without one (curl, server-side tests) carry no cookie the
 * attacker could ride, so they pass.
 */
export function isCrossSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export function crossSiteRefusal(): Response {
  return json({ error: "cross-site" }, 403);
}

/** An error whose message was written to be logged: no emails, links or values. */
export class LoggableError extends Error {
  override name = "LoggableError";
}

/**
 * The error's kind and code only: pg messages can quote emails and values.
 * A `LoggableError` also gives its message.
 */
export function describeError(error: unknown): string {
  if (error instanceof LoggableError) return `${error.name}: ${error.message}`;
  const name = error instanceof Error ? error.name : typeof error;
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? `${name} ${code}` : name;
}

/** Runs an auth route's work; a storage failure answers a JSON 500 instead of an error page. */
export async function guardAuth(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    console.error(`squint auth: storage failed (${describeError(error)})`);
    return json({ error: "storage" }, 500);
  }
}
