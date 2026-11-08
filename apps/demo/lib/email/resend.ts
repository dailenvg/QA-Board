import { Resend } from "resend";
import { LoggableError } from "../auth/http";

/**
 * Sending email through Resend, for the account emails (password resets,
 * email changes). They go from `EMAIL_FROM` as it is, so their sender stays
 * Squint; a workspace's emails use `from-header.ts` instead.
 */

/** Reads RESEND_API_KEY and EMAIL_FROM. */
export type EmailEnv = Readonly<Record<string, string | undefined>>;

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type SendEmail = (email: OutgoingEmail) => Promise<void>;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Resend's reason with links and addresses blanked, since it can quote the recipient. */
export function redactResendMessage(message: string): string {
  return message
    .replace(/https?:\/\/\S+/g, "[link]")
    .replace(/\S+@\S+/g, "[address]")
    .slice(0, 200);
}

/** Resend refused to send: its error code and redacted reason, safe for the logs. */
export class EmailRefused extends LoggableError {
  override name = "EmailRefused";
  constructor(code: string, message: string) {
    super(`${code} ${redactResendMessage(message)}`);
  }
}

/**
 * Sends through Resend from `EMAIL_FROM`; a refusal throws `Refused`. Without
 * `RESEND_API_KEY` or `EMAIL_FROM` (local development) it sends nothing and
 * logs that `label` was skipped, never the address, link or token.
 */
export function resendSender(
  label: string,
  Refused: new (code: string, message: string) => EmailRefused,
  env: EmailEnv = process.env,
): SendEmail {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (!key || !from) {
    return () => {
      console.warn(`squint auth: ${label} skipped (RESEND_API_KEY or EMAIL_FROM not set)`);
      return Promise.resolve();
    };
  }
  const resend = new Resend(key);
  return async ({ to, subject, text, html }) => {
    const { error } = await resend.emails.send({ from, to, subject, text, html });
    if (error) throw new Refused(error.name, error.message);
  };
}
