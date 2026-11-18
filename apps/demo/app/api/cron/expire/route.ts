import { tokensMatch } from "@pinpoint/server";
import { runExpiry } from "@/lib/cron/run-expiry";
import { json } from "@/lib/share/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The work stops starting new deletes at `EXPIRY_BUDGET_MS`; the rest is headroom to finish. */
export const maxDuration = 60;

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Fails closed:
 * without a secret nothing runs, so the route can't be called unauthenticated.
 */
async function refusal(request: Request): Promise<Response | null> {
  const secret = process.env.CRON_SECRET;
  if (!secret?.trim()) return json({ error: "not-configured" }, 503);
  const presented = request.headers.get("authorization") ?? "";
  const allowed = await tokensMatch(presented, `Bearer ${secret}`);
  return allowed ? null : json({ error: "unauthorized" }, 401);
}

/**
 * `GET /api/cron/expire`, daily: the cleanup (`runExpiry`). Answers each
 * step's count (null when skipped or failed), `done` (false when the time
 * budget ran out or a step failed; the next run continues) and `failed` per
 * step, with a 500 when any step failed; a 409 `running`, with nothing run,
 * while another run (the admin's Run sweep) is under way.
 */
export async function GET(request: Request) {
  const refused = await refusal(request);
  if (refused) return refused;
  const run = await runExpiry({ trigger: "schedule" });
  if (run.running) return json({ error: "running" }, 409);
  return json(run.report, run.anyFailed ? 500 : 200);
}
