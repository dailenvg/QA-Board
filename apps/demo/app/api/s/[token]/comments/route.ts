import { failure, json, readBytes, validate } from "@/lib/share/http";
import { asClient } from "@/lib/share/routes";
import { clientCommentSchema, SHARE_LIMITS } from "@/lib/share/schemas";
import { addClientComment } from "@/lib/share/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

const MAX_BODY = SHARE_LIMITS.jsonBytes + SHARE_LIMITS.blobBytes.crop;

/** Reads the multipart body: `comment` (JSON) and an optional `crop` image. */
async function readForm(request: Request): Promise<FormData | null> {
  const bytes = await readBytes(request, MAX_BODY);
  if (!bytes) return null;
  const type = request.headers.get("content-type") ?? "";
  return new Response(new Uint8Array(bytes), { headers: { "content-type": type } })
    .formData()
    .catch(() => null);
}

function parseComment(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/** `POST` multipart `comment` + optional `crop`: a client adds a comment (always active). */
export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  return asClient(request, token, "clientComment", async ({ services, share }) => {
    const form = await readForm(request);
    if (!form) return json({ error: "invalid-body" }, 400);
    const input = validate(clientCommentSchema, parseComment(form.get("comment")));
    if (!input.ok) return input.response;
    const file = form.get("crop");
    const crop = file instanceof Blob ? new Uint8Array(await file.arrayBuffer()) : null;
    const added = await addClientComment(services, share, input.value, crop, Date.now());
    return added.ok ? json(added.value, 201) : failure(added);
  });
}
