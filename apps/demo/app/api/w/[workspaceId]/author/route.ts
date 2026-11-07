import { json } from "@/lib/share/http";
import { readBody } from "@/lib/workspace/http";
import { authorName, setAuthorName } from "@/lib/workspace/load-workspace";
import { authorSchema } from "@/lib/workspace/schemas";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string };

/** `GET`: `{ name }`, the signed-in member's name for new comments (null until given). */
export const GET = withMember<Params>(async (_request, { db, user }) =>
  json({ name: await authorName(db, user.id) }),
);

/** `PUT { name }`: sets it. */
export const PUT = withMember<Params>(async (request, { db, user }) => {
  const body = await readBody(request, authorSchema);
  if (!body.ok) return body.response;
  await setAuthorName(db, user.id, body.value.name);
  return json({ name: body.value.name });
});
