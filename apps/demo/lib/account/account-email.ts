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

/** What the deletion notice says: when the account goes for good, and the workspace with it. */
export interface DeletionNotice {
  to: string;
  /** When it's deleted for good (epoch ms). */
  deleteAfter: number;
  /** The workspace deleted with it; null for a member's account. */
  workspaceName: string | null;
}

export type SendDeletionNotice = (notice: DeletionNotice) => Promise<void>;

const DELETION_SUBJECT = "Your Squint account is scheduled for deletion";

/** "December 2, 2026": the day in UTC, which is when the cron runs. */
const deletionDate = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

/** The notice's lines, one paragraph each. No link: nothing in it to act on. */
export function deletionNoticeLines({ deleteAfter, workspaceName }: DeletionNotice): string[] {
  const date = deletionDate.format(deleteAfter);
  return [
    "Your Squint account is scheduled for deletion, and you've been signed out everywhere.",
    ...(workspaceName === null
      ? []
      : [`The ${workspaceName} workspace, with its projects and review links, goes with it.`]),
    `Your account will be deleted for good on ${date} (UTC). Until then, your Squint admin can restore it.`,
    "If this wasn't you, contact your Squint admin.",
  ];
}

/** Tells the account's address it's going, and until when it can come back. */
export function deletionNoticeSender(env: EmailEnv = process.env): SendDeletionNotice {
  const send = resendSender("squint account: deletion notice", AccountEmailRefused, env);
  return (notice) => {
    const lines = deletionNoticeLines(notice);
    return send({
      to: notice.to,
      subject: DELETION_SUBJECT,
      text: lines.join("\n\n"),
      html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n"),
    });
  };
}
