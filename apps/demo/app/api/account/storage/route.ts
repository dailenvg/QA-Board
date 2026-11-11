import { storageReportSchema } from "@/lib/account/schemas";
import { loadStorageReport } from "@/lib/account/storage";
import { withOwnWorkspace } from "@/lib/account/with-account";
import { json } from "@/lib/share/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET`: the Storage page's report on the signed-in user's workspace (never
 * one named in the request), for any member: usage and quota, usage by kind
 * of file, and the largest projects. Read-only, so there's no owner check.
 * 404 for an account in no workspace (the admin).
 */
export const GET = withOwnWorkspace(async (_request, { db, membership }) => {
  const report = await loadStorageReport(db, membership.workspaceId);
  return json(storageReportSchema.parse(report));
});
