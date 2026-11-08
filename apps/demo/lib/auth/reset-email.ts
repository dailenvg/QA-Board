import { EmailRefused, escapeHtml, resendSender, type EmailEnv } from "../email/resend";
import type { SendResetEmail } from "./password-reset";

const SUBJECT = "Reset your Squint password";

export function resetEmailText(link: string): string {
  return [
    "Someone asked to reset the password of your Squint account.",
    "",
    `Choose a new password here (the link works once, for one hour):`,
    link,
    "",
    "If it wasn't you, ignore this email. Your password stays as it is.",
  ].join("\n");
}

export function resetEmailHtml(link: string): string {
  const href = escapeHtml(link);
  return `<p>Someone asked to reset the password of your Squint account.</p>
<p><a href="${href}">Choose a new password</a>. The link works once, for one hour.</p>
<p>If it wasn't you, ignore this email. Your password stays as it is.</p>`;
}

/** Resend refused a reset email: its error code and redacted reason, safe for the logs. */
export class ResetEmailRefused extends EmailRefused {
  override name = "ResetEmailRefused";
}

/**
 * Sends reset emails through Resend (`lib/email/resend.ts`). Without
 * `RESEND_API_KEY` or `EMAIL_FROM` (local development) it sends nothing and
 * logs that it skipped, never the address, link or token.
 */
export function resetEmailSender(env: EmailEnv = process.env): SendResetEmail {
  const send = resendSender("reset email", ResetEmailRefused, env);
  return ({ to, link }) =>
    send({ to, subject: SUBJECT, text: resetEmailText(link), html: resetEmailHtml(link) });
}
