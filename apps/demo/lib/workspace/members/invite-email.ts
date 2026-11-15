import {
  brandHeader,
  button,
  emailAccent,
  fallbackLink,
  footerNote,
  headline,
  NO_BRAND,
  oneLine,
  paragraph,
  type EmailBrand,
} from "../../email/branded-html";
import {
  EmailRefused,
  resendBatchSender,
  type EmailEnv,
  type OutgoingEmail,
} from "../../email/resend";

/**
 * The email that invites someone to join a workspace: from the workspace's
 * sender ("{Name} via Squint", `from-header.ts`), with its icon and name on
 * top and one Join button in its color (`branded-html.ts`), like the Share
 * window's invitation. Text and HTML say the same; every value in the HTML is
 * escaped. Each address gets its own email with its own link.
 */

/** How many days an invite's link works, from when it's made or renewed. */
export const INVITE_DAYS = 7;

export interface MemberInviteDetails {
  /** The workspace's name. */
  workspace: string;
  /** Who invited them (their name); null when they have none. */
  inviter: string | null;
  /** The address invited: the one they'll sign in with. */
  email: string;
  /** The invite's join link. */
  link: string;
}

export interface MemberInviteCopy {
  subject: string;
  greeting: string;
  /** The same as the subject (no full stop: a heading). */
  headline: string;
  button: string;
  note: string;
  howTo: string;
  footer: string;
}

export function memberInviteCopy({ workspace, inviter, email }: MemberInviteDetails) {
  const headlineText = inviter
    ? `${inviter} has invited you to join ${workspace} on Squint`
    : `You've been invited to join ${workspace} on Squint`;
  return {
    subject: headlineText,
    greeting: "Hi,",
    headline: headlineText,
    button: `Join ${workspace}`,
    note: `This invite is for ${email} and works for ${INVITE_DAYS} days.`,
    howTo: `Join to review projects and leave comments with ${workspace}.`,
    footer: `You got this email because someone at ${workspace} invited this address to Squint.`,
  } satisfies MemberInviteCopy;
}

export function memberInviteText(details: MemberInviteDetails): string {
  const copy = memberInviteCopy(details);
  return [
    copy.greeting,
    "",
    `${copy.headline}.`,
    "",
    `${copy.button}: ${details.link}`,
    "",
    copy.note,
    copy.howTo,
    "",
    "-- ",
    copy.footer,
  ].join("\n");
}

export function memberInviteHtml(details: MemberInviteDetails, brand: EmailBrand = NO_BRAND) {
  const copy = memberInviteCopy(details);
  const accent = emailAccent(brand.color);
  return `<div style="max-width:560px;margin:0 auto;padding:24px">
${brandHeader(details.workspace, brand.iconUrl)}
${paragraph(copy.greeting)}
${headline(copy.headline)}
${button(details.link, copy.button, accent)}
${paragraph(copy.note)}
${paragraph(copy.howTo)}
${fallbackLink(details.link, accent)}
${footerNote(copy.footer)}
</div>`;
}

export function memberInviteEmail(details: MemberInviteDetails, brand: EmailBrand = NO_BRAND) {
  return {
    subject: oneLine(memberInviteCopy(details).subject),
    text: memberInviteText(details),
    html: memberInviteHtml(details, brand),
  };
}

/** Resend refused the invites: its error code and redacted reason, safe for the logs. */
export class MemberInviteEmailRefused extends EmailRefused {
  override name = "MemberInviteEmailRefused";
}

/** The invites one request sends, from one workspace. */
export interface MemberInviteBatch {
  /** The workspace's From header; null keeps `EMAIL_FROM`. */
  from: string | null;
  brand: EmailBrand;
  invites: readonly MemberInviteDetails[];
}

export type SendMemberInvites = (batch: MemberInviteBatch) => Promise<void>;

/**
 * Sends one email per invite, all in one Resend request (all or none), so a
 * burst never meets Resend's per-second limit. Skips like every Squint email
 * without `RESEND_API_KEY` or `EMAIL_FROM`.
 */
export function memberInviteEmailSender(env: EmailEnv = process.env): SendMemberInvites {
  const send = resendBatchSender("squint members: invite email", MemberInviteEmailRefused, env);
  return ({ from, brand, invites }) =>
    send(
      invites.map((details): OutgoingEmail => ({
        to: details.email,
        ...memberInviteEmail(details, brand),
        ...(from ? { from } : {}),
      })),
    );
}
