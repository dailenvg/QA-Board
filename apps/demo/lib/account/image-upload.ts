import { createRateLimiter } from "../capture/rate-limit";
import { json, readBytes } from "../share/http";
import { checkImage, type CheckedImage, type ImageRefusal } from "./image-check";
import { IMAGE_MAX_BYTES, type ImageKind } from "./image-rules";
import { rateLimited } from "./with-account";

/**
 * Uploads per user, per server instance: a brake on a script, well above
 * what someone trying a few pictures needs.
 */
const UPLOADS = createRateLimiter({ limit: 10, windowMs: 60_000 });

const STATUS: Record<ImageRefusal, number> = {
  "too-large": 413,
  "wrong-kind": 415,
  "wrong-size": 422,
};

export type ImageUpload = { ok: true; image: CheckedImage } | { ok: false; response: Response };

/**
 * An avatar or logo upload's body, checked (`checkImage`): 429 past 10
 * uploads a minute, 413 `too-large` past 1 MB (read no further), 415
 * `wrong-kind`, 422 `wrong-size`.
 */
export async function readImageUpload(
  request: Request,
  kind: ImageKind,
  userId: string,
  now: number,
): Promise<ImageUpload> {
  const budget = UPLOADS(userId, now);
  if (!budget.ok) return { ok: false, response: rateLimited(budget.retryAfterSeconds) };
  const bytes = await readBytes(request, IMAGE_MAX_BYTES);
  if (!bytes) return { ok: false, response: json({ error: "too-large" }, 413) };
  const checked = checkImage(kind, bytes);
  if (checked.ok) return checked;
  return { ok: false, response: json({ error: checked.reason }, STATUS[checked.reason]) };
}
