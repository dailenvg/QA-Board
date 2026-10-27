import type { Octokit, RestEndpointMethodTypes } from "@octokit/rest";
import { isRateLimited, statusOf } from "../lib/errors";
import type { ExpireResult, ScreenshotStore } from "../storage";
import type { Pin } from "../types";
import { decodePinComment } from "./codec";
import type { RepoRef } from "./repo";
import { ISSUE_TITLE_PREFIX } from "./targets";

export interface PinExpiryContext {
  octokit: Octokit;
  ref: RepoRef;
  /** The trusted login: only its pin comments and fallback issues are ever touched. */
  author: string;
  screenshots: ScreenshotStore | null;
  now: () => number;
  /** Waits between writes (deletes, closes): GitHub asks bulk mutations to go one a second. */
  pause: () => Promise<void>;
  /** Called for each branch that lost a pin, so cached reads drop it. */
  forget: (branch: string) => void;
}

interface ExpiredPin {
  pin: Pin;
  commentId: number;
}

/** One of pinpoint's `[pinpoint] <branch>` issues. */
interface FallbackIssue {
  number: number;
  state: string;
  created_at: string;
}

type ThreadComment = RestEndpointMethodTypes["issues"]["listComments"]["response"]["data"][number];

const PAGE_SIZE = 100;
/** Pins taken on per run: about as many as one run deletes at a write a second. */
export const MAX_PINS_PER_RUN = 100;
/** GitHub's search answers at most this many results per query. */
const SEARCH_RESULT_LIMIT = 1_000;
/**
 * A pin's comment is posted a moment after its `createdAt`, on a thread that
 * already existed. A thread created this much later than the cutoff can't
 * hold an expired pin.
 */
const CLOCK_MARGIN_MS = 24 * 60 * 60 * 1000;

/** The pin in a comment, when it's pinpoint's own (by `author`, in its codec). */
function ownPin(ctx: PinExpiryContext, comment: ThreadComment): Pin | null {
  return comment.user?.login === ctx.author ? decodePinComment(comment.body ?? "") : null;
}

function threadComments(ctx: PinExpiryContext, issueNumber: number): Promise<ThreadComment[]> {
  return ctx.octokit.paginate(ctx.octokit.rest.issues.listComments, {
    ...ctx.ref,
    issue_number: issueNumber,
    per_page: PAGE_SIZE,
  });
}

/** Pinpoint's `[pinpoint] <branch>` issues, open or closed, oldest first. */
async function fallbackIssues(ctx: PinExpiryContext): Promise<FallbackIssue[]> {
  const issues = await ctx.octokit.paginate(ctx.octokit.rest.issues.listForRepo, {
    ...ctx.ref,
    state: "all",
    creator: ctx.author,
    per_page: PAGE_SIZE,
  });
  return issues
    .filter((issue) => !issue.pull_request && issue.title.startsWith(ISSUE_TITLE_PREFIX))
    .sort((a, b) => a.number - b.number);
}

/** How search names the author: a GitHub App's `<slug>[bot]` is `app/<slug>` there. */
function searchLogin(author: string): string {
  const app = /^(.+)\[bot\]$/.exec(author);
  return app ? `app/${app[1]}` : author;
}

/**
 * One page of the pull requests, open or closed, that `author` commented on
 * and that were created by the day of `latest`, oldest first. Search only
 * picks where to look: every comment is still checked by its login and codec.
 * `last` is true on the final page; `complete` is false when GitHub says the
 * results are partial, or there are more than search can return.
 */
async function searchPulls(ctx: PinExpiryContext, latest: number, page: number) {
  const { owner, repo } = ctx.ref;
  const day = new Date(latest).toISOString().slice(0, 10);
  const { data } = await ctx.octokit.rest.search.issuesAndPullRequests({
    q: `repo:${owner}/${repo} is:pr commenter:${searchLogin(ctx.author)} created:<=${day}`,
    sort: "created",
    order: "asc",
    per_page: PAGE_SIZE,
    page,
  });
  const seen = page * PAGE_SIZE;
  return {
    numbers: data.items.map((item) => item.number),
    last: data.items.length < PAGE_SIZE || seen >= data.total_count || seen >= SEARCH_RESULT_LIMIT,
    complete: !data.incomplete_results && data.total_count <= SEARCH_RESULT_LIMIT,
  };
}

/**
 * Pinpoint's own pin comments (by `author`, in its codec) for pins created at
 * or before `cutoff`. Only pinpoint's surfaces are read: its fallback issues,
 * then the pull requests search finds it commented on, oldest first, each
 * thread's comments in full. `complete` is false when the deadline, the
 * per-run cap or a partial search stopped it early.
 */
async function findExpired(
  ctx: PinExpiryContext,
  issues: readonly FallbackIssue[],
  cutoff: number,
  deadline: number,
): Promise<{ found: ExpiredPin[]; complete: boolean }> {
  const latest = cutoff + CLOCK_MARGIN_MS;
  const found: ExpiredPin[] = [];
  /** Takes the thread's expired pins; false once the run has to stop. */
  const scan = async (issueNumber: number): Promise<boolean> => {
    if (ctx.now() >= deadline) return false;
    for (const comment of await threadComments(ctx, issueNumber)) {
      const pin = ownPin(ctx, comment);
      if (pin && Date.parse(pin.createdAt) <= cutoff) found.push({ pin, commentId: comment.id });
    }
    return found.length < MAX_PINS_PER_RUN;
  };
  const stopped = () => ({ found: found.slice(0, MAX_PINS_PER_RUN), complete: false });

  for (const issue of issues) {
    if (Date.parse(issue.created_at) > latest) continue;
    if (!(await scan(issue.number))) return stopped();
  }
  let complete = true;
  for (let page = 1; ; page += 1) {
    if (ctx.now() >= deadline) return stopped();
    const result = await searchPulls(ctx, latest, page);
    complete &&= result.complete;
    for (const number of result.numbers) {
      if (!(await scan(number))) return stopped();
    }
    if (result.last) return { found, complete };
  }
}

/** Deletes one comment; false when it was already gone. */
async function deleteComment(ctx: PinExpiryContext, commentId: number): Promise<boolean> {
  try {
    await ctx.octokit.rest.issues.deleteComment({ ...ctx.ref, comment_id: commentId });
    return true;
  } catch (error) {
    if (statusOf(error) === 404) return false;
    throw error;
  }
}

/**
 * Deletes the pins' screenshots (one commit), then their comments one by one
 * until `deadline`. Screenshots go first: a comment left by the deadline is
 * found and deleted next run, while a file left without its comment would be
 * found by nothing.
 */
async function deletePins(
  ctx: PinExpiryContext,
  pins: readonly ExpiredPin[],
  deadline: number,
  progress: { expired: number },
): Promise<boolean> {
  const screenshots = pins.flatMap(({ pin: { branch, id, screenshotUrl } }) =>
    branch !== null && screenshotUrl ? [{ branch, pinId: id, url: screenshotUrl }] : [],
  );
  if (screenshots.length > 0 && ctx.screenshots?.remove) {
    await ctx.screenshots.remove(screenshots);
    await ctx.pause();
  }
  for (const { pin, commentId } of pins) {
    if (ctx.now() >= deadline) return false;
    if (await deleteComment(ctx, commentId)) progress.expired += 1;
    if (pin.branch !== null) ctx.forget(pin.branch);
    await ctx.pause();
  }
  return true;
}

/** Whether pinpoint's own pin comments remain on the issue. */
async function hasPins(ctx: PinExpiryContext, issueNumber: number): Promise<boolean> {
  const comments = await threadComments(ctx, issueNumber);
  return comments.some((comment) => ownPin(ctx, comment) !== null);
}

async function setState(ctx: PinExpiryContext, issueNumber: number, state: "open" | "closed") {
  await ctx.octokit.rest.issues.update({ ...ctx.ref, issue_number: issueNumber, state });
  await ctx.pause();
}

/**
 * Closes (never deletes) those of pinpoint's `[pinpoint] <branch>` issues
 * that were open and have no pins left. Only issues at least as old as the
 * cutoff: a younger one may be about to get its first pin. A pin posted while
 * the issue closed would be hidden (only open issues are read), so the issue
 * is checked again after closing and reopened if one arrived. False when the
 * deadline stopped it.
 */
async function closeEmptyIssues(
  ctx: PinExpiryContext,
  issues: readonly FallbackIssue[],
  cutoff: number,
  deadline: number,
): Promise<boolean> {
  const fallbacks = issues.filter(
    (issue) => issue.state === "open" && Date.parse(issue.created_at) <= cutoff,
  );
  for (const issue of fallbacks) {
    if (ctx.now() >= deadline) return false;
    if (await hasPins(ctx, issue.number)) continue;
    await setState(ctx, issue.number, "closed");
    if (await hasPins(ctx, issue.number)) await setState(ctx, issue.number, "open");
  }
  return true;
}

/**
 * Expires pins kept in GitHub: deletes pinpoint's pin comments for pins
 * created at or before `cutoff` with their screenshots, then closes fallback
 * issues left without pins. Comments, issues and files pinpoint didn't make
 * are never touched. Requests go one at a time, writes a pause apart; it stops
 * early at `deadline` or a rate limit (the search API's too), and the next
 * call goes on.
 */
export async function expireGitHubPins(
  ctx: PinExpiryContext,
  cutoff: number,
  deadline: number,
): Promise<ExpireResult> {
  const progress = { expired: 0 };
  try {
    const issues = await fallbackIssues(ctx);
    const { found, complete } = await findExpired(ctx, issues, cutoff, deadline);
    const deleted = await deletePins(ctx, found, deadline, progress);
    const closed = await closeEmptyIssues(ctx, issues, cutoff, deadline);
    return { expired: progress.expired, done: complete && deleted && closed };
  } catch (error) {
    if (!isRateLimited(error)) throw error;
    return { expired: progress.expired, done: false };
  }
}
