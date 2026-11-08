import { readAvatar, removeAvatar, replaceAvatar } from "@/lib/account/avatar";
import { readImageUpload } from "@/lib/account/image-upload";
import { withAccount } from "@/lib/account/with-account";
import { brandLogoResponse } from "@/lib/share/brand-logo";
import { json, notFound } from "@/lib/share/http";
import { blobDriverFromEnv } from "@/lib/workspace/blob-driver";
import { refusal } from "@/lib/workspace/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET ?v=<version>`: the signed-in user's avatar. 404 without one. */
export const GET = withAccount(async (request, { db, user }) => {
  const avatar = await readAvatar(db, user.id);
  if (!avatar) return notFound();
  return brandLogoResponse(avatar, new URL(request.url).searchParams.get("v"));
});

/**
 * `PUT` with the image as the body (a square PNG, JPEG or WebP the browser
 * already cropped and resized): makes it the signed-in user's avatar and
 * deletes the old one. Answers `{ version }`; 413 `too-large`, 415
 * `wrong-kind`, 422 `wrong-size` (`image-rules.ts`), 429 past the upload budget.
 */
export const PUT = withAccount(
  async (request, { db, user, now }) => {
    const upload = await readImageUpload(request, "avatar", user.id, now);
    if (!upload.ok) return upload.response;
    const stored = await replaceAvatar(db, blobDriverFromEnv(), user.id, upload.image, now);
    return stored.ok ? json(stored.value) : refusal(stored.reason);
  },
  { body: "bytes" },
);

/** `DELETE` (with a JSON body, `{}`): takes the avatar away, file and all. `{ ok: true }` either way. */
export const DELETE = withAccount(async (_request, { db, user, now }) => {
  await removeAvatar(db, blobDriverFromEnv(), user.id, now);
  return json({ ok: true });
});
