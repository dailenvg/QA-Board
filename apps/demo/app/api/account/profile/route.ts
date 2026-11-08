import { updateDisplayName } from "@/lib/account/profile";
import { profileSchema } from "@/lib/account/schemas";
import { withAccount } from "@/lib/account/with-account";
import { json, readJson } from "@/lib/share/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `PATCH { name }`: sets the signed-in user's name (1 to 80 characters, trimmed). Answers `{ name }`. */
export const PATCH = withAccount(async (request, { db, user, now }) => {
  const body = await readJson(request, profileSchema);
  if (!body.ok) return body.response;
  await updateDisplayName(db, user.id, body.value.name, now);
  return json({ name: body.value.name });
});
