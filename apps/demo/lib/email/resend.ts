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
  /**
   * The From header, such as a workspace's (`from-header.ts`); `EMAIL_FROM`
   * as it is when left out.
   */
  from?: string;
}

export type SendEmail = (email: OutgoingEmail) => Promise<void>;

/** Several emails in one request; Resend sends all of them or none. */
export type SendEmails = (emails: readonly OutgoingEmail[]) => Promise<void>;

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

type Refusal = new (code: string, message: string) => EmailRefused;

/** Resend and the default From, or null without `RESEND_API_KEY` or `EMAIL_FROM`. */
function configured(env: EmailEnv): { resend: Resend; from: string } | null {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  return key && from ? { resend: new Resend(key), from } : null;
}

function skipped(logName: string): Promise<void> {
  console.warn(`${logName} skipped (RESEND_API_KEY or EMAIL_FROM not set)`);
  return Promise.resolve();
}

/**
 * Sends through Resend from `EMAIL_FROM` (or the email's own `from`); a
 * refusal throws `Refused`. Without `RESEND_API_KEY` or `EMAIL_FROM` (local
 * development) it sends nothing and logs "`logName` skipped" (such as "squint
 * auth: reset email skipped"), never the address, link or token.
 */
export function resendSender(
  logName: string,
  Refused: Refusal,
  env: EmailEnv = process.env,
): SendEmail {
  const service = configured(env);
  if (!service) return () => skipped(logName);
  return async ({ to, subject, text, html, from }) => {
    const { error } = await service.resend.emails.send({
      from: from ?? service.from,
      to,
      subject,
      text,
      html,
    });
    if (error) throw new Refused(error.name, error.message);
  };
}

/**
 * Sends up to 100 emails in one Resend request (its batch API), so a burst
 * never meets Resend's per-second limit: all of them go, or a refusal throws
 * `Refused` and none do. Skips like `resendSender` without its variables.
 */
export function resendBatchSender(
  logName: string,
  Refused: Refusal,
  env: EmailEnv = process.env,
): SendEmails {
  const service = configured(env);
  if (!service) return () => skipped(logName);
  return async (emails) => {
    if (emails.length === 0) return;
    const { error } = await service.resend.batch.send(
      emails.map(({ to, subject, text, html, from }) => ({
        from: from ?? service.from,
        to,
        subject,
        text,
        html,
      })),
    );
    if (error) throw new Refused(error.name, error.message);
  };
}
