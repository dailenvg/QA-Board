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
} from "../email/branded-html";
import {
  EmailRefused,
  resendBatchSender,
  type EmailEnv,
  type OutgoingEmail,
} from "../email/resend";
import { inviteCopy, type InviteDetails } from "./invite-copy";

export { emailAccent };

/**
 * The invitation email a workspace sends from the Share window: from the
 * workspace's sender ("{Name} via Squint", `from-header.ts`), no Reply-To,
 * the copy in `invite-copy.ts`, and an Open review button. The HTML carries
 * the company's look (`branded-html.ts`): its icon and name on top, its color
 * on the button. Text and HTML say the same; every value in the HTML is
 * escaped. Never the password.
 */

/** How the email shows the company. */
export type InviteBrand = EmailBrand;

export interface InviteEmail {
  subject: string;
  text: string;
  html: string;
}

/** Why it came, for someone who doesn't know Squint. */
function footer(company: string): string {
  return `You got this email because ${company} shared a review with this address on Squint.`;
}

export function inviteEmailText(details: InviteDetails): string {
  const copy = inviteCopy(details);
  return [
    copy.greeting,
    "",
    `${copy.headline}.`,
    "",
    `Open review: ${details.link}`,
    "",
    ...(copy.deadline ? [copy.deadline] : []),
    ...(copy.passwordNote ? [copy.passwordNote] : []),
    copy.howTo,
    "",
    "-- ",
    footer(details.company),
  ].join("\n");
}

export function inviteEmailHtml(details: InviteDetails, brand: InviteBrand = NO_BRAND): string {
  const copy = inviteCopy(details);
  const accent = emailAccent(brand.color);
  const notes = [copy.deadline, copy.passwordNote].filter((note): note is string => note !== null);
  return `<div style="max-width:560px;margin:0 auto;padding:24px">
${brandHeader(details.company, brand.iconUrl)}
${paragraph(copy.greeting)}
${headline(copy.headline)}
${button(details.link, "Open review", accent)}
${notes.map((note) => paragraph(note)).join("\n")}
${paragraph(copy.howTo)}
${fallbackLink(details.link, accent)}
${footerNote(footer(details.company))}
</div>`;
}

export function inviteEmail(details: InviteDetails, brand: InviteBrand = NO_BRAND): InviteEmail {
  return {
    subject: oneLine(inviteCopy(details).subject),
    text: inviteEmailText(details),
    html: inviteEmailHtml(details, brand),
  };
}

/** Resend refused the invitations: its error code and redacted reason, safe for the logs. */
export class InviteEmailRefused extends EmailRefused {
  override name = "InviteEmailRefused";
}

/** One invitation, the same for every address, from `from`. */
export interface InviteBatch {
  to: readonly string[];
  /** The workspace's From header; null keeps `EMAIL_FROM`. */
  from: string | null;
  details: InviteDetails;
  brand: InviteBrand;
}

export type SendInvites = (batch: InviteBatch) => Promise<void>;

/**
 * Sends one email per address, all in one Resend request (all or none). Each
 * address gets its own email: nobody sees who else was invited. Skips like
 * every Squint email without `RESEND_API_KEY` or `EMAIL_FROM`.
 */
export function inviteEmailSender(env: EmailEnv = process.env): SendInvites {
  const send = resendBatchSender("squint share: invite email", InviteEmailRefused, env);
  return ({ to, from, details, brand }) => {
    const email = inviteEmail(details, brand);
    const emails: OutgoingEmail[] = to.map((address) => ({
      to: address,
      ...email,
      ...(from ? { from } : {}),
    }));
    return send(emails);
  };
}
