import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as cancelRoute from "@/app/api/account/members/invites/[inviteId]/route";
import * as resendRoute from "@/app/api/account/members/invites/[inviteId]/resend/route";
import * as invitesRoute from "@/app/api/account/members/invites/route";
import * as joinRoute from "@/app/api/auth/join/route";
import type * as DatabaseModule from "@/lib/db/database";
import {
  addMember,
  EMAIL_ON,
  inviteOne,
  membersWorld,
  person,
  SITE,
  type MembersWorld,
  type Person,
} from "@/test/members-fixture";
import { readSession } from "../../auth/sessions";
import { SESSION_COOKIE } from "../../auth/session-cookie";
import type { Database } from "../../db/database";
import { MAX_INVITE_EMAILS } from "./invite-sends";

/**
 * The invite routes and `/api/auth/join` as a browser calls them: the
 * session, the people switch, cross-site posts, bodies and answers. The rules
 * themselves are tested on the functions behind them.
 */

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

// No test reaches Resend: with email on, its batch call is this stub.
const resend = vi.hoisted(() => ({
  batch: vi.fn<(emails: unknown) => Promise<{ error: null }>>(),
}));

vi.mock("resend", () => ({
  Resend: class {
    batch = { send: resend.batch };
  },
}));

const ORIGIN = "http://localhost:3000";
let world: MembersWorld;
let address = 0;

beforeEach(async () => {
  vi.stubEnv("AUTH_SECRET", EMAIL_ON.AUTH_SECRET);
  vi.stubEnv("AUTH_URL", SITE);
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("EMAIL_FROM", "");
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  resend.batch.mockReset();
  resend.batch.mockResolvedValue({ error: null });
  world = await membersWorld();
  holder.db = world.db;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

interface Init {
  cookie?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** The same caller each time (for the rate limit); a new address by default. */
  from?: string;
}

function request(method: string, path: string, init: Init = {}): Request {
  address += 1;
  const form = typeof init.body === "string";
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      host: "localhost:3000",
      origin: ORIGIN,
      "content-type": form ? "application/x-www-form-urlencoded" : "application/json",
      "x-forwarded-for": init.from ?? `198.51.100.${address % 250}`,
      ...(init.cookie ? { cookie: init.cookie } : {}),
      ...init.headers,
    },
    body: form ? (init.body as string) : JSON.stringify(init.body ?? {}),
  });
}

const params = (inviteId: string) => ({ params: Promise.resolve({ inviteId }) });

const inviteAs = (who: Person, emails: string[]) =>
  invitesRoute.POST(
    request("POST", "/api/account/members/invites", { cookie: who.cookie, body: { emails } }),
  );

const cancelAs = (who: Person, id: string) =>
  cancelRoute.DELETE(
    request("DELETE", `/api/account/members/invites/${id}`, { cookie: who.cookie }),
    params(id),
  );

const resendAs = (who: Person, id: string) =>
  resendRoute.POST(
    request("POST", `/api/account/members/invites/${id}/resend`, { cookie: who.cookie }),
    params(id),
  );

const join = (init: Init) => joinRoute.POST(request("POST", "/api/auth/join", init));

/** The invite id in a POST answer's first result. */
async function firstInvite(response: Response): Promise<{ id: string; link: string }> {
  const body = (await response.json()) as {
    results: Array<{ invite?: { id: string; link: string } }>;
  };
  const invite = body.results[0]?.invite;
  if (!invite) throw new Error(JSON.stringify(body));
  return invite;
}

describe("POST /api/account/members/invites", () => {
  it("invites as the owner and answers each address and the seats", async () => {
    const response = await inviteAs(world.owner, ["cleo@x.test", "bad"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      results: [
        {
          email: "cleo@x.test",
          ok: true,
          invite: {
            id: expect.any(String) as unknown,
            link: expect.stringMatching(`^${SITE}/join/`) as unknown,
            expiresAt: expect.any(Number) as unknown,
          },
          emailed: false,
        },
        { email: "bad", ok: false, error: "invalid" },
      ],
      seats: { used: 2, limit: 10 },
    });
  });

  it("lets a member with people invite, and refuses one without it with not-allowed", async () => {
    const manager = await addMember(world.db, world.workspaceId, ["people"]);
    const member = await addMember(world.db, world.workspaceId);
    expect((await inviteAs(manager, ["cleo@x.test"])).status).toBe(200);
    const refused = await inviteAs(member, ["dan@x.test"]);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: "not-allowed", permission: "members.manage" });
  });

  it("refuses signed out, from another site, and with a bad body", async () => {
    expect(
      (
        await invitesRoute.POST(
          request("POST", "/api/account/members/invites", { body: { emails: ["a@x.test"] } }),
        )
      ).status,
    ).toBe(401);
    const crossSite = await invitesRoute.POST(
      request("POST", "/api/account/members/invites", {
        cookie: world.owner.cookie,
        body: { emails: ["a@x.test"] },
        headers: { origin: "https://evil.test" },
      }),
    );
    expect(crossSite.status).toBe(403);
    for (const emails of [[], Array.from({ length: 101 }, (_, i) => `a${i}@x.test`), "a@x.test"]) {
      expect(
        (
          await invitesRoute.POST(
            request("POST", "/api/account/members/invites", {
              cookie: world.owner.cookie,
              body: { emails },
            }),
          )
        ).status,
      ).toBe(400);
    }
  });

  it("answers 409 seats-full with the numbers, writing nothing", async () => {
    await world.db.query("UPDATE workspaces SET seat_limit = 2 WHERE id = $1", [world.workspaceId]);
    const response = await inviteAs(world.owner, ["a@x.test", "b@x.test"]);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "seats-full", used: 1, limit: 2 });
  });

  it("answers 429 with how many went out over the day's emails, and Retry-After", async () => {
    vi.stubEnv("RESEND_API_KEY", EMAIL_ON.RESEND_API_KEY);
    vi.stubEnv("EMAIL_FROM", EMAIL_ON.EMAIL_FROM);
    await world.db.query("UPDATE workspaces SET seat_limit = 100 WHERE id = $1", [
      world.workspaceId,
    ]);
    const first = Array.from({ length: MAX_INVITE_EMAILS }, (_, i) => `a${i}@x.test`);
    const sent = await inviteAs(world.owner, first);
    expect(sent.status).toBe(200);
    expect(resend.batch).toHaveBeenCalledTimes(1);
    const response = await inviteAs(world.owner, ["late@x.test"]);
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await response.json()).toEqual({
      error: "rate-limited",
      retryAfterSeconds: expect.any(Number) as unknown,
      sentInWindow: MAX_INVITE_EMAILS,
      limit: MAX_INVITE_EMAILS,
    });
  });
});

describe("DELETE /api/account/members/invites/:inviteId and POST .../resend", () => {
  it("cancels as the owner, again too; 409 once used; 404 for a bad or unknown id", async () => {
    const invite = await firstInvite(await inviteAs(world.owner, ["cleo@x.test"]));
    for (let time = 0; time < 2; time += 1) {
      const response = await cancelAs(world.owner, invite.id);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    }
    const used = await firstInvite(await inviteAs(world.owner, ["dan@x.test"]));
    const token = used.link.split("/").at(-1) ?? "";
    expect(
      (await join({ body: { token, name: "Dan", password: "a long enough password" } })).status,
    ).toBe(200);
    expect((await cancelAs(world.owner, used.id)).status).toBe(409);
    expect((await cancelAs(world.owner, "not-an-id")).status).toBe(404);
    expect((await cancelAs(world.owner, "00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });

  it("resends with the same link and answers whether it was emailed and until when", async () => {
    const invite = await firstInvite(await inviteAs(world.owner, ["cleo@x.test"]));
    const response = await resendAs(world.owner, invite.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      emailed: false,
      expiresAt: expect.any(Number) as unknown,
    });
  });

  it("answers 429 cooldown within a minute of an email, with Retry-After", async () => {
    vi.stubEnv("RESEND_API_KEY", EMAIL_ON.RESEND_API_KEY);
    vi.stubEnv("EMAIL_FROM", EMAIL_ON.EMAIL_FROM);
    const invite = await firstInvite(await inviteAs(world.owner, ["cleo@x.test"]));
    const response = await resendAs(world.owner, invite.id);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "cooldown",
      retryAfterSeconds: expect.any(Number) as unknown,
    });
    expect(response.headers.get("retry-after")).not.toBeNull();
  });

  it("lets a member with people resend and cancel the owner's invite, and refuses one without", async () => {
    const manager = await addMember(world.db, world.workspaceId, ["people"]);
    const member = await addMember(world.db, world.workspaceId);
    const invite = await firstInvite(await inviteAs(world.owner, ["cleo@x.test"]));
    for (const refused of [await resendAs(member, invite.id), await cancelAs(member, invite.id)]) {
      expect(refused.status).toBe(403);
      expect(await refused.json()).toEqual({ error: "not-allowed", permission: "members.manage" });
    }
    expect((await resendAs(manager, invite.id)).status).toBe(200);
    expect((await cancelAs(manager, invite.id)).status).toBe(200);
  });
});

describe("POST /api/auth/join", () => {
  const PASSWORD = "a long enough password";

  async function tokenFor(email: string) {
    return inviteOne(world, world.owner, email, Date.now());
  }

  it("joins a new person, signs them in with a session cookie, and answers ok", async () => {
    const token = await tokenFor("cleo@x.test");
    const response = await join({ body: { token, name: " Cleo ", password: PASSWORD } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(cookie).toMatch(/HttpOnly/i);
    const session = await readSession(
      world.db,
      cookie.split(";")[0]?.split("=")[1] ?? "",
      Date.now(),
    );
    expect(session).toMatchObject({ email: "cleo@x.test", name: "Cleo" });
  });

  it("takes the signed-in path whenever there's a session, ignoring a name and password", async () => {
    const token = await tokenFor("cleo@x.test");
    const someone = await person(world.db, "dan@x.test");
    const response = await join({
      cookie: someone.cookie,
      body: { token, name: "Cleo", password: PASSWORD },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "wrong-account" });
    const cleo = await person(world.db, "cleo@x.test");
    const joined = await join({ cookie: cleo.cookie, body: { token } });
    expect(joined.status).toBe(200);
    expect(joined.headers.get("set-cookie")).toBeNull();
  });

  it("answers 409 sign-in-first for an address with an account, and 400 for a token alone signed out", async () => {
    await person(world.db, "cleo@x.test");
    const token = await tokenFor("cleo@x.test");
    const response = await join({ body: { token, name: "Cleo", password: PASSWORD } });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "sign-in-first" });
    expect((await join({ body: { token } })).status).toBe(400);
    expect((await join({ body: { token, name: "Cleo", password: "short" } })).status).toBe(400);
    expect((await join({ body: { token: "nope", name: "Cleo", password: PASSWORD } })).status).toBe(
      400,
    );
  });

  it("answers 404 for an unknown link and 409 once it's used", async () => {
    const token = await tokenFor("cleo@x.test");
    const body = { token, name: "Cleo", password: PASSWORD };
    expect((await join({ body })).status).toBe(200);
    const used = await join({ body });
    expect(used.status).toBe(409);
    expect(await used.json()).toEqual({ error: "used" });
    const unknown = await join({ body: { ...body, token: "u".repeat(43) } });
    expect(unknown.status).toBe(404);
  });

  it("refuses a post from another site before anything else", async () => {
    const token = await tokenFor("cleo@x.test");
    const response = await join({
      body: { token, name: "Cleo", password: PASSWORD },
      headers: { origin: "https://evil.test" },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "cross-site" });
  });

  it("brakes one address after 20 tries a minute", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 21; attempt += 1) {
      const response = await join({
        from: "203.0.113.77",
        body: { token: "u".repeat(43), name: "X", password: PASSWORD },
      });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 20).every((status) => status === 404)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it("answers a plain form post with a 303: on to the Overview, or back to the invite with a code", async () => {
    const token = await tokenFor("cleo@x.test");
    const fields = (values: Record<string, string>) =>
      new URLSearchParams({ token, ...values }).toString();
    const mismatch = await join({
      body: fields({ name: "Cleo", password: PASSWORD, confirm: "other" }),
    });
    expect(mismatch.status).toBe(303);
    expect(mismatch.headers.get("location")).toBe(`/join/${token}?error=mismatch`);
    const weak = await join({
      body: fields({ name: "Cleo", password: "short", confirm: "short" }),
    });
    expect(weak.headers.get("location")).toBe(`/join/${token}?error=invalid`);
    const joined = await join({
      body: fields({ name: "Cleo", password: PASSWORD, confirm: PASSWORD }),
    });
    expect(joined.status).toBe(303);
    expect(joined.headers.get("location")).toBe("/?welcome=joined");
    expect(joined.headers.get("set-cookie")).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    const again = await join({
      body: fields({ name: "Cleo", password: PASSWORD, confirm: PASSWORD }),
    });
    expect(again.headers.get("location")).toBe(`/join/${token}?error=used`);
    const bad = await join({ body: new URLSearchParams({ token: "nope" }).toString() });
    expect(bad.headers.get("location")).toBe("/login");
  });
});
