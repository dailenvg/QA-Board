import { describe, expect, it } from "vitest";
import { insertUser, NOW, PASSWORD } from "@/test/accounts-fixture";
import { migratedPglite } from "@/test/pglite";
import { completePasswordReset, requestPasswordReset } from "../auth/password-reset";
import { createSession } from "../auth/sessions";
import type { Database } from "../db/database";
import { MAX_EMAIL_CHANGES_PER_HOUR, requestEmailChange } from "./email-change";
import { handleEmailChangeConfirm } from "./email-change-confirm-handler";
import { logOutEverywhere } from "./log-out-everywhere";
import { changePassword } from "./password-change";

/**
 * Someone who knows the password asks to move the account to their own
 * address. Whatever the owner then does to secure it (a new password, a reset,
 * logging out everywhere) must use that pending link up: confirming it after
 * answers 410, as a used link does, and the address stays.
 */

const EMAIL = "ana@acme.test";
const ORIGIN = new URL("https://squint.test");
const LATER = NOW + 60_000;

interface Setup {
  db: Database;
  userId: string;
  /** The attacker's pending link, asked for before the owner acts. */
  token: string;
}

async function setup(): Promise<Setup> {
  const db = await migratedPglite();
  const userId = await insertUser(db, EMAIL);
  let link = "";
  const result = await requestEmailChange(db, userId, "attacker@evil.test", {
    now: NOW,
    origin: ORIGIN,
    send: (email) => {
      link = email.link;
      return Promise.resolve();
    },
  });
  if (result.ok) await result.deliver();
  return { db, userId, token: link.split("/email-change/")[1] ?? "" };
}

/** Posts the link's confirm as the attacker would, from their own browser. */
function confirm(db: Database, token: string): Promise<Response> {
  return handleEmailChangeConfirm(
    new Request("http://127.0.0.1:3100/api/auth/email-change/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }),
    {
      db: Promise.resolve(db),
      now: LATER + 1000,
      sendNotice: () => Promise.resolve(),
      defer: () => undefined,
    },
  );
}

async function expectLinkSpent({ db, userId, token }: Setup): Promise<void> {
  const response = await confirm(db, token);
  expect(response.status).toBe(410);
  expect(await response.json()).toEqual({ error: "expired" });
  const { rows } = await db.query("SELECT email FROM users WHERE id = $1", [userId]);
  expect(rows).toEqual([{ email: EMAIL }]);
}

describe("securing the account uses up pending email changes", () => {
  it("a password change from the account settings", async () => {
    const seeded = await setup();
    const user = { id: seeded.userId, email: EMAIL, name: null, role: "company" as const };
    const result = await changePassword(
      seeded.db,
      user,
      { currentPassword: PASSWORD, newPassword: "a brand new password", ip: "203.0.113.1" },
      LATER,
    );
    expect(result.ok).toBe(true);
    await expectLinkSpent(seeded);
  });

  it("a password reset from an emailed link", async () => {
    const seeded = await setup();
    let resetLink = "";
    await requestPasswordReset(seeded.db, EMAIL, {
      now: LATER,
      origin: ORIGIN,
      send: (email) => {
        resetLink = email.link;
        return Promise.resolve();
      },
    });
    const resetToken = resetLink.split("/reset/")[1] ?? "";
    expect(await completePasswordReset(seeded.db, resetToken, "a brand new password", LATER)).toBe(
      true,
    );
    await expectLinkSpent(seeded);
  });

  it("log out everywhere", async () => {
    const seeded = await setup();
    await createSession(seeded.db, seeded.userId, NOW);
    await logOutEverywhere(seeded.db, seeded.userId, LATER);
    await expectLinkSpent(seeded);
    const { rows } = await seeded.db.query("SELECT 1 FROM sessions");
    expect(rows).toEqual([]);
  });

  it("still counts the used-up links toward the hourly cap", async () => {
    const { db, userId } = await setup();
    await logOutEverywhere(db, userId, LATER);
    const ask = (email: string) =>
      requestEmailChange(db, userId, email, {
        now: LATER,
        origin: ORIGIN,
        send: () => Promise.resolve(),
      });
    for (let index = 1; index < MAX_EMAIL_CHANGES_PER_HOUR; index += 1) {
      expect((await ask(`new${index}@acme.test`)).ok).toBe(true);
    }
    expect(await ask("one-too-many@acme.test")).toEqual({ ok: false, reason: "rate-limited" });
  });
});
