import { z } from "zod";
import { MEMBER_SWITCHES, type MemberSwitch } from "../auth/permissions";
import { REVIEW_WINDOWS, type ReviewWindowChoice } from "../share/review-window";

/**
 * What the admin panel shows of an audit entry's `meta`: only what
 * `AuditEntry` (`lib/account/audit.ts`) documents as safe to keep, and less.
 * Field names; a review link's new window; that a membership came from an
 * invite; a member's switches before and after; how many people an invitation
 * went to (never the keyed HMACs themselves); and whether a project sent to
 * ClickUp was assigned (never its ClickUp ids). Anything else in `meta` is
 * dropped, whatever it holds.
 */
export interface AuditDetails {
  fields: string[];
  reviewWindow?: ReviewWindowChoice;
  viaInvite?: true;
  switches?: { before: MemberSwitch[]; after: MemberSwitch[] };
  recipients?: number;
  assigned?: boolean;
}

/** A field's name: a short identifier, never a value someone typed. */
const FIELD_NAME = /^[a-z][a-z0-9_]{0,39}$/;

const switchList = z.array(z.enum(MEMBER_SWITCHES as [MemberSwitch, ...MemberSwitch[]]));

/** Each key read on its own, so one odd value never hides the others. */
const metaSchema = z.object({
  fields: z.array(z.unknown()).optional().catch(undefined),
  reviewWindow: z.enum(REVIEW_WINDOWS).optional().catch(undefined),
  source: z.literal("invite").optional().catch(undefined),
  before: switchList.optional().catch(undefined),
  after: switchList.optional().catch(undefined),
  recipients: z.array(z.unknown()).optional().catch(undefined),
  assigned: z.number().optional().catch(undefined),
});

export function auditDetails(meta: unknown): AuditDetails {
  const parsed = metaSchema.safeParse(meta);
  if (!parsed.success) return { fields: [] };
  const { fields, reviewWindow, source, before, after, recipients, assigned } = parsed.data;
  return {
    fields: (fields ?? []).filter(
      (field): field is string => typeof field === "string" && FIELD_NAME.test(field),
    ),
    ...(reviewWindow ? { reviewWindow } : {}),
    ...(source === "invite" ? { viaInvite: true } : {}),
    ...(before && after ? { switches: { before, after } } : {}),
    ...(recipients ? { recipients: recipients.length } : {}),
    ...(assigned !== undefined ? { assigned: assigned > 0 } : {}),
  };
}
