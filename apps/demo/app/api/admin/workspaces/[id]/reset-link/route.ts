import { withAdminWorkspace } from "@/lib/admin/with-admin";
import { createOwnerResetLink } from "@/lib/admin/workspace-actions";
import { noFieldsSchema } from "@/lib/admin/workspace-schemas";
import { authOrigin } from "@/lib/auth/auth-url";
import { json } from "@/lib/share/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST {}`: a password reset link for the workspace's owner
 * (`createOwnerResetLink`), on the app's canonical origin (`authOrigin`).
 * Answers `{ link, expiresAt }`, uncached, for the admin to copy once and
 * pass on; nothing is emailed and the link is never logged. 404 for an
 * unknown workspace; 409 `no-owner` when its owner's account is deleted.
 */
export const POST = withAdminWorkspace(noFieldsSchema, async ({ db, target, now }) => {
  const result = await createOwnerResetLink(db, target, { now, origin: authOrigin() });
  if (result.ok) return json({ link: result.link, expiresAt: result.expiresAt });
  return result.reason === "not-found"
    ? json({ error: "not-found" }, 404)
    : json({ error: "no-owner" }, 409);
});
