import type { HandleUploadBody } from "@vercel/blob/client";
import { describeError } from "@/lib/auth/http";
import { database } from "@/lib/db/database";
import { json, validate, type Parsed } from "@/lib/share/http";
import { blobDriverFromEnv } from "@/lib/workspace/blob-driver";
import { readJsonValue, refusal } from "@/lib/workspace/http";
import { uploadRequestSchema } from "@/lib/workspace/schemas";
import {
  handleUploadBodySchema,
  parseJson,
  tokenPayloadSchema,
} from "@/lib/workspace/upload-events";
import { commitUpload, uploadGrant } from "@/lib/workspace/uploads";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string };

/**
 * The upload route's body, checked, but handed to the SDK exactly as parsed:
 * the callback's signature covers the body as sent, so nothing may be dropped
 * or reordered.
 */
async function readEvent(request: Request): Promise<Parsed<HandleUploadBody>> {
  const raw = await readJsonValue(request);
  if (!raw.ok) return raw;
  const checked = validate(handleUploadBodySchema, raw.value);
  return checked.ok ? { ok: true, value: raw.value as HandleUploadBody } : checked;
}

/**
 * A member asks for a client upload token (`upload()` from
 * `@vercel/blob/client`, with `clientPayload` `{ projectId, key, size,
 * contentType }`). The token allows one private file at the key's fixed path,
 * of at most that size and that type, for 10 minutes, and only while the
 * workspace's quota has room. 409 `inline-uploads` without Vercel Blob.
 */
const issueToken = withMember<Params>(async (request, { db, workspaceId, now }) => {
  const event = await readEvent(request);
  if (!event.ok) return event.response;
  const driver = blobDriverFromEnv();
  if (driver.kind !== "vercel") return json({ error: "inline-uploads" }, 409);
  if (event.value.type !== "blob.generate-client-token") return json({ error: "invalid" }, 400);
  const { pathname, clientPayload } = event.value.payload;
  const upload = validate(uploadRequestSchema, parseJson(clientPayload));
  if (!upload.ok) return upload.response;
  const grant = await uploadGrant(db, workspaceId, upload.value, now);
  if (!grant.ok) return refusal(grant.reason);
  if (pathname !== grant.value.pathname) return json({ error: "invalid", field: "pathname" }, 400);
  const issued = await driver.handleUpload(
    request,
    event.value,
    () => grant.value,
    () => Promise.resolve(),
  );
  return json(issued);
});

/**
 * Vercel Blob's completion callback: no session, but signed with the store's
 * token, which `handleUpload` verifies before anything runs. Commits the
 * upload named in the token's payload (set by `issueToken`), exactly like
 * `blobs/commit`, so whichever arrives second changes nothing.
 */
async function uploadCompleted(request: Request, workspaceId: string): Promise<Response> {
  const pending = database();
  const driver = blobDriverFromEnv();
  if (!pending || driver.kind !== "vercel") return json({ error: "not-configured" }, 503);
  const event = await readEvent(request);
  if (!event.ok) return event.response;
  if (event.value.type !== "blob.upload-completed") return json({ error: "invalid" }, 400);
  const db = await pending;
  try {
    await driver.handleUpload(
      request,
      event.value,
      () => {
        throw new Error("Not a token request.");
      },
      async (tokenPayload) => {
        const upload = tokenPayloadSchema.safeParse(parseJson(tokenPayload));
        if (!upload.success || upload.data.workspaceId !== workspaceId) return;
        await commitUpload(db, driver, workspaceId, upload.data);
      },
    );
    return json({ ok: true });
  } catch (error) {
    console.error(`squint workspace: upload callback failed (${describeError(error)})`);
    return json({ error: "invalid-callback" }, 400);
  }
}

/**
 * `POST`: a member's token request, or the store's signed completion callback
 * (the only request here without a session; middleware lets it through).
 */
export async function POST(request: Request, context: { params: Promise<Params> }) {
  if (request.headers.has("x-vercel-signature")) {
    return uploadCompleted(request, (await context.params).workspaceId);
  }
  return issueToken(request, context);
}
