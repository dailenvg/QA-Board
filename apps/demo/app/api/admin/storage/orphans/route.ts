import { checkOrphans } from "@/lib/admin/orphans";
import { withAdmin } from "@/lib/admin/with-admin";
import { noFieldsSchema } from "@/lib/admin/workspace-schemas";
import { json } from "@/lib/share/http";
import { shareServices } from "@/lib/share/server";
import { blobDriverFromEnv } from "@/lib/workspace/blob-driver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The check stops listing at `ORPHAN_CHECK_BUDGET_MS`; the rest is headroom. */
export const maxDuration = 60;

/**
 * `POST {}`: what the daily cleanup's file sweeps would delete now
 * (`checkOrphans`), deleting nothing. A POST, though it changes nothing,
 * because each one lists Vercel Blob (billed): never prefetched or cached.
 * Not audited: the log records changes, and this is a read. Answers
 * `{ report }`.
 */
export const POST = withAdmin(noFieldsSchema, async ({ db, now }) => {
  const services = { shares: await shareServices(), blobs: blobDriverFromEnv() };
  return json({ report: await checkOrphans(db, services, now) });
});
