import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { IMAGE_UPLOAD_RATE_LIMIT } from "../account/image-upload";
import { MAX_EMAIL_CHANGES_PER_HOUR } from "../account/email-change";
import { MAX_RESETS_PER_HOUR } from "../auth/password-reset";
import { LOGIN_WINDOW_MS, MAX_FAILURES_PER_EMAIL, MAX_FAILURES_PER_IP } from "../auth/rate-limit";
import { RESET_REQUEST_RATE_LIMIT } from "../auth/reset-request-handler";
import { CAPTURE_RATE_LIMIT } from "../capture/http";
import { CLICKUP_CONNECT_RATE_LIMIT } from "../integrations/clickup/connect";
import { CLICKUP_READ_RATE_LIMIT, CLICKUP_SEND_RATE_LIMIT } from "../integrations/clickup/send";
import { PINPOINT_RATE_LIMIT_DEFAULT } from "../pinpoint-rate-limit";
import { SHARE_RATE_LIMITS } from "../share/http";
import { MAX_INVITES_PER_MEMBER, MAX_INVITES_PER_WORKSPACE } from "../share/invite-limits";
import { MAX_FAILURES_PER_ADDRESS, MAX_FAILURES_PER_LINK } from "../share/password-attempts";
import { INVITE_EMAIL_WINDOW_MS, MAX_INVITE_EMAILS } from "../workspace/members/invite-sends";
import { rateLimits } from "./rate-limits";

const APP = join(import.meta.dirname, "../..");

/** The app's own source files (no tests, nothing installed or built). */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (["node_modules", "e2e", "test", "public"].includes(name) || name.startsWith(".")) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Each `createRateLimiter(…)` call's arguments, up to its closing parenthesis. */
function limiterCalls(source: string): string[] {
  const calls: string[] = [];
  for (
    let at = source.indexOf("createRateLimiter(");
    at >= 0;
    at = source.indexOf("createRateLimiter(", at + 1)
  ) {
    let depth = 0;
    let end = at + "createRateLimiter".length;
    do {
      if (source[end] === "(") depth += 1;
      if (source[end] === ")") depth -= 1;
      end += 1;
    } while (depth > 0 && end < source.length);
    calls.push(source.slice(at, end));
  }
  return calls;
}

describe("rateLimits", () => {
  it("names every limit once, from the constants the limits use", () => {
    const limits = rateLimits({});
    const byId = Object.fromEntries(limits.map((entry) => [entry.id, entry]));
    expect(Object.keys(byId)).toHaveLength(limits.length);
    expect(byId.signInEmail).toMatchObject({
      backend: "postgres",
      limit: MAX_FAILURES_PER_EMAIL,
      windowMs: LOGIN_WINDOW_MS,
    });
    expect(byId.signInAddress).toMatchObject({ limit: MAX_FAILURES_PER_IP });
    expect(byId.resetEmails).toMatchObject({ limit: MAX_RESETS_PER_HOUR });
    expect(byId.emailChanges).toMatchObject({ limit: MAX_EMAIL_CHANGES_PER_HOUR });
    expect(byId.linkPasswordLink).toMatchObject({ limit: MAX_FAILURES_PER_LINK });
    expect(byId.linkPasswordAddress).toMatchObject({ limit: MAX_FAILURES_PER_ADDRESS });
    expect(byId.linkInvitesWorkspace).toMatchObject({ limit: MAX_INVITES_PER_WORKSPACE });
    expect(byId.linkInvitesMember).toMatchObject({ limit: MAX_INVITES_PER_MEMBER });
    expect(byId.memberInvites).toMatchObject({
      limit: MAX_INVITE_EMAILS,
      windowMs: INVITE_EMAIL_WINDOW_MS,
    });
    const memory: Array<[string, { limit: number; windowMs: number }]> = [
      ["resetRequests", RESET_REQUEST_RATE_LIMIT],
      ["imageUploads", IMAGE_UPLOAD_RATE_LIMIT],
      ["capture", CAPTURE_RATE_LIMIT],
      ["clickUpConnect", CLICKUP_CONNECT_RATE_LIMIT],
      ["clickUpSend", CLICKUP_SEND_RATE_LIMIT],
      ["clickUpRead", CLICKUP_READ_RATE_LIMIT],
      ["pinpoint", PINPOINT_RATE_LIMIT_DEFAULT],
      ["join", SHARE_RATE_LIMITS.join],
      ["shareCreate", SHARE_RATE_LIMITS.create],
      ["clientUnlock", SHARE_RATE_LIMITS.clientUnlock],
    ];
    for (const [id, config] of memory) {
      expect(byId[id]).toEqual({ id, per: byId[id]?.per, backend: "memory", ...config });
    }
  });

  it("lists every share limit", () => {
    const shareLimits = rateLimits({}).filter(
      (entry) =>
        Object.values(SHARE_RATE_LIMITS).some(
          (config) => config.limit === entry.limit && config.windowMs === entry.windowMs,
        ) &&
        entry.per === "address" &&
        entry.backend === "memory",
    );
    expect(shareLimits.length).toBeGreaterThanOrEqual(Object.keys(SHARE_RATE_LIMITS).length);
  });

  it("shows the pinpoint widget's limit as PINPOINT_RATE_LIMIT sets it", () => {
    const pinpoint = rateLimits({ PINPOINT_RATE_LIMIT: "250" }).find(
      (entry) => entry.id === "pinpoint",
    );
    expect(pinpoint).toMatchObject({ limit: 250, windowMs: 60_000 });
  });

  it("can't miss a limiter: none is made from numbers written at its call", () => {
    const inline = sourceFiles(APP)
      .filter((path) => !path.endsWith(join("lib", "capture", "rate-limit.ts")))
      .flatMap((path) =>
        limiterCalls(readFileSync(path, "utf8"))
          .filter((call) => /\d/.test(call))
          .map((call) => `${relative(APP, path)}: ${call}`),
      );
    expect(inline).toEqual([]);
  });
});
