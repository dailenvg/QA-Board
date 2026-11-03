import { Resend } from "resend";
import type { SendResetEmail } from "./password-reset";

/** Reads RESEND_API_KEY and EMAIL_FROM. */
type EmailEnv = Readonly<Record<string, string | undefined>>;

const SUBJECT = "Reset your Squint password";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

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

/**
 * Sends reset emails through Resend. Without `RESEND_API_KEY` or `EMAIL_FROM`
 * (local development) it sends nothing and logs that it skipped, never the
 * address, link or token.
 */
export function resetEmailSender(env: EmailEnv = process.env): SendResetEmail {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (!key || !from) {
    return () => {
      console.warn("squint auth: reset email skipped (RESEND_API_KEY or EMAIL_FROM not set)");
      return Promise.resolve();
    };
  }
  const resend = new Resend(key);
  return async ({ to, link }) => {
    const { error } = await resend.emails.send({
      from,
      to,
      subject: SUBJECT,
      text: resetEmailText(link),
      html: resetEmailHtml(link),
    });
    if (error) throw new Error(`Resend refused the reset email (${error.name})`);
  };
}
