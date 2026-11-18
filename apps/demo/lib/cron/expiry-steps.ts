/**
 * The daily cleanup's steps (`run-expiry.ts`), in the order its answer lists
 * them. Client-safe: the admin panel names them in plain words.
 */
export const EXPIRY_STEPS = [
  "shares",
  "blobs",
  "passwordAttempts",
  "inviteSends",
  "memberInvites",
  "memberInviteSends",
  "trash",
  "archived",
  "accounts",
  "workspaceBlobs",
  "pins",
] as const;

export type ExpiryStep = (typeof EXPIRY_STEPS)[number];

export function isExpiryStep(value: unknown): value is ExpiryStep {
  return (EXPIRY_STEPS as readonly unknown[]).includes(value);
}

/**
 * What a run answers, and what its record keeps: each step's count (null
 * when skipped or failed), `done` (false when the time budget ran out or a
 * step failed; the next run carries on) and whether each step failed.
 */
export type ExpiryReport = Record<ExpiryStep, number | null> & {
  done: boolean;
  failed: Record<ExpiryStep, boolean>;
};

/** Who started a run: Vercel Cron on its schedule, or the Squint admin from the Storage page. */
export type CronTrigger = "schedule" | "admin";
