import { readImageUpload } from "@/lib/account/image-upload";
import { withOwnWorkspace } from "@/lib/account/with-account";
import {
  readWorkspaceLogo,
  removeWorkspaceLogo,
  replaceWorkspaceLogo,
} from "@/lib/account/workspace-logo";
import { brandLogoResponse } from "@/lib/share/brand-logo";
import { json, notFound } from "@/lib/share/http";
import { blobDriverFromEnv } from "@/lib/workspace/blob-driver";
import { refusal } from "@/lib/workspace/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET ?v=<version>`: the logo of the signed-in user's workspace, for its settings page. 404 without one. */
export const GET = withOwnWorkspace(async (request, { db, membership }) => {
  const logo = await readWorkspaceLogo(db, membership.workspaceId);
  if (!logo) return notFound();
  return brandLogoResponse(logo, new URL(request.url).searchParams.get("v"));
});

/**
 * `PUT` with the image as the body (a PNG, JPEG or WebP the browser already
 * resized): makes it the logo of the workspace the signed-in user owns and
 * deletes the old one. Answers `{ version }`; 413 `too-large` or `quota`, 415
 * `wrong-kind`, 422 `wrong-size` (`image-rules.ts`), 429 past the upload budget.
 */
export const PUT = withOwnWorkspace(
  async (request, { db, user, membership, now }) => {
    const upload = await readImageUpload(request, "logo", user.id, now);
    if (!upload.ok) return upload.response;
    const actor = { userId: user.id, workspaceId: membership.workspaceId };
    const stored = await replaceWorkspaceLogo(db, blobDriverFromEnv(), actor, upload.image, now);
    return stored.ok ? json(stored.value) : refusal(stored.reason);
  },
  { body: "bytes", owner: true },
);

/** `DELETE` (with a JSON body, `{}`): takes the logo away, file and all. `{ ok: true }` either way. */
export const DELETE = withOwnWorkspace(
  async (_request, { db, user, membership, now }) => {
    const actor = { userId: user.id, workspaceId: membership.workspaceId };
    await removeWorkspaceLogo(db, blobDriverFromEnv(), actor, now);
    return json({ ok: true });
  },
  { owner: true },
);
