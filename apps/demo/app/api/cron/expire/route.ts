import { tokensMatch, type StorageAdapter } from "@pinpoint/server";
import { database } from "@/lib/db/database";
import { storageFromEnv } from "@/lib/pinpoint-storage";
import { expireShares, sweepOrphanedBlobs } from "@/lib/share/expiry";
import { json } from "@/lib/share/http";
import { pruneInviteSends } from "@/lib/share/invite-limits";
import { prunePasswordAttempts } from "@/lib/share/password-attempts";
import { retentionCutoff } from "@/lib/share/retention";
import { shareServices } from "@/lib/share/server";
import { blobDriverFromEnv } from "@/lib/workspace/blob-driver";
import { purgeDeletedAccounts } from "@/lib/account/account-purge";
import { purgeArchived, purgeTrash, sweepWorkspaceBlobs } from "@/lib/workspace/purge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The work stops starting new deletes at `BUDGET_MS`; the rest is headroom to finish. */
export const maxDuration = 60;

const BUDGET_MS = 45_000;

let pins: StorageAdapter | undefined;

type StepName =
  | "shares"
  | "blobs"
  | "passwordAttempts"
  | "inviteSends"
  | "trash"
  | "archived"
  | "accounts"
  | "workspaceBlobs"
  | "pins";

/** What one step did: how many it deleted (null when skipped or failed), and whether it finished. */
interface StepResult {
  count: number | null;
  done: boolean;
  failed: boolean;
}

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Fails closed:
 * without a secret nothing runs, so the route can't be called unauthenticated.
 */
async function refusal(request: Request): Promise<Response | null> {
  const secret = process.env.CRON_SECRET;
  if (!secret?.trim()) return json({ error: "not-configured" }, 503);
  const presented = request.headers.get("authorization") ?? "";
  const allowed = await tokensMatch(presented, `Bearer ${secret}`);
  return allowed ? null : json({ error: "unauthorized" }, 401);
}

/** The error's kind and HTTP status, never its message: messages can carry URLs or ids. */
function describe(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? `${name} ${status}` : name;
}

/** Runs one step on its own: a failure is logged and reported, and never stops the others. */
async function step(
  name: StepName,
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
 * Workspace projects trashed more than 30 days ago, deleted for good, and
 * archived ones whose deletion date has come; then deleted accounts (and the
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

/**
 * `GET /api/cron/expire`, daily. Independent steps, each with its own error
 * handling: shares past their `expiresAt`, then Blob files a failed delete
 * left behind; wrong review link passwords and invitation sends a day old; workspace projects
 * past their time in the trash or the archive, deleted
 * accounts past theirs, then files nothing records; and, alongside them,
 * pinpoint pins 30 days old (when their storage can expire them). Answers
 * each step's count (null when skipped or failed), `done` (false when the
 * time budget ran out or a step failed; the next run continues) and `failed`
 * per step, with a 500 when any step failed.
 */
export async function GET(request: Request) {
  const refused = await refusal(request);
  if (refused) return refused;
  const now = Date.now();
  const deadline = now + BUDGET_MS;
  const [
    [shares, blobs],
    passwordAttempts,
    inviteSends,
    [trash, archived, accounts, workspaceBlobs],
    pinned,
  ] = await Promise.all([
    shareSteps(now, deadline),
    passwordAttemptSteps(now),
    inviteSendSteps(now),
    workspaceSteps(now, deadline),
    pinSteps(now, deadline),
  ]);
  const steps = {
    shares,
    blobs,
    passwordAttempts,
    inviteSends,
    trash,
    archived,
    accounts,
    workspaceBlobs,
    pins: pinned,
  };
  const report = {
    shares: shares.count,
    blobs: blobs.count,
    passwordAttempts: passwordAttempts.count,
    inviteSends: inviteSends.count,
    trash: trash.count,
    archived: archived.count,
    accounts: accounts.count,
    workspaceBlobs: workspaceBlobs.count,
    pins: pinned.count,
    done: Object.values(steps).every((result) => result.done),
    failed: {
      shares: shares.failed,
      blobs: blobs.failed,
      passwordAttempts: passwordAttempts.failed,
      inviteSends: inviteSends.failed,
      trash: trash.failed,
      archived: archived.failed,
      accounts: accounts.failed,
      workspaceBlobs: workspaceBlobs.failed,
      pins: pinned.failed,
    },
  };
  // eslint-disable-next-line no-console -- counts only (never ids or URLs), for the function logs
  console.info(`squint expiry: ${JSON.stringify(report)}`);
  const anyFailed = Object.values(steps).some((result) => result.failed);
  return json(report, anyFailed ? 500 : 200);
}
