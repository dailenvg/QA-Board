import type { ApiResult } from "@/lib/share-client/api";
import type { CreatedShare } from "@/lib/share/types";
import type { Result } from "@/lib/store/store";

/** The steps of making a project's link, each against the server. */
export interface MakeLinkSteps {
  /** Takes away the link that stopped working (only when replacing one). */
  unshare: () => Promise<Result>;
  /** Makes a share (`POST /api/shares`), not yet anyone's link. */
  create: () => Promise<ApiResult<CreatedShare>>;
  /** Makes it the project's link (`PUT .../share-link`). */
  attach: (created: CreatedShare) => Promise<Result>;
  /** Deletes a share no project took: unattached, so its key alone does it. */
  discard: (created: CreatedShare) => Promise<unknown>;
}

export type MadeLink =
  | { ok: true; created: CreatedShare }
  /** The review-links switch went off since the page loaded: nothing is left on the server. */
  | { ok: false; refused: true }
  /** `create` didn't answer or was refused (`error`, the server's), or `attach` was (`message`). */
  | { ok: false; refused: false; error?: string; message?: string };

/**
 * Makes the project's link: replaces a gone one, then makes and attaches a
 * new share. A switch refusal stops before anything new is made (the
 * unshare), or deletes the share the attach refused, so no orphan stays.
 */
export async function makeShareLink(replacing: boolean, steps: MakeLinkSteps): Promise<MadeLink> {
  if (replacing) {
    const unshared = await steps.unshare();
    if (!unshared.ok && unshared.notAllowed) return { ok: false, refused: true };
  }
  const created = await steps.create();
  if (!created.ok) return { ok: false, refused: false, error: created.error };
  const saved = await steps.attach(created.value);
  if (saved.ok) return { ok: true, created: created.value };
  if (!saved.notAllowed) return { ok: false, refused: false, message: saved.error };
  await steps.discard(created.value);
  return { ok: false, refused: true };
}

/** Whether opening Share makes the link: only for a member who may, when there's none that works. */
export function createsOnOpen(
  canManage: boolean,
  hasLink: boolean,
  gone: boolean,
  creating: boolean,
): boolean {
  return canManage && (!hasLink || gone) && !creating;
}
