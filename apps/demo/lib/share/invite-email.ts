import { contrast } from "../color";
import {
  EmailRefused,
  escapeHtml,
  resendBatchSender,
  type EmailEnv,
  type OutgoingEmail,
} from "../email/resend";
import { inviteCopy, type InviteDetails } from "./invite-copy";

/**
 * The invitation email a workspace sends from the Share window: from the
 * workspace's sender ("{Name} via Squint", `from-header.ts`), no Reply-To,
 * the copy in `invite-copy.ts`, and an Open review button. The HTML carries
 * the company's look: its icon and name on top, its color on the button. Text
 * and HTML say the same; every value in the HTML is escaped. Never the password.
 */

/** How the email shows the company. */
export interface InviteBrand {
  /** The company's icon (logo or monogram, `brandIconPath`), absolute; null: the name alone. */
  iconUrl: string | null;
  /** `#rrggbb`, for the button and the link; null keeps Squint's blue. */
  color: string | null;
}

const NO_BRAND: InviteBrand = { iconUrl: null, color: null };

export interface InviteEmail {
  subject: string;
  text: string;
  html: string;
}

/** Why it came, for someone who doesn't know Squint. */
function footer(company: string): string {
  return `You got this email because ${company} shared a review with this address on Squint.`;
}

/** A subject can't break its header: line breaks and control characters become spaces. */
function oneLine(value: string): string {
  return value
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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

const INK = "#18181b";
const MUTED = "#62626b";
const BRAND = "#0c54cc";
const FONT = "Helvetica, Arial, sans-serif";
/** WCAG AA for the button's white label, and for the link on white. */
const MIN_TEXT_CONTRAST = 4.5;

/** The company's color for the button and link when white text reads on it, else Squint's blue. */
export function emailAccent(color: string | null): string {
  return color && contrast(color, "#ffffff") >= MIN_TEXT_CONTRAST ? color : BRAND;
}

/** The company's icon beside its name: a table, which every inbox lays out. */
function header(company: string, iconUrl: string | null): string {
  const icon = iconUrl
    ? `<td style="padding:0 12px 0 0;vertical-align:middle"><img src="${escapeHtml(iconUrl)}" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border:0;border-radius:10px"></td>`
    : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px"><tr>${icon}<td style="vertical-align:middle;font:700 16px/1.3 ${FONT};color:${INK}">${escapeHtml(company)}</td></tr></table>`;
}

/** A paragraph in the email's body type. */
const paragraph = (text: string, color = INK) =>
  `<p style="margin:0 0 16px;font:15px/1.5 ${FONT};color:${color}">${escapeHtml(text)}</p>`;

export function inviteEmailHtml(details: InviteDetails, brand: InviteBrand = NO_BRAND): string {
  const copy = inviteCopy(details);
  const accent = emailAccent(brand.color);
  const href = escapeHtml(details.link);
  const notes = [copy.deadline, copy.passwordNote].filter((note): note is string => note !== null);
  return `<div style="max-width:560px;margin:0 auto;padding:24px">
${header(details.company, brand.iconUrl)}
${paragraph(copy.greeting)}
<h1 style="margin:0 0 24px;font:700 22px/1.3 ${FONT};color:${INK}">${escapeHtml(copy.headline)}</h1>
<p style="margin:0 0 24px"><a href="${href}" style="display:inline-block;padding:12px 24px;border-radius:999px;background:${accent};color:#ffffff;font:600 15px/1.2 ${FONT};text-decoration:none">Open review</a></p>
${notes.map((note) => paragraph(note)).join("\n")}
${paragraph(copy.howTo)}
<p style="margin:24px 0 0;font:13px/1.4 ${FONT};color:${MUTED}">If the button doesn't work, paste this link into your browser: <a href="${href}" style="color:${accent}">${href}</a></p>
<p style="margin:16px 0 0;font:13px/1.4 ${FONT};color:${MUTED}">${escapeHtml(footer(details.company))}</p>
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
