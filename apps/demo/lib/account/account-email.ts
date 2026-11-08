import { EmailRefused, escapeHtml, resendSender, type EmailEnv } from "../email/resend";
import type { SendEmailChangedNotice, SendEmailChangeLink } from "./email-change";

const LINK_SUBJECT = "Confirm your new Squint email";
const NOTICE_SUBJECT = "Your Squint email changed";

export function emailChangeLinkText(link: string): string {
  return [
    "Someone asked to change a Squint account's email to this address.",
    "",
    "Confirm the change here (the link works once, for one hour):",
    link,
    "",
    "If it wasn't you, ignore this email. Nothing changes until the link is used.",
  ].join("\n");
}

export function emailChangeLinkHtml(link: string): string {
  const href = escapeHtml(link);
  return `<p>Someone asked to change a Squint account's email to this address.</p>
<p><a href="${href}">Confirm the change</a>. The link works once, for one hour.</p>
<p>If it wasn't you, ignore this email. Nothing changes until the link is used.</p>`;
}

export const EMAIL_CHANGED_NOTICE =
  "Your Squint email changed. If this wasn't you, contact your Squint administrator.";

/** Resend refused an account email: its error code and redacted reason, safe for the logs. */
export class AccountEmailRefused extends EmailRefused {
  override name = "AccountEmailRefused";
}

/** Mails an email change link to the new address (see `resendSender` for local development). */
export function emailChangeLinkSender(env: EmailEnv = process.env): SendEmailChangeLink {
  const send = resendSender("squint account: email change link", AccountEmailRefused, env);
  return ({ to, link }) =>
    send({
      to,
      subject: LINK_SUBJECT,
      text: emailChangeLinkText(link),
      html: emailChangeLinkHtml(link),
    });
}

/** Tells the old address the account moved. No link: nothing in it to act on. */
export function emailChangedNoticeSender(env: EmailEnv = process.env): SendEmailChangedNotice {
  const send = resendSender("squint account: email changed notice", AccountEmailRefused, env);
  return (to) =>
    send({
      to,
      subject: NOTICE_SUBJECT,
      text: EMAIL_CHANGED_NOTICE,
      html: `<p>${escapeHtml(EMAIL_CHANGED_NOTICE)}</p>`,
    });
}
