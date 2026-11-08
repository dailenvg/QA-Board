import { describe, expect, it } from "vitest";
import { insertUser, NOW } from "@/test/accounts-fixture";
import { migratedPglite } from "@/test/pglite";
import { createSession, readSession } from "../auth/sessions";
import type { Database } from "../db/database";
import { requestEmailChange } from "./email-change";
import { EMAIL_CHANGED_HREF } from "../routes";
import { handleEmailChangeConfirm } from "./email-change-confirm-handler";

const ORIGIN = "http://127.0.0.1:3100";
const PATH = "/api/auth/email-change/confirm";

interface Setup {
  db: Database;
  userId: string;
  token: string;
  notices: string[];
  tasks: Array<() => Promise<void>>;
  deps: Parameters<typeof handleEmailChangeConfirm>[1];
}

async function setup(): Promise<Setup> {
  const db = await migratedPglite();
  const userId = await insertUser(db, "ana@acme.test");
  let link = "";
  const result = await requestEmailChange(db, userId, "new@acme.test", {
    now: NOW,
    origin: new URL("https://squint.test"),
    send: (email) => {
      link = email.link;
      return Promise.resolve();
    },
  });
  if (result.ok) await result.deliver();
  const notices: string[] = [];
  const tasks: Array<() => Promise<void>> = [];
  return {
    db,
    userId,
    token: link.split("/email-change/")[1] ?? "",
    notices,
    tasks,
    deps: {
      db: Promise.resolve(db),
      now: NOW + 1000,
      sendNotice: (to) => {
        notices.push(to);
        return Promise.resolve();
      },
      defer: (task) => {
        tasks.push(task);
      },
    },
  };
}

function jsonPost(body: unknown, origin = ORIGIN) {
  return new Request(`${ORIGIN}${PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, host: "127.0.0.1:3100" },
    body: JSON.stringify(body),
  });
}

function formPost(token: string) {
  return new Request(`${ORIGIN}${PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: ORIGIN,
      host: "127.0.0.1:3100",
    },
    body: new URLSearchParams({ token }).toString(),
  });
}

describe("confirming an email change from its link", () => {
  it("changes the address, clears the cookie, and mails the old address after the response", async () => {
    const { db, userId, token, notices, tasks, deps } = await setup();
    const response = await handleEmailChangeConfirm(jsonPost({ token }), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toMatch(/^squint_session=;.*Max-Age=0/i);
    expect(notices).toEqual([]);
    await Promise.all(tasks.map((task) => task()));
    expect(notices).toEqual(["ana@acme.test"]);
    const { rows } = await db.query("SELECT email FROM users WHERE id = $1", [userId]);
    expect(rows).toEqual([{ email: "new@acme.test" }]);
  });

  it("answers a used link 410 and a taken address 409, mailing nobody", async () => {
    const first = await setup();
    await handleEmailChangeConfirm(jsonPost({ token: first.token }), first.deps);
    const again = await handleEmailChangeConfirm(jsonPost({ token: first.token }), first.deps);
    expect(again.status).toBe(410);
    expect(await again.json()).toEqual({ error: "expired" });

    const raced = await setup();
    await insertUser(raced.db, "new@acme.test");
    const taken = await handleEmailChangeConfirm(jsonPost({ token: raced.token }), raced.deps);
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: "taken" });
    await Promise.all(raced.tasks.map((task) => task()));
    expect(raced.notices).toEqual([]);
  });

  it("refuses another site, a malformed token, and a missing database", async () => {
    const { token, deps } = await setup();
    const crossSite = await handleEmailChangeConfirm(
      jsonPost({ token }, "https://evil.test"),
      deps,
    );
    expect(crossSite.status).toBe(403);
    const malformed = await handleEmailChangeConfirm(jsonPost({ token: "nope" }), deps);
    expect(malformed.status).toBe(400);
    const offline = await handleEmailChangeConfirm(jsonPost({ token }), { ...deps, db: null });
    expect(offline.status).toBe(503);
  });

  it("answers a form posted before hydration with a 303, never ending a session it shouldn't", async () => {
    const { db, userId, token, deps } = await setup();
    const session = await createSession(db, userId, NOW);
    const done = await handleEmailChangeConfirm(formPost(token), deps);
    expect(done.status).toBe(303);
    expect(done.headers.get("location")).toBe(EMAIL_CHANGED_HREF);
    expect(await readSession(db, session, NOW + 1000)).toBeNull();
    const spent = await handleEmailChangeConfirm(formPost(token), deps);
    expect(spent.headers.get("location")).toBe(`/email-change/${token}`);
    const bad = await handleEmailChangeConfirm(formPost("nope"), deps);
    expect(bad.headers.get("location")).toBe("/login");

    const raced = await setup();
    await insertUser(raced.db, "new@acme.test");
    const taken = await handleEmailChangeConfirm(formPost(raced.token), raced.deps);
    expect(taken.headers.get("location")).toBe(`/email-change/${raced.token}?error=taken`);
  });
});
