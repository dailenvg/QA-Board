import type { StorageAdapter } from "@pinpoint/server";
import { purgeDeletedAccounts } from "../account/account-purge";
import { describeError } from "../auth/http";
import { database, type Database } from "../db/database";
import { storageFromEnv } from "../pinpoint-storage";
import { expireShares, sweepOrphanedBlobs } from "../share/expiry";
import { pruneInviteSends } from "../share/invite-limits";
import { prunePasswordAttempts } from "../share/password-attempts";
import { retentionCutoff } from "../share/retention";
import { shareServices } from "../share/server";
import { blobDriverFromEnv } from "../workspace/blob-driver";
import { pruneWorkspaceInviteSends } from "../workspace/members/invite-sends";
import { pruneEndedInvites } from "../workspace/members/prune-invites";
import { purgeArchived, purgeTrash, sweepWorkspaceBlobs } from "../workspace/purge";
import { claimCronRun, finishCronRun } from "./cron-runs";
import {
  EXPIRY_STEPS,
  type CronTrigger,
  type ExpiryReport,
  type ExpiryStep,
} from "./expiry-steps";

/**
 * The work stops starting new deletes at `EXPIRY_BUDGET_MS`; the rest of a
 * function's 60 seconds is headroom to finish.
 */
export const EXPIRY_BUDGET_MS = 45_000;

let pins: StorageAdapter | undefined;

/** What one step did: how many it deleted (null when skipped or failed), and whether it finished. */
interface StepResult {
  count: number | null;
  done: boolean;
  failed: boolean;
}

/** The error's kind and HTTP status, never its message: messages can carry URLs or ids. */
function describe(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? `${name} ${status}` : name;
}

/** Runs one step on its own: a failure is logged and reported, and never stops the others. */
async function step(
  name: ExpiryStep,
  run: () => Promise<{ count: number; done: boolean } | null>,
): Promise<StepResult> {
  try {
    const result = await run();
    return result ? { ...result, failed: false } : { count: null, done: true, failed: false };
  } catch (error) {
    console.error(`squint expiry: ${name} failed (${describe(error)})`);
    return { count: null, done: false, failed: true };
  }
}

async function shareSteps(now: number, deadline: number): Promise<[StepResult, StepResult]> {
  const shares = await step("shares", async () => {
    const { expired, done } = await expireShares(await shareServices(), now, deadline);
    return { count: expired, done };
  });
  const blobs = await step("blobs", async () => {
    const swept = await sweepOrphanedBlobs(await shareServices(), now, deadline);
    return swept && { count: swept.deleted, done: swept.done };
  });
  return [shares, blobs];
}

/** Wrong review link passwords a day old (037). Skipped without a database. */
function passwordAttemptSteps(now: number): Promise<StepResult> {
  return step("passwordAttempts", async () => {
    const pending = database();
    return pending ? { count: await prunePasswordAttempts(await pending, now), done: true } : null;
  });
}

/** Invitation email sends a day old, kept only for their rate limits (038). Skipped without a database. */
function inviteSendSteps(now: number): Promise<StepResult> {
  return step("inviteSends", async () => {
    const pending = database();
    return pending ? { count: await pruneInviteSends(await pending, now), done: true } : null;
  });
}

/**
 * Workspace invites that ended (used, cancelled or expired) more than 30 days
 * ago, so addresses don't linger, and their email sends a day old, kept only
 * for the day's limit (044). Skipped without a database.
 */
function memberInviteSteps(now: number): Promise<[StepResult, StepResult]> {
  const pending = database();
  return Promise.all([
    step("memberInvites", async () =>
      pending ? { count: await pruneEndedInvites(await pending, now), done: true } : null,
    ),
    step("memberInviteSends", async () =>
      pending ? { count: await pruneWorkspaceInviteSends(await pending, now), done: true } : null,
    ),
  ]);
}

/**
 * Workspace projects trashed more than 30 days ago, deleted for good, and
 * archived ones whose deletion date has come, except in a suspended workspace
 * (caught up once it's lifted); then deleted accounts (and the
 * workspaces they owned) whose 30 days are up; then workspace and avatar
 * files nothing records any more, which picks up any file a failed delete
 * left. Skipped without a database.
 */
async function workspaceSteps(
  now: number,
  deadline: number,
): Promise<[StepResult, StepResult, StepResult, StepResult]> {
  const pending = database();
  const purgeServices = async () => ({
    shareBlobs: (await shareServices()).blobs,
    blobs: blobDriverFromEnv(),
  });
  const trash = await step("trash", async () =>
    pending ? purgeTrash(await pending, await purgeServices(), now, deadline) : null,
  );
  const archived = await step("archived", async () =>
    pending ? purgeArchived(await pending, await purgeServices(), now, deadline) : null,
  );
  const accounts = await step("accounts", async () =>
    pending ? purgeDeletedAccounts(await pending, await purgeServices(), now, deadline) : null,
  );
  const files = await step("workspaceBlobs", async () =>
    pending ? sweepWorkspaceBlobs(await pending, blobDriverFromEnv(), now, deadline) : null,
  );
  return [trash, archived, accounts, files];
}

function pinSteps(now: number, deadline: number): Promise<StepResult> {
  return step("pins", async () => {
    pins ??= storageFromEnv().storage;
    const expired = await pins.expire?.(retentionCutoff(now), deadline);
    return expired ? { count: expired.expired, done: expired.done } : null;
  });
}

/** Every step at once (each group in its own order), by name. */
async function runSteps(now: number): Promise<Record<ExpiryStep, StepResult>> {
  const deadline = now + EXPIRY_BUDGET_MS;
  const [
    [shares, blobs],
    passwordAttempts,
    inviteSends,
    [memberInvites, memberInviteSends],
    [trash, archived, accounts, workspaceBlobs],
    pinned,
  ] = await Promise.all([
    shareSteps(now, deadline),
    passwordAttemptSteps(now),
    inviteSendSteps(now),
    memberInviteSteps(now),
    workspaceSteps(now, deadline),
    pinSteps(now, deadline),
  ]);
  return {
    shares,
    blobs,
    passwordAttempts,
    inviteSends,
    memberInvites,
    memberInviteSends,
    trash,
    archived,
    accounts,
    workspaceBlobs,
    pins: pinned,
  };
}

function reportOf(steps: Record<ExpiryStep, StepResult>): ExpiryReport {
  const counts = Object.fromEntries(EXPIRY_STEPS.map((name) => [name, steps[name].count]));
  const failed = Object.fromEntries(EXPIRY_STEPS.map((name) => [name, steps[name].failed]));
  return {
    ...(counts as Record<ExpiryStep, number | null>),
    done: EXPIRY_STEPS.every((name) => steps[name].done),
    failed: failed as Record<ExpiryStep, boolean>,
  };
}

/** Where this run is recorded, or why it isn't. */
type Claim = { kind: "recorded"; db: Database; id: string } | { kind: "running" | "unrecorded" };

/**
 * Claims the run in `cron_runs` (`claimCronRun`). Without a database it runs
 * unrecorded, as it always did; so does it when recording fails (logged by
 * kind): every step stays safe alongside another run, so the record never
 * holds the cleanup back.
 */
async function claim(trigger: CronTrigger, now: number): Promise<Claim> {
  const pending = database();
  if (!pending) return { kind: "unrecorded" };
  try {
    const db = await pending;
    const id = await claimCronRun(db, trigger, now);
    return id === null ? { kind: "running" } : { kind: "recorded", db, id };
  } catch (error) {
    console.error(`squint expiry: claiming the run failed (${describeError(error)})`);
    return { kind: "unrecorded" };
  }
}

async function record(claimed: Claim, report: ExpiryReport): Promise<void> {
  if (claimed.kind !== "recorded") return;
  try {
    await finishCronRun(claimed.db, claimed.id, report, Date.now());
  } catch (error) {
    console.error(`squint expiry: recording the run failed (${describeError(error)})`);
  }
}

/** A run's outcome: refused while another is running, or its report. */
export type ExpiryRun =
  | { running: true }
  | { running: false; report: ExpiryReport; anyFailed: boolean };

/**
 * The daily cleanup, started by `trigger`. Independent steps, each with its
 * own error handling: shares past their `expiresAt`, then Blob files a
 * failed delete left behind; wrong review link passwords and invitation
 * sends a day old; workspace invites that ended 30 days ago and their sends
 * a day old; workspace projects past their time in the trash or the
 * archive, deleted accounts past theirs, then files nothing records; and,
 * alongside them, pinpoint pins 30 days old (when their storage can expire
 * them). Claimed and recorded in `cron_runs` (`claim`); refused, with
 * nothing run, while another run is under way. Logs the counts only, never
 * ids or URLs.
 */
export async function runExpiry({ trigger }: { trigger: CronTrigger }): Promise<ExpiryRun> {
  const now = Date.now();
  const claimed = await claim(trigger, now);
  if (claimed.kind === "running") {
    // eslint-disable-next-line no-console -- no ids, for the function logs
    console.info(`squint expiry: skipped (${trigger}), another run is under way`);
    return { running: true };
  }
  const steps = await runSteps(now);
  const report = reportOf(steps);
  await record(claimed, report);
  // eslint-disable-next-line no-console -- counts only (never ids or URLs), for the function logs
  console.info(`squint expiry: ${JSON.stringify(report)}`);
  return {
    running: false,
    report,
    anyFailed: EXPIRY_STEPS.some((name) => steps[name].failed),
  };
}
