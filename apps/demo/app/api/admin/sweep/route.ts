import { withAdmin } from "@/lib/admin/with-admin";
import { noFieldsSchema } from "@/lib/admin/workspace-schemas";
import { auditAdminSystem } from "@/lib/account/audit";
import { runExpiry } from "@/lib/cron/run-expiry";
import { json } from "@/lib/share/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The cleanup stops starting new deletes at `EXPIRY_BUDGET_MS`; the rest is headroom to finish. */
export const maxDuration = 60;

/**
 * `POST {}`: the admin runs the daily cleanup now (`runExpiry`, decision 5),
 * all of it, as the schedule does, and waits for it. Answers `{ report }`,
 * each step's count and whether it failed (a 200 even then: the report says
 * so); 409 `running`, with nothing run, while another run is under way. The
 * run is recorded in `cron_runs` and the audit log (`admin.sweep_run`, no
 * fields: its counts are in the run's record).
 */
export const POST = withAdmin(noFieldsSchema, async ({ db, admin }) => {
  const run = await runExpiry({ trigger: "admin" });
  if (run.running) return json({ error: "running" }, 409);
  await auditAdminSystem(db, admin.id, "admin.sweep_run", [], Date.now());
  return json({ report: run.report });
});
